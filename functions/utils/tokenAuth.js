import { createDatabase } from "../db/factory.js";

export async function tokenAuth(context) {
    const { request, env } = context;

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return null;

    let token = null;
    if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
    } else if (authHeader.startsWith('Token ')) {
        token = authHeader.substring(6);
    }

    if (!token) return null;

    const db = createDatabase(env);
    if (!db) return null;

    let cursor = null;
    while (true) {
        const result = await db.list({ prefix: 'token_', limit: 100, cursor });
        for (const item of result.keys) {
            const record = await db.getWithMetadata(item.name);
            if (record && record.metadata && record.metadata.token === token) {
                // Check expiration
                if (record.metadata.expiresAt && Date.now() > record.metadata.expiresAt) {
                    return { valid: false, error: 'Token expired' };
                }

                // Update last used
                record.metadata.lastUsedAt = Date.now();
                await db.put(item.name, '', record.metadata);

                return {
                    valid: true,
                    token: record.metadata,
                    tokenId: item.name,
                };
            }
        }
        if (result.list_complete) break;
        cursor = result.cursor;
    }

    return null;
}
