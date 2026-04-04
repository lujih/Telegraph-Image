import { StorageBase } from "./base.js";

export class S3Storage extends StorageBase {
    constructor(env) {
        super(env);
        this.channel = 'S3';
        this.endpoint = env.S3_ENDPOINT || '';
        this.accessKeyId = env.S3_ACCESS_KEY_ID || '';
        this.secretAccessKey = env.S3_SECRET_ACCESS_KEY || '';
        this.bucketName = env.S3_BUCKET_NAME || '';
        this.region = env.S3_REGION || 'auto';
        this.pathStyle = env.S3_PATH_STYLE === 'true';
        this.cdnDomain = env.S3_CDN_DOMAIN || '';
    }

    async upload(file, fileName, mimeType) {
        if (!this.endpoint || !this.bucketName) {
            throw new Error('S3 not configured. Please set S3_ENDPOINT, S3_BUCKET_NAME, etc.');
        }

        const key = `uploads/${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${fileName}`;

        const url = this.pathStyle
            ? `${this.endpoint}/${this.bucketName}/${key}`
            : `${this.endpoint}/${key}`;

        const authHeader = await this.generatePresignedAuth('PUT', key, mimeType, file.size);

        const uploadRes = await fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': mimeType,
                'Authorization': authHeader,
                'Content-Length': String(file.size),
            },
            body: file,
        });

        if (!uploadRes.ok) {
            const errorText = await uploadRes.text();
            throw new Error(`S3 upload failed: ${uploadRes.status} ${errorText}`);
        }

        const publicUrl = this.cdnDomain
            ? `https://${this.cdnDomain}/${key}`
            : this.pathStyle
                ? `${this.endpoint}/${this.bucketName}/${key}`
                : `${this.endpoint}/${key}`;

        return {
            fileId: key,
            src: publicUrl,
            channel: this.channel,
        };
    }

    async get(fileId) {
        if (!this.endpoint || !this.bucketName) return null;

        const url = this.pathStyle
            ? `${this.endpoint}/${this.bucketName}/${fileId}`
            : `${this.endpoint}/${fileId}`;

        const authHeader = await this.generatePresignedAuth('GET', fileId, '', 0);

        return await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': authHeader,
            },
        });
    }

    async delete(fileId) {
        if (!this.endpoint || !this.bucketName) return false;

        const url = this.pathStyle
            ? `${this.endpoint}/${this.bucketName}/${fileId}`
            : `${this.endpoint}/${fileId}`;

        const authHeader = await this.generatePresignedAuth('DELETE', fileId, '', 0);

        const res = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Authorization': authHeader,
            },
        });

        return res.ok;
    }

    getPublicUrl(fileId) {
        if (this.cdnDomain) {
            return `https://${this.cdnDomain}/${fileId}`;
        }
        return this.pathStyle
            ? `${this.endpoint}/${this.bucketName}/${fileId}`
            : `${this.endpoint}/${fileId}`;
    }

    async generatePresignedAuth(method, key, contentType, contentLength) {
        // Simple HMAC-SHA256 signing for S3-compatible APIs
        // For production, use a proper AWS SigV4 implementation
        const encoder = new TextEncoder();
        const keyData = encoder.encode(this.secretAccessKey);
        const cryptoKey = await crypto.subtle.importKey(
            'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        );
        const signature = await crypto.subtle.sign(
            'HMAC', cryptoKey, encoder.encode(`${method}\n\n${contentType}\n\n/${this.bucketName}/${key}`)
        );
        return `AWS ${this.accessKeyId}:${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
    }
}
