import ENV from './env';
import Database from './orm/database';
import Server from './server/server';

import ServerController from './server/server_controller';
import DiscordController from './controllers/discord_controller';

async function main(): Promise<void> {
    console.log('Starting database');
    let database = new Database();
    await database.connect();

    console.log('Starting Server');
    let server = new Server(database);

    var assetPath =
        ENV.server !== undefined && ENV.server.assets !== undefined ? ENV.server.assets : 'please supply static path';
    console.log('The following is the asset path: ', assetPath);
    server.static('/assets', assetPath);
    let controllers: ServerController[] = [new DiscordController()];
    controllers.forEach((controller, index) => {
        server.router(controller.route, controller.router);
    });

    server.app.get('/session', (request, response) => {
        response.json({
            success: true,
            response: {
                user: (request.session as unknown as { [key: string]: string })['user']
                    ? (request.session as unknown as { [key: string]: string })['user']
                    : false,
                application: (request.session as unknown as { [key: string]: string })['application']
                    ? (request.session as unknown as { [key: string]: string })['application']
                    : false,
            },
            errors: [],
        });
    });

    let awaitingPromises: Promise<unknown>[] = [];

    // start the server
    console.log('Starting server');
    awaitingPromises.push(server.start(ENV.server?.port));

    console.log('Starting database auto ping');
    awaitingPromises.push(database.startAutoPing());

    await Promise.all(awaitingPromises);

    console.log('Closing');
    await database.close();
}

main()
    .then(() => console.log('Done'))
    .catch((err) => console.log('An error occurred', err));
