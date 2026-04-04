import { createDatabase } from "../../../db/factory.js";

export async function onRequest(context) {
    const { params, request, env } = context;
    const db = createDatabase(env);
    if (!db) return new Response(JSON.stringify({ error: 'No database configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    const url = new URL(request.url);
    const newName = url.searchParams.get('name');
    if (!newName) return new Response(JSON.stringify({ error: 'Missing "name" parameter' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const record = await db.getWithMetadata(params.id);
    if (!record || !record.metadata) return new Response(JSON.stringify({ error: 'File not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    // Build new ID: keep extension, change base name
    const ext = params.id.includes('.') ? '.' + params.id.split('.').pop() : '';
    const cleanName = newName.replace(/[\/\\]/g, '_'); // Sanitize path separators
    const newId = cleanName + ext;

    // Check if target already exists
    const existing = await db.getWithMetadata(newId);
    if (existing && existing.metadata && newId !== params.id) {
        return new Response(JSON.stringify({ error: 'File with this name already exists' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }

    // Update metadata
    record.metadata.fileName = newName;

    // If ID changed, move to new key
    if (newId !== params.id) {
        await db.put(newId, '', record.metadata);
        await db.delete(params.id);
    } else {
        // Just update metadata
        await db.put(params.id, '', record.metadata);
    }

    return new Response(JSON.stringify({ success: true, oldId: params.id, newId: newId, fileName: newName }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
