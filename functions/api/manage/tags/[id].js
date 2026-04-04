import { createDatabase } from "../../../db/factory.js";

export async function onRequest(context) {
    const { params, request, env } = context;
    const db = createDatabase(env);
    if (!db) return new Response(JSON.stringify({ error: 'No database configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    const record = await db.getWithMetadata(params.id);
    if (!record || !record.metadata) return new Response(JSON.stringify({ error: 'File not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    const tags = record.metadata.tags || [];
    return new Response(JSON.stringify({ tags }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

export async function onRequestPost(context) {
    const { params, request, env } = context;
    const db = createDatabase(env);
    if (!db) return new Response(JSON.stringify({ error: 'No database configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'set'; // set, add, remove
    const body = await request.json();
    const newTags = body.tags || [];

    const record = await db.getWithMetadata(params.id);
    if (!record || !record.metadata) return new Response(JSON.stringify({ error: 'File not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    let tags = record.metadata.tags || [];

    if (action === 'set') {
        tags = newTags;
    } else if (action === 'add') {
        for (const tag of newTags) {
            if (!tags.includes(tag)) tags.push(tag);
        }
    } else if (action === 'remove') {
        tags = tags.filter(t => !newTags.includes(t));
    }

    record.metadata.tags = tags;
    await db.put(params.id, '', record.metadata);

    return new Response(JSON.stringify({ success: true, tags }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
