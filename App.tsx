import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage.ts';
import ToastContainer, { toast } from './components/Toast.tsx';
// FIX: Import GeneratedFile type to resolve compilation error.
import { 
  StoryChunk, Settings, PairedFile, LogEntry, Tab, FFMPEG_RESOLUTIONS, COLOR_PALETTE, COLOR_MAP, GEMINI_TTS_VOICES, GEMINI_TEXT_MODELS, GeneratedFile, GeneratedImage
} from './types.ts';
import { splitTextSmart, downloadBlob, base64ToWavBlob, base64ToBlob, drawTextOnCanvas, generateImageFromText } from './utils/helpers.ts';
import { generateTts, generatePrompt, generatePromptWithOpenAI, generateImageWithImagen, reviseImagePrompt, translatePromptToEnglish, generateVideoWithVeo, getVeoOperationStatus } from './services/geminiService.ts';
import { loadFfmpeg, makeClipFromImageAndAudio, concatVideos, extractLastFrame } from './services/ffmpegService.ts';
import type { VideosOperation } from '@google/genai';


// To satisfy TypeScript since JSZip is loaded from CDN
declare var JSZip: any;

// --- App ---

const App: React.FC = () => {
    const [activeTab, setActiveTab] = useState<Tab>(Tab.Input);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [chunks, setChunks] = useLocalStorage<StoryChunk[]>('storyChunks', []);
    const [selectedChunkIndex, setSelectedChunkIndex] = useState<number>(0);
    const [generatedFiles, setGeneratedFiles] = useLocalStorage<GeneratedFile[]>('generatedFiles', []);
    const [generatedImages, setGeneratedImages] = useLocalStorage<GeneratedImage[]>('generatedImages', []);

    const [settings, setSettings] = useLocalStorage<Settings>('appSettings', {
        googleApiKeys: [],
        openAiApiKeys: [],
        maxCharsPerChunk: 300,
        imageSettings: {
            fontSize: 64,
            textColor: 'Putih',
            backgroundColor: 'Hitam',
            textPosition: 'Tengah',
            fontFamily: 'Arial',
            baseFileName: 'slide',
        },
        videoSettings: {
            resolution: '1920x1080',
            fps: 30,
            finalFileName: 'final_video.mp4',
        },
        promptSettings: {
            characterBible: '',
            template: `You are an expert image prompt writer for diffusion/vision models.
Goal: Create a precise, copy-pasteable prompt for a single image that matches the story split.

# Rules
- Use English.
- One paragraph only.
- Reflect exactly the story split (characters, setting, mood, actions).
- Enforce identical character identity via Character Bible.
- Add visual details (camera, lens, lighting, time of day, materials, micro-expressions).
- End with comma-separated tags.
- Include aspect ratio {aspect}.
- Include a final "Negative" clause.

# Character Bible
{character_bible}

# Story Split
{story}

# Style
{style}

# Negative
{negative}`,
            model: 'gemini-2.5-flash',
            style: 'photorealistic, high detail, natural lighting, 35mm, f/1.8, shallow depth of field',
            negative: 'low quality, blurry, deformed hands, extra fingers, watermark, text overlay, duplicate face, artifacts',
            aspect: '16:9',
        },
        ttsSettings: {
            voice: 'Zephyr',
            throttle: 15,
        }
    });

    const addLog = useCallback((log: Omit<LogEntry, 'timestamp'>) => {
        setLogs(prev => [...prev, { ...log, timestamp: new Date().toLocaleTimeString() }]);
    }, []);

    const updateSettings = <K extends keyof Settings>(key: K, value: Settings[K]) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const addGeneratedFile = (name: string, blob: Blob) => {
        setGeneratedFiles(prev => [...prev.filter(f => f.name !== name), {name, blob}]);
    };

    useEffect(() => {
        const initFFmpeg = async () => {
            await loadFfmpeg((log) => addLog(log));
        };
        initFFmpeg();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const promptResults = useRef<{ gemini: PromptResult[], openai: PromptResult[] }>({ gemini: [], openai: [] });

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col p-4 font-sans">
            <ToastContainer />
            <h1 className="text-3xl font-bold text-center text-cyan-400 mb-4">AI Video Content Suite</h1>
            
            <div className="flex justify-center border-b border-gray-700 mb-4 overflow-x-auto">
                {(Object.values(Tab) as Tab[]).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 text-sm font-medium transition-colors duration-200 whitespace-nowrap
                            ${activeTab === tab 
                                ? 'border-b-2 border-cyan-400 text-cyan-400' 
                                : 'text-gray-400 hover:text-white'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <main className="flex-grow flex flex-col overflow-y-auto">
                {activeTab === Tab.Input && (
                    <TabInputText 
                        chunks={chunks} 
                        setChunks={setChunks} 
                        maxChars={settings.maxCharsPerChunk}
                        setMaxChars={(val) => updateSettings('maxCharsPerChunk', val)}
                        selectedChunkIndex={selectedChunkIndex}
                        setSelectedChunkIndex={setSelectedChunkIndex}
                        addLog={addLog}
                        settings={settings}
                        addGeneratedFile={addGeneratedFile}
                    />
                )}
                {activeTab === Tab.Slides && (
                    <TabGenerateSlides 
                        settings={settings.imageSettings}
                        updateSettings={(val) => updateSettings('imageSettings', val)}
                        chunks={chunks}
                        selectedChunkIndex={selectedChunkIndex}
                        addLog={addLog}
                        addGeneratedFile={addGeneratedFile}
                    />
                )}
                {activeTab === Tab.ImageFX && (
                    <TabGenerateImages
                        promptResults={promptResults.current}
                        googleApiKeys={settings.googleApiKeys}
                        addLog={addLog}
                        generatedImages={generatedImages}
                        setGeneratedImages={setGeneratedImages}
                        throttle={settings.ttsSettings.throttle}
                    />
                )}
                 {activeTab === Tab.Video && (
                    <TabVideoGenerator 
                        settings={settings.videoSettings}
                        updateSettings={(val) => updateSettings('videoSettings', val)}
                        generatedFiles={generatedFiles}
                        addGeneratedFile={addGeneratedFile}
                        addLog={addLog}
                    />
                )}
                {activeTab === Tab.VideoVeo && (
                    <TabVideoGeneratorVeo
                        googleApiKeys={settings.googleApiKeys}
                        addLog={addLog}
                    />
                )}
                {activeTab === Tab.Prompt && (
                    <TabPromptGenerator 
                        settings={settings.promptSettings}
                        updateSettings={(val) => updateSettings('promptSettings', val)}
                        chunks={chunks}
                        selectedChunkIndex={selectedChunkIndex}
                        apiKeys={{google: settings.googleApiKeys, openai: settings.openAiApiKeys}}
                        addLog={addLog}
                        throttle={settings.ttsSettings.throttle}
                        promptResults={promptResults}
                    />
                )}
                {activeTab === Tab.Settings && (
                     <TabSettings 
                        settings={settings}
                        setSettings={setSettings}
                    />
                )}

            </main>

            <footer className="mt-4 border-t border-gray-700 pt-2">
                <div className="h-40 bg-gray-800 rounded-md p-2 overflow-y-auto text-xs font-mono">
                    {logs.map((log, i) => {
                        const color = log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : log.type === 'warning' ? 'text-yellow-400' : 'text-gray-400';
                        return <div key={i} className={color}>{`[${log.timestamp}] ${log.message}`}</div>;
                    })}
                </div>
            </footer>
        </div>
    );
};

// --- Helper Components (to keep file count low) ---

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label: string;
}
const Input: React.FC<InputProps> = ({ label, ...props }) => (
    <div className="flex flex-col">
        <label className="mb-1 text-sm text-gray-400">{label}</label>
        <input {...props} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
    </div>
);

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label: string;
}
const Select: React.FC<SelectProps> = ({ label, children, ...props }) => (
     <div className="flex flex-col">
        <label className="mb-1 text-sm text-gray-400">{label}</label>
        <select {...props} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-cyan-500 focus:outline-none">
          {children}
        </select>
    </div>
);

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  loading?: boolean;
}
const Button: React.FC<ButtonProps> = ({ children, variant = 'primary', loading = false, ...props }) => {
  const baseClasses = "px-4 py-2 rounded-md font-semibold transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2";
  const variantClasses = variant === 'primary' 
    ? "bg-cyan-600 hover:bg-cyan-500 text-white"
    : "bg-gray-600 hover:bg-gray-500 text-white";
  return (
    <button className={`${baseClasses} ${variantClasses}`} {...props} disabled={props.disabled || loading}>
        {loading && (
            <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
        )}
        {children}
    </button>
  );
};

