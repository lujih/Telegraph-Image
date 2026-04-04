import { DatabaseAdapter } from "./adapter.js";

export class KVDatabase extends DatabaseAdapter {
    constructor(env) {
        super(env);
        this.type = 'KV';
        this.kv = env.img_url;
    }

    async put(key, value, metadata = {}) {
        if (!this.kv) throw new Error('KV namespace not bound');
        return await this.kv.put(key, value, { metadata });
    }

    async get(key) {
        if (!this.kv) return null;
        return await this.kv.get(key);
    }

    async getWithMetadata(key) {
        if (!this.kv) return { value: null, metadata: null };
        return await this.kv.getWithMetadata(key);
    }

    async delete(key) {
        if (!this.kv) return false;
        await this.kv.delete(key);
        return true;
    }

    async list(options = {}) {
        if (!this.kv) return { keys: [], list_complete: true };
        return await this.kv.list({
            prefix: options.prefix,
            limit: options.limit || 100,
            cursor: options.cursor,
        });
    }
}
