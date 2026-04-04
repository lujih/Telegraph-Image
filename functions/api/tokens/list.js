import { createDatabase } from "../../db/factory.js";

export async function onRequest(context) {
    const { env } = context;
    const db = createDatabase(env);
    if (!db) return new Response('No database configured', { status: 500, headers: { 'Content-Type': 'application/json' } });

    const tokens = [];
    let cursor = null;

    while (true) {
        const result = await db.list({ prefix: 'token_', limit: 100, cursor });
        for (const item of result.keys) {
            const record = await db.getWithMetadata(item.name);
            if (record && record.metadata) {
                tokens.push({
                    id: item.name,
                    name: record.metadata.name,
                    token: record.metadata.token,
                    permissions: record.metadata.permissions || ['read'],
                    createdAt: record.metadata.createdAt,
                    expiresAt: record.metadata.expiresAt,
                    lastUsedAt: record.metadata.lastUsedAt,
                });
            }
        }
        if (result.list_complete) break;
        cursor = result.cursor;
    }

    return new Response(JSON.stringify({ tokens }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
