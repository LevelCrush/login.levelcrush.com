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
        const redirectUri = hostServer + '/twitch/validate';
        const validateDataObj: { [key: string]: string } = {
            client_id: ENV.platforms.twitch.oauth.client_id,
            client_secret: ENV.platforms.twitch.oauth.client_secret,
            grant_type: 'authorization_code',
            code: request.query['code'] as string,
            redirect_uri: redirectUri,
            scope: [
                'user:read:email',
                'user:read:broadcast',
                'chat:read',
                'channel:read:hype_train',
                'channel:read:polls',
            ].join('+'),
        };
        let validateDataArray: string[] = [];
        for (let key in validateDataObj) {
            validateDataArray.push(encodeURIComponent(key) + '=' + encodeURIComponent(validateDataObj[key]));
        }

        let webRequest: AxiosResponse<any, any> | undefined = undefined;
        try {
            webRequest = await Axios.post(ENV.platforms.twitch.oauth.urls.token, validateDataArray.join('&'), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'application/json',
                },
            });
        } catch {
            // todo
        }

        if (webRequest !== undefined && webRequest.data && typeof webRequest.data['access_token'] !== 'undefined') {
            console.log(serverRequest.session);
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

            const userData = twitchUserRequest.data as TwitchUserResponse;
            const database = serverRequest.globals.database.raw();
            let platformUserRequestPromise = database.getRepository(Platform).findOne({
                where: {
                    platform: 'twitch',
                    platform_user: userData.id,
                },
            });

            const platformUser = await platformUserRequestPromise;
            if (platformUser !== undefined) {
                platformUser.access_token = accessToken;
                platformUser.refresh_token = refreshToken;
                platformUser.updated_at = moment().unix();
                await database.getRepository(Platform).save(platformUser);
            } else {
            }
        }

        response.send('Hello!');
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
        const scopes = [''];
        const prompt = 'true';

        // construct authorization url
        let authorizeUrl = ENV.platforms.twitch.oauth.urls.authorize;
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
            '&force_verify=' +
            encodeURIComponent(prompt);

        (serverRequest.session as unknown as { [key: string]: string })['oauth_redirect'] = finalRedirect as string;
        serverRequest.session.save((err) => {
            response.json({
                success: true,
                redirect: authorizeUrl,
                errors: [],
            });
        });
    }
}
