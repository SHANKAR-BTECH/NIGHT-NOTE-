# NightNote 🌙

NightNote is an on-device AI-powered evening thought recorder and morning focus optimizer. It converts night brain dumps into actionable, prioritized morning missions using on-device SmolLM2-135M Lite V2 local inference via llama.cpp.

## Features
- **Voice Thought Capture**: Capture night thoughts using Native Android Speech Recognition or browser Web Speech.
- **On-Device AI Mission Generator**: Convert raw night thoughts into actionable tasks locally with assigned priorities, durations, and category grounding without sending data to the cloud.
- **Smart Workload Trim**: Optimize today's mission using on-device workload balancing to prevent burnout.
- **Progress Tracking & Weekly Summary**: Monitor focus consistency, complete daily missions, and track focus streaks.
- **Dark Mode & Calming Themes**: Eye-safe, calming twilight UI for night capture and clean light mode for day focus.

## Tech Stack & Native Setup
- React 19, Vite, TypeScript, Tailwind CSS
- Capacitor 8+ with `@capacitor-community/speech-recognition`
- On-device NightNote Lite V2 (SmolLM2-135M Q5_K_M GGUF) via native Android llama.cpp JNI bindings
- LocalStorage persistence with 100% offline support

