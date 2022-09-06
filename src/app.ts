process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import ENV from './env';
import Database from './orm/database';
import Server from './server/server';
import ServerController from './server/server_controller';
import DiscordController from './controllers/discord_controller';
import * as path from 'path';
import * as fs from 'fs';
import { TwitchController } from './controllers/twitch_controller';
import ProfileController from './controllers/profile_controller';
import BungieController from './controllers/bungie_controller';

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
    server.static('/robots.txt', path.join(assetPath, 'root', 'robots.txt'));
    server.static('/robot.txt', path.join(assetPath, 'root', 'robots.txt'));

    // get all versioned directories
    const targetDir = path.join(assetPath, 'widget');
    const directories = fs.readdirSync(targetDir);
    directories.reverse();
    console.log(directories);

    // master route for what version is served  for the widget
    if (directories.length > 0) {
        const topDir = directories[0];
        server.static('/assets/widget/latest/css/main.css', path.join(assetPath, 'widget', topDir, 'css', 'main.css'));
        server.static('/assets/widget/latest/js/main.js', path.join(assetPath, 'widget', topDir, 'js', 'main.js'));
    }

    // server.static('/assets/widgets/latest/css/main.css', path.join(assetPath,'widget/'))

    server.static('/', path.join(assetPath, 'root'));

    let controllers: ServerController[] = [
        new DiscordController(),
        new TwitchController(),
        new ProfileController(),
        new BungieController(),
    ];

    //let controllers: ServerController[] = [new DiscordController(), new TwitchController()];
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

    server.app.get('/logout', (request, response) => {
        request.session.destroy((err) => {
            response.sendStatus(200);
        });
    });

    let awaitingPromises: Promise<unknown>[] = [];

    // start the server
    console.log('Starting server');
    awaitingPromises.push(server.start());

    console.log('Starting database auto ping');
    awaitingPromises.push(database.startAutoPing());

    await Promise.all(awaitingPromises);

    console.log('Closing');
    await database.close();
}

main()
    .then(() => console.log('Done'))
    .catch((err) => console.log('An error occurred', err));
