import { ImageSettings } from '../types.ts';

/**
 * Splits text into chunks by sentence, trying to not exceed a maximum character limit per chunk.
 */
export function splitTextSmart(text: string, maxChars: number): string[] {
  if (!text) return [];

  // Split by sentence-ending punctuation. Using a regex that keeps the delimiters.
  const sentences = text.match(/[^.!?]+[.!?]*|[^.!?\s]+$/g) || [];
  
  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    if (currentChunk.length + trimmedSentence.length + 1 <= maxChars) {
      currentChunk += (currentChunk ? " " : "") + trimmedSentence;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      // If a single sentence is longer than maxChars, it becomes its own chunk.
      // The user can adjust maxChars in the UI if this is not desired.
      currentChunk = trimmedSentence;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Triggers a browser download for a given Blob.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Converts a base64 string to a Blob, inferring the MIME type.
 */
export function base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
}


/**
 * Decodes a base64 string and assumes it's raw PCM audio data,
 * then wraps it in a WAV header to create a valid .wav file Blob.
 * This implementation assumes 16-bit mono PCM at 24000Hz, a common output for Gemini TTS.
 */
export function base64ToWavBlob(base64: string): Blob {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const dataSize = bytes.length;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);
  
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  return new Blob([view, bytes], { type: 'audio/wav' });
}

/**
 * Draws wrapped text onto a canvas with specified styling and positioning.
 * It expects settings to have hex color codes, not color names.
 */
export function drawTextOnCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  settings: Omit<ImageSettings, 'baseFileName' | 'textColor' | 'backgroundColor'> & { textColor: string; backgroundColor: string; }
) {
  const { fontSize, textColor, backgroundColor, textPosition, fontFamily } = settings;
  const canvas = ctx.canvas;
  const { width, height } = canvas;
  const padding = width * 0.05;

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = textColor;
  ctx.font = `${fontSize}px ${fontFamily || 'sans-serif'}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const words = text.split(' ');
  let line = '';
  const lines = [];
  const maxWidth = width - (padding * 2);

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      lines.push(line.trim());
      line = words[n] + ' ';
    } else {
      line = testLine;
    }
  }
  lines.push(line.trim());

  const lineHeight = fontSize * 1.2;
  const totalTextHeight = lines.length * lineHeight;
  let startY: number;

  switch (textPosition) {
    case 'Atas':
      startY = padding + (lineHeight / 2);
      break;
    case 'Bawah':
      startY = height - padding - totalTextHeight + (lineHeight / 2);
      break;
    case 'Tengah':
    default:
      startY = (height - totalTextHeight) / 2 + (lineHeight / 2);
      break;
  }

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], width / 2, startY + (i * lineHeight));
  }
}

/**
 * Generates an image from text by drawing on an offscreen canvas.
 */
export async function generateImageFromText(
  text: string,
  settings: Omit<ImageSettings, 'baseFileName' | 'textColor' | 'backgroundColor'> & { textColor: string; backgroundColor: string; },
  _filename: string
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  drawTextOnCanvas(ctx, text, settings);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create blob from canvas'));
      }
    }, 'image/png');
  });
}
