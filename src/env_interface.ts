export interface ENV {
    server?: {
        session?: {
            ttl?: 86400 | number;
            secret?: string;
        };
        port?: number;
        assets?: string;
    };
}

export default ENV;
