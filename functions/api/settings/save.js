import { createDatabase } from "../../db/factory.js";

export async function onRequestPost(context) {
    const { request, env } = context;
    const db = createDatabase(env);
    if (!db) return new Response(JSON.stringify({ error: 'No database configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    let body;
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const { settings } = body;
    if (!settings || typeof settings !== 'object') {
        return new Response(JSON.stringify({ error: 'Settings object is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const saved = [];
    for (const [key, value] of Object.entries(settings)) {
        const settingKey = `setting_${key}`;
        await db.put(settingKey, '', { value, updatedAt: Date.now() });
        saved.push(key);
    }

    return new Response(JSON.stringify({ success: true, saved }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
