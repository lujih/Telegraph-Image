import { TelegramStorage } from "./telegram.js";
import { R2Storage } from "./r2.js";
import { S3Storage } from "./s3.js";

export function createStorage(env) {
    const channel = env.STORAGE_CHANNEL || 'TelegramNew';

    switch (channel) {
        case 'CloudflareR2':
            return new R2Storage(env);
        case 'S3':
            return new S3Storage(env);
        case 'TelegramNew':
        default:
            return new TelegramStorage(env);
    }
}
