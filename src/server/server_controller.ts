import Database from '../orm/database';
import Server from './server';
import * as express from 'express';

export interface ServerResponseError {
    field: string;
    message: string;
}

export interface ServerResponse {
    success: boolean;
    response: {};
    errors: ServerResponseError[];
}

export abstract class ServerController {
    public router: express.Router;
    public readonly route: string;

    public constructor(route: string) {
        this.router = express.Router();
        this.route = route;
    }
}

export default ServerController;
