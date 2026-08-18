import { SpeechRecognition } from '@capacitor-community/speech-recognition'

export interface VoiceListeners {
  onStart: () => void
  onResult: (transcript: string, isFinal: boolean) => void
  onError: (errorMsg: string) => void
  onEnd: () => void
}

export function cleanRepeatedWords(text: string): string {
  if (!text) return ''
  // Fix consecutive identical words (e.g. "i i want want" -> "i want")
  let cleaned = text.replace(/\b(\w+)(?:\s+\1\b)+/gi, '$1')
  // Fix consecutive identical 2-word phrases (e.g. "to gym to gym" -> "to gym")
  cleaned = cleaned.replace(/\b(\w+\s+\w+)(?:\s+\1\b)+/gi, '$1')
  return cleaned.trim()
}

export function smartAppendThought(existing: string, newText: string): string {
  const cleanNew = cleanRepeatedWords(newText)
  if (!cleanNew) return existing
  if (!existing.trim()) return cleanNew

  const existTrim = existing.trim()

  // 1. If existing already ends with cleanNew, do nothing
  if (existTrim.toLowerCase().endsWith(cleanNew.toLowerCase())) {
    return existing
  }

  // 2. Check for word overlaps between end of existing and start of cleanNew
  const existWords = existTrim.split(/\s+/)
  const newWords = cleanNew.split(/\s+/)

  let maxOverlap = 0
  for (let len = Math.min(existWords.length, newWords.length); len > 0; len--) {
    const existSuffix = existWords.slice(existWords.length - len).join(' ').toLowerCase()
    const newPrefix = newWords.slice(0, len).join(' ').toLowerCase()
    if (existSuffix === newPrefix) {
      maxOverlap = len
      break
    }
  }

  if (maxOverlap > 0) {
    const nonOverlappingNew = newWords.slice(maxOverlap).join(' ')
    if (!nonOverlappingNew) return existing
    return existTrim + ' ' + nonOverlappingNew
  }

  return existTrim + ' ' + cleanNew
}

export class VoiceSession {
  private webRecognition: any = null
  private activeStream: MediaStream | null = null
  private mediaRecorder: MediaRecorder | null = null
  private isListening = false
  private shouldBeListening = false
  private nativeListenerHandle: any = null
  private lastPartialText = ''
  private currentListeners: VoiceListeners | null = null

