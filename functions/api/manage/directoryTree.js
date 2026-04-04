import { createDatabase } from "../../db/factory.js";

export async function onRequest(context) {
    const { env } = context;
    const db = createDatabase(env);
    if (!db) return new Response(JSON.stringify({ error: 'No database configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    const directories = new Set();
    let cursor = null;

    while (true) {
        const result = await db.list({ limit: 1000, cursor });
        for (const item of result.keys) {
            const name = item.name;
            // Extract directory from file path (everything before last /)
            const lastSlash = name.lastIndexOf('/');
            if (lastSlash > 0) {
                const dir = name.substring(0, lastSlash);
                directories.add(dir);
            }
        }
        if (result.list_complete) break;
        cursor = result.cursor;
    }

    // Build tree structure
    const tree = [];
    const dirArray = Array.from(directories).sort();

    for (const dir of dirArray) {
        const parts = dir.split('/');
        let current = tree;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            let found = current.find(n => n.name === part);
            if (!found) {
                found = { name: part, path: parts.slice(0, i + 1).join('/'), children: [] };
                current.push(found);
            }
            current = found.children;
        }
    }

    return new Response(JSON.stringify({ directories: tree, count: dirArray.length }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
