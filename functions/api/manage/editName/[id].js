import { createDatabase } from "../../../db/factory.js";

export async function onRequest(context) {
    const { params, request } = context;
    const url = new URL(request.url);
    const newName = url.searchParams.get('newName');
    const db = createDatabase(context.env);
    if (!db) return new Response('No database configured', { status: 500 });

    const record = await db.getWithMetadata(params.id);
    if (!record || !record.metadata) return new Response(`Image metadata not found for ID: ${params.id}`, { status: 404 });

    record.metadata.fileName = newName || params.name;
    await db.put(params.id, '', record.metadata);

    return new Response(JSON.stringify({ success: true, fileName: record.metadata.fileName }), {
        headers: { 'Content-Type': 'application/json' },
    });
}
