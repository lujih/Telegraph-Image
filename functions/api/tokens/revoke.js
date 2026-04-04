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

    const { id } = body;
    if (!id) return new Response(JSON.stringify({ error: 'Token ID is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const record = await db.getWithMetadata(id);
    if (!record || !record.metadata) return new Response(JSON.stringify({ error: 'Token not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    await db.delete(id);

    return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
