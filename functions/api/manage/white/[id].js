import { createDatabase } from "../../../db/factory.js";

export async function onRequest(context) {
    const { params } = context;
    const db = createDatabase(context.env);
    if (!db) return new Response('No database configured', { status: 500 });

    const record = await db.getWithMetadata(params.id);
    if (!record || !record.metadata) return new Response('Not found', { status: 404 });

    record.metadata.ListType = 'White';
    await db.put(params.id, '', record.metadata);

    return new Response(JSON.stringify(record.metadata));
}
