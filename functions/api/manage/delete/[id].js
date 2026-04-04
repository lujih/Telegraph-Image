import { createDatabase } from "../../../db/factory.js";

export async function onRequest(context) {
    const { params } = context;
    const db = createDatabase(context.env);
    if (!db) return new Response('No database configured', { status: 500 });

    await db.delete(params.id);
    return new Response(JSON.stringify(params.id));
}
