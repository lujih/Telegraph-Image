export class StorageBase {
    constructor(env) {
        this.env = env;
        this.channel = 'Unknown';
    }

    async upload(file, fileName, mimeType) {
        throw new Error('upload() not implemented');
    }

    async get(fileId) {
        throw new Error('get() not implemented');
    }

    async delete(fileId) {
        throw new Error('delete() not implemented');
    }

    getPublicUrl(fileId) {
        throw new Error('getPublicUrl() not implemented');
    }
}
