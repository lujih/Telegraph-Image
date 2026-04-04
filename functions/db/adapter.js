export class DatabaseAdapter {
    constructor(env) {
        this.env = env;
        this.type = 'Unknown';
    }

    async put(key, value, metadata = {}) {
        throw new Error('put() not implemented');
    }

    async get(key) {
        throw new Error('get() not implemented');
    }

    async getWithMetadata(key) {
        throw new Error('getWithMetadata() not implemented');
    }

    async delete(key) {
        throw new Error('delete() not implemented');
    }

    async list(options = {}) {
        throw new Error('list() not implemented');
    }
}
