import { registerPlugin } from '@capacitor/core';

export enum ModelStatus {
  NOT_INSTALLED = 'MODEL_NOT_INSTALLED',
  DOWNLOADING = 'MODEL_DOWNLOADING',
  VERIFYING = 'MODEL_VERIFYING',
  READY = 'MODEL_READY',
  LOADING = 'MODEL_LOADING',
  LOADED = 'MODEL_LOADED',
  ERROR = 'MODEL_ERROR'
}

export interface ModelStatusResult {
  status: ModelStatus;
  progress?: number; // 0-100
  message?: string;
}

export interface NightNoteLocalAIPlugin {
  getStatus(): Promise<ModelStatusResult>;
  downloadModel(options: { url: string, path: string, sha256: string }): Promise<void>;
  extractBundledModel(): Promise<{ success?: boolean; path?: string }>;
  cancelDownload(): Promise<void>;
  removeModel(options: { path: string }): Promise<void>;

  loadModel(options?: { path?: string }): Promise<{ success: boolean }>;
  isModelLoaded(): Promise<{ loaded: boolean }>;
  generate(options: { prompt: string }): Promise<{ result: string }>;
  releaseModel(): Promise<void>;

  // Listeners
  addListener(eventName: 'modelDownloadProgress', listenerFunc: (data: { progress: number }) => void): Promise<any>;
  addListener(eventName: 'modelStatusChanged', listenerFunc: (data: ModelStatusResult) => void): Promise<any>;
}

const NightNoteLocalAI = registerPlugin<NightNoteLocalAIPlugin>('NightNoteLocalAI', {
  web: () => import('./nightnoteLocalAIWeb').then((m) => new m.NightNoteLocalAIWeb())
});

export default NightNoteLocalAI;
