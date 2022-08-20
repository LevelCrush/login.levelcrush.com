import { ServerController, ServerResponse, ServerResponseError } from '../server/server_controller';
import { Repository } from 'typeorm';
import { Server, ServerRequest, ServerSession } from '../server/server';
import * as moment from 'moment';
import * as express from 'express';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import ENV from '../env';
import Axios, { AxiosResponse } from 'axios';
import { session } from 'passport';
import Platform from '../orm/entity/platform';

export interface DiscordUserResponse {
    id: string;
    username: string;
    discriminator: string;
    avatar: string;
    email: string;
    verified: string;
}

export class DiscordController extends ServerController {
    public constructor() {
        super('/discord');

        this.router.get('/login', this.getLogin);
        this.router.get('/validate', this.getValidate);
    }

    public async getValidate(request: express.Request, response: express.Response) {
        let serverRequest = request as ServerRequest;

        // first make sure we have a valid response
        if (typeof serverRequest.query['error'] !== 'undefined' || typeof serverRequest.query['code'] === 'undefined') {
            let redirectUrl = (serverRequest.session as unknown as { [key: string]: string })['oauth_redirect'];
            if (redirectUrl.length === 0) {
                redirectUrl = ENV.hosts.frontend;
            }
            response.redirect(redirectUrl); // redirect back home
            return;
        }

        const hostServer =
            ENV.server !== undefined && ENV.server.url !== undefined ? ENV.server.url : request.get('origin');
        const returnRedirect = hostServer + request.originalUrl;

        // for oauth redirect
        const redirectUri = hostServer + '/discord/validate';

        const validateDataObj: { [key: string]: string } = {
            client_id: ENV.platforms.discord.oauth.client_id,
            client_secret: ENV.platforms.discord.oauth.client_secret,
            grant_type: 'authorization_code',
            code: request.query['code'] as string,
            redirect_uri: redirectUri,
            scope: ['identify', 'email'].join('+'),
        };
        let validateDataArray: string[] = [];
        for (let key in validateDataObj) {
            validateDataArray.push(encodeURIComponent(key) + '=' + encodeURIComponent(validateDataObj[key]));
        }

        let webRequest: AxiosResponse<any, any> | undefined = undefined;
        try {
            webRequest = await Axios.post(ENV.platforms.discord.oauth.urls.token, validateDataArray.join('&'), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'application/json',
                },
            });
        } catch {
            // todo
        }

        // attempt to parse the response

        if (webRequest !== undefined && webRequest.data && typeof webRequest.data['access_token'] !== 'undefined') {
            console.log(serverRequest.session);
            const oauthRedirect = (serverRequest.session as unknown as { [key: string]: string })[
                'oauth_redirect'
            ] as string;

            // make a request to get more information about the discord user
            const accessToken = webRequest.data['access_token'] as string;
            const refreshToken = webRequest.data['refresh_token'] as string;
            const requestTime = moment().unix();

            let discordUserRequest = await Axios.get('https://discord.com/api/v8/users/@me', {
                headers: {
                    Authorization: 'Bearer ' + accessToken,
                    Accept: 'application/json',
                },
            });

            // with what information we have tied to the current email fetch through the api
            let userData = discordUserRequest.data as DiscordUserResponse;
            let database = serverRequest.globals.database.raw();

            // first we need to find out if we have a matching platform user already in the database
            // matching to api user is irelevant right now
            let platformUserRequestPromise = database.getRepository(Platform).findOne({
                where: {
                    platform: 'discord',
                    platform_user: userData.id,
                },
            });

            // at the same time we make a request to the api to check if this email is in use
            let emailExistsApiRequestPromise = Axios.post(ENV.hosts.api + '/user/exists', {
                user: userData.email,
            });

            let allResults = await Promise.all([platformUserRequestPromise, emailExistsApiRequestPromise]);
            let platformUser = allResults[0] as Platform | undefined;
            let emailExistsApiRequest = allResults[1] as AxiosResponse;
            let emailExists = false;

            let apiUserToken = '';
            let appToken = '';
            if (emailExistsApiRequest.data) {
                let emailExistsRequest = emailExistsApiRequest.data as {
                    success: boolean;
                    response: { exists: boolean };
                    errors: [];
                };
                emailExists = emailExistsRequest.response.exists;
            }

            // first time logging in with discord with this **discord** account
            const firstTime = platformUser === undefined && emailExists === false;
            let allowLogin = false;
            let tokenExists = false;
            let displayName = userData.username + '#' + userData.discriminator;
            if (firstTime) {
                let password = crypto
                    .createHash('md5')
                    .update(userData.email + userData.id + userData.username + moment().unix())
                    .digest('hex');

                // need to create platform user + api user

                // create our api request to register the user
                let apiUserRequest = await Axios.post(ENV.hosts.api + '/user/register', {
                    email: userData.email,
                    password: password,
                    passwordConfirm: password,
                    displayName: displayName,
                });

                const platformUserData: Partial<Platform> = {
                    user: apiUserRequest.data['response']['user']['token'],
                    secret: crypto
                        .createHash('md5')
                        .update(password + displayName + moment().unix())
                        .digest('hex'),
                    platform: 'discord',
                    platform_user: userData.id,
                    access_token: accessToken,
                    refresh_token: refreshToken,
                    expires_at: 0, // need to set this to the actual expires time,
                    created_at: 0,
                    deleted_at: 0,
                    updated_at: 0,
                };

                await database.getRepository(Platform).save(platformUserData);

                apiUserToken = apiUserRequest.data['response']['user']['token'];

                allowLogin = true;
            } else {
                // returning users in some fashion
                // this "else" statement is intended to be ran only when a user returns to login
                // in this case, we can only authenticatae logging in when we have a platform user record (discord login) AND a matching API User that matches via token
                if (platformUser !== undefined) {
                    // we have found a match for a platform user record
                    //
                    //let apiUser = platformUser.user;

                    // make a request to the api to check if this token is in use
                    // if they are a returning user, at any point they can change the email tied their discord account
                    // but their "api" account can have the original email still attached and not updated (yet)
                    // by checking if the user exists via token we can confirm that we have a user to login with the api to even with a mismatching email because they are seperate systems
                    // if we relied on email only, changing discord email everytime would create a new api account / hijack other api account. Not ideal! Token generated on initial creation is the only way around this
                    // this is important since we are supporting multiple authentications in the future and primarily login via DISCORD right now
                    let userApiExistsRequest = await Axios.post(ENV.hosts.api + '/user/exists', {
                        user: platformUser.user,
                        token: true,
                    });

                    tokenExists = userApiExistsRequest.data['response']['exists'] as boolean;

                    // right now this is simple
                    // in the future this line will expand as we find more scenarios at some point
                    allowLogin = tokenExists ? true : false;

                    apiUserToken = platformUser.user;
                }
            }

            // update user with updated discord information
            if (allowLogin && platformUser !== undefined) {
                console.log('Updating display name');
                await Axios.post(ENV.hosts.api + '/user/update', {
                    displayName: displayName,
                    user: platformUser.user,
                    application: ENV.platforms.api.token,
                });
            }

            // are we allowed to login?
            if (allowLogin) {
                // send the tokens needed to login via the client side to the api
                (serverRequest.session as unknown as { [key: string]: string })['user'] = apiUserToken;
                (serverRequest.session as unknown as { [key: string]: string })['application'] =
                    ENV.platforms.api.token;

                serverRequest.session.save((err) => {
                    let redirectUrl = (serverRequest.session as unknown as { [key: string]: string })['oauth_redirect'];
                    if (!redirectUrl || redirectUrl.length === 0) {
                        redirectUrl = request.get('origin') as string;
                    }
                    response.redirect(redirectUrl);
                });
            } else {
                let redirectUrl = (serverRequest.session as unknown as { [key: string]: string })['oauth_redirect'];
                if (!redirectUrl || redirectUrl.length === 0) {
                    redirectUrl = request.get('origin') as string;
                }
                response.redirect(redirectUrl);
            }
        } else {
            let redirectUrl = (serverRequest.session as unknown as { [key: string]: string })['oauth_redirect'];
            if (!redirectUrl || redirectUrl.length === 0) {
                redirectUrl = request.get('origin') as string;
            }
            response.redirect(redirectUrl);
        }
    }

    public async getLogin(request: express.Request, response: express.Response) {
        let serverRequest = request as ServerRequest;

        const hostServer =
            ENV.server !== undefined && ENV.server.url !== undefined ? ENV.server.url : request.get('origin');
        const returnRedirect = hostServer + request.originalUrl;

        // for oauth redirect
        const redirectUri = hostServer + '/discord/validate';

        const scopes = ['identify', 'email'];
        const responseType = 'code';
        const prompt = 'consent';
        const clientID = ENV.platforms.discord.oauth.client_id;

        // construct authorization url
        let authorizeUrl = ENV.platforms.discord.oauth.urls.authorize;
        authorizeUrl +=
            '?response_type=' +
            encodeURIComponent(responseType) +
            '&client_id=' +
            encodeURIComponent(clientID) +
            '&scope=' +
            scopes.join('+') +
            '&state=' +
            encodeURIComponent(moment().unix()) +
            '&redirect_uri=' +
            encodeURIComponent(redirectUri) +
            '&prompt=' +
            encodeURIComponent(prompt);

        const finalRedirect =
            typeof serverRequest.query['redirect'] !== 'undefined'
                ? (serverRequest.query['redirect'] as string)
                : hostServer;

        (serverRequest.session as unknown as { [key: string]: string })['oauth_redirect'] = finalRedirect as string;
        serverRequest.session.save((err) => {
            console.log('XHR request? ', serverRequest.xhr);
            if (serverRequest.xhr) {
                response.json({
                    success: true,
                    redirect: authorizeUrl,
                    errors: [],
                });
            } else {
                response.redirect(authorizeUrl);
            }
        });
    }
}

export default DiscordController;
