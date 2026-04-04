import { errorHandling, telemetryData } from "../utils/middleware.js";

const CHUNK_SIZE = 19 * 1024 * 1024;

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        await errorHandling(context);
        telemetryData(context);

        const clonedRequest = request.clone();
        const formData = await clonedRequest.formData();

        const chunk = formData.get('chunk');
        const chunkIndex = parseInt(formData.get('chunkIndex'));
        const totalChunks = parseInt(formData.get('totalChunks'));
        const fileName = formData.get('fileName');
        const mimeType = formData.get('mimeType') || 'application/octet-stream';

        if (!chunk) {
            throw new Error('No chunk uploaded');
        }

        if (chunk.size > CHUNK_SIZE) {
            throw new Error(`Chunk size exceeds limit (${CHUNK_SIZE / 1024 / 1024}MB)`);
        }

        const telegramFormData = new FormData();
        telegramFormData.append("chat_id", env.TG_Chat_ID);
        telegramFormData.append("document", chunk);

        const result = await sendToTelegram(telegramFormData, 'sendDocument', env);

        if (!result.success) {
            throw new Error(result.error);
        }

        const fileId = getFileId(result.data);
        if (!fileId) {
            throw new Error('Failed to get file ID for chunk');
        }

        return new Response(
            JSON.stringify({
                success: true,
                fileId: fileId,
                chunkIndex: chunkIndex,
                totalChunks: totalChunks,
                fileName: fileName
            }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    } catch (error) {
        console.error('Chunk upload error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

function getFileId(response) {
    if (!response.ok || !response.result) return null;
    const result = response.result;
    if (result.document) return result.document.file_id;
    return null;
}

async function sendToTelegram(formData, apiEndpoint, env, retryCount = 0) {
    const MAX_RETRIES = 2;
    const apiUrl = `https://api.telegram.org/bot${env.TG_Bot_Token}/${apiEndpoint}`;

    try {
        const response = await fetch(apiUrl, { method: "POST", body: formData });
        const responseData = await response.json();

        if (response.ok) {
            return { success: true, data: responseData };
        }

        return {
            success: false,
            error: responseData.description || 'Upload to Telegram failed'
        };
    } catch (error) {
        console.error('Network error:', error);
        if (retryCount < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return await sendToTelegram(formData, apiEndpoint, env, retryCount + 1);
        }
        return { success: false, error: 'Network error occurred' };
    }
}
