import { tokenAuth } from "../utils/tokenAuth.js";

export const onRequest = [webdavAuth];

async function webdavAuth(context) {
    const { request, env } = context;

    if (!env.img_url && !env.img_db) {
        return new Response('WebDAV is disabled. Please bind a KV namespace or D1 database.', { status: 503 });
    }

    // Try token auth first
    const tokenResult = await tokenAuth(context);
    if (tokenResult) {
        if (!tokenResult.valid) {
            return new Response(tokenResult.error, { status: 401 });
        }
        context.data.tokenAuth = tokenResult;
        return context.next();
    }

    // Fall back to Basic Auth
    if (!env.BASIC_USER) {
        return context.next();
    }

    if (request.headers.has('Authorization')) {
        const authHeader = request.headers.get('Authorization');
        if (authHeader.startsWith('Basic ')) {
            const encoded = authHeader.substring(6);
            const decoded = atob(encoded);
            const index = decoded.indexOf(':');
            const user = decoded.substring(0, index);
            const pass = decoded.substring(index + 1);
            if (env.BASIC_USER === user && env.BASIC_PASS === pass) {
                return context.next();
            }
        }
    }

    return new Response('Unauthorized', {
        status: 401,
        headers: {
            'WWW-Authenticate': 'Basic realm="Telegraph-Image WebDAV"',
            'DAV': '1, 2',
        },
    });
}
