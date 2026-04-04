import { createDatabase } from "../../../db/factory.js";

export async function onRequestPost(context) {
    const { request, env } = context;
    const db = createDatabase(env);
    if (!db) return new Response(JSON.stringify({ error: 'No database configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    const body = await request.json();
    const { fileIds, pattern, replacement } = body;

    if (!fileIds || !Array.isArray(fileIds) || !pattern) {
        return new Response(JSON.stringify({ error: 'Missing required fields: fileIds, pattern' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const results = [];
    for (const fileId of fileIds) {
        try {
            const record = await db.getWithMetadata(fileId);
            if (!record || !record.metadata) {
                results.push({ fileId, success: false, error: 'Not found' });
                continue;
            }

            const currentName = record.metadata.fileName || fileId;
            const regex = new RegExp(pattern, 'g');
            const newName = currentName.replace(regex, replacement || '');

            if (newName === currentName) {
                results.push({ fileId, success: false, error: 'No change' });
                continue;
            }

            const ext = fileId.includes('.') ? '.' + fileId.split('.').pop() : '';
            const cleanName = newName.replace(/[\/\\]/g, '_');
            const newId = cleanName + ext;

            const existing = await db.getWithMetadata(newId);
            if (existing && existing.metadata && newId !== fileId) {
                results.push({ fileId, success: false, error: 'Target exists' });
                continue;
            }

            record.metadata.fileName = newName;
            await db.put(newId, '', record.metadata);
            if (newId !== fileId) await db.delete(fileId);

            results.push({ fileId, success: true, newId, newName });
        } catch (e) {
            results.push({ fileId, success: false, error: e.message });
        }
    }

    const successCount = results.filter(r => r.success).length;
    return new Response(JSON.stringify({ success: true, results, successCount, totalCount: fileIds.length }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
