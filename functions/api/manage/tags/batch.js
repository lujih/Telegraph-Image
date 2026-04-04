import { createDatabase } from "../../../db/factory.js";

export async function onRequestPost(context) {
    const { request, env } = context;
    const db = createDatabase(env);
    if (!db) return new Response(JSON.stringify({ error: 'No database configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    const body = await request.json();
    const { fileIds, action, tags } = body;

    if (!fileIds || !Array.isArray(fileIds) || !action || !tags || !Array.isArray(tags)) {
        return new Response(JSON.stringify({ error: 'Missing required fields: fileIds, action, tags' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const results = [];
    for (const fileId of fileIds) {
        try {
            const record = await db.getWithMetadata(fileId);
            if (!record || !record.metadata) {
                results.push({ fileId, success: false, error: 'Not found' });
                continue;
            }

            let fileTags = record.metadata.tags || [];

            if (action === 'set') {
                fileTags = tags;
            } else if (action === 'add') {
                for (const tag of tags) {
                    if (!fileTags.includes(tag)) fileTags.push(tag);
                }
            } else if (action === 'remove') {
                fileTags = fileTags.filter(t => !tags.includes(t));
            }

            record.metadata.tags = fileTags;
            await db.put(fileId, '', record.metadata);
            results.push({ fileId, success: true, tags: fileTags });
        } catch (e) {
            results.push({ fileId, success: false, error: e.message });
        }
    }

    const successCount = results.filter(r => r.success).length;
    return new Response(JSON.stringify({ success: true, results, successCount, totalCount: fileIds.length }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
