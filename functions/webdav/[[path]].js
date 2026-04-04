import { createDatabase } from "../../db/factory.js";
import { createStorage } from "../../storage/factory.js";

export async function onRequest(context) {
    const { request, env, params } = context;
    const method = request.method.toUpperCase();
    const db = createDatabase(env);
    const storage = createStorage(env);

    if (!db) return new Response('No database', { status: 500 });

    const path = params.path || '';
    const isRoot = !path || path === '/';

    switch (method) {
        case 'OPTIONS':
            return handleOptions();
        case 'PROPFIND':
            return handlePropfind(db, path, isRoot, request);
        case 'PROPPATCH':
            return handlePropPatch();
        case 'MKCOL':
            return handleMkcol();
        case 'GET':
        case 'HEAD':
            return handleGet(db, storage, path, request);
        case 'PUT':
            return handlePut(db, storage, path, request);
        case 'DELETE':
            return handleDelete(db, path);
        case 'COPY':
        case 'MOVE':
            return handleCopyMove(db, path, request, method);
        default:
            return new Response('Method Not Allowed', { status: 405 });
    }
}

async function handleOptions() {
    return new Response(null, {
        status: 200,
        headers: {
            'Allow': 'OPTIONS, PROPFIND, PROPPATCH, MKCOL, GET, HEAD, PUT, DELETE, COPY, MOVE',
            'DAV': '1, 2',
            'MS-Author-Via': 'DAV',
        },
    });
}

async function handlePropfind(db, path, isRoot, request) {
    const depth = request.headers.get('Depth') || 'infinity';

    if (isRoot) {
        const body = buildPropfindResponse([{
            href: '/',
            displayName: 'root',
            isCollection: true,
            creationDate: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            contentLength: 0,
            contentType: 'httpd/unix-directory',
        }]);
        return new Response(body, {
            status: 207,
            headers: { 'Content-Type': 'application/xml; charset=utf-8', 'DAV': '1, 2' },
        });
    }

    // Check if it's a directory (prefix match)
    const prefix = path.endsWith('/') ? path : path + '/';
    const listResult = await db.list({ prefix, limit: 1 });

    const isCollection = listResult.keys.length > 0;

    if (isCollection) {
        const files = [];
        let cursor = null;
        while (true) {
            const result = await db.list({ prefix, limit: 100, cursor });
            for (const item of result.keys) {
                const meta = item.metadata || {};
                files.push({
                    href: `/${item.name}`,
                    displayName: meta.fileName || item.name,
                    isCollection: false,
                    creationDate: new Date(meta.TimeStamp || Date.now()).toISOString(),
                    lastModified: new Date(meta.TimeStamp || Date.now()).toISOString(),
                    contentLength: meta.fileSize || 0,
                    contentType: meta.fileType || 'application/octet-stream',
                });
            }
            if (result.list_complete) break;
            cursor = result.cursor;
        }

        files.unshift({
            href: `/${path}`,
            displayName: path.split('/').pop() || 'root',
            isCollection: true,
            creationDate: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            contentLength: 0,
            contentType: 'httpd/unix-directory',
        });

        const body = buildPropfindResponse(files);
        return new Response(body, {
            status: 207,
            headers: { 'Content-Type': 'application/xml; charset=utf-8', 'DAV': '1, 2' },
        });
    }

    // Single file
    const record = await db.getWithMetadata(path);
    if (!record || !record.metadata) {
        return new Response('Not Found', { status: 404 });
    }

    const meta = record.metadata;
    const body = buildPropfindResponse([{
        href: `/${path}`,
        displayName: meta.fileName || path,
        isCollection: false,
        creationDate: new Date(meta.TimeStamp || Date.now()).toISOString(),
        lastModified: new Date(meta.TimeStamp || Date.now()).toISOString(),
        contentLength: meta.fileSize || 0,
        contentType: meta.fileType || 'application/octet-stream',
    }]);

    return new Response(body, {
        status: 207,
        headers: { 'Content-Type': 'application/xml; charset=utf-8', 'DAV': '1, 2' },
    });
}

async function handleGet(db, storage, path, request) {
    const record = await db.getWithMetadata(path);
    if (!record || !record.metadata) return new Response('Not Found', { status: 404 });

    const meta = record.metadata;
    const channel = meta.Channel || 'TelegramNew';

    if (channel === 'CloudflareR2' && storage.channel === 'CloudflareR2') {
        const object = await storage.get(path);
        if (!object) return new Response('Not Found', { status: 404 });
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(meta.fileName || path)}"`);
        return new Response(object.body, { headers });
    }

    // For Telegram and others, redirect to the file URL
    const fileUrl = storage.getPublicUrl(path);
    return Response.redirect(fileUrl.startsWith('http') ? fileUrl : `${new URL(request.url).origin}${fileUrl}`, 302);
}

async function handlePut(db, storage, path, request) {
    const body = await request.arrayBuffer();
    const file = new File([body], path.split('/').pop() || 'upload', {
        type: request.headers.get('Content-Type') || 'application/octet-stream',
    });

    const result = await storage.upload(file, file.name, file.type);

    await db.put(result.fileId, '', {
        TimeStamp: Date.now(),
        ListType: 'None',
        Label: 'None',
        liked: false,
        fileName: file.name,
        fileSize: file.size,
        Channel: result.channel,
        fileType: file.type,
    });

    return new Response(null, { status: 201 });
}

async function handleDelete(db, path) {
    await db.delete(path);
    return new Response(null, { status: 204 });
}

async function handlePropPatch() {
    return new Response('<?xml version="1.0"?><D:multistatus xmlns:D="DAV:"><D:response><D:href>/</D:href><D:propstat><D:prop/><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>', {
        status: 207,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
}

async function handleMkcol() {
    // WebDAV doesn't need real directories in KV/D1
    return new Response(null, { status: 201 });
}

async function handleCopyMove(db, path, request, method) {
    const destHeader = request.headers.get('Destination');
    if (!destHeader) return new Response('Destination header required', { status: 400 });

    const destUrl = new URL(destHeader);
    const destPath = destUrl.pathname.replace(/^\/webdav\//, '');

    const record = await db.getWithMetadata(path);
    if (!record || !record.metadata) return new Response('Not Found', { status: 404 });

    await db.put(destPath, '', record.metadata);

    if (method === 'MOVE') {
        await db.delete(path);
    }

    return new Response(null, { status: 201 });
}

function buildPropfindResponse(resources) {
    let xml = '<?xml version="1.0" encoding="utf-8"?>\n<D:multistatus xmlns:D="DAV:">\n';
    for (const res of resources) {
        xml += `  <D:response>
    <D:href>${escapeXml(res.href)}</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>${escapeXml(res.displayName)}</D:displayname>
        <D:getcontentlength>${res.contentLength}</D:getcontentlength>
        <D:getlastmodified>${res.lastModified}</D:getlastmodified>
        <D:creationdate>${res.creationDate}</D:creationdate>
        <D:getcontenttype>${res.contentType}</D:getcontenttype>
        <D:resourcetype>${res.isCollection ? '<D:collection/>' : ''}</D:resourcetype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>\n`;
    }
    xml += '</D:multistatus>';
    return xml;
}

function escapeXml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
