import { createDatabase } from "../../db/factory.js";

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    const raw = url.searchParams.get("limit");
    let limit = parseInt(raw || "100", 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = 100;
    if (limit > 1000) limit = 1000;

    const cursor = url.searchParams.get("cursor") || undefined;
    const prefix = url.searchParams.get("prefix") || undefined;

    const db = createDatabase(env);
    if (!db) {
        return new Response(JSON.stringify({ error: 'No database configured' }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    // Initialize D1 if needed
    if (db.type === 'D1' && db.init) {
        await db.init();
    }

    const value = await db.list({ limit, cursor, prefix });

    return new Response(JSON.stringify(value), {
        headers: { "Content-Type": "application/json" }
    });
}
