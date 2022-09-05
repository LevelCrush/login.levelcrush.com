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
import { access } from 'fs';
import PlatformMetadata from '../orm/entity/platform_metadata';

export interface TwitchUserResponse {
    id: string;
    login: string;
    display_name: string;
    type: string;
    broadcaster_type: string;
    description: string;
    profile_image_url: string;
    offline_image_url: string;
    view_count: number;
    email: string;
    created_at: string;
}

export class TwitchController extends ServerController {
    public constructor() {
        super('/twitch');

        this.router.get('/login', this.getLogin);
        this.router.get('/validate', this.getValidate);
    }

    public async getValidate(request: express.Request, response: express.Response) {
        let serverRequest = request as ServerRequest;

        console.log(serverRequest.query);

        // first make sure we have a valid response
        if (typeof serverRequest.query['error'] !== 'undefined' || typeof serverRequest.query['code'] === 'undefined') {
            let redirectUrl = (serverRequest.session as unknown as { [key: string]: string })['oauth_redirect'];
            if (redirectUrl.length === 0) {
                redirectUrl = ENV.hosts.frontend;
            }
            response.redirect(redirectUrl); // redirect back home
            return;
        }
        let serverSession = serverRequest.session as any; // ugly, should find a better way to do this

        const hostServer =
            ENV.server !== undefined && ENV.server.url !== undefined ? ENV.server.url : request.get('origin');
        const returnRedirect = hostServer + request.originalUrl;

        // must be logged in via discord first
        if (typeof serverSession['user'] === 'undefined') {
            console.log('Not logged in');
            const redirectUri = hostServer + '/twitch/login';
            const targetUrl = hostServer + '/discord/login?redirect=' + encodeURIComponent(redirectUri);
            response.redirect(targetUrl);
            return;
        }

        // for oauth redirect
        const redirectUri = hostServer + '/twitch/validate';
        const validateDataObj: { [key: string]: string } = {
            client_id: ENV.platforms.twitch.oauth.client_id,
            client_secret: ENV.platforms.twitch.oauth.client_secret,
            grant_type: 'authorization_code',
            code: request.query['code'] as string,
            redirect_uri: redirectUri,
            scope: ['user:read:email'].join(' '),
        };
        let validateDataArray: string[] = [];
        for (let key in validateDataObj) {
            validateDataArray.push(encodeURIComponent(key) + '=' + encodeURIComponent(validateDataObj[key]));
        }

        let webRequest: AxiosResponse<any, any> | undefined = undefined;
        try {
            console.log('Attempting twitch oauth url');
            webRequest = await Axios.post(ENV.platforms.twitch.oauth.urls.token, validateDataArray.join('&'), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'application/json',
                },
            });
        } catch (auth_err) {
            // todo
            console.log(auth_err);
            console.log('FAILED to authorize twitch');
            webRequest = undefined;
        }

        if (webRequest !== undefined && webRequest.data && typeof webRequest.data['access_token'] !== 'undefined') {
            const oauthRedirect = (serverRequest.session as unknown as { [key: string]: string })[
                'oauth_redirect'
            ] as string;

            const accessToken = webRequest.data['access_token'] as string;
            const refreshToken = webRequest.data['refresh_token'] as string;
            const requestTime = moment().unix();

            let twitchUserRequest = await Axios.get('https://api.twitch.tv/helix/users', {
                headers: {
                    Authorization: 'Bearer ' + accessToken,
                    'Client-Id': ENV.platforms.twitch.oauth.client_id,
                    Accept: 'application/json',
                },
            });

            const userData = twitchUserRequest.data.data[0] as TwitchUserResponse;
            const database = serverRequest.globals.database.raw();
            let platformUserRequestPromise = database.getRepository(Platform).findOne({
                where: {
                    platform: 'twitch',
                    platform_user: userData.id,
                },
            });

            // find out if we need to create or update our matching link here

            const platformUser = await platformUserRequestPromise;
            const generated_secret =
                serverSession['user'] + userData.id + userData.display_name + moment().unix() + userData.created_at;
            if (platformUser !== undefined) {
                // user does exist in our system already just update it accordingly
                platformUser.user = serverSession['user'];

                // regenerate secret, since  its a link there is a chance it could of come from somewhere else
                platformUser.secret = crypto.createHash('md5').update(generated_secret).digest('hex');
                platformUser.access_token = accessToken;
                platformUser.refresh_token = refreshToken;
                platformUser.expires_at = 0; // this needs to be updated
                platformUser.updated_at = moment().unix();
                await database.getRepository(Platform).save(platformUser);
            } else {
                // this is a brand new user
                const new_platform: Partial<Platform> = {
                    user: serverSession['user'],
                    secret: crypto.createHash('md5').update(generated_secret).digest('hex'),
                    platform: 'twitch',
                    platform_user: userData.id,
                    access_token: accessToken,
                    refresh_token: refreshToken,
                    expires_at: 0, // need to be set for real
                    created_at: moment().unix(),
                    deleted_at: 0,
                    updated_at: 0,
                };

                await database.getRepository(Platform).save(new_platform);
            }

            (serverRequest.session as any)['twitch'] = {
                id: userData.id,
                display_name: userData.display_name,
                offline_image: userData.offline_image_url,
                profile_image: userData.profile_image_url,
            };

            try {
                const metadata = await database.getRepository(PlatformMetadata).findOne({
                    where: {
                        platform: 'twitch',
                        platform_user: userData.id,
                        key: 'profile',
                    },
                });

                if (metadata !== undefined) {
                    // existing, just update
                    metadata.value = JSON.stringify(userData);
                    metadata.updated_at = moment().unix();
                    await database.getRepository(PlatformMetadata).save(metadata);
                } else {
                    // update platform metadata
                    const new_metadata: Partial<PlatformMetadata> = {
                        platform: 'twitch',
                        platform_user: userData.id,
                        key: 'profile',
                        value: JSON.stringify(userData),
                        created_at: moment().unix(),
                        updated_at: 0,
                    };
                    await database.getRepository(PlatformMetadata).save(new_metadata);
                }
            } catch (err) {
                console.log('An internal error occurred. Failed to save');
                console.log(err);
            }

            // update username
            try {
                const metadata = await database.getRepository(PlatformMetadata).findOne({
                    where: {
                        platform: 'twitch',
                        platform_user: userData.id,
                        key: 'display_name',
                    },
                });

                if (metadata !== undefined) {
                    // existing, just update
                    metadata.value = userData.display_name;
                    metadata.updated_at = moment().unix();
                    await database.getRepository(PlatformMetadata).save(metadata);
                } else {
                    // update platform metadata
                    const new_metadata: Partial<PlatformMetadata> = {
                        platform: 'twitch',
                        platform_user: userData.id,
                        key: 'display_name',
                        value: userData.display_name,
                        created_at: moment().unix(),
                        updated_at: 0,
                    };
                    await database.getRepository(PlatformMetadata).save(new_metadata);
                }
            } catch (err) {
                console.log('An internal error occurred. Failed to save');
                console.log(err);
            }

            // at the end redirect
            serverRequest.session.save((err) => {
                let redirectUrl = (serverRequest.session as any)['oauth_redirect'];
                if (!redirectUrl || redirectUrl.length === 0) {
                    redirectUrl = request.get('origin') as string;
                }
                response.redirect(redirectUrl);
            });
        } else {
            // redirect immedaitely
            let redirectUrl = (serverRequest.session as any)['oauth_redirect'];
            if (!redirectUrl || redirectUrl.length === 0) {
                redirectUrl = request.get('origin') as string;
            }
            response.redirect(redirectUrl);
        }
    }

    public async getLogin(request: express.Request, response: express.Response) {
        let serverRequest = request as ServerRequest;
        let serverSession = serverRequest.session as any; // ugly, should find a better way to do this

        const hostServer =
            ENV.server !== undefined && ENV.server.url !== undefined ? ENV.server.url : request.get('origin');

        // must be logged in via discord first
        if (typeof serverSession['user'] === 'undefined') {
            const redirectUri = hostServer + '/twitch/login';
            const targetUrl = hostServer + '/discord/login?redirect=' + encodeURIComponent(redirectUri);
            response.redirect(targetUrl);
            return;
        }

        const redirectUri = hostServer + '/twitch/validate';
        const finalRedirect =
            typeof serverRequest.query['redirect'] !== 'undefined'
                ? (serverRequest.query['redirect'] as string)
                : hostServer;

        const clientID = ENV.platforms.twitch.oauth.client_id;
        const responseType = 'code';
        const scopes = ['user:read:email'];
        const prompt = 'true';

        // construct authorization url
        let authorizeUrl = ENV.platforms.twitch.oauth.urls.authorize;
        authorizeUrl +=
            '?response_type=' +
            encodeURIComponent(responseType) +
            '&client_id=' +
            encodeURIComponent(clientID) +
            '&scope=' +
            encodeURIComponent(scopes.join(' ')) +
            '&state=' +
            encodeURIComponent(moment().unix()) +
            '&redirect_uri=' +
            encodeURIComponent(redirectUri) +
            '&force_verify=' +
            encodeURIComponent(prompt);

        (serverRequest.session as unknown as { [key: string]: string })['oauth_redirect'] = finalRedirect as string;
        serverRequest.session.save((err) => {
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
