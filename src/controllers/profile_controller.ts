import { ServerController, ServerResponse, ServerResponseError } from '../server/server_controller';
import { Repository } from 'typeorm';
import { Server, ServerRequest, ServerSession } from '../server/server';
import * as moment from 'moment';
import * as express from 'express';
import ENV from '../env';
import Platform from '../orm/entity/platform';
import PlatformMetadata from '../orm/entity/platform_metadata';

export class ProfileController extends ServerController {
    public constructor() {
        super('/profile');

        this.router.get('/get', this.getProfile);
    }

    public async getProfile(request: express.Request, response: express.Response) {
        let serverRequest = request as ServerRequest;
        let serverSession = serverRequest.session as any; // ugly, should find a better way to do this
        let serverResponse: { [key: string]: any } = {};

        // the presence of this key in our session means we are logged in
        const isLoggedIn = typeof serverSession['user'] !== 'undefined';

        if (isLoggedIn) {
            const database = serverRequest.globals.database.raw();

            const platforms: { user: string; platform: string; platformUser: string }[] = await database
                .createQueryBuilder()
                .select([
                    'platform.user AS user',
                    'platform.platform AS platform',
                    'platform.platform_user AS platformUser',
                ])
                .from('platform', 'platform')
                .where('platform.user = :userToken')
                .setParameter('userToken', serverSession['user'])
                .getRawMany();

            for (let i = 0; i < platforms.length; i++) {
                const platform = platforms[i];

                const platformMetadata: { displayName: string } | undefined = await database
                    .createQueryBuilder()
                    .select(['platform_metadata.value AS displayName'])
                    .from('platform_metadata', 'platform_metadata')
                    .where('platform_metadata.platform_user = :platformUser')
                    .andWhere('platform_metadata.platform = :platformName')
                    .andWhere("platform_metadata.key = 'display_name'")
                    .setParameter('platformName', platform.platform)
                    .setParameter('platformUser', platform.platformUser)
                    .getRawOne();

                if (platformMetadata) {
                    serverResponse[platform.platform] = platformMetadata.displayName;
                }
            }
        }

        response.json({
            success: true,
            response: serverResponse,
            errors: [],
        });
    }
}

export default ProfileController;
