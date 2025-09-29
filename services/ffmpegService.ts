// services/ffmpegService.ts

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from "@ffmpeg/util";
import { LogEntry } from '../types.ts';

// This is a simplified service assuming FFmpeg is loaded from a CDN.
// In a real app, you might want to manage the singleton instance more robustly.
let ffmpeg: FFmpeg | null = null;

// FIX: Point to a local path on the VPS instead of a remote CDN.
// The web server (Nginx) will be configured to serve these files.
const FFMPEG_BASE_URL = "/ffmpeg";

export async function loadFfmpeg(addLog: (log: LogEntry) => void): Promise<boolean> {
  if (ffmpeg && ffmpeg.loaded) {
    return true;
  }
  
  addLog({ timestamp: new Date().toLocaleTimeString(), message: 'Loading FFmpeg core...', type: 'info' });
  try {
    ffmpeg = new FFmpeg();
    ffmpeg.on('log', ({ message }) => {
        // We can optionally log ffmpeg messages, but they are very verbose.
        // console.log(message);
    });
    // NOTE: We no longer need to use toBlobURL as we are serving from the same origin.
    await ffmpeg.load({
      coreURL: `${FFMPEG_BASE_URL}/ffmpeg-core.js`,
      wasmURL: `${FFMPEG_BASE_URL}/ffmpeg-core.wasm`,
      workerURL: `${FFMPEG_BASE_URL}/ffmpeg-core.worker.js`,
    });
    addLog({ timestamp: new Date().toLocaleTimeString(), message: 'FFmpeg loaded successfully.', type: 'success' });
    return true;
  } catch(e) {
    addLog({ timestamp: new Date().toLocaleTimeString(), message: `Failed to load FFmpeg: ${e}`, type: 'error' });
    return false;
  }
}

export async function makeClipFromImageAndAudio(
  imageFile: File, 
  audioFile: File, 
  resolution: { w: number, h: number },
  fps: number,
  outputFilename: string
): Promise<Blob> {
  if (!ffmpeg || !ffmpeg.loaded) {
    throw new Error("FFmpeg is not loaded.");
  }

  const imageBuffer = await fetchFile(imageFile);
  const audioBuffer = await fetchFile(audioFile);

  await ffmpeg.writeFile('input.image', imageBuffer);
  await ffmpeg.writeFile('input.audio', audioBuffer);

  const command = [
    '-loop', '1',
    '-framerate', String(fps),
    '-i', 'input.image',
    '-i', 'input.audio',
    '-vf', `scale=${resolution.w}:${resolution.h}:force_original_aspect_ratio=decrease,pad=${resolution.w}:${resolution.h}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
    '-c:v', 'libx264',
    '-tune', 'stillimage',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    outputFilename,
  ];

  await ffmpeg.exec(command);
  const data = await ffmpeg.readFile(outputFilename);
  return new Blob([data], { type: 'video/mp4' });
}

export async function concatVideos(
  videoFiles: {name: string, blob: Blob}[], 
  outputFilename: string
): Promise<Blob> {
    if (!ffmpeg || !ffmpeg.loaded) {
    throw new Error("FFmpeg is not loaded.");
  }
  
  const fileList = [];
  for (const videoFile of videoFiles) {
    const buffer = await fetchFile(videoFile.blob);
    await ffmpeg.writeFile(videoFile.name, buffer);
    fileList.push(`file '${videoFile.name}'`);
  }

  await ffmpeg.writeFile('mylist.txt', fileList.join('\n'));

  const command = [
    '-f', 'concat',
    '-safe', '0',
    '-i', 'mylist.txt',
    '-c', 'copy',
    outputFilename
  ];

  await ffmpeg.exec(command);
  const data = await ffmpeg.readFile(outputFilename);
  return new Blob([data], { type: 'video/mp4' });
}

export async function extractLastFrame(videoBlob: Blob): Promise<Blob> {
    if (!ffmpeg || !ffmpeg.loaded) {
        throw new Error("FFmpeg is not loaded.");
    }
    
    const inputFilename = 'input.mp4';
    const outputFilename = 'last_frame.jpg';

    await ffmpeg.writeFile(inputFilename, await fetchFile(videoBlob));

    // This command seeks to 1 second from the end (-sseof -1), which is fast,
    // and grabs a single frame (-vframes 1) with good quality (-q:v 2).
    const command = [
        '-sseof', '-1',
        '-i', inputFilename,
        '-vframes', '1',
        '-q:v', '2',
        outputFilename
    ];
    
    await ffmpeg.exec(command);
    const data = await ffmpeg.readFile(outputFilename);
    return new Blob([data], { type: 'image/jpeg' });
}