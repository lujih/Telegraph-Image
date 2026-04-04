import { errorHandling, telemetryData } from "../utils/middleware.js";

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        await errorHandling(context);
        telemetryData(context);

        const body = await request.json();
        const { fileName, mimeType, totalSize, chunks } = body;

        if (!fileName || !chunks || !Array.isArray(chunks) || chunks.length === 0) {
            throw new Error('Invalid chunk metadata');
        }

        // Generate unique ID for the chunked file
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const fileId = `chunked_${timestamp}_${random}`;

        // Save metadata to KV
        if (env.img_url) {
            await env.img_url.put(fileId, "", {
                metadata: {
                    type: 'chunked',
                    chunks: chunks,
                    totalSize: totalSize,
                    fileName: fileName,
                    mimeType: mimeType || 'application/octet-stream',
                    TimeStamp: timestamp,
                    ListType: "None",
                    Label: "None",
                    liked: false,
                    fileSize: totalSize,
                }
            });
        }

        return new Response(
            JSON.stringify([{ 'src': `/file/${fileId}` }]),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    } catch (error) {
        console.error('Commit error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}
