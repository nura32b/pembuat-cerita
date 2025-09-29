import type { GenerateContentResponse, VideosOperation } from '@google/genai';
import { LogEntry } from '../types.ts';
// FIX: Use an ES6 import for GoogleGenAI as per the coding guidelines, instead of relying on a global variable.
import { GoogleGenAI, Modality } from '@google/genai';

let googleKeyIndex = 0;
let openaiKeyIndex = 0;

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function callGoogleApiWithRetries<T,>(
    apiCall: (apiKey: string) => Promise<T>,
    apiKeys: string[],
    addLog: (log: LogEntry) => void
): Promise<T> {
    if (!apiKeys || apiKeys.length === 0) {
        addLog({ timestamp: new Date().toLocaleTimeString(), message: 'No Google API Keys provided.', type: 'error' });
        throw new Error("No Google API Keys provided.");
    }

    let attempts = 0;
    const maxAttemptsPerKey = 2; // Retry once for transient errors on the same key
    const initialKeyIndex = googleKeyIndex;

    while (true) {
        const currentApiKey = apiKeys[googleKeyIndex];
        try {
            return await apiCall(currentApiKey);
        } catch (error: any) {
            const errorMessage = error.toString();
            addLog({ timestamp: new Date().toLocaleTimeString(), message: `Google API Error with key #${googleKeyIndex + 1}: ${errorMessage}`, type: 'error' });
            
            const isQuotaError = /429|quota|rate limit/i.test(errorMessage);
            const isTransientError = /503|unavailable|transient/i.test(errorMessage);

            if (isQuotaError) {
                googleKeyIndex = (googleKeyIndex + 1) % apiKeys.length;
                if (googleKeyIndex === initialKeyIndex) {
                    addLog({ timestamp: new Date().toLocaleTimeString(), message: 'All Google API keys are rate-limited. Aborting.', type: 'error' });
                    throw new Error("All Google API keys are exhausted.");
                }
                addLog({ timestamp: new Date().toLocaleTimeString(), message: `Google quota error. Rotating to key #${googleKeyIndex + 1}.`, type: 'warning' });
                continue; // Try next key immediately
            }

            if (isTransientError && attempts < maxAttemptsPerKey) {
                attempts++;
                const backoffTime = Math.pow(2, attempts) * 1000;
                addLog({ timestamp: new Date().toLocaleTimeString(), message: `Transient error. Retrying in ${backoffTime / 1000}s...`, type: 'warning' });
                await delay(backoffTime);
                continue; // Retry with the same key
            }

            // For other errors or after max retries, rotate key and continue
            googleKeyIndex = (googleKeyIndex + 1) % apiKeys.length;
            if (googleKeyIndex === initialKeyIndex) {
                addLog({ timestamp: new Date().toLocaleTimeString(), message: 'A non-recoverable error occurred with all Google keys. Aborting.', type: 'error' });
                throw new Error(`A non-recoverable error occurred: ${errorMessage}`);
            }
             addLog({ timestamp: new Date().toLocaleTimeString(), message: `Non-recoverable error on key. Rotating to key #${googleKeyIndex + 1}.`, type: 'warning' });
        }
    }
}


async function callOpenAiApiWithRetries(
    apiCall: (apiKey: string) => Promise<string>,
    apiKeys: string[],
    addLog: (log: LogEntry) => void
): Promise<string> {
    if (!apiKeys || apiKeys.length === 0) {
        addLog({ timestamp: new Date().toLocaleTimeString(), message: 'No OpenAI API Keys provided.', type: 'error' });
        throw new Error("No OpenAI API Keys provided.");
    }

    const initialKeyIndex = openaiKeyIndex;

    while (true) {
        const currentApiKey = apiKeys[openaiKeyIndex];
        try {
            return await apiCall(currentApiKey);
        } catch (error: any) {
            const errorMessage = error.message || error.toString();
            addLog({ timestamp: new Date().toLocaleTimeString(), message: `OpenAI API Error with key #${openaiKeyIndex + 1}: ${errorMessage}`, type: 'error' });
            
            const isQuotaError = /429|rate limit|quota/i.test(errorMessage);

            if (isQuotaError) {
                openaiKeyIndex = (openaiKeyIndex + 1) % apiKeys.length;
                if (openaiKeyIndex === initialKeyIndex) {
                    addLog({ timestamp: new Date().toLocaleTimeString(), message: 'All OpenAI API keys are rate-limited. Aborting.', type: 'error' });
                    throw new Error("All OpenAI API keys are exhausted.");
                }
                addLog({ timestamp: new Date().toLocaleTimeString(), message: `OpenAI quota error. Rotating to key #${openaiKeyIndex + 1}.`, type: 'warning' });
                continue; 
            }
            
            openaiKeyIndex = (openaiKeyIndex + 1) % apiKeys.length;
            if (openaiKeyIndex === initialKeyIndex) {
                addLog({ timestamp: new Date().toLocaleTimeString(), message: 'A non-recoverable error occurred with all OpenAI keys. Aborting.', type: 'error' });
                throw new Error(`A non-recoverable OpenAI error occurred: ${errorMessage}`);
            }
            addLog({ timestamp: new Date().toLocaleTimeString(), message: `Non-recoverable error on OpenAI key. Rotating to key #${openaiKeyIndex + 1}.`, type: 'warning' });
        }
    }
}

