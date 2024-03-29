export interface ENV {
    server?: {
        session?: {
            ttl?: 86400 | number;
            secret?: string;
        };
        port?: number;
        assets?: string;
        domain?: string;
        url?: string;
        ssl?: {
            key: string;
            cert: string;
        };
    };
    hosts: {
        api: string;
        login: string;
        frontend: string;
    };
    platforms: {
        api: {
            token: string;
            token_secret: string;
        };
        discord: {
            oauth: {
                urls: {
                    authorize: string;
                    token: string;
                    revoke: string;
                };
                client_id: string;
                client_secret: string;
                public_key: string;
            };
        };
        twitch: {
            oauth: {
                urls: {
                    authorize: string;
                    token: string;
                    revoke: string;
                };
                client_id: string;
                client_secret: string;
            };
        };
        bungie: {
            oauth: {
                urls: {
                    authorize: string;
                    token: string;
                    revoke: string;
                    refresh: string;
                };
                api_key: string;
                client_id: string;
                client_secret: string;
            };
        };
    };
}

export default ENV;
