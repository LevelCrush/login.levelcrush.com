import { ServerController, ServerResponse, ServerResponseError } from '../server/server_controller';
import { Brackets, Repository } from 'typeorm';
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

const BUNGIE_SCOPES = ['ReadUserData', 'ReadGroup', 'ReadBasicUserProfile', 'ReadDestinyInventoryAndVault'];

export class BungieController extends ServerController {
    public constructor() {
        super('/bungie');

        this.router.get('/login', this.getLogin);
        this.router.get('/validate', this.getValidate);
        this.router.post('/unlink', this.postUnlink);
    }

    public async postUnlink(request: express.Request, response: express.Response) {
        let serverRequest = request as ServerRequest;
        let serverSession = serverRequest.session as any; // ugly, should find a better way to do this
        const is_logged_in = typeof serverSession['user'] !== 'undefined';

        console.log('IS Logged In: ', is_logged_in);
        if (is_logged_in) {
            try {
                const database = serverRequest.globals.database.raw();
                const twitchPlatform: { user: string; platform: string; platformUser: string } | undefined =
                    await database
                        .createQueryBuilder()
                        .select([
                            'platform.user AS user',
                            'platform.platform AS platform',
                            'platform.platform_user AS platformUser',
                        ])
                        .from('platform', 'platform')
                        .where('platform.user = :userToken')
                        .andWhere("platform.platform = 'bungie'")
                        .setParameter('userToken', serverSession['user'])
                        .getRawOne();

                console.log('Checking bungie platform result', twitchPlatform);

                if (twitchPlatform) {
                    console.log('Unlinking Bungie: BEFORE DB CALL');
                    // we found a linked twitch platform
                    const platformDeleteQuery = database
                        .createQueryBuilder()
                        .delete()
                        .from('platform', 'platform')
                        .where("platform.platform = 'bungie'")
                        .andWhere('platform.user = :userToken')
                        .setParameter('userToken', serverSession['user'])
                        .execute();

                    const metadataDeleteQuery = database
                        .createQueryBuilder()
                        .delete()
                        .from('platform_metadata', 'platform_metadata')
                        .where("platform_metadata.platform = 'bungie'")
                        .andWhere('platform_metadata.platform_user = :platformUser')
                        .setParameter('platformUser', twitchPlatform.platformUser)
                        .execute();

                    // wait for both queries to finish
                    await Promise.allSettled([platformDeleteQuery, metadataDeleteQuery]);
                }
            } catch (err) {
                // if we fail no worry, this is not mission critical
                // just silently ignore for now
                // TODO eventually it would be nice to have better error handling / responses

                console.log('Twitch Unlink Error:', err);
            }
        }

        response.json({
            success: true,
            response: {},
            errors: [],
        });
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
        let serverSession = serverRequest.session as any; // ugly, should find a better way to do this

        const hostServer =
            ENV.server !== undefined && ENV.server.url !== undefined ? ENV.server.url : request.get('origin');
        const returnRedirect = hostServer + request.originalUrl;

        // must be logged in via discord first
        if (typeof serverSession['user'] === 'undefined') {
            console.log('Not logged in');
            const redirectUri = hostServer + '/bungie/login';
            const targetUrl = hostServer + '/discord/login?redirect=' + encodeURIComponent(redirectUri);
            response.redirect(targetUrl);
            return;
        }

        if (typeof serverRequest.query['error'] !== 'undefined') {
            // fail silently
            let redirectUrl = (serverRequest.session as unknown as { [key: string]: string })['oauth_redirect'];
            if (redirectUrl.length === 0) {
                redirectUrl = ENV.hosts.frontend;
            }
            response.redirect(redirectUrl); // redirect back home
            return;
        }

        // validate the code we received
        const redirectUri = hostServer + '/bungie/validate';
        const validateDataObj: { [key: string]: string } = {
            client_id: ENV.platforms.bungie.oauth.client_id,
            client_secret: ENV.platforms.bungie.oauth.client_secret,
            grant_type: 'authorization_code',
            code: request.query['code'] as string,
            redirect_uri: redirectUri,
            //  No scope needed for bungie oauth  scope: ['user:read:email'].join(' '),
        };

        let validateDataArray: string[] = [];
        for (let key in validateDataObj) {
            validateDataArray.push(encodeURIComponent(key) + '=' + encodeURIComponent(validateDataObj[key]));
        }

        let webRequest: AxiosResponse<any, any> | undefined = undefined;
        try {
            // base64 to obtain our authorization code
            const b64Auth = Buffer.from(
                ENV.platforms.bungie.oauth.client_id + ':' + ENV.platforms.bungie.oauth.client_secret,
                'binary',
            ).toString('base64');

            // send web request
            webRequest = await Axios.post(ENV.platforms.bungie.oauth.urls.token, validateDataArray.join('&'), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-API-Key': ENV.platforms.bungie.oauth.api_key,
                    Authorization: 'Basic ' + b64Auth,
                    Accept: 'application/json',
                },
            });
        } catch (auth_err) {
            // todo
            console.log(auth_err);
            webRequest = undefined;
        }

        if (webRequest !== undefined && webRequest.data && typeof webRequest.data['access_token'] !== 'undefined') {
            const oauthRedirect = (serverRequest.session as unknown as { [key: string]: string })[
                'oauth_redirect'
            ] as string;

            const accessToken = webRequest.data['access_token'] as string;
            const refreshToken = webRequest.data['refresh_token'] as string;
            const membershipID = webRequest.data['membership_id'] as string;
            const requestTime = moment().unix();

            let bungieUserRequest = await Axios.get(
                'https://www.bungie.net/Platform/User/GetBungieNetUserById/' + encodeURIComponent(membershipID) + '/',
                {
                    headers: {
                        Authorization: 'Bearer ' + accessToken,
                        'X-API-Key': ENV.platforms.bungie.oauth.api_key,
                        Accept: 'application/json',
                    },
                },
            );

            const bungieMembershipRequest = await Axios.get(
                'https://www.bungie.net/Platform/User/GetMembershipsById/' + encodeURIComponent(membershipID) + '/-1/',
                {
                    headers: {
                        Authorization: 'Bearer ' + accessToken,
                        'X-API-Key': ENV.platforms.bungie.oauth.api_key,
                        Accept: 'application/json',
                    },
                },
            );

            const membershipData = bungieMembershipRequest.data.Response;

            const userData = bungieUserRequest.data.Response as any; // TODO make this more defined
            const database = serverRequest.globals.database.raw();
            let platformUserRequestPromise = database.getRepository(Platform).findOne({
                where: {
                    platform: 'bungie',
                    platform_user: membershipID,
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
                    platform: 'bungie',
                    platform_user: membershipID,
                    access_token: accessToken,
                    refresh_token: refreshToken,
                    expires_at: 0, // need to be set for real
                    created_at: moment().unix(),
                    deleted_at: 0,
                    updated_at: 0,
                };

                await database.getRepository(Platform).save(new_platform);
            }

            try {
                const metadata = await database.getRepository(PlatformMetadata).findOne({
                    where: {
                        platform: 'bungie',
                        platform_user: membershipID,
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
                        platform: 'bungie',
                        platform_user: membershipID,
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
                        platform: 'bungie',
                        platform_user: membershipID,
                        key: 'display_name',
                    },
                });

                if (metadata !== undefined) {
                    // existing, just update
                    metadata.value = userData.uniqueName;
                    metadata.updated_at = moment().unix();
                    await database.getRepository(PlatformMetadata).save(metadata);
                } else {
                    // update platform metadata
                    const new_metadata: Partial<PlatformMetadata> = {
                        platform: 'bungie',
                        platform_user: membershipID,
                        key: 'display_name',
                        value: userData.uniqueName,
                        created_at: moment().unix(),
                        updated_at: 0,
                    };
                    await database.getRepository(PlatformMetadata).save(new_metadata);
                }
            } catch (err) {
                console.log('An internal error occurred. Failed to save');
                console.log(err);
            }

            // update PRIMARY MEMBERSHIP
            // bungie maintains a "true" membership id
            // most likely this is due to the new cross save system
            try {
                const metadata = await database.getRepository(PlatformMetadata).findOne({
                    where: {
                        platform: 'bungie',
                        platform_user: membershipID,
                        key: 'primary_membership',
                    },
                });

                if (metadata !== undefined) {
                    // existing, just update
                    metadata.value = membershipData.primaryMembershipId;
                    metadata.updated_at = moment().unix();
                    await database.getRepository(PlatformMetadata).save(metadata);
                } else {
                    // update platform metadata
                    const new_metadata: Partial<PlatformMetadata> = {
                        platform: 'bungie',
                        platform_user: membershipID,
                        key: 'primary_membership',
                        value: membershipData.primaryMembershipId,
                        created_at: moment().unix(),
                        updated_at: 0,
                    };
                    await database.getRepository(PlatformMetadata).save(new_metadata);
                }
            } catch (err) {
                console.log('An internal error occurred. Failed to save');
                console.log(err);
            }

            // membershipData.destinyMemberships
            // update and store ALL memberships
            // bungie maintains a "true" membership id
            // most likely this is due to the new cross save system
            const memberships_all = JSON.stringify(membershipData.destinyMemberships);
            try {
                const metadata = await database.getRepository(PlatformMetadata).findOne({
                    where: {
                        platform: 'bungie',
                        platform_user: membershipID,
                        key: 'all_memberships',
                    },
                });

                if (metadata !== undefined) {
                    // existing, just update
                    metadata.value = memberships_all;
                    metadata.updated_at = moment().unix();
                    await database.getRepository(PlatformMetadata).save(metadata);
                } else {
                    // update platform metadata
                    const new_metadata: Partial<PlatformMetadata> = {
                        platform: 'bungie',
                        platform_user: membershipID,
                        key: 'all_memberships',
                        value: memberships_all,
                        created_at: moment().unix(),
                        updated_at: 0,
                    };
                    await database.getRepository(PlatformMetadata).save(new_metadata);
                }
            } catch (err) {
                console.log('An internal error occurred. Failed to save');
                console.log(err);
            }

            // now store raid report link (if possible)
            let raidreportUrl = '';
            const memberships: { membershipType: number; membershipId: string }[] = membershipData.destinyMemberships;

            // this is etup by comparing bungie net platform membershiop types
            // and comparing to raid report platforms
            // https://bungie-net.github.io/#/components/schemas/BungieMembershipType
            let raidreportPlatform = 'none';
            for (let i = 0; i < memberships.length; i++) {
                const membership = memberships[i];
                if (membership.membershipId.toString() === membershipData.primaryMembershipId.toString()) {
                    switch (membership.membershipType) {
                        case 0:
                            raidreportPlatform = 'none';
                            break;
                        case 1: // verified, xbox
                            raidreportPlatform = 'xb';
                            break;
                        case 2: // verified, playstation
                            raidreportPlatform = 'ps';
                            break;
                        case 3: // verified , steam
                            raidreportPlatform = 'pc';
                            break;
                        case 4: // not verified, blizzard bnet
                            raidreportPlatform = 'pc';
                            break;
                        case 5:
                            raidreportPlatform = 'pc';
                            break;
                        case 6: // unknown platform, not verified
                            raidreportPlatform = 'pc';
                            break;
                        case 10: // bungie says this is TigerDemon. What platform is that? not verified
                            raidreportPlatform = 'pc';
                            break;
                        case 254: // bungie says this is reserved for the next new platform. Not verified. Will never see this in real world
                            raidreportPlatform = 'pc';
                            break;
                        case -1: // bungie says this is reserved for all platforms. only valid for searching. not applicable to this use case. just here for knowledge
                            raidreportPlatform = 'pc';
                            break;
                        default:
                            raidreportPlatform = 'pc';
                            break;
                    }
                    break;
                }
            }

            raidreportUrl =
                'https://raid.report/' +
                encodeURIComponent(raidreportPlatform) +
                '/' +
                membershipData.primaryMembershipId.toString();

            try {
                const metadata = await database.getRepository(PlatformMetadata).findOne({
                    where: {
                        platform: 'bungie',
                        platform_user: membershipID,
                        key: 'raid_report',
                    },
                });

                if (metadata !== undefined) {
                    // existing, just update
                    metadata.value = raidreportUrl;
                    metadata.updated_at = moment().unix();
                    await database.getRepository(PlatformMetadata).save(metadata);
                } else {
                    // update platform metadata
                    const new_metadata: Partial<PlatformMetadata> = {
                        platform: 'bungie',
                        platform_user: membershipID,
                        key: 'raid_report',
                        value: raidreportUrl,
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
            // redirect if we somehow get to this point
            let redirectUrl = (serverRequest.session as any)['oauth_redirect'];
            if (!redirectUrl || redirectUrl.length === 0) {
                redirectUrl = request.get('origin') as string;
            }
            response.redirect(redirectUrl);
        }
    }

    public async getLogin(request: express.Request, response: express.Response) {
        const serverRequest = request as ServerRequest;
        const timestamp = moment().unix();
        const hostServer =
            ENV.server !== undefined && ENV.server.url !== undefined ? ENV.server.url : request.get('origin');
        const returnRedirect = hostServer + request.originalUrl;

        // must be logged in via discord first
        let serverSession = serverRequest.session as any; // ugly, should find a better way to do this
        if (typeof serverSession['user'] === 'undefined') {
            console.log('Not logged in');
            const redirectUri = hostServer + '/bungie/login';
            const targetUrl = hostServer + '/discord/login?redirect=' + encodeURIComponent(redirectUri);
            response.redirect(targetUrl);
            return;
        }

        // for oauth redirect
        const redirectUri = hostServer + '/bungie/validate';

        let authorizeUrl = ENV.platforms.bungie.oauth.urls.authorize;

        authorizeUrl +=
            '?response_type=code' +
            '&client_id=' +
            encodeURIComponent(ENV.platforms.bungie.oauth.client_id) +
            '&state=' +
            encodeURIComponent(timestamp) +
            '&prompt=consent';

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
                console.log(authorizeUrl);
                response.redirect(authorizeUrl);
            }
        });
    }
}

export default BungieController;
