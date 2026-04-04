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

    // Advanced filter params
    const channel = url.searchParams.get("channel") || undefined;
    const listType = url.searchParams.get("listType") || undefined;
    const fileType = url.searchParams.get("fileType") || undefined;
    const label = url.searchParams.get("label") || undefined;
    const includeTags = url.searchParams.get("includeTags") || undefined;
    const excludeTags = url.searchParams.get("excludeTags") || undefined;
    const search = url.searchParams.get("search") || undefined;

    const db = createDatabase(env);
    if (!db) {
        return new Response(JSON.stringify({ error: 'No database configured' }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    if (db.type === 'D1' && db.init) {
        await db.init();
    }

    const value = await db.list({ limit, cursor, prefix });

    // Apply client-side filters
    let filtered = value.keys;

    if (channel) {
        const channels = channel.split(',');
        filtered = filtered.filter(f => channels.includes(f.metadata?.Channel));
    }
    if (listType) {
        const types = listType.split(',');
        filtered = filtered.filter(f => types.includes(f.metadata?.ListType));
    }
    if (fileType) {
        const ext = fileType.toLowerCase();
        filtered = filtered.filter(f => {
            const name = f.metadata?.fileName || f.name || '';
            const fileExt = name.split('.').pop().toLowerCase();
            if (ext === 'image') return ['jpg','jpeg','png','gif','webp','bmp','tiff','ico','svg'].includes(fileExt);
            if (ext === 'video') return ['mp4','webm','ogg','avi','mov','wmv','flv','mkv'].includes(fileExt);
            if (ext === 'audio') return ['mp3','wav','ogg','flac','aac','m4a','wma'].includes(fileExt);
            if (ext === 'document') return !['jpg','jpeg','png','gif','webp','bmp','tiff','ico','svg','mp4','webm','ogg','avi','mov','wmv','flv','mkv','mp3','wav','flac','aac','m4a','wma'].includes(fileExt);
            return true;
        });
    }
    if (label) {
        filtered = filtered.filter(f => f.metadata?.Label === label);
    }
    if (includeTags) {
        const tags = includeTags.split(',');
        filtered = filtered.filter(f => {
            const fileTags = f.metadata?.tags || [];
            return tags.some(t => fileTags.includes(t));
        });
    }
    if (excludeTags) {
        const tags = excludeTags.split(',');
        filtered = filtered.filter(f => {
            const fileTags = f.metadata?.tags || [];
            return !tags.some(t => fileTags.includes(t));
        });
    }
    if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(f => {
            const fileName = (f.metadata?.fileName || '').toLowerCase();
            const fileId = (f.name || '').toLowerCase();
            return fileName.includes(s) || fileId.includes(s);
        });
    }

    value.keys = filtered;
    value.list_complete = true;
    value.cursor = null;

    return new Response(JSON.stringify(value), {
        headers: { "Content-Type": "application/json" }
    });
}
