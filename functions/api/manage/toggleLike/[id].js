import { createDatabase } from "../../../db/factory.js";

export async function onRequest(context) {
    const { params } = context;
    const db = createDatabase(context.env);
    if (!db) return new Response('No database configured', { status: 500 });

    const record = await db.getWithMetadata(params.id);
    if (!record || !record.metadata) return new Response(`Image metadata not found for ID: ${params.id}`, { status: 404 });

    record.metadata.liked = !record.metadata.liked;
    await db.put(params.id, '', record.metadata);

    return new Response(JSON.stringify({ success: true, liked: record.metadata.liked }), {
        headers: { 'Content-Type': 'application/json' },
    });
}
