import { tokenAuth } from "../../utils/tokenAuth.js";

export const onRequest = [authMiddleware];

async function authMiddleware(context) {
    const { request, env } = context;

    if (!env.img_url && !env.img_db) {
        return new Response('Dashboard is disabled. Please bind a KV namespace or D1 database.', { status: 200 });
    }

    // Try token auth first
    const tokenResult = await tokenAuth(context);
    if (tokenResult) {
        if (!tokenResult.valid) {
            return new Response(JSON.stringify({ error: tokenResult.error }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }
        context.data.tokenAuth = tokenResult;
        return context.next();
    }

    // Fall back to Basic Auth
    if (!env.BASIC_USER) {
        return context.next();
    }

    if (request.headers.has('Authorization')) {
        const { user, pass } = basicAuthentication(request);
        if (env.BASIC_USER !== user || env.BASIC_PASS !== pass) {
            return UnauthorizedException('Invalid credentials.');
        }
        return context.next();
    } else {
        return UnauthorizedException('No credentials provided.');
    }
}

function basicAuthentication(request) {
    const Authorization = request.headers.get('Authorization');
    const [scheme, encoded] = Authorization.split(' ');
    if (!encoded || scheme !== 'Basic') {
        throw new Error('Malformed authorization header.');
    }
    const buffer = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    const decoded = new TextDecoder().decode(buffer).normalize();
    const index = decoded.indexOf(':');
    if (index === -1 || index + 1 > decoded.length) {
        throw new Error('Invalid credential format.');
    }
    return { user: decoded.substring(0, index), pass: decoded.substring(index + 1) };
}

function UnauthorizedException(message) {
    return new Response(message, {
        status: 401,
        headers: {
            'WWW-Authenticate': 'Basic realm="Telegraph-Image Admin", charset="UTF-8"',
        },
    });
}
