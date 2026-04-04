import { createDatabase } from "../../db/factory.js";

export async function onRequest(context) {
    const { env } = context;
    const db = createDatabase(env);
    if (!db) return new Response(JSON.stringify({ error: 'No database configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    const settings = {};
    let cursor = null;

    while (true) {
        const result = await db.list({ prefix: 'setting_', limit: 100, cursor });
        for (const item of result.keys) {
            const record = await db.getWithMetadata(item.name);
            if (record && record.metadata && record.metadata.value !== undefined) {
                settings[item.name.replace('setting_', '')] = record.metadata.value;
            }
        }
        if (result.list_complete) break;
        cursor = result.cursor;
    }

    // Also include env vars as defaults
    settings.STORAGE_CHANNEL = env.STORAGE_CHANNEL || 'TelegramNew';
    settings.hasR2 = !!env.img_r2;
    settings.hasD1 = !!env.img_db;
    settings.hasBasicAuth = !!env.BASIC_USER;

    return new Response(JSON.stringify({ settings }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
