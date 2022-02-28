import * as express from 'express';
import * as ExpressSession from 'express-session';
import * as cors from 'cors';
import * as bodyParser from 'body-parser';
import * as multer from 'multer';
import Database from '../orm/database';

import { Session } from '../orm/entity/session';
import { Repository } from 'typeorm';
import { TypeormStore } from 'connect-typeorm';

// passports

import session = require('express-session');

export interface ServerSessionSettings {
    ttl: number;
    secret: string;
}

export interface ServerCorsSettings {
    origins: string[];
}

export interface ServerRequest extends express.Request {
    globals: {
        database: Database;
        platforms: {};
    };
}

export interface ServerSession extends session.Session {
    user?: string;
    applications?: { [appName: string]: { [key: string]: unknown } };
}

export class Server {
    public app: express.Express;
    public database: Database;
    private sessionRepository: Repository<Session>;
    private sessionSettings: ServerSessionSettings;
    private corSettings: ServerCorsSettings;
    private port: number = 8080;

    private readonly defaultCorsSettings: ServerCorsSettings = {
        origins: ['*'],
    };
    private readonly defaultSessionSettings: ServerSessionSettings = {
        ttl: 86400,
        secret: 'ienjoymacncheese',
    };

    public constructor(database: Database, sessionSettings?: ServerSessionSettings, corsSettings?: ServerCorsSettings) {
        this.database = database;
        this.sessionRepository = this.database.raw().getRepository(Session);

        // if we have no session settings defined use our defaults, if we have defined session settings, merge them with the defaults via object spread
        this.sessionSettings =
            sessionSettings === undefined
                ? this.defaultSessionSettings
                : { ...this.defaultSessionSettings, ...sessionSettings };

        // repeat the same step of above but this time for cor settings
        this.corSettings =
            corsSettings === undefined ? this.defaultCorsSettings : { ...this.defaultCorsSettings, ...corsSettings };

        // create our express app
        this.app = express();

        // store important things in the middleware for use later
        this.app.use((req, res, next) => {
            (req as ServerRequest).globals = {
                database: database,
                platforms: {},
            };

            next();
        });

        // configure our express session
        this.app.use(
            ExpressSession({
                resave: false,
                saveUninitialized: false,
                store: new TypeormStore({
                    cleanupLimit: 2,
                    limitSubquery: false,
                    ttl: this.sessionSettings.ttl,
                }).connect(this.sessionRepository),
                secret: this.sessionSettings.secret,
            }),
        );

        // configure our cors settings
        this.app.use(
            cors({
                optionsSuccessStatus: 200,
                credentials: true,
                preflightContinue: true,
                origin: (origin, callback) => {
                    origin = origin !== undefined ? origin : '';
                    let allowAll = this.corSettings.origins[0] === '*';
                    let originAllowed = allowAll || this.corSettings.origins.indexOf(origin) !== -1;
                    callback(
                        originAllowed ? null : new Error('Domain did not pass CORS'),
                        originAllowed ? true : undefined,
                    );
                },
            }),
        );

        // configure body parsing
        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: true }));

        this.app.get('/', (req, res) => {
            res.json({
                success: true,
                response: {
                    message: 'Welcome to the Level Crush Login Gateway',
                },
                errors: [],
            });
        });

        this.app.get('/ping', (req, res) => {
            res.sendStatus(200);
        });
    }

    public static(route: string, path: string) {
        this.app.use(route, express.static(path));
    }

    public router(route: string, router: express.Router) {
        console.log('Using Route: ' + route);
        this.app.use(route, router);
    }

    public start(port = 8080) {
        this.port = port;
        return new Promise(() => {
            this.app.listen(this.port, () => {
                console.log('Now listening on ' + this.port);
            });
        });
    }
}

export default Server;
