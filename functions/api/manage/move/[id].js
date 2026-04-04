import { createDatabase } from "../../../db/factory.js";

export async function onRequest(context) {
    const { params, request, env } = context;
    const db = createDatabase(env);
    if (!db) return new Response(JSON.stringify({ error: 'No database configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    const url = new URL(request.url);
    const newId = url.searchParams.get('to');
    if (!newId) return new Response(JSON.stringify({ error: 'Missing "to" parameter' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const record = await db.getWithMetadata(params.id);
    if (!record || !record.metadata) return new Response(JSON.stringify({ error: 'File not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    // Check if target already exists
    const existing = await db.getWithMetadata(newId);
    if (existing && existing.metadata) return new Response(JSON.stringify({ error: 'Target already exists' }), { status: 409, headers: { 'Content-Type': 'application/json' } });

    // Copy to new location
    await db.put(newId, '', record.metadata);

    // Delete original
    await db.delete(params.id);

    return new Response(JSON.stringify({ success: true, from: params.id, to: newId }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
