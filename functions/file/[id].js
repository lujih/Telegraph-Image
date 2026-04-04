export async function onRequest(context) {
    const {
        request,
        env,
        params,
    } = context;

    const url = new URL(request.url);

    // Check if this is a chunked file
    if (params.id && params.id.startsWith('chunked_')) {
        return await serveChunkedFile(params.id, env, url, request);
    }

    // Check KV for Channel metadata to route to correct storage
    if (env.img_url) {
        const record = await env.img_url.getWithMetadata(params.id);
        if (record && record.metadata && record.metadata.Channel) {
            const channel = record.metadata.Channel;
            if (channel === 'CloudflareR2') {
                return await handleR2File(params.id, env, url, request, record.metadata);
            } else if (channel === 'S3') {
                return await handleS3File(params.id, env, url, request, record.metadata);
            }
            // TelegramNew falls through to existing logic below
        }
    }

    let fileUrl = 'https://telegra.ph/' + url.pathname + url.search
    if (url.pathname.length > 39) { // Path length > 39 indicates file uploaded via Telegram Bot API
        const formdata = new FormData();
        formdata.append("file_id", url.pathname);

        const requestOptions = {
            method: "POST",
            body: formdata,
            redirect: "follow"
        };
        // /file/AgACAgEAAxkDAAMDZt1Gzs4W8dQPWiQJxO5YSH5X-gsAAt-sMRuWNelGOSaEM_9lHHgBAAMCAANtAAM2BA.png
        //get the AgACAgEAAxkDAAMDZt1Gzs4W8dQPWiQJxO5YSH5X-gsAAt-sMRuWNelGOSaEM_9lHHgBAAMCAANtAAM2BA
        console.log(url.pathname.split(".")[0].split("/")[2])
        const filePath = await getFilePath(env, url.pathname.split(".")[0].split("/")[2]);
        console.log(filePath)
        fileUrl = `https://api.telegram.org/file/bot${env.TG_Bot_Token}/${filePath}`;
    }

    const response = await fetch(fileUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
    });

    // If the response is OK, proceed with further checks
    if (!response.ok) return response;

    // Log response details
    console.log(response.ok, response.status);

    // Allow the admin page to directly view the image
    const isAdmin = request.headers.get('Referer')?.includes(`${url.origin}/admin`);
    if (isAdmin) {
        return response;
    }

    // Check if KV storage is available
    if (!env.img_url) {
        console.log("KV storage not available, returning image directly");
        return response;  // Directly return image response, terminate execution
    }

    // The following code executes only if KV is available
    let record = await env.img_url.getWithMetadata(params.id);
    if (!record || !record.metadata) {
        // Initialize metadata if it doesn't exist
        console.log("Metadata not found, initializing...");
        record = {
            metadata: {
                ListType: "None",
                Label: "None",
                TimeStamp: Date.now(),
                liked: false,
                fileName: params.id,
                fileSize: 0,
            }
        };
        await env.img_url.put(params.id, "", { metadata: record.metadata });
    }

    const metadata = {
        ListType: record.metadata.ListType || "None",
        Label: record.metadata.Label || "None",
        TimeStamp: record.metadata.TimeStamp || Date.now(),
        liked: record.metadata.liked !== undefined ? record.metadata.liked : false,
        fileName: record.metadata.fileName || params.id,
        fileSize: record.metadata.fileSize || 0,
    };

    // Handle based on ListType and Label
    if (metadata.ListType === "White") {
        return response;
    } else if (metadata.ListType === "Block" || metadata.Label === "adult") {
        const referer = request.headers.get('Referer');
        const redirectUrl = referer ? "https://static-res.pages.dev/teleimage/img-block-compressed.png" : `${url.origin}/block-img.html`;
        return Response.redirect(redirectUrl, 302);
    }

    // Check if WhiteList_Mode is enabled
    if (env.WhiteList_Mode === "true") {
        return Response.redirect(`${url.origin}/whitelist-on.html`, 302);
    }

    // If no metadata or further actions required, moderate content and add to KV if needed
    if (env.ModerateContentApiKey) {
        try {
            console.log("Starting content moderation...");
            const moderateUrl = `https://api.moderatecontent.com/moderate/?key=${env.ModerateContentApiKey}&url=https://telegra.ph${url.pathname}${url.search}`;
            const moderateResponse = await fetch(moderateUrl);

            if (!moderateResponse.ok) {
                console.error("Content moderation API request failed: " + moderateResponse.status);
            } else {
                const moderateData = await moderateResponse.json();
                console.log("Content moderation results:", moderateData);

                if (moderateData && moderateData.rating_label) {
                    metadata.Label = moderateData.rating_label;

                    if (moderateData.rating_label === "adult") {
                        console.log("Content marked as adult, saving metadata and redirecting");
                        await env.img_url.put(params.id, "", { metadata });
                        return Response.redirect(`${url.origin}/block-img.html`, 302);
                    }
                }
            }
        } catch (error) {
            console.error("Error during content moderation: " + error.message);
            // Moderation failure should not affect user experience, continue processing
        }
    }

    // Only save metadata if content is not adult content
    // Adult content cases are already handled above and will not reach this point
    console.log("Saving metadata");
    await env.img_url.put(params.id, "", { metadata });

    // Return file content
    return response;
}

