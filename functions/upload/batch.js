import { errorHandling, telemetryData } from "../utils/middleware";

const MAX_CONCURRENT = 3;

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        await errorHandling(context);
        telemetryData(context);

        const clonedRequest = request.clone();
        const formData = await clonedRequest.formData();

        // Get all files from the form data
        const files = formData.getAll('files');
        if (!files || files.length === 0) {
            throw new Error('No files uploaded');
        }

        // Process files in batches with concurrency control
        const results = [];
        for (let i = 0; i < files.length; i += MAX_CONCURRENT) {
            const batch = files.slice(i, i + MAX_CONCURRENT);
            const batchResults = await Promise.all(
                batch.map(file => uploadSingleFile(file, env))
            );
            results.push(...batchResults);
        }

        return new Response(
            JSON.stringify(results),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    } catch (error) {
        console.error('Batch upload error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

async function uploadSingleFile(file, env) {
    const fileName = file.name;
    const fileExtension = fileName.split('.').pop().toLowerCase();

    try {
        const telegramFormData = new FormData();
        telegramFormData.append("chat_id", env.TG_Chat_ID);

        // Choose API endpoint based on file type
        let apiEndpoint;
        if (file.type.startsWith('image/')) {
            telegramFormData.append("photo", file);
            apiEndpoint = 'sendPhoto';
        } else if (file.type.startsWith('audio/')) {
            telegramFormData.append("audio", file);
            apiEndpoint = 'sendAudio';
        } else if (file.type.startsWith('video/')) {
            telegramFormData.append("video", file);
            apiEndpoint = 'sendVideo';
        } else {
            telegramFormData.append("document", file);
            apiEndpoint = 'sendDocument';
        }

        const result = await sendToTelegram(telegramFormData, apiEndpoint, env);

        if (!result.success) {
            return { name: fileName, src: null, error: result.error };
        }

        const fileId = getFileId(result.data);
        if (!fileId) {
            return { name: fileName, src: null, error: 'Failed to get file ID' };
        }

        // Save to KV storage
        if (env.img_url) {
            await env.img_url.put(`${fileId}.${fileExtension}`, "", {
                metadata: {
                    TimeStamp: Date.now(),
                    ListType: "None",
                    Label: "None",
                    liked: false,
                    fileName: fileName,
                    fileSize: file.size,
                }
            });
        }

        return { name: fileName, src: `/file/${fileId}.${fileExtension}`, error: null };
    } catch (error) {
        console.error(`Upload failed for ${fileName}:`, error);
        return { name: fileName, src: null, error: error.message };
    }
}

function getFileId(response) {
    if (!response.ok || !response.result) return null;

    const result = response.result;
    if (result.photo) {
        return result.photo.reduce((prev, current) =>
            (prev.file_size > current.file_size) ? prev : current
        ).file_id;
    }
    if (result.document) return result.document.file_id;
    if (result.video) return result.video.file_id;
    if (result.audio) return result.audio.file_id;

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

        // Retry image as document if sendPhoto fails
        if (retryCount < MAX_RETRIES && apiEndpoint === 'sendPhoto') {
            console.log('Retrying image as document...');
            const newFormData = new FormData();
            newFormData.append('chat_id', formData.get('chat_id'));
            newFormData.append('document', formData.get('photo'));
            return await sendToTelegram(newFormData, 'sendDocument', env, retryCount + 1);
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
