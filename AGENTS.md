# AGENTS.md - Telegraph-Image

## Project Overview

Cloudflare Pages-based image hosting using Telegram Bot API for storage. No TypeScript, no linter/formatter configured.

## Build / Dev / Test Commands

```bash
# Local dev server (Cloudflare Pages emulator)
npm start
# Runs: wrangler pages dev ./ --kv "img_url" --port 8080 --binding BASIC_USER=admin --binding BASIC_PASS=123 --persist-to ./data

# Run tests (Mocha)
npm test
# Runs: mocha

# CI test (starts dev server, waits for it, then runs mocha)
npm run ci-test
# Runs: concurrently --kill-others --success first "npm start" "wait-on http://localhost:8080 && mocha --exit"
```

### Running a Single Test

```bash
# Run a specific test file
npx mocha test/pagination.test.js

# Run tests matching a pattern
npx mocha --grep "pagination"

# Force exit after tests complete
npx mocha --exit
```

## Code Style

### Imports
- Bare specifiers for npm packages, no extension: `import sentryPlugin from "@cloudflare/pages-plugin-sentry"`
- Relative paths with `.js` extension: `import { errorHandling } from "./utils/middleware"`
- Side-effect imports allowed: `import '@sentry/tracing'`
- Use named exports only — no default exports in project code

### Formatting
- **Indentation**: 4 spaces, no tabs
- **Semicolons**: Inconsistent across files — pick one style and stay consistent within each file
- **Quotes**: Single quotes preferred, but mixed usage exists. No strict enforcement
- **Brace style**: K&R/1TBS — opening brace on same line
- **Line length**: No strict limit

### Naming Conventions
- **Files**: `kebab-case` or `snake_case` for middleware (`_middleware.js`), `[id].js` for dynamic routes (Cloudflare convention)
- **Directories**: `camelCase` (e.g., `toggleLike/`, `editName/`)
- **Functions**: `camelCase` — all route handlers export `onRequest` or `onRequestPost`
- **Variables**: `camelCase` (e.g., `uploadFile`, `formData`, `fileId`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_RETRIES`)
- **Error factories**: `PascalCase` (e.g., `UnauthorizedException`, `BadRequestException`)
- **KV metadata keys**: Mixed case (`ListType`, `TimeStamp`, `Label`, `fileName`, `fileSize`)

### Cloudflare Pages Function Structure

Every route handler follows this pattern:

```js
export async function onRequest(context) {
    const { request, env, params, waitUntil, next, data } = context;
    // ... logic
    return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}
```

Method-specific handlers: `export async function onRequestPost(context)`

Middleware files (`_middleware.js`) export an array:

```js
export const onRequest = [errorHandling, telemetryData];
```

### Error Handling

1. **try/catch with JSON Response** — wrap logic, return error Response on failure:
```js
} catch (error) {
    console.error('Upload error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
}
```

2. **Middleware-level error catching** — `errorHandling` middleware wraps request chain with Sentry integration

3. **HTTP response checks** — explicit `response.ok` guards after fetch calls

4. **Null/undefined guards** — defensive checks for env vars:
```js
if (typeof env.BASIC_USER == "undefined" || env.BASIC_USER == null || env.BASIC_USER == "") {
```

5. **Retry with exponential backoff** — used for Telegram API calls:
```js
const MAX_RETRIES = 2;
if (retryCount < MAX_RETRIES) {
    await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
    return await sendToTelegram(..., retryCount + 1);
}
```

6. **Graceful degradation** — moderation failures don't block requests

7. **Logging** — heavy use of `console.log()` and `console.error()` throughout

### Testing Patterns

- Framework: **Mocha** with Node.js `assert` module
- Use `describe()` / `it()` for test structure
- Dynamic `import()` for loading ES module functions under test:
```js
const onRequest = (await import('../functions/api/manage/list.js')).onRequest;
```
- Mock `env` objects with fake KV methods for isolation
- Tests simulate paginated KV listing with `keys`, `list_complete`, `cursor`

## Key Environment Variables

| Variable | Purpose |
|---|---|
| `TG_Bot_Token` | Telegram Bot API token |
| `TG_Chat_ID` | Telegram channel/group ID |
| `img_url` | KV namespace binding |
| `BASIC_USER` / `BASIC_PASS` | Basic auth for admin |
| `ModerateContentApiKey` | Content moderation API key |
| `WhiteList_Mode` | Whitelist mode toggle |
| `disable_telemetry` | Disable Sentry telemetry |
| `sampleRate` | Sentry sample rate |

## Project Structure

```
functions/              # Cloudflare Pages Functions (route handlers)
  utils/middleware.js   # Shared middleware (Sentry, telemetry)
  upload.js             # POST /upload
  file/[id].js          # GET /file/[id] — serve files
  file/_middleware.js   # /file/* middleware
  api/manage/           # Admin API endpoints (list, delete, block, white, etc.)
  api/bing/wallpaper/   # Bing wallpaper proxy
test/                   # Mocha tests
*.html                  # Admin/frontend pages
_nuxt/                  # Nuxt.js build output (do not edit)
```

## Important Notes

- No linting or formatting config exists — follow existing file conventions
- No TypeScript — plain JavaScript only
- Node.js 20 in CI
- KV free tier limits: 1000 writes/day, 100k reads/day, 1000 deletes/day, 1000 list/day
- All route handlers must export `onRequest` (or `onRequestPost`, etc.) as named export
- Middleware chains are arrays exported as `onRequest` in `_middleware.js` files