  async requestMicrophonePermission(): Promise<boolean> {
    // 1. Native Capacitor Speech Recognition Permission Check & Request
    try {
      if (typeof (SpeechRecognition as any).requestPermissions === 'function') {
        const req = await (SpeechRecognition as any).requestPermissions()
        if (req && (req.speechRecognition === 'granted' || req.permission === true)) {
          return true
        }
      }
      const speechAny = SpeechRecognition as any
      if (typeof speechAny.checkPermissions === 'function') {
        const check = await speechAny.checkPermissions()
        if (check?.speechRecognition === 'granted') return true
      }
      if (typeof speechAny.hasPermission === 'function') {
        const hasPerm = await speechAny.hasPermission()
        if (hasPerm?.permission) return true
      }
      if (typeof speechAny.requestPermission === 'function') {
        const req = await speechAny.requestPermission()
        if (req?.permission) return true
      }
    } catch (e) {
      console.warn('Native SpeechRecognition permission check skipped/failed:', e)
    }

    // 2. Web Browser & WebView getUserMedia Permission Check
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop())
        return true
      } catch (err: any) {
        console.warn('getUserMedia permission error:', err)
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          return false
        }
      }
    }

    return true
  }

  async startListening(listeners: VoiceListeners): Promise<void> {
    if (this.isListening) {
      await this.stopListening()
    }

    const hasPermission = await this.requestMicrophonePermission()
    if (!hasPermission) {
      listeners.onError('Microphone access denied. Tap mic again to allow or type your thoughts below.')
      return
    }

    this.currentListeners = listeners
    this.shouldBeListening = true

    // Attempt 1: Web Speech API (Preferred in WebViews - smooth, no system beep pops)
    const win = window as any
    const WebSpeech = win.SpeechRecognition || win.webkitSpeechRecognition

    if (WebSpeech) {
      try {
        const recognition = new WebSpeech()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = 'en-US'

        recognition.onstart = () => {
          this.isListening = true
          listeners.onStart()
        }

        recognition.onresult = (event: any) => {
          let interimStr = ''
          let finalStr = ''

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript
            if (event.results[i].isFinal) {
              finalStr += transcript
            } else {
              interimStr += transcript
            }
          }

          if (finalStr) {
            this.lastPartialText = ''
            listeners.onResult(cleanRepeatedWords(finalStr), true)
          } else if (interimStr) {
            const cleaned = cleanRepeatedWords(interimStr)
            this.lastPartialText = cleaned
            listeners.onResult(cleaned, false)
          }
        }

        recognition.onerror = (event: any) => {
          console.warn('Web Speech recognition error:', event.error)

          if (event.error === 'not-allowed') {
            this.shouldBeListening = false
            this.isListening = false
            listeners.onError('Microphone access blocked. Tap mic again to allow or type below.')
            listeners.onEnd()
          } else if (event.error === 'no-speech') {
            // Silence detected; will restart smoothly if still listening
          } else if (event.error === 'audio-capture') {
            this.shouldBeListening = false
            this.isListening = false
            listeners.onError('No microphone found on device.')
            listeners.onEnd()
          }
        }

        recognition.onend = () => {
          if (this.shouldBeListening) {
            setTimeout(() => {
              if (this.shouldBeListening && this.webRecognition) {
                try {
                  this.webRecognition.start()
                } catch (e) {
                  this.isListening = false
                  listeners.onEnd()
                }
              }
            }, 300)
          } else {
            this.isListening = false
            listeners.onEnd()
          }
        }

        this.webRecognition = recognition
        recognition.start()
        return
      } catch (err: any) {
        console.warn('Web Speech API initialization error, falling back to Native plugin:', err)
      }
    }

    // Attempt 2: Native Capacitor SpeechRecognition Plugin
    try {
      const isAvailable = await SpeechRecognition.available()
      if (isAvailable && isAvailable.available) {
        this.isListening = true
        listeners.onStart()

        this.nativeListenerHandle = await SpeechRecognition.addListener('partialResults', (data: { matches: string[] }) => {
          if (data && data.matches && data.matches.length > 0) {
            const text = data.matches[0]
            if (text && text.trim()) {
              const cleaned = cleanRepeatedWords(text)
              this.lastPartialText = cleaned
              listeners.onResult(cleaned, false)
            }
          }
        })

        // Run single/continuous native session with paced restart
        this.runNativeListeningLoop(listeners)
        return
      }
    } catch (nativeErr: any) {
      console.warn('Capacitor native SpeechRecognition start failed:', nativeErr)
    }

    // Attempt 3: getUserMedia MediaRecorder Fallback
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.activeStream = stream
      this.isListening = true
      listeners.onStart()

      const mediaRecorder = new MediaRecorder(stream)
      this.mediaRecorder = mediaRecorder

      mediaRecorder.onstop = () => {
        this.isListening = false
        if (this.activeStream) {
          this.activeStream.getTracks().forEach((t) => t.stop())
          this.activeStream = null
        }
        listeners.onEnd()
      }

      mediaRecorder.start()
      listeners.onError('Voice recording active. Speak your thoughts and type or edit below.')
    } catch (fallbackErr: any) {
      this.shouldBeListening = false
      this.isListening = false
      listeners.onError('Voice input is unavailable. Please type your thoughts in the box below.')
      listeners.onEnd()
    }
  }

  private async runNativeListeningLoop(listeners: VoiceListeners): Promise<void> {
    while (this.shouldBeListening) {
      try {
        this.lastPartialText = ''
        const result = await SpeechRecognition.start({
          language: 'en-US',
          maxResults: 5,
          prompt: 'Speak your night thoughts...',
          partialResults: true,
          popup: false,
        })

        let finalText = ''
        if (result && result.matches && result.matches.length > 0) {
          finalText = result.matches[0]
        } else if (this.lastPartialText) {
          finalText = this.lastPartialText
        }

        if (finalText && finalText.trim()) {
          listeners.onResult(cleanRepeatedWords(finalText), true)
        }
        this.lastPartialText = ''

        if (this.shouldBeListening) {
          await new Promise((resolve) => setTimeout(resolve, 800))
        }
      } catch (err: any) {
        console.warn('Native speech recognition iteration finished or timed out:', err)
        if (this.lastPartialText && this.lastPartialText.trim()) {
          listeners.onResult(cleanRepeatedWords(this.lastPartialText), true)
          this.lastPartialText = ''
        }

        if (this.shouldBeListening) {
          const errString = String(err?.message || err || '').toLowerCase()
          if (errString.includes('permission') || errString.includes('not allowed')) {
            this.shouldBeListening = false
            this.isListening = false
            listeners.onError('Microphone access denied.')
            break
          }
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }
    }

    this.isListening = false
    listeners.onEnd()
  }

  async stopListening(): Promise<void> {
    this.shouldBeListening = false

    if (this.lastPartialText && this.lastPartialText.trim() && this.currentListeners) {
      this.currentListeners.onResult(cleanRepeatedWords(this.lastPartialText), true)
      this.lastPartialText = ''
    }

    try {
      await SpeechRecognition.stop()
      await SpeechRecognition.removeAllListeners()
    } catch (e) {
      // Ignore if not running in native
    }

    if (this.nativeListenerHandle) {
      try {
        if (typeof this.nativeListenerHandle.remove === 'function') {
          this.nativeListenerHandle.remove()
        }
      } catch (e) {
        // Ignore
      }
      this.nativeListenerHandle = null
    }

    if (this.webRecognition) {
      try {
        this.webRecognition.stop()
      } catch (e) {
        // Ignore
      }
      this.webRecognition = null
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop()
      } catch (e) {
        // Ignore
      }
      this.mediaRecorder = null
    }

    if (this.activeStream) {
      this.activeStream.getTracks().forEach((t) => t.stop())
      this.activeStream = null
    }

    this.isListening = false
    if (this.currentListeners) {
      this.currentListeners.onEnd()
      this.currentListeners = null
    }
  }
}

