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

    const { name, permissions, expiresAt } = body;
    if (!name) return new Response(JSON.stringify({ error: 'Token name is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const token = 'sk_' + crypto.randomUUID().replace(/-/g, '');
    const id = 'token_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

    const metadata = {
        name: name,
        token: token,
        permissions: permissions || ['read', 'upload', 'delete'],
        createdAt: Date.now(),
        expiresAt: expiresAt || null,
        lastUsedAt: null,
    };

    await db.put(id, '', metadata);

    return new Response(JSON.stringify({
        id: id,
        name: name,
        token: token,
        permissions: metadata.permissions,
        createdAt: metadata.createdAt,
        expiresAt: metadata.expiresAt,
    }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
    });
}
