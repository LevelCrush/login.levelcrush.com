import moment = require('moment');
import { Connection, createConnection } from 'typeorm';

export class Database {
    private connection: Connection | undefined;

    public constructor() {
        this.connection = undefined;
    }

    /**
     * Connect this instance to the database
     * */
    public connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.connection === undefined) {
                let connectionPromise = createConnection();
                connectionPromise
                    .then((connection) => {
                        this.connection = connection;
                        resolve();
                    })
                    .catch((reason) => {
                        reject(reason);
                    });
            }
        });
    }

    public raw(): Connection {
        if (this.connection !== undefined) {
            return this.connection;
        } else {
            throw new Error('Not connected to the database');
        }
    }

    public close(): Promise<void> {
        return new Promise((resolve) => {
            if (this.connection !== undefined) {
                this.connection
                    .close()
                    .then(() => {
                        // todo something here on success
                        let somethingSuccess = 1;
                    })
                    .catch(() => {
                        // todo somehere here on failure
                        let somethingFailure = 1;
                    })
                    .finally(() => {
                        // no matter what we are doing this
                        this.connection = undefined;
                        resolve();
                    });
            } else {
                resolve();
            }
        });
    }

    public ping(): Promise<void> {
        return new Promise((resolve) => {
            if (this.connection !== undefined) {
                this.connection.query('SELECT 1+1').finally(() => {
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    public startAutoPing(): Promise<void> {
        return new Promise(() => {
            setInterval(() => {
                //  console.log("Pinging database at " + moment().unix());
            }, 5000); // ping every 5 seconds
        });
    }
}

export default Database;
