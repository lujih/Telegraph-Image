import { StorageBase } from "./base.js";

export class TelegramStorage extends StorageBase {
    constructor(env) {
        super(env);
        this.channel = 'TelegramNew';
    }

    async upload(file, fileName, mimeType) {
        const fileExtension = fileName.split('.').pop().toLowerCase();

        const telegramFormData = new FormData();
        telegramFormData.append("chat_id", this.env.TG_Chat_ID);

        let apiEndpoint;
        if (mimeType.startsWith('image/')) {
            telegramFormData.append("photo", file);
            apiEndpoint = 'sendPhoto';
        } else if (mimeType.startsWith('audio/')) {
            telegramFormData.append("audio", file);
            apiEndpoint = 'sendAudio';
        } else if (mimeType.startsWith('video/')) {
            telegramFormData.append("video", file);
            apiEndpoint = 'sendVideo';
        } else {
            telegramFormData.append("document", file);
            apiEndpoint = 'sendDocument';
        }

        const result = await this.sendToTelegram(telegramFormData, apiEndpoint);

        if (!result.success) {
            throw new Error(result.error);
        }

        const fileId = this.getFileId(result.data);
        if (!fileId) {
            throw new Error('Failed to get file ID');
        }

        return {
            fileId: `${fileId}.${fileExtension}`,
            src: `/file/${fileId}.${fileExtension}`,
            channel: this.channel,
        };
    }

    async get(fileId) {
        const filePath = await this.getFilePath(fileId);
        if (!filePath) return null;
        return `https://api.telegram.org/file/bot${this.env.TG_Bot_Token}/${filePath}`;
    }

    async delete(fileId) {
        // Telegram doesn't support deleting files from channels
        return true;
    }

    getPublicUrl(fileId) {
        return `/file/${fileId}`;
    }

    getFileId(response) {
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

    async getFilePath(fileId) {
        try {
            const url = `https://api.telegram.org/bot${this.env.TG_Bot_Token}/getFile?file_id=${fileId}`;
            const res = await fetch(url);
            if (!res.ok) return null;
            const data = await res.json();
            if (data.ok && data.result) return data.result.file_path;
            return null;
        } catch (error) {
            console.error('Error fetching file path:', error.message);
            return null;
        }
    }

    async sendToTelegram(formData, apiEndpoint, retryCount = 0) {
        const MAX_RETRIES = 2;
        const apiUrl = `https://api.telegram.org/bot${this.env.TG_Bot_Token}/${apiEndpoint}`;

        try {
            const response = await fetch(apiUrl, { method: "POST", body: formData });
            const responseData = await response.json();

            if (response.ok) {
                return { success: true, data: responseData };
            }

            if (retryCount < MAX_RETRIES && apiEndpoint === 'sendPhoto') {
                const newFormData = new FormData();
                newFormData.append('chat_id', formData.get('chat_id'));
                newFormData.append('document', formData.get('photo'));
                return await this.sendToTelegram(newFormData, 'sendDocument', retryCount + 1);
            }

            return {
                success: false,
                error: responseData.description || 'Upload to Telegram failed'
            };
        } catch (error) {
            console.error('Network error:', error);
            if (retryCount < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
                return await this.sendToTelegram(formData, apiEndpoint, retryCount + 1);
            }
            return { success: false, error: 'Network error occurred' };
        }
    }
}
