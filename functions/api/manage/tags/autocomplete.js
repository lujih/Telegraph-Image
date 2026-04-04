import { createDatabase } from "../../../db/factory.js";

export async function onRequest(context) {
    const { env, request } = context;
    const db = createDatabase(env);
    if (!db) return new Response(JSON.stringify({ error: 'No database configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    const url = new URL(request.url);
    const prefix = (url.searchParams.get('prefix') || '').toLowerCase();
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

    const allTags = new Map();
    let cursor = null;

    while (true) {
        const result = await db.list({ limit: 1000, cursor });
        for (const item of result.keys) {
            if (item.metadata && item.metadata.tags && Array.isArray(item.metadata.tags)) {
                for (const tag of item.metadata.tags) {
                    const tagLower = tag.toLowerCase();
                    if (!prefix || tagLower.startsWith(prefix)) {
                        allTags.set(tag, (allTags.get(tag) || 0) + 1);
                    }
                }
            }
        }
        if (result.list_complete) break;
        cursor = result.cursor;
    }

    // Sort by count descending, then alphabetically
    const sorted = Array.from(allTags.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, limit)
        .map(([tag, count]) => ({ tag, count }));

    return new Response(JSON.stringify({ tags: sorted }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