// --- Tab Components ---

interface TabInputTextProps {
    chunks: StoryChunk[];
    setChunks: (chunks: StoryChunk[]) => void;
    maxChars: number;
    setMaxChars: (val: number) => void;
    selectedChunkIndex: number;
    setSelectedChunkIndex: (index: number) => void;
    addLog: (log: Omit<LogEntry, 'timestamp'>) => void;
    settings: Settings;
    addGeneratedFile: (name: string, blob: Blob) => void;
}
const TabInputText: React.FC<TabInputTextProps> = ({
    chunks, setChunks, maxChars, setMaxChars, selectedChunkIndex, setSelectedChunkIndex, addLog, settings, addGeneratedFile
}) => {
    const [sourceText, setSourceText] = useLocalStorage<string>('sourceText', '');
    const [rangeFrom, setRangeFrom] = useState(1);
    const [rangeTo, setRangeTo] = useState(1);
    const [loadingActions, setLoadingActions] = useState({ singleTts: false, batchTts: false });

    const handleSplit = () => {
        addLog({ message: `Splitting text with max ${maxChars} chars/chunk.`, type: 'info' });
        const newChunks = splitTextSmart(sourceText, maxChars).map((text, id) => ({ id, text }));
        setChunks(newChunks);
        setSelectedChunkIndex(0);
        setRangeTo(newChunks.length);
        addLog({ message: `Successfully split text into ${newChunks.length} chunks.`, type: 'success' });
        toast(`Split into ${newChunks.length} chunks`, 'success');
    };

    const handleGenerateTTS = async (isBatch: boolean) => {
        const startIndex = isBatch ? rangeFrom - 1 : selectedChunkIndex;
        const endIndex = isBatch ? rangeTo - 1 : selectedChunkIndex;
        
        if (startIndex < 0 || endIndex >= chunks.length || startIndex > endIndex) {
            toast('Invalid range selected.', 'error');
            addLog({ message: 'Invalid range for TTS generation.', type: 'error' });
            return;
        }
        
        const action = isBatch ? 'batchTts' : 'singleTts';
        setLoadingActions(prev => ({...prev, [action]: true}));
        let success = true;

        for (let i = startIndex; i <= endIndex; i++) {
            const chunk = chunks[i];
            const paddedIndex = String(i + 1).padStart(3, '0');
            addLog({ message: `Requesting TTS for chunk ${paddedIndex}...`, type: 'info' });

            try {
                const audioBase64 = await generateTts(chunk.text, settings.ttsSettings.voice, settings.googleApiKeys, addLog);
                const audioBlob = base64ToWavBlob(audioBase64);
                const filename = `task_audio_${paddedIndex}.wav`;
                downloadBlob(audioBlob, filename);
                addGeneratedFile(filename, audioBlob);
                addLog({ message: `Successfully generated and downloaded ${filename}`, type: 'success' });

                if (isBatch && i < endIndex) {
                    addLog({ message: `Waiting ${settings.ttsSettings.throttle}s...`, type: 'info' });
                    await new Promise(resolve => setTimeout(resolve, settings.ttsSettings.throttle * 1000));
                }
            } catch (error) {
                addLog({ message: `Failed to generate TTS for chunk ${paddedIndex}: ${error}`, type: 'error' });
                toast(`Error on chunk ${paddedIndex}. See logs.`, 'error');
                success = false;
                break; // Stop batch on error
            }
        }
        setLoadingActions(prev => ({...prev, [action]: false}));
        if (success) {
            toast('TTS Generation complete.', 'success');
        } else {
            toast('TTS Generation failed. Check logs.', 'error');
        }
    };
    
    const handleSaveTxt = () => {
        if (chunks.length === 0) {
            toast('No chunks to save.', 'warning');
            return;
        }
        const content = chunks.map((c, i) => `--- Potongan ${i+1} ---\n${c.text}`).join('\n\n');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        downloadBlob(blob, 'semua_potongan.txt');
        addLog({ message: 'Saved all chunks to .txt file.', type: 'success' });
    };

    const handleCopyText = () => {
        if (chunks.length > 0 && selectedChunkIndex < chunks.length) {
            navigator.clipboard.writeText(chunks[selectedChunkIndex].text);
            toast('Copied selected chunk to clipboard!', 'success');
        }
    };
    
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
            {/* Left Panel */}
            <div className="flex flex-col gap-4">
                <div className="flex-grow flex flex-col">
                    <label className="mb-1 text-sm text-gray-400">Source Story ({sourceText.length} / 100,000)</label>
                    <textarea 
                        value={sourceText}
                        onChange={e => setSourceText(e.target.value)}
                        maxLength={100000}
                        className="w-full flex-grow bg-gray-800 border border-gray-700 rounded-md p-2 resize-none focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                        placeholder="Paste your story here..."
                    />
                </div>
                <div className="flex items-end gap-4">
                    <Input 
                        label="Maks. karakter/potong"
                        type="number"
                        value={maxChars}
                        onChange={e => setMaxChars(Number(e.target.value))}
                        className="w-40"
                    />
                    <Button onClick={handleSplit}>Split / Generate Tasks</Button>
                </div>
            </div>
            {/* Right Panel */}
            <div className="flex flex-col gap-4">
                <div className="flex-grow flex flex-col border border-gray-700 rounded-md">
                    <div className="p-2 border-b border-gray-700 font-semibold">List of Chunks ({chunks.length})</div>
                    <ul className="overflow-y-auto p-2">
                        {chunks.map((chunk, index) => (
                            <li 
                                key={chunk.id}
                                onClick={() => setSelectedChunkIndex(index)}
                                className={`p-1.5 rounded-md cursor-pointer truncate ${selectedChunkIndex === index ? 'bg-cyan-800' : 'hover:bg-gray-700'}`}
                            >
                                {index + 1}. {chunk.text}
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="bg-gray-800 p-3 rounded-md border border-gray-700">
                    <h3 className="font-semibold mb-2">Preview (Potongan {selectedChunkIndex + 1})</h3>
                    <p className="text-sm text-gray-300 h-24 overflow-y-auto">
                        {chunks[selectedChunkIndex]?.text || 'No chunk selected.'}
                    </p>
                    <div className="text-right text-xs text-gray-500 mt-1">Karakter: {chunks[selectedChunkIndex]?.text.length || 0}</div>
                </div>
                <div className="grid grid-cols-2 gap-4 items-end">
                    <Input label="Dari potongan" type="number" min="1" max={chunks.length} value={rangeFrom} onChange={e => setRangeFrom(Number(e.target.value))}/>
                    <Input label="Sampai potongan" type="number" min="1" max={chunks.length} value={rangeTo} onChange={e => setRangeTo(Number(e.target.value))}/>
                </div>
                 <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    <Button onClick={handleCopyText} variant="secondary">Copy Teks Potongan</Button>
                    <Button onClick={() => handleGenerateTTS(false)} loading={loadingActions.singleTts} variant="secondary">Generate Terpilih</Button>
                    <Button onClick={() => handleGenerateTTS(true)} loading={loadingActions.batchTts}>Generate Batch</Button>
                    <Button onClick={handleSaveTxt} variant="secondary">Simpan semua (.txt)</Button>
                </div>
            </div>
        </div>
    );
};

interface TabGenerateSlidesProps {
    settings: Settings['imageSettings'];
    updateSettings: (val: Settings['imageSettings']) => void;
    chunks: StoryChunk[];
    selectedChunkIndex: number;
    addLog: (log: Omit<LogEntry, 'timestamp'>) => void;
    addGeneratedFile: (name: string, blob: Blob) => void;
}
const TabGenerateSlides: React.FC<TabGenerateSlidesProps> = ({
    settings, updateSettings, chunks, selectedChunkIndex, addLog, addGeneratedFile
}) => {
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
    const [rangeFrom, setRangeFrom] = useState(1);
    const [rangeTo, setRangeTo] = useState(1);
    const [loadingActions, setLoadingActions] = useState({ single: false, batch: false });
    
    useEffect(() => {
        if(chunks.length > 0) setRangeTo(chunks.length);
    }, [chunks.length]);

    const updateSingleSetting = <K extends keyof Settings['imageSettings']>(key: K, value: Settings['imageSettings'][K]) => {
        updateSettings({ ...settings, [key]: value });
    };

    useEffect(() => {
        const canvas = previewCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx) {
            const textToRender = chunks[selectedChunkIndex]?.text || "Ini adalah teks contoh untuk pratinjau.";
            const scaledSettings = {
                ...settings,
                fontSize: settings.fontSize * (320 / 1920),
                textColor: COLOR_MAP[settings.textColor],
                backgroundColor: COLOR_MAP[settings.backgroundColor],
            };
            drawTextOnCanvas(ctx, textToRender, scaledSettings);
        }
    }, [settings, chunks, selectedChunkIndex]);

    const handleGenerateImages = async (isBatch: boolean) => {
        const startIndex = isBatch ? rangeFrom - 1 : selectedChunkIndex;
        const endIndex = isBatch ? rangeTo - 1 : selectedChunkIndex;
        
        if (startIndex < 0 || endIndex >= chunks.length || startIndex > endIndex) {
            toast('Invalid range selected.', 'error');
            return;
        }

        const action = isBatch ? 'batch' : 'single';
        setLoadingActions(prev => ({...prev, [action]: true}));

        for (let i = startIndex; i <= endIndex; i++) {
            const chunk = chunks[i];
            const paddedIndex = String(i + 1).padStart(3, '0');
            addLog({ message: `Generating slide for chunk ${paddedIndex}...`, type: 'info' });

            try {
                const fullSettings = {
                    ...settings,
                    textColor: COLOR_MAP[settings.textColor],
                    backgroundColor: COLOR_MAP[settings.backgroundColor],
                };
                const filename = `${settings.baseFileName}_${paddedIndex}.png`;
                const blob = await generateImageFromText(chunk.text, fullSettings, filename);
                downloadBlob(blob, filename);
                addGeneratedFile(filename, blob);
                addLog({ message: `Successfully generated and downloaded ${filename}`, type: 'success' });
            } catch (error) {
                addLog({ message: `Failed to generate slide for chunk ${paddedIndex}: ${error}`, type: 'error' });
                toast(`Error on chunk ${paddedIndex}. See logs.`, 'error');
                break;
            }
        }
        setLoadingActions(prev => ({...prev, [action]: false}));
        toast('Slide Generation complete.', 'success');
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 flex flex-col gap-4">
                <h2 className="text-xl font-semibold text-cyan-400 border-b border-gray-700 pb-2">Image Controls</h2>
                <Input label="Font Size" type="number" value={settings.fontSize} onChange={e => updateSingleSetting('fontSize', Number(e.target.value))} />
                <Select label="Text Color" value={settings.textColor} onChange={e => updateSingleSetting('textColor', e.target.value)}>
                    {COLOR_PALETTE.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
                <Select label="Background Color" value={settings.backgroundColor} onChange={e => updateSingleSetting('backgroundColor', e.target.value)}>
                    {COLOR_PALETTE.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
                <div>
                    <label className="mb-1 text-sm text-gray-400">Text Position</label>
                    <div className="flex gap-2 mt-1">
                        {(['Atas', 'Tengah', 'Bawah'] as const).map(pos => (
                            <button key={pos} onClick={() => updateSingleSetting('textPosition', pos)}
                                className={`px-3 py-1 text-sm rounded-md ${settings.textPosition === pos ? 'bg-cyan-600' : 'bg-gray-700'}`}>
                                {pos}
                            </button>
                        ))}
                    </div>
                </div>
                <Input label="Font File Name (optional)" value={settings.fontFamily} onChange={e => updateSingleSetting('fontFamily', e.target.value)} placeholder="e.g., Arial, Times New Roman" />
            </div>
             <div className="md:col-span-2 flex flex-col gap-4">
                <h2 className="text-xl font-semibold text-cyan-400 border-b border-gray-700 pb-2">Live Preview (16:9)</h2>
                <div className="bg-gray-800 p-4 rounded-md flex justify-center items-center">
                    <canvas ref={previewCanvasRef} width="320" height="180" className="border border-gray-600"></canvas>
                </div>
                <h2 className="text-xl font-semibold text-cyan-400 border-b border-gray-700 pb-2 mt-4">Output Controls</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input label="Nama File Dasar" value={settings.baseFileName} onChange={e => updateSingleSetting('baseFileName', e.target.value)} />
                    <Input label="Dari Potongan" type="number" min="1" max={chunks.length} value={rangeFrom} onChange={e => setRangeFrom(Number(e.target.value))} />
                    <Input label="Sampai Potongan" type="number" min="1" max={chunks.length} value={rangeTo} onChange={e => setRangeTo(Number(e.target.value))} />
                </div>
                <div className="flex gap-4">
                    <Button onClick={() => handleGenerateImages(false)} loading={loadingActions.single}>Generate Gambar Terpilih</Button>
                    <Button onClick={() => handleGenerateImages(true)} loading={loadingActions.batch}>Generate Semua Potongan</Button>
                </div>
            </div>
        </div>
    );
};

interface TabVideoGeneratorProps {
    settings: Settings['videoSettings'];
    updateSettings: (val: Settings['videoSettings']) => void;
    generatedFiles: GeneratedFile[];
    addGeneratedFile: (name: string, blob: Blob) => void;
    addLog: (log: Omit<LogEntry, 'timestamp'>) => void;
}
const TabVideoGenerator: React.FC<TabVideoGeneratorProps> = ({
    settings, updateSettings, generatedFiles, addGeneratedFile, addLog
}) => {
    const [images, setImages] = useState<File[]>([]);
    const [audios, setAudios] = useState<File[]>([]);
    const [pairedFiles, setPairedFiles] = useState<PairedFile[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    
    const updateSingleSetting = <K extends keyof Settings['videoSettings']>(key: K, value: Settings['videoSettings'][K]) => {
        updateSettings({ ...settings, [key]: value });
    };

    const parseIndex = (filename: string): number | null => {
        const threePlusDigits = filename.match(/(\d{3,})/);
        if (threePlusDigits) return parseInt(threePlusDigits[0], 10);
        const anyDigits = filename.match(/(\d+)/);
        if (anyDigits) return parseInt(anyDigits[0], 10);
        return null;
    };

    const handleScanAndPair = async () => {
        addLog({ message: `Scanning ${images.length} images and ${audios.length} audios...`, type: 'info' });
        const imageMap = new Map<number, File>();
        const audioMap = new Map<number, File>();

        for (const img of images) {
            const index = parseIndex(img.name);
            if (index !== null) imageMap.set(index, img);
        }
        for (const aud of audios) {
            const index = parseIndex(aud.name);
            if (index !== null) audioMap.set(index, aud);
        }

        const pairs: PairedFile[] = [];
        const audioContext = new AudioContext();

        for (const [index, imageFile] of imageMap.entries()) {
            if (audioMap.has(index)) {
                const audioFile = audioMap.get(index)!;
                try {
                    const arrayBuffer = await audioFile.arrayBuffer();
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                    pairs.push({ id: index, image: imageFile, audio: audioFile, audioDuration: audioBuffer.duration });
                } catch (e) {
                    addLog({ message: `Could not decode audio file ${audioFile.name}. Skipping.`, type: 'warning'});
                }
            }
        }
        
        pairs.sort((a, b) => a.id - b.id);
        setPairedFiles(pairs);
        addLog({ message: `Found ${pairs.length} matched pairs.`, type: 'success' });
        toast(`Found ${pairs.length} pairs`, 'success');
    };

    const handleRender = async () => {
        if (pairedFiles.length === 0) {
            toast('No paired files to render.', 'error');
            return;
        }
        
        setIsLoading(true);
        addLog({message: `Starting video render process...`, type: 'info' });
        const resolution = FFMPEG_RESOLUTIONS[settings.resolution];
        const clips: GeneratedFile[] = [];

        for(let i=0; i < pairedFiles.length; i++) {
            const pair = pairedFiles[i];
            const clipFilename = `clip_${String(pair.id).padStart(3, '0')}.mp4`;
            addLog({ message: `Processing pair #${pair.id}: ${pair.image.name} + ${pair.audio.name}`, type: 'info' });
            
            try {
                const clipBlob = await makeClipFromImageAndAudio(pair.image, pair.audio, resolution, settings.fps, clipFilename);
                clips.push({ name: clipFilename, blob: clipBlob });
                addLog({ message: `Successfully created ${clipFilename}`, type: 'success' });
            } catch (e: any) {
                const errorMsg = `Failed to create clip for pair #${pair.id}: ${e.message}`;
                if (e.message?.includes('memory')) {
                    toast('Browser out of memory. Try a lower resolution.', 'error');
                } else {
                    toast(`Error creating clip ${i+1}. See logs.`, 'error');
                }
                addLog({ message: errorMsg, type: 'error' });
                setIsLoading(false);
                return;
            }
        }
        
        addLog({ message: `All clips generated. Starting concatenation...`, type: 'info' });
        
        try {
            const finalVideoBlob = await concatVideos(clips, settings.finalFileName);
            downloadBlob(finalVideoBlob, settings.finalFileName);
            addGeneratedFile(settings.finalFileName, finalVideoBlob);
            addLog({ message: `Successfully concatenated and downloaded ${settings.finalFileName}`, type: 'success' });
            toast('Final video is ready!', 'success');
        } catch (e: any) {
            toast('Error concatenating videos. See logs.', 'error');
            addLog({ message: `Failed to concatenate videos: ${e.message}`, type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };
    
    const downloadAllFiles = async () => {
        if(generatedFiles.length === 0) {
            toast("No files have been generated yet.", "warning");
            return;
        }
        setIsLoading(true);
        const zip = new JSZip();
        generatedFiles.forEach(file => {
            zip.file(file.name, file.blob);
        });
        const content = await zip.generateAsync({type:"blob"});
        downloadBlob(content, "generated_files.zip");
        toast("Downloaded all generated files as a ZIP.", "success");
        setIsLoading(false);
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
            <div className="flex flex-col gap-4">
                <div className="bg-gray-800 p-4 rounded-md border border-gray-700 flex-grow flex flex-col">
                    <h3 className="text-lg font-semibold mb-2">1. Select Media</h3>
                    <div className="flex flex-col gap-3">
                        <div>
                            <label className="block mb-1 text-sm text-gray-400">Select Images (.png, .jpg, .webp)</label>
                            <input type="file" multiple accept="image/*" onChange={e => setImages(Array.from(e.target.files || []))} className="file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-cyan-600 file:text-white hover:file:bg-cyan-500"/>
                        </div>
                        <div>
                            <label className="block mb-1 text-sm text-gray-400">Select Audios (.wav, .mp3, .m4a, etc.)</label>
                            <input type="file" multiple accept="audio/*" onChange={e => setAudios(Array.from(e.target.files || []))} className="file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-cyan-600 file:text-white hover:file:bg-cyan-500"/>
                        </div>
                    </div>
                    <Button onClick={handleScanAndPair} className="mt-4">Scan & Pair Files</Button>
                </div>
                 <div className="bg-gray-800 p-4 rounded-md border border-gray-700">
                    <h3 className="text-lg font-semibold mb-2">3. Render Video</h3>
                    <div className="grid grid-cols-2 gap-4">
                       <Select label="Resolution" value={settings.resolution} onChange={e => updateSingleSetting('resolution', e.target.value)}>
                            {Object.keys(FFMPEG_RESOLUTIONS).map(res => <option key={res} value={res}>{res}</option>)}
                        </Select>
                        <Input label="FPS" type="number" value={settings.fps} onChange={e => updateSingleSetting('fps', Number(e.target.value))} />
                    </div>
                    <Input label="Final File Name" value={settings.finalFileName} onChange={e => updateSingleSetting('finalFileName', e.target.value)} className="mt-4"/>
                    <div className="flex gap-4 mt-4">
                        <Button onClick={handleRender} loading={isLoading}>Render Semua → Final</Button>
                        <Button onClick={downloadAllFiles} variant="secondary" loading={isLoading}>Download ZIP</Button>
                    </div>
                </div>
            </div>
            <div className="flex flex-col border border-gray-700 rounded-md">
                <h3 className="text-lg font-semibold mb-2 p-3 border-b border-gray-700">2. Paired Media ({pairedFiles.length})</h3>
                <ul className="overflow-y-auto p-2 text-sm">
                    {pairedFiles.map(p => (
                        <li key={p.id} className="p-1.5 rounded-md hover:bg-gray-800 flex justify-between">
                            <span><span className="font-mono text-cyan-400">{String(p.id).padStart(3, '0')}</span> | {p.image.name} + {p.audio.name}</span>
                            <span className="text-gray-400">(~{p.audioDuration.toFixed(1)}s)</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

interface PromptResult {
    chunkIndex: number;
    prompt: string;
}

interface TabPromptGeneratorProps {
    settings: Settings['promptSettings'];
    updateSettings: (val: Settings['promptSettings']) => void;
    chunks: StoryChunk[];
    selectedChunkIndex: number;
    apiKeys: { google: string[], openai: string[] };
    addLog: (log: Omit<LogEntry, 'timestamp'>) => void;
    throttle: number;
    promptResults: React.MutableRefObject<{ gemini: PromptResult[], openai: PromptResult[] }>;
}
const TabPromptGenerator: React.FC<TabPromptGeneratorProps> = ({
    settings, updateSettings, chunks, selectedChunkIndex, apiKeys, addLog, throttle, promptResults
}) => {
    const [geminiResults, setGeminiResults] = useState<PromptResult[]>(promptResults.current.gemini);
    const [openaiResults, setOpenaiResults] = useState<PromptResult[]>(promptResults.current.openai);
    const [rangeFrom, setRangeFrom] = useState(1);
    const [rangeTo, setRangeTo] = useState(1);
    const [loadingActions, setLoadingActions] = useState<Record<string, boolean>>({});
    
    useEffect(() => {
        if(chunks.length > 0) setRangeTo(chunks.length);
    }, [chunks.length]);
    
    useEffect(() => {
        promptResults.current = { gemini: geminiResults, openai: openaiResults };
    }, [geminiResults, openaiResults, promptResults]);

    const updateSingleSetting = <K extends keyof Settings['promptSettings']>(key: K, value: Settings['promptSettings'][K]) => {
        updateSettings({ ...settings, [key]: value });
    };

    const buildPrompt = (chunkIndex: number) => {
        return settings.template
            .replace('{character_bible}', settings.characterBible)
            .replace('{story}', chunks[chunkIndex]?.text || '')
            .replace('{style}', settings.style)
            .replace('{negative}', settings.negative)
            .replace('{aspect}', settings.aspect);
    };

    const handleGenerate = async (isBatch: boolean, isGemini: boolean) => {
        const startIndex = isBatch ? rangeFrom - 1 : selectedChunkIndex;
        const endIndex = isBatch ? rangeTo - 1 : selectedChunkIndex;

        if (startIndex < 0 || endIndex >= chunks.length || startIndex > endIndex) {
            toast('Invalid range selected.', 'error');
            return;
        }

        const engineName = isGemini ? 'Gemini' : 'OpenAI';
        const keys = isGemini ? apiKeys.google : apiKeys.openai;

        if (keys.length === 0) {
            toast(`No ${engineName} API Key provided.`, 'error');
            return;
        }
        
        const action = `${isGemini ? 'gemini' : 'openai'}-${isBatch ? 'batch' : 'single'}`;
        setLoadingActions(prev => ({ ...prev, [action]: true }));

        const setResults = isGemini ? setGeminiResults : setOpenaiResults;
        
        for (let i = startIndex; i <= endIndex; i++) {
            addLog({ message: `Requesting ${engineName} prompt for chunk ${i + 1}...`, type: 'info'});
            try {
                const prompt = buildPrompt(i);
                const result = isGemini 
                    ? await generatePrompt(prompt, settings.model, apiKeys.google, addLog)
                    : await generatePromptWithOpenAI(prompt, apiKeys.openai, addLog);

                setResults(prev => [...prev.filter(p => p.chunkIndex !== i), { chunkIndex: i, prompt: result }].sort((a,b) => a.chunkIndex - b.chunkIndex));
                addLog({ message: `Successfully generated ${engineName} prompt for chunk ${i+1}.`, type: 'success'});

                if (isBatch && i < endIndex) {
                    await new Promise(resolve => setTimeout(resolve, throttle * 1000));
                }
            } catch (e) {
                toast(`Failed to generate ${engineName} prompt for chunk ${i+1}. See logs.`, 'error');
                break;
            }
        }
        setLoadingActions(prev => ({ ...prev, [action]: false }));
        toast(`${engineName} prompt generation complete.`, 'success');
    };
    
    const copyPrompt = (text: string) => {
        if(text) {
            navigator.clipboard.writeText(text);
            toast("Prompt copied to clipboard!", "success");
        }
    };

    const PromptResultsDisplay: React.FC<{results: PromptResult[], engine: string}> = ({results, engine}) => (
        <div className="flex-grow flex flex-col relative h-64">
            <label className="mb-1 text-sm text-gray-400">{engine} Prompt Results ({results.length})</label>
            <div className="w-full h-full bg-gray-800 border border-gray-700 rounded-md p-2 overflow-y-auto">
                {results.length > 0 ? results.map(({chunkIndex, prompt}) => (
                    <div key={chunkIndex} className="mb-2 p-2 bg-gray-900 rounded-md relative group">
                        <h4 className="font-semibold text-cyan-400 mb-1">Prompt for Chunk {chunkIndex + 1}</h4>
                        <p className="text-sm whitespace-pre-wrap font-mono text-gray-300">{prompt}</p>
                        <Button onClick={() => copyPrompt(prompt)} className="absolute top-1 right-1 px-2 py-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity" variant="secondary">Copy</Button>
                    </div>
                )) : <div className="text-center text-gray-500 pt-8">No prompts generated yet.</div>}
            </div>
        </div>
    );

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
            <div className="flex flex-col gap-4">
                <div className="flex-grow flex flex-col">
                    <label className="mb-1 text-sm text-gray-400">Template</label>
                    <textarea value={settings.template} onChange={e => updateSingleSetting('template', e.target.value)}
                        className="w-full flex-grow bg-gray-800 border border-gray-700 rounded-md p-2 resize-none font-mono text-xs"/>
                </div>
                <div className="flex-grow flex flex-col">
                    <label className="mb-1 text-sm text-gray-400">Character Bible</label>
                    <textarea value={settings.characterBible} onChange={e => updateSingleSetting('characterBible', e.target.value)}
                        className="w-full flex-grow bg-gray-800 border border-gray-700 rounded-md p-2 resize-none"/>
                </div>
            </div>
             <div className="flex flex-col gap-4">
                <Select label="Model" value={settings.model} onChange={e => updateSingleSetting('model', e.target.value)}>
                    {GEMINI_TEXT_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                </Select>
                <div className="bg-gray-800 p-3 rounded-md border border-gray-700">
                    <h3 className="font-semibold mb-2">Story Split Preview (Potongan {selectedChunkIndex + 1})</h3>
                    <p className="text-sm text-gray-300 h-20 overflow-y-auto">{chunks[selectedChunkIndex]?.text || 'No chunk selected.'}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Style" value={settings.style} onChange={e => updateSingleSetting('style', e.target.value)} />
                  <Input label="Negative" value={settings.negative} onChange={e => updateSingleSetting('negative', e.target.value)} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Dari Potongan" type="number" min="1" max={chunks.length} value={rangeFrom} onChange={e => setRangeFrom(Number(e.target.value))} />
                    <Input label="Sampai Potongan" type="number" min="1" max={chunks.length} value={rangeTo} onChange={e => setRangeTo(Number(e.target.value))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <Button onClick={() => handleGenerate(false, true)} loading={loadingActions['gemini-single']}>Generate Selected (Gemini)</Button>
                    <Button onClick={() => handleGenerate(true, true)} loading={loadingActions['gemini-batch']}>Generate Batch (Gemini)</Button>
                    {apiKeys.openai.length > 0 && (
                        <>
                            <Button onClick={() => handleGenerate(false, false)} loading={loadingActions['openai-single']} variant="secondary">Generate Selected (OpenAI)</Button>
                            <Button onClick={() => handleGenerate(true, false)} loading={loadingActions['openai-batch']} variant="secondary">Generate Batch (OpenAI)</Button>
                        </>
                    )}
                </div>
                <PromptResultsDisplay results={geminiResults} engine="Gemini" />
                {apiKeys.openai.length > 0 && <PromptResultsDisplay results={openaiResults} engine="OpenAI" />}
            </div>
        </div>
    );
};

interface RevisionModalProps {
    image: GeneratedImage;
    onClose: () => void;
    onGenerate: (image: GeneratedImage, revisionText: string) => void;
    isLoading: boolean;
}
const RevisionModal: React.FC<RevisionModalProps> = ({ image, onClose, onGenerate, isLoading }) => {
    const [revisionText, setRevisionText] = useState('');

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-3xl border border-gray-700">
                <h2 className="text-xl font-bold text-cyan-400 mb-4">Revise Image #{image.chunkIndex + 1}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <img src={image.imageData} alt="Current version" className="rounded-md w-full aspect-video object-cover"/>
                    <div className="flex flex-col gap-2">
                        <p className="text-sm text-gray-400">Current Prompt:</p>
                        <p className="text-xs bg-gray-900 p-2 rounded-md h-24 overflow-y-auto font-mono">{image.prompt}</p>
                        <p className="text-sm text-gray-400 mt-2">Revision Request (in Indonesian or English):</p>
                        <textarea 
                            value={revisionText}
                            onChange={(e) => setRevisionText(e.target.value)}
                            placeholder="e.g., ganti langitnya menjadi senja"
                            className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 resize-none focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                            rows={4}
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-4 mt-6">
                    <Button variant="secondary" onClick={onClose} disabled={isLoading}>Cancel</Button>
                    <Button onClick={() => onGenerate(image, revisionText)} loading={isLoading}>Generate Revision</Button>
                </div>
            </div>
        </div>
    );
};


interface TabGenerateImagesProps {
    promptResults: { gemini: PromptResult[], openai: PromptResult[] };
    googleApiKeys: string[];
    addLog: (log: Omit<LogEntry, 'timestamp'>) => void;
    generatedImages: GeneratedImage[];
    setGeneratedImages: React.Dispatch<React.SetStateAction<GeneratedImage[]>>;
    throttle: number;
}
const TabGenerateImages: React.FC<TabGenerateImagesProps> = ({
    promptResults, googleApiKeys, addLog, generatedImages, setGeneratedImages, throttle
}) => {
    const [promptSource, setPromptSource] = useState<'gemini' | 'openai'>('gemini');
    const [rangeFrom, setRangeFrom] = useState(1);
    const [rangeTo, setRangeTo] = useState(1);
    const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
    const [revisionTarget, setRevisionTarget] = useState<GeneratedImage | null>(null);
    const [manualPrompt, setManualPrompt] = useState('');
    const manualImageCounter = useRef(0);
    
    const activePrompts = promptSource === 'gemini' ? promptResults.gemini : promptResults.openai;

    const setActionLoading = (actionId: string, isLoading: boolean) => {
        setLoadingStates(prev => ({...prev, [actionId]: isLoading}));
    };
    
    useEffect(() => {
        if (activePrompts.length > 0) {
            setRangeTo(Math.max(...activePrompts.map(p => p.chunkIndex + 1), 1));
            setRangeFrom(Math.min(...activePrompts.map(p => p.chunkIndex + 1), 1));
        }
    }, [activePrompts]);
    
    const handleGenerateBatch = async () => {
        if (googleApiKeys.length === 0) {
            toast('No Google API Key provided.', 'error');
            return;
        }

        const promptsToProcess = activePrompts
            .filter(p => p.chunkIndex >= rangeFrom - 1 && p.chunkIndex <= rangeTo - 1)
            .sort((a,b) => a.chunkIndex - b.chunkIndex);

        if (promptsToProcess.length === 0) {
            toast(`No ${promptSource} prompts found for the selected range.`, 'warning');
            return;
        }
        
        const actionId = 'batch';
        setActionLoading(actionId, true);

        for (let i = 0; i < promptsToProcess.length; i++) {
            const { chunkIndex, prompt } = promptsToProcess[i];
            addLog({ message: `Requesting image for chunk ${chunkIndex + 1}...`, type: 'info' });

            try {
                const imageBase64 = await generateImageWithImagen(prompt, googleApiKeys, addLog);
                const imageDataUrl = `data:image/png;base64,${imageBase64}`;
                
                setGeneratedImages(prev => [
                    ...prev.filter(img => img.chunkIndex !== chunkIndex),
                    { chunkIndex, prompt, imageData: imageDataUrl }
                ].sort((a,b) => a.chunkIndex - b.chunkIndex));

                addLog({ message: `Successfully generated image for chunk ${chunkIndex + 1}.`, type: 'success' });

                 if (i < promptsToProcess.length - 1) {
                    addLog({ message: `Waiting ${throttle}s...`, type: 'info' });
                    await new Promise(resolve => setTimeout(resolve, throttle * 1000));
                }
            } catch (error) {
                 toast(`Failed to generate image for chunk ${chunkIndex + 1}. See logs.`, 'error');
                 break;
            }
        }
        setActionLoading(actionId, false);
        toast('Batch image generation complete.', 'success');
    };
    
    const handleDownloadImage = (imageData: string, chunkIndex: number) => {
        const blob = base64ToBlob(imageData.split(',')[1], 'image/png');
        const filename = chunkIndex < 0 
            ? `manual_image_${String(Math.abs(chunkIndex)).padStart(3, '0')}.png`
            : `image_${String(chunkIndex + 1).padStart(3, '0')}.png`;
        downloadBlob(blob, filename);
    };

    const handleGenerateRevision = async (originalImage: GeneratedImage, revisionText: string) => {
        if (!revisionText.trim()) {
            toast('Please enter a revision request.', 'warning');
            return;
        }
        const actionId = `revise-${originalImage.chunkIndex}`;
        setActionLoading(actionId, true);
        
        try {
            addLog({ message: `Revising prompt for image (Index: ${originalImage.chunkIndex})...`, type: 'info' });
            const newPrompt = await reviseImagePrompt(originalImage.prompt, revisionText, googleApiKeys, addLog);
            addLog({ message: `New prompt generated: "${newPrompt}"`, type: 'info' });
            
            addLog({ message: `Regenerating image (Index: ${originalImage.chunkIndex})...`, type: 'info' });
            const imageBase64 = await generateImageWithImagen(newPrompt, googleApiKeys, addLog);
            const imageDataUrl = `data:image/png;base64,${imageBase64}`;
            
            setGeneratedImages(prev => prev.map(img => 
                img.chunkIndex === originalImage.chunkIndex 
                ? { ...img, prompt: newPrompt, imageData: imageDataUrl }
                : img
            ));
            
            toast('Image revised successfully!', 'success');
            setRevisionTarget(null);

        } catch (error) {
            toast('Failed to revise image. See logs.', 'error');
        } finally {
            setActionLoading(actionId, false);
        }
    };
    
    const handleRegenerate = async (imageToRegen: GeneratedImage) => {
        const actionId = `regenerate-${imageToRegen.chunkIndex}`;
        setActionLoading(actionId, true);
        try {
            const idForLog = imageToRegen.chunkIndex < 0 ? `(Manual ${Math.abs(imageToRegen.chunkIndex)})` : `#${imageToRegen.chunkIndex + 1}`;
            addLog({ message: `Regenerating image for ${idForLog}...`, type: 'info' });
            
            const imageBase64 = await generateImageWithImagen(imageToRegen.prompt, googleApiKeys, addLog);
            const imageDataUrl = `data:image/png;base64,${imageBase64}`;
            
            setGeneratedImages(prev => prev.map(img => 
                img.chunkIndex === imageToRegen.chunkIndex
                ? { ...img, imageData: imageDataUrl }
                : img
            ));
            addLog({ message: `Successfully regenerated image.`, type: 'success' });
            toast('Image regenerated!', 'success');
        } catch (error) {
            toast('Failed to regenerate image. See logs.', 'error');
        } finally {
            setActionLoading(actionId, false);
        }
    };

    const handleGenerateManual = async () => {
        if (!manualPrompt.trim()) {
            toast('Please enter a prompt.', 'warning');
            return;
        }
        if (googleApiKeys.length === 0) {
            toast('No Google API Key provided.', 'error');
            return;
        }

        const actionId = 'manual-generate';
        setActionLoading(actionId, true);

        try {
            addLog({ message: `Translating manual prompt if necessary...`, type: 'info' });
            const englishPrompt = await translatePromptToEnglish(manualPrompt, googleApiKeys, addLog);
            
            if (englishPrompt.toLowerCase() !== manualPrompt.toLowerCase()) {
                addLog({ message: `Original prompt: "${manualPrompt}"`, type: 'info' });
                addLog({ message: `Translated prompt: "${englishPrompt}"`, type: 'info' });
            } else {
                addLog({ message: `Prompt is already in English: "${englishPrompt}"`, type: 'info' });
            }

            addLog({ message: 'Requesting image for manual prompt...', type: 'info' });
            const imageBase64 = await generateImageWithImagen(englishPrompt, googleApiKeys, addLog);
            const imageDataUrl = `data:image/png;base64,${imageBase64}`;

            manualImageCounter.current += 1;
            const newImage: GeneratedImage = {
                chunkIndex: -manualImageCounter.current, // Use negative index
                prompt: englishPrompt,
                imageData: imageDataUrl
            };
            
            setGeneratedImages(prev => [...prev, newImage].sort((a,b) => a.chunkIndex - b.chunkIndex));
            addLog({ message: `Successfully generated image from manual prompt.`, type: 'success' });
            toast('Manual image generated!', 'success');
            setManualPrompt(''); // Clear input after success

        } catch (error) {
            toast('Failed to generate manual image. See logs.', 'error');
        } finally {
            setActionLoading(actionId, false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
            {revisionTarget && (
                <RevisionModal 
                    image={revisionTarget}
                    onClose={() => setRevisionTarget(null)}
                    onGenerate={handleGenerateRevision}
                    isLoading={loadingStates[`revise-${revisionTarget.chunkIndex}`] || false}
                />
            )}
            <div className="lg:col-span-1 flex flex-col gap-4">
                 <h2 className="text-xl font-semibold text-cyan-400 border-b border-gray-700 pb-2">Image Generation Controls</h2>
                 <div className="bg-gray-800 p-4 rounded-md border border-gray-700">
                    <label className="mb-2 text-sm text-gray-400 block">Prompt Source (for Batch)</label>
                    <div className="flex gap-2">
                        <Button onClick={() => setPromptSource('gemini')} variant={promptSource === 'gemini' ? 'primary' : 'secondary'}>
                            Gemini Prompts ({promptResults.gemini.length})
                        </Button>
                        <Button onClick={() => setPromptSource('openai')} variant={promptSource === 'openai' ? 'primary' : 'secondary'} disabled={promptResults.openai.length === 0}>
                            OpenAI Prompts ({promptResults.openai.length})
                        </Button>
                    </div>
                 </div>

                 <div className="bg-gray-800 p-4 rounded-md border border-gray-700">
                    <h3 className="font-semibold mb-2">Batch Generation Range</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <Input label="Dari Potongan" type="number" min="1" value={rangeFrom} onChange={e => setRangeFrom(Number(e.target.value))} />
                        <Input label="Sampai Potongan" type="number" min="1" value={rangeTo} onChange={e => setRangeTo(Number(e.target.value))} />
                    </div>
                    <div className="flex flex-col gap-2 mt-4">
                        <Button onClick={handleGenerateBatch} loading={loadingStates['batch']} disabled={activePrompts.length === 0}>
                            Generate Batch
                        </Button>
                    </div>
                </div>
                 <div className="bg-gray-800 p-4 rounded-md border border-gray-700">
                    <h3 className="font-semibold mb-2">Manual Prompt</h3>
                    <textarea 
                        value={manualPrompt}
                        onChange={e => setManualPrompt(e.target.value)}
                        rows={3}
                        className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 resize-y focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                        placeholder="Type your prompt here in English or Indonesian..."
                    />
                    <div className="flex flex-col gap-2 mt-2">
                        <Button onClick={handleGenerateManual} loading={loadingStates['manual-generate']}>
                            Generate from Manual Prompt
                        </Button>
                    </div>
                </div>
            </div>
            <div className="lg:col-span-2 flex flex-col border border-gray-700 rounded-md">
                 <h2 className="text-xl font-semibold p-3 border-b border-gray-700">Generated Images ({generatedImages.length})</h2>
                 <div className="p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {generatedImages.length > 0 ? generatedImages.map((img) => (
                        <div key={img.chunkIndex} className="bg-gray-800 rounded-lg overflow-hidden group relative">
                            <img src={img.imageData} alt={`Generated for index ${img.chunkIndex}`} className="w-full h-auto aspect-video object-cover"/>
                            <div className="p-2">
                                <h4 className="font-bold text-sm">
                                    {img.chunkIndex < 0 ? `Manual Image #${Math.abs(img.chunkIndex)}` : `Potongan #${img.chunkIndex + 1}`}
                                </h4>
                            </div>
                             <div className="absolute inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button onClick={() => handleRegenerate(img)} loading={loadingStates[`regenerate-${img.chunkIndex}`]}>Regenerate</Button>
                                <Button onClick={() => setRevisionTarget(img)} variant="secondary">Revise</Button>
                                <Button onClick={() => handleDownloadImage(img.imageData, img.chunkIndex)} variant="secondary">Download</Button>
                             </div>
                        </div>
                    )) : <div className="col-span-full text-center text-gray-500 pt-16">Generate images to see them here.</div>}
                 </div>
            </div>
        </div>
    )
};

interface TabVideoGeneratorVeoProps {
    googleApiKeys: string[];
    addLog: (log: Omit<LogEntry, 'timestamp'>) => void;
}
const TabVideoGeneratorVeo: React.FC<TabVideoGeneratorVeoProps> = ({ googleApiKeys, addLog }) => {
    const [prompt, setPrompt] = useState('');
    const [extendPrompt, setExtendPrompt] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [veoModel, setVeoModel] = useState<'veo2' | 'veo3'>('veo3');
    const [isLoading, setIsLoading] = useState(false);
    const [progressMessage, setProgressMessage] = useState('');
    const [videoUrl, setVideoUrl] = useState<string | null>(null);

    const progressMessages = [
        "Menganalisis prompt Anda...",
        "Mengalokasikan sumber daya komputasi...",
        "Memulai proses rendering video...",
        "Ini mungkin memakan waktu beberapa menit...",
        "Membangun adegan awal...",
        "Menghasilkan frame video...",
        "Hampir selesai...",
    ];

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = error => reject(error);
        });
    };
    
    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        } else {
            setImageFile(null);
            setImagePreview(null);
        }
    };
    
    const pollOperation = async (operation: VideosOperation): Promise<VideosOperation> => {
        let currentOperation = operation;
        let progressIndex = 0;
        
        while (!currentOperation.done) {
            setProgressMessage(progressMessages[progressIndex % progressMessages.length]);
            progressIndex++;
            
            await new Promise(resolve => setTimeout(resolve, 15000)); // Poll every 15s
            addLog({ message: `Polling for VEO video status...`, type: 'info' });
            try {
                currentOperation = await getVeoOperationStatus(currentOperation, googleApiKeys, addLog);
            } catch (pollError) {
                addLog({ message: `Error while polling VEO status: ${pollError}`, type: 'error' });
                throw new Error("Polling failed. The operation might still be running.");
            }
        }
        return currentOperation;
    };

    const handleGenerate = async () => {
        if (!prompt.trim()) {
            toast("Please enter a video prompt.", 'warning');
            return;
        }
        if (googleApiKeys.length === 0) {
            toast('No Google API Key provided.', 'error');
            return;
        }

        setIsLoading(true);
        setVideoUrl(null);
        setProgressMessage("Memulai pembuatan video...");
        addLog({ message: `VEO generation started. Prompt: "${prompt}"`, type: 'info' });

        try {
            let imagePayload: { imageBytes: string, mimeType: string } | null = null;
            if (imageFile) {
                const imageBytes = await fileToBase64(imageFile);
                imagePayload = { imageBytes, mimeType: imageFile.type };
                addLog({ message: `Using initial image: ${imageFile.name}`, type: 'info' });
            }

            const languageToSend = veoModel === 'veo3' ? 'id' : null;
            let operation = await generateVideoWithVeo(prompt, languageToSend, imagePayload, googleApiKeys, addLog);
            addLog({ message: 'VEO operation initiated. Now polling for completion.', type: 'info' });
            
            const finalOperation = await pollOperation(operation);
            
            const downloadLink = finalOperation.response?.generatedVideos?.[0]?.video?.uri;
            if (!downloadLink) {
                throw new Error("Video URI not found in the final operation response.");
            }
            
            addLog({ message: 'Video generated. Downloading video data...', type: 'success' });
            setProgressMessage("Video selesai! Mengunduh data...");
            
            // The API key must be appended to the download URI
            const videoResponse = await fetch(`${downloadLink}&key=${googleApiKeys[0]}`);
            if (!videoResponse.ok) {
                throw new Error(`Failed to fetch video file: ${videoResponse.statusText}`);
            }

            const videoBlob = await videoResponse.blob();
            const url = URL.createObjectURL(videoBlob);
            setVideoUrl(url);
            toast("Video generation successful!", 'success');
        } catch (error: any) {
            toast("Video generation failed. Check logs for details.", 'error');
            addLog({ message: `VEO generation failed: ${error.message}`, type: 'error' });
        } finally {
            setIsLoading(false);
            setProgressMessage('');
        }
    };
    
    const handleExtendVideo = async () => {
        if (!extendPrompt.trim()) {
            toast("Please enter a prompt for the extension.", 'warning');
            return;
        }
        if (!videoUrl) {
            toast("No existing video to extend.", 'error');
            return;
        }
         if (googleApiKeys.length === 0) {
            toast('No Google API Key provided.', 'error');
            return;
        }

        setIsLoading(true);
        setProgressMessage("Memulai ekstensi video...");
        addLog({ message: `VEO extension started. Prompt: "${extendPrompt}"`, type: 'info' });
        
        try {
            // 1. Get the last frame
            setProgressMessage("Mengekstrak frame terakhir dari video sebelumnya...");
            addLog({ message: "Fetching previous video blob...", type: 'info' });
            const videoBlob = await fetch(videoUrl).then(r => r.blob());
            addLog({ message: "Extracting last frame with FFmpeg...", type: 'info' });
            const lastFrameBlob = await extractLastFrame(videoBlob);
            const lastFrameFile = new File([lastFrameBlob], "last_frame.jpg", { type: "image/jpeg" });
            
            // 2. Convert to base64
            const imageBytes = await fileToBase64(lastFrameFile);
            const imagePayload = { imageBytes, mimeType: lastFrameFile.type };
            addLog({ message: "Last frame extracted. Starting new video generation...", type: 'info' });

            // 3. Call VEO API
            const languageToSend = veoModel === 'veo3' ? 'id' : null;
            let operation = await generateVideoWithVeo(extendPrompt, languageToSend, imagePayload, googleApiKeys, addLog);
            addLog({ message: 'VEO extension operation initiated. Polling for completion.', type: 'info' });
            
            // 4. Poll and get result
            const finalOperation = await pollOperation(operation);
            const downloadLink = finalOperation.response?.generatedVideos?.[0]?.video?.uri;
             if (!downloadLink) {
                throw new Error("Video URI not found in the extension response.");
            }

            // 5. Display new video
            setProgressMessage("Video selesai! Mengunduh data...");
            const videoResponse = await fetch(`${downloadLink}&key=${googleApiKeys[0]}`);
             if (!videoResponse.ok) {
                throw new Error(`Failed to fetch extended video file: ${videoResponse.statusText}`);
            }
            const newVideoBlob = await videoResponse.blob();
            const newUrl = URL.createObjectURL(newVideoBlob);
            
            URL.revokeObjectURL(videoUrl); // Clean up old blob URL
            setVideoUrl(newUrl);
            setExtendPrompt(''); // Clear prompt
            toast("Video extension successful!", 'success');

        } catch (error: any) {
             toast("Video extension failed. Check logs for details.", 'error');
            addLog({ message: `VEO extension failed: ${error.message}`, type: 'error' });
        } finally {
            setIsLoading(false);
            setProgressMessage('');
        }

    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
            <div className="flex flex-col gap-4">
                <h2 className="text-xl font-semibold text-cyan-400 border-b border-gray-700 pb-2">Video Generator (VEO)</h2>
                <div className="flex-grow flex flex-col gap-4 bg-gray-800 p-4 rounded-md border border-gray-700">
                     <div>
                        <label className="mb-1 text-sm text-gray-400">Prompt Video (Manual)</label>
                        <textarea 
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            rows={8}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 resize-y focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                            placeholder="A cinematic shot of a majestic lion walking on the savanna at sunset..."
                        />
                    </div>
                     <div>
                        <label className="block mb-1 text-sm text-gray-400">Gambar Awal (Opsional)</label>
                        <input type="file" accept="image/*" onChange={handleImageChange} className="file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-cyan-600 file:text-white hover:file:bg-cyan-500"/>
                        {imagePreview && <img src={imagePreview} alt="Preview" className="mt-4 rounded-md max-h-40"/>}
                    </div>
                    <div className="flex flex-col gap-2">
                        <Select label="Model" value={veoModel} onChange={e => setVeoModel(e.target.value as 'veo2' | 'veo3')}>
                            <option value="veo2">VEO 2 (Tanpa Suara)</option>
                            <option value="veo3">VEO 3 (Dengan Suara - Bahasa Indonesia)</option>
                        </Select>
                    </div>
                    <Button onClick={handleGenerate} loading={isLoading} className="mt-auto">
                        Generate Video
                    </Button>
                </div>
            </div>
             <div className="flex flex-col gap-4">
                 <h2 className="text-xl font-semibold text-cyan-400 border-b border-gray-700 pb-2">Hasil Video</h2>
                 <div className="flex-grow bg-gray-800 p-4 rounded-md border border-gray-700 flex flex-col items-center justify-center">
                    {isLoading && (
                        <div className="text-center">
                            <svg className="animate-spin mx-auto h-10 w-10 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <p className="mt-4 text-lg font-semibold">{progressMessage}</p>
                            <p className="text-sm text-gray-400">Harap jangan tutup tab ini.</p>
                        </div>
                    )}
                    {!isLoading && videoUrl && (
                        <div className="w-full flex flex-col gap-4">
                             <video src={videoUrl} controls className="w-full rounded-md" />
                            <a href={videoUrl} download="veo_video.mp4" className="px-4 py-2 rounded-md font-semibold transition-colors duration-200 flex items-center justify-center gap-2 bg-gray-600 hover:bg-gray-500 text-white w-full">
                                Download Video
                            </a>
                            {/* Extend Video Section */}
                            <div className="bg-gray-700 p-4 rounded-md border border-gray-600">
                                <h3 className="text-lg font-semibold text-cyan-400 mb-2">Extend Video</h3>
                                 <label className="mb-1 text-sm text-gray-400">Prompt Lanjutan</label>
                                 <textarea 
                                    value={extendPrompt}
                                    onChange={e => setExtendPrompt(e.target.value)}
                                    rows={3}
                                    className="w-full bg-gray-800 border border-gray-600 rounded-md p-2 resize-y focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                                    placeholder="The lion then looks up at the starry night sky..."
                                />
                                <Button onClick={handleExtendVideo} loading={isLoading} className="w-full mt-2">
                                    Generate Extension
                                </Button>
                            </div>
                        </div>
                    )}
                    {!isLoading && !videoUrl && (
                        <div className="text-center text-gray-500">
                            <p>Video yang Anda hasilkan akan muncul di sini.</p>
                        </div>
                    )}
                 </div>
             </div>
        </div>
    );
};

interface TabSettingsProps {
    settings: Settings;
    setSettings: (settings: Settings) => void;
}
const TabSettings: React.FC<TabSettingsProps> = ({ settings, setSettings }) => {
    const [googleApiKeys, setGoogleApiKeys] = useState(settings.googleApiKeys.join('\n'));
    const [openAiApiKeys, setOpenAiApiKeys] = useState(settings.openAiApiKeys.join('\n'));
    const [ttsVoice, setTtsVoice] = useState(settings.ttsSettings.voice);
    const [ttsThrottle, setTtsThrottle] = useState(settings.ttsSettings.throttle);

    const handleSave = () => {
        const googleKeys = googleApiKeys.split('\n').map(k => k.trim()).filter(Boolean);
        const openAiKeys = openAiApiKeys.split('\n').map(k => k.trim()).filter(Boolean);
        setSettings({
            ...settings,
            googleApiKeys: googleKeys,
            openAiApiKeys: openAiKeys,
            ttsSettings: {
                voice: ttsVoice,
                throttle: ttsThrottle,
            }
        });
        toast('Settings saved successfully!', 'success');
    };
    
    return (
        <div className="max-w-2xl mx-auto w-full flex flex-col gap-6">
            <div className="bg-gray-800 p-4 rounded-md border border-gray-700">
                <h2 className="text-xl font-semibold text-cyan-400 border-b border-gray-700 pb-2 mb-4">API Keys</h2>
                <div className="flex flex-col gap-4">
                    <div>
                        <label className="mb-1 text-sm text-gray-400">Google AI Keys (one per line) - Count: {googleApiKeys.split('\n').filter(Boolean).length}</label>
                        <textarea value={googleApiKeys} onChange={e => setGoogleApiKeys(e.target.value)} rows={5}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 resize-y font-mono text-sm"/>
                    </div>
                     <div>
                        <label className="mb-1 text-sm text-gray-400">OpenAI API Keys (one per line) - Count: {openAiApiKeys.split('\n').filter(Boolean).length}</label>
                        <textarea value={openAiApiKeys} onChange={e => setOpenAiApiKeys(e.target.value)} rows={5}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 resize-y font-mono text-sm"/>
                    </div>
                </div>
            </div>
            <div className="bg-gray-800 p-4 rounded-md border border-gray-700">
                <h2 className="text-xl font-semibold text-cyan-400 border-b border-gray-700 pb-2 mb-4">TTS Settings</h2>
                <div className="grid grid-cols-2 gap-4">
                    <Select label="Voice" value={ttsVoice} onChange={e => setTtsVoice(e.target.value)}>
                        {GEMINI_TTS_VOICES.map(v => <option key={v} value={v}>{v}</option>)}
                    </Select>
                    <Input label="Throttle between requests (seconds)" type="number" value={ttsThrottle} onChange={e => setTtsThrottle(Number(e.target.value))} />
                </div>
            </div>
            <div className="flex justify-end">
                <Button onClick={handleSave}>Simpan Semua Pengaturan</Button>
            </div>
        </div>
    );
};


export default App;