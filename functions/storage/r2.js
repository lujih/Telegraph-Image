import { StorageBase } from "./base.js";

export class R2Storage extends StorageBase {
    constructor(env) {
        super(env);
        this.channel = 'CloudflareR2';
        this.bucket = env.img_r2;
        this.publicUrl = env.R2_PUBLIC_URL || '';
    }

    async upload(file, fileName, mimeType) {
        if (!this.bucket) {
            throw new Error('R2 bucket not configured. Please bind img_r2 KV namespace.');
        }

        const key = `uploads/${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${fileName}`;

        await this.bucket.put(key, file, {
            httpMetadata: {
                contentType: mimeType,
            },
            customMetadata: {
                fileName: fileName,
                fileSize: String(file.size),
                uploadedAt: String(Date.now()),
            }
        });

        const src = this.publicUrl
            ? `${this.publicUrl}/${key}`
            : `/file/${key}`;

        return {
            fileId: key,
            src: src,
            channel: this.channel,
        };
    }

    async get(fileId) {
        if (!this.bucket) return null;
        const object = await this.bucket.get(fileId);
        if (!object) return null;
        return object;
    }

    async delete(fileId) {
        if (!this.bucket) return false;
        await this.bucket.delete(fileId);
        return true;
    }

    getPublicUrl(fileId) {
        if (this.publicUrl) {
            return `${this.publicUrl}/${fileId}`;
        }
        return `/file/${fileId}`;
    }
}
