// Centralized AI Configuration for NightNote
// Normal task extraction is handled entirely locally by Lite V2 GGUF.

export const AI_CONFIG = {
  ENGINE_NAME: 'NightNote Lite V2',
  MODE: 'Local • Offline',
  MODEL_NAME: 'nightnote-lite-smollm2-135m-v2-q5_k_m.gguf',
  APPROX_SIZE_MB: 106.91,
  CONTEXT_SIZE: 512,
  THREADS: 4,
} as const
