import { DatabaseAdapter } from "./adapter.js";

export class D1Database extends DatabaseAdapter {
    constructor(env) {
        super(env);
        this.type = 'D1';
        this.db = env.img_db;
    }

    async init() {
        if (!this.db) return;
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                value TEXT DEFAULT '',
                metadata TEXT DEFAULT '{}',
                file_name TEXT,
                file_type TEXT,
                file_size INTEGER,
                upload_ip TEXT,
                upload_address TEXT,
                list_type TEXT DEFAULT 'None',
                timestamp INTEGER,
                label TEXT DEFAULT 'None',
                channel TEXT DEFAULT 'TelegramNew',
                is_chunked INTEGER DEFAULT 0,
                liked INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_list_type ON files(list_type);
            CREATE INDEX IF NOT EXISTS idx_timestamp ON files(timestamp);
            CREATE INDEX IF NOT EXISTS idx_channel ON files(channel);
        `);
    }

    async put(key, value, metadata = {}) {
        if (!this.db) throw new Error('D1 database not bound');
        const metaJson = JSON.stringify({
            ...metadata,
            fileName: metadata.fileName || key,
            fileSize: metadata.fileSize || 0,
            Channel: metadata.Channel || 'TelegramNew',
        });
        await this.db.prepare(
            `INSERT OR REPLACE INTO files (id, value, metadata, file_name, file_type, file_size, list_type, timestamp, label, channel, is_chunked, liked)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
            key,
            value || '',
            metaJson,
            metadata.fileName || key,
            metadata.fileType || '',
            metadata.fileSize || 0,
            metadata.ListType || 'None',
            metadata.TimeStamp || Date.now(),
            metadata.Label || 'None',
            metadata.Channel || 'TelegramNew',
            metadata.isChunked ? 1 : 0,
            metadata.liked ? 1 : 0
        ).run();
    }

    async get(key) {
        if (!this.db) return null;
        const result = await this.db.prepare('SELECT value FROM files WHERE id = ?').bind(key).first();
        return result ? result.value : null;
    }

    async getWithMetadata(key) {
        if (!this.db) return { value: null, metadata: null };
        const result = await this.db.prepare('SELECT * FROM files WHERE id = ?').bind(key).first();
        if (!result) return { value: null, metadata: null };
        let metadata = {};
        try { metadata = JSON.parse(result.metadata || '{}'); } catch (e) {}
        return {
            value: result.value,
            metadata: {
                ...metadata,
                ListType: result.list_type || metadata.ListType || 'None',
                Label: result.label || metadata.Label || 'None',
                TimeStamp: result.timestamp || metadata.TimeStamp || Date.now(),
                Channel: result.channel || metadata.Channel || 'TelegramNew',
                liked: result.liked === 1,
                fileName: result.file_name || metadata.fileName || key,
                fileSize: result.file_size || metadata.fileSize || 0,
            }
        };
    }

    async delete(key) {
        if (!this.db) return false;
        await this.db.prepare('DELETE FROM files WHERE id = ?').bind(key).run();
        return true;
    }

    async list(options = {}) {
        if (!this.db) return { keys: [], list_complete: true };

        let sql = 'SELECT id, value, metadata, file_name, file_type, file_size, list_type, timestamp, label, channel, is_chunked, liked FROM files';
        const params = [];
        const conditions = [];

        if (options.prefix) {
            conditions.push('id LIKE ?');
            params.push(options.prefix + '%');
        }

        if (conditions.length) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }

        sql += ' ORDER BY timestamp DESC';

        const limit = options.limit || 100;
        sql += ' LIMIT ?';
        params.push(limit + 1); // +1 to check if there are more

        if (options.cursor) {
            const cursorTime = parseInt(Buffer.from(options.cursor, 'base64').toString(), 10);
            sql = sql.replace('ORDER BY timestamp DESC', 'ORDER BY timestamp DESC');
            conditions.push('timestamp < ?');
            if (!sql.includes('WHERE')) {
                sql = sql.replace('ORDER BY', 'WHERE timestamp < ? ORDER BY');
                params.unshift(cursorTime);
            } else {
                sql = sql.replace('ORDER BY', 'AND timestamp < ? ORDER BY');
                params.splice(params.length - 1, 0, cursorTime);
            }
        }

        const results = await this.db.prepare(sql).bind(...params).all();

        const keys = results.results.slice(0, limit).map(row => {
            let metadata = {};
            try { metadata = JSON.parse(row.metadata || '{}'); } catch (e) {}
            return {
                name: row.id,
                metadata: {
                    ...metadata,
                    ListType: row.list_type || metadata.ListType || 'None',
                    Label: row.label || metadata.Label || 'None',
                    TimeStamp: row.timestamp || metadata.TimeStamp,
                    Channel: row.channel || metadata.Channel || 'TelegramNew',
                    liked: row.liked === 1,
                    fileName: row.file_name || metadata.fileName || row.id,
                    fileSize: row.file_size || metadata.fileSize || 0,
                }
            };
        });

        const list_complete = results.results.length <= limit;
        const cursor = list_complete ? null : Buffer.from(String(results.results[limit - 1].timestamp)).toString('base64');

        return { keys, list_complete, cursor };
    }

    async updateMetadata(key, updates) {
        if (!this.db) return false;
        const sets = [];
        const params = [];

        if (updates.ListType !== undefined) { sets.push('list_type = ?'); params.push(updates.ListType); }
        if (updates.Label !== undefined) { sets.push('label = ?'); params.push(updates.Label); }
        if (updates.fileName !== undefined) { sets.push('file_name = ?'); params.push(updates.fileName); }
        if (updates.liked !== undefined) { sets.push('liked = ?'); params.push(updates.liked ? 1 : 0); }

        if (!sets.length) return false;

        params.push(key);
        await this.db.prepare(`UPDATE files SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
        return true;
    }
}