export const generateTts = async (
    text: string,
    voice: string,
    apiKeys: string[],
    addLog: (log: LogEntry) => void
): Promise<string> => {
    const apiCall = async (apiKey: string): Promise<string> => {
        const ai = new GoogleGenAI({ apiKey });
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-tts',
            contents: { parts: [{ text }] },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: voice }
                    }
                }
            }
        });
        
        const audioPart = response.candidates?.[0]?.content?.parts?.[0];
        if (audioPart && audioPart.inlineData) {
            return audioPart.inlineData.data;
        }
        throw new Error("Audio data not found in Gemini response.");
    };

    return callGoogleApiWithRetries(apiCall, apiKeys, addLog);
};

export const generatePrompt = async (
    fullPrompt: string,
    model: string,
    apiKeys: string[],
    addLog: (log: LogEntry) => void
): Promise<string> => {
    const apiCall = async (apiKey: string): Promise<string> => {
        const ai = new GoogleGenAI({ apiKey });
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: model,
            contents: fullPrompt,
        });
        return response.text;
    };

    return callGoogleApiWithRetries(apiCall, apiKeys, addLog);
};

export const generateImageWithImagen = async (
    prompt: string,
    apiKeys: string[],
    addLog: (log: LogEntry) => void
): Promise<string> => {
    const apiCall = async (apiKey: string): Promise<string> => {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
              numberOfImages: 1,
              outputMimeType: 'image/png',
              aspectRatio: '16:9',
            },
        });
        
        const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
        if (imageBytes) {
            return imageBytes;
        }
        throw new Error("Image data not found in Imagen response.");
    };

    return callGoogleApiWithRetries(apiCall, apiKeys, addLog);
};

export const reviseImagePrompt = async (
    originalPrompt: string,
    revisionRequest: string,
    apiKeys: string[],
    addLog: (log: LogEntry) => void
): Promise<string> => {
    const systemPrompt = `You are an intelligent prompt rewriter. Your task is to take an existing English image prompt and a user's revision request, which may be in English or Indonesian, and generate a new, improved English prompt.
- The new prompt must incorporate the user's changes.
- Maintain the style and key elements of the original prompt unless the user's request overrides them.
- The final output must be a single paragraph, in English, suitable for a text-to-image AI.
- Do not add any conversational text or explanations. Only output the revised prompt.`;

    const userPrompt = `Original Prompt:
"${originalPrompt}"

User's Revision Request:
"${revisionRequest}"

New Prompt:`;

    const apiCall = async (apiKey: string): Promise<string> => {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: userPrompt,
            config: {
                systemInstruction: systemPrompt,
                temperature: 0.5,
            }
        });
        return response.text;
    };

    return callGoogleApiWithRetries(apiCall, apiKeys, addLog);
};


export const generatePromptWithOpenAI = async (
    fullPrompt: string,
    apiKeys: string[],
    addLog: (log: LogEntry) => void
): Promise<string> => {
     const apiCall = async (apiKey: string): Promise<string> => {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: fullPrompt }],
                max_tokens: 500
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`OpenAI API Error: ${response.status} ${errorData.error.message}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    };
    
    return callOpenAiApiWithRetries(apiCall, apiKeys, addLog);
};

export const translatePromptToEnglish = async (
    promptText: string,
    apiKeys: string[],
    addLog: (log: LogEntry) => void
): Promise<string> => {
    const systemPrompt = `You are an expert translation assistant. Your task is to translate the given text into English.
- If the text is already in English, return the original text without any changes or comments.
- If the text is in another language (like Indonesian), translate it accurately to English.
- Your output must ONLY be the final English text. Do not include any explanations, prefixes like "Translation:", or any other conversational text.`;
    
    const userPrompt = `Translate the following text to English: "${promptText}"`;

    const apiCall = async (apiKey: string): Promise<string> => {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: userPrompt,
            config: {
                systemInstruction: systemPrompt,
                temperature: 0.2,
            }
        });
        // Trim and remove potential quotes that the model might add
        return response.text.trim().replace(/^"(.*)"$/, '$1');
    };

    return callGoogleApiWithRetries(apiCall, apiKeys, addLog);
};

export const generateVideoWithVeo = async (
    prompt: string,
    language: 'en' | 'id' | null,
    image: { imageBytes: string, mimeType: string } | null,
    apiKeys: string[],
    addLog: (log: LogEntry) => void
): Promise<VideosOperation> => {
    const apiCall = async (apiKey: string): Promise<VideosOperation> => {
        const ai = new GoogleGenAI({ apiKey });
        
        const requestPayload: any = {
            model: 'veo-2.0-generate-001',
            prompt: prompt,
            config: {
                numberOfVideos: 1,
            }
        };

        if (language) {
            // FIX: Both `language` and `dialogueConfig` must be top-level parameters,
            // not nested inside the `config` object. This is the definitive fix.
            requestPayload.language = language;
            requestPayload.dialogueConfig = { renderMode: 'AUDIO' };
        }

        if (image) {
            requestPayload.image = image;
        }

        return await ai.models.generateVideos(requestPayload);
    };
    
    return callGoogleApiWithRetries(apiCall, apiKeys, addLog);
};

export const getVeoOperationStatus = async (
    operation: VideosOperation,
    apiKeys: string[],
    addLog: (log: LogEntry) => void
): Promise<VideosOperation> => {
    const apiCall = async (apiKey: string): Promise<VideosOperation> => {
        const ai = new GoogleGenAI({ apiKey });
        return await ai.operations.getVideosOperation({ operation: operation });
    };
    
    return callGoogleApiWithRetries(apiCall, apiKeys, addLog);
};