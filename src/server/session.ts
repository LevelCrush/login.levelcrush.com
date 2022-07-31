export default interface LoginSession {
    user?: string;
    platforms?: {
        [platform: string]: {
            access_token: string;
            refresh_token: string;
            expires_at: string;
        };
    };
}