async function serveChunkedFile(fileId, env, url, request) {
    if (!env.img_url) {
        return new Response('KV storage not available', { status: 500 });
    }

    const record = await env.img_url.getWithMetadata(fileId);
    if (!record || !record.metadata || record.metadata.type !== 'chunked') {
        return new Response('File not found', { status: 404 });
    }

    const metadata = record.metadata;
    const chunks = metadata.chunks || [];
    const fileName = metadata.fileName || fileId;
    const mimeType = metadata.mimeType || 'application/octet-stream';
    const totalSize = metadata.totalSize || 0;

    // Check whitelist/blocklist
    if (metadata.ListType === "Block" || metadata.Label === "adult") {
        const referer = request.headers.get('Referer');
        const redirectUrl = referer ? "https://static-res.pages.dev/teleimage/img-block-compressed.png" : `${url.origin}/block-img.html`;
        return Response.redirect(redirectUrl, 302);
    }

    if (metadata.ListType === "White") {
        // Proceed to stream
    }

    if (env.WhiteList_Mode === "true" && metadata.ListType !== "White") {
        return Response.redirect(`${url.origin}/whitelist-on.html`, 302);
    }

    // Stream all chunks concatenated
    const stream = new ReadableStream({
        async start(controller) {
            for (const chunkFileId of chunks) {
                try {
                    const filePath = await getFilePath(env, chunkFileId);
                    if (!filePath) {
                        console.error(`Failed to get path for chunk: ${chunkFileId}`);
                        continue;
                    }
                    const chunkUrl = `https://api.telegram.org/file/bot${env.TG_Bot_Token}/${filePath}`;
                    const res = await fetch(chunkUrl);
                    if (!res.ok) {
                        console.error(`Failed to fetch chunk: ${chunkFileId}, status: ${res.status}`);
                        continue;
                    }
                    const reader = res.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        controller.enqueue(value);
                    }
                } catch (err) {
                    console.error(`Error streaming chunk ${chunkFileId}:`, err);
                }
            }
            controller.close();
        }
    });

    const headers = new Headers();
    headers.set('Content-Type', mimeType);
    headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    if (totalSize) {
        headers.set('Content-Length', String(totalSize));
    }
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'public, max-age=31536000');

    return new Response(stream, { headers });
}

async function getFilePath(env, file_id) {
    try {
        const url = `https://api.telegram.org/bot${env.TG_Bot_Token}/getFile?file_id=${file_id}`;
        const res = await fetch(url, {
            method: 'GET',
        });

        if (!res.ok) {
            console.error(`HTTP error! status: ${res.status}`);
            return null;
        }

        const responseData = await res.json();
        const { ok, result } = responseData;

        if (ok && result) {
            return result.file_path;
        } else {
            console.error('Error in response data:', responseData);
            return null;
        }
    } catch (error) {
        console.error('Error fetching file path:', error.message);
        return null;
    }
}

async function handleR2File(fileId, env, url, request, metadata) {
    if (!env.img_r2) {
        return new Response('R2 storage not configured', { status: 500 });
    }

    const object = await env.img_r2.get(fileId);
    if (!object) {
        return new Response('File not found', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000');
    headers.set('Accept-Ranges', 'bytes');

    // Range request support
    const range = request.headers.get('Range');
    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : object.size - 1;
        const chunk = object.slice(start, end + 1);
        headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
        headers.set('Content-Length', String(end - start + 1));
        return new Response(chunk, { status: 206, headers });
    }

    return new Response(object.body, { headers });
}

async function handleS3File(fileId, env, url, request, metadata) {
    const endpoint = env.S3_ENDPOINT || '';
    const bucketName = env.S3_BUCKET_NAME || '';
    const cdnDomain = env.S3_CDN_DOMAIN || '';
    const pathStyle = env.S3_PATH_STYLE === 'true';

    if (cdnDomain) {
        const cdnUrl = `https://${cdnDomain}/${fileId}`;
        return Response.redirect(cdnUrl, 302);
    }

    const s3Url = pathStyle
        ? `${endpoint}/${bucketName}/${fileId}`
        : `${endpoint}/${fileId}`;

    return await fetch(s3Url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
    });
}