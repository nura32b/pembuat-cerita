// types.ts

export interface StoryChunk {
  id: number;
  text: string;
}

export interface Settings {
  googleApiKeys: string[];
  openAiApiKeys: string[];
  maxCharsPerChunk: number;
  imageSettings: ImageSettings;
  videoSettings: VideoSettings;
  promptSettings: PromptSettings;
  ttsSettings: TtsSettings;
}

export interface ImageSettings {
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  textPosition: 'Atas' | 'Tengah' | 'Bawah';
  fontFamily: string;
  baseFileName: string;
}

export interface VideoSettings {
  resolution: string;
  fps: number;
  finalFileName: string;
}

export interface PromptSettings {
  characterBible: string;
  template: string;
  model: string;
  style: string;
  negative: string;
  aspect: string;
}

export interface TtsSettings {
  voice: string;
  throttle: number;
}

export interface PairedFile {
  id: number;
  image: File;
  audio: File;
  audioDuration: number;
}

export interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface GeneratedFile {
  name: string;
  blob: Blob;
}

export interface GeneratedImage {
  chunkIndex: number;
  prompt: string;
  imageData: string; // Base64 data URL
}

export enum Tab {
  Input = 'Input Teks & Potongan',
  Slides = 'Generate Slides',
  ImageFX = 'Generate Images (ImageFX)',
  Video = 'Video Generator',
  VideoVeo = 'Video Generator (VEO)',
  Prompt = 'Generate Prompt',
  Settings = 'API & Pengaturan',
}

export const FFMPEG_RESOLUTIONS: {[key: string]: {w: number, h: number}} = {
  '1280x720': {w: 1280, h: 720},
  '1920x1080': {w: 1920, h: 1080},
  '2560x1440': {w: 2560, h: 1440},
  '3840x2160': {w: 3840, h: 2160},
};

export const COLOR_PALETTE = ['Putih', 'Hitam', 'Merah', 'Kuning', 'Biru', 'Hijau', 'Ungu'];
export const COLOR_MAP: {[key: string]: string} = {
  'Putih': '#FFFFFF',
  'Hitam': '#000000',
  'Merah': '#FF0000',
  'Kuning': '#FFFF00',
  'Biru': '#0000FF',
  'Hijau': '#00FF00',
  'Ungu': '#800080',
};

export const GEMINI_TTS_VOICES = [
  'Kore', 'Puck', 'Zephyr', 'Oriole', 'Sparrow', 'Tala', 'Indus', 'Rigel', 'Vega', 'Vindemiatrix', 'Sadachbia', 'Algenib'
];

// FIX: Update to use the recommended 'gemini-2.5-flash' model and remove deprecated models.
export const GEMINI_TEXT_MODELS = ['gemini-2.5-flash'];