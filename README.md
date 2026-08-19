# NightNote 🌙

NightNote is a 100% offline, privacy-first evening thought recorder and morning focus optimizer. It converts raw evening brain dumps into prioritized, actionable morning missions using an on-device local AI engine (`SmolLM2-135M Lite V2 Q5_K_M`) executed natively via `llama.cpp` over JNI without requiring any internet connection or cloud API keys.

## Features
- **Voice & Text Thought Capture**: Capture night thoughts using Native Android Speech Recognition or keyboard input with live transcription feedback.
- **On-Device Local AI Mission Generator**: Extract all actionable tasks from multi-task dumps using a high-precision local SLM parser running on-device.
- **Bundled Model Extraction**: The GGUF model (`nightnote-lite-smollm2-135m-v2-q5_k_m.gguf`, 107 MB) is bundled directly in application assets and verified via SHA-256 upon first launch.
- **Smart Workload Trim & Balancing**: Calibrate daily missions with rule-based and local balancing to prevent cognitive overload.
- **Safe-Area UI**: Native immersive full-bleed styling with dedicated system status bar and navigation bar padding.
- **Progress Tracking & Analytics**: Monitor focus consistency, streak counts, and weekly activity charts stored in private offline storage.
- **Eye-Safe Themes**: Calming twilight dark theme for night capture and high-contrast clean theme for morning planning.

## Architecture & Native Stack
- **UI & Application Layer**: React 19, TypeScript, Vite, Tailwind CSS v4.
- **Native Container**: Capacitor Android with custom `NightNoteLocalAI` plugin.
- **Inference Engine**: Native C++ `llama.cpp` compiled via CMake/NDK (`libnightnote_inference.so`).
- **SLM Model**: SmolLM2-135M (Q5_K_M quantization) bundled in `android/app/src/main/assets/models/`.
- **Integrity Check**: SHA-256 checksum verification (`34a278346df6c4d0645fb0ae5c961daf2115b35da77b011c9fdd169005c07d6c`).
- **Data Persistence**: Offline LocalStorage with optional local backup.

