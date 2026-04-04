import { createDatabase } from "../../../db/factory.js";

export async function onRequestPost(context) {
    const { request, env } = context;
    const db = createDatabase(env);
    if (!db) return new Response(JSON.stringify({ error: 'No database configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    const body = await request.json();
    const { fileIds, to } = body;

    if (!fileIds || !Array.isArray(fileIds) || !to) {
        return new Response(JSON.stringify({ error: 'Missing required fields: fileIds, to' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const results = [];
    for (const fileId of fileIds) {
        try {
            const record = await db.getWithMetadata(fileId);
            if (!record || !record.metadata) {
                results.push({ fileId, success: false, error: 'Not found' });
                continue;
            }

            const fileName = fileId.split('/').pop() || fileId;
            const newId = to.endsWith('/') ? to + fileName : to + '/' + fileName;

            const existing = await db.getWithMetadata(newId);
            if (existing && existing.metadata) {
                results.push({ fileId, success: false, error: 'Target exists' });
                continue;
            }

            await db.put(newId, '', record.metadata);
            await db.delete(fileId);
            results.push({ fileId, success: true, newId });
        } catch (e) {
            results.push({ fileId, success: false, error: e.message });
        }
    }

    const successCount = results.filter(r => r.success).length;
    return new Response(JSON.stringify({ success: true, results, successCount, totalCount: fileIds.length }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
