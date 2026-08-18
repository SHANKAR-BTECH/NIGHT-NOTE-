import { useState, useEffect, useRef, useCallback } from 'react'
import NightNoteLocalAI, { ModelStatus } from './plugins/nightnoteLocalAI'
import {
  generateMission,
  generateLocalTasks,
  cleanupLegacyCredentials,
  smartTrim,
  sortTasksByPriority,
  notifyAIToast,
  TaskItem,
} from './services/customLLMService'
import { getLocalModelStatus, startModelDownload, initializeLocalModel } from './services/localInferenceService'
import { MODEL_CONFIG } from './config/modelConfig'
import { getStats, incrementNotes, recordMissionComplete, recordTaskActivity, ProgressStats, DEFAULT_STATS } from './stats'
import { getSettings, saveSettings, AppSettings } from './settings'
import { VoiceSession, smartAppendThought, cleanRepeatedWords } from './services/voiceService'
import { ProgressDashboard } from './components/ProgressDashboard'
import { SettingsScreen } from './components/SettingsScreen'

// ─── Configuration ─────────────────────────────────────────────────────────────
// Set to true for dev/testing demo mode (ignores time/date locks, enables infinite repeatable workflows).
// Set to false for strict production behavior.
export const DEMO_MODE = true

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen = 'night' | 'morning' | 'progress' | 'settings'
type Priority = 'high' | 'medium' | 'low'

interface Task {
  id: string
  text: string
  priority: Priority
  duration: string
  done: boolean
}

// ─── Theme ────────────────────────────────────────────────────────────────────

const night = {
  bg: '#0d1b3e',
  surface: '#162150',
  surfaceAlt: '#1c2a63',
  accent: '#f5c842',
  text: '#e8eaf6',
  textDim: 'rgba(232,234,246,0.55)',
  border: 'rgba(245,200,66,0.18)',
}

export const lightDayTheme = {
  bg: '#f7f4ee',
  surface: '#ffffff',
  surfaceAlt: '#f0ece2',
  accent: '#e8903a',
  accentDim: 'rgba(232,144,58,0.12)',
  text: '#1a1714',
  textDim: '#8a7e72',
  border: '#e4ddd0',
  green: '#3bb06d',
  greenBg: 'rgba(59,176,109,0.1)',
  yellow: '#d4a017',
  yellowBg: 'rgba(212,160,23,0.1)',
  red: '#d44a3a',
  redBg: 'rgba(212,74,58,0.1)',
}

export const darkDayTheme = {
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceAlt: '#334155',
  accent: '#f5c842',
  accentDim: 'rgba(245,200,66,0.15)',
  text: '#f8fafc',
  textDim: '#94a3b8',
  border: '#334155',
  green: '#10b981',
  greenBg: 'rgba(16,185,129,0.15)',
  yellow: '#f5c842',
  yellowBg: 'rgba(245,200,66,0.15)',
  red: '#ef4444',
  redBg: 'rgba(239,68,68,0.15)',
}

export type DayTheme = typeof lightDayTheme

export function getDayTheme(isDark: boolean): DayTheme {
  return isDark ? darkDayTheme : lightDayTheme
}

// Default day theme fallback
const day = lightDayTheme

// ─── Helpers ──────────────────────────────────────────────────────────────────

const priorityStyle = (p: Priority, theme: DayTheme = day) => {
  if (p === 'high') return { border: theme.green, bg: theme.greenBg, dot: theme.green, label: 'High' }
  if (p === 'medium') return { border: theme.yellow, bg: theme.yellowBg, dot: theme.yellow, label: 'Medium' }
  return { border: theme.red, bg: theme.redBg, dot: theme.red, label: 'Low' }
}

// ─── Confetti ─────────────────────────────────────────────────────────────────

const CONFETTI_COLORS = ['#f5c842', '#3bb06d', '#5b6af7', '#e8903a', '#f472b6', '#34d399']

function Confetti() {
  const pieces = Array.from({ length: 28 }, (_, i) => ({
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    left: `${5 + (i * 3.3) % 90}%`,
    delay: `${(i * 0.11) % 1.4}s`,
    duration: `${1.6 + (i % 5) * 0.18}s`,
    size: 5 + (i % 4) * 3,
    shape: i % 3,
  }))

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {pieces.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            top: '-10px',
            left: p.left,
            width: p.size,
            height: p.shape === 2 ? p.size * 2 : p.size,
            background: p.color,
            borderRadius: p.shape === 0 ? '50%' : p.shape === 1 ? '2px' : '1px',
            animation: `confettiFall ${p.duration} ${p.delay} ease-in forwards`,
            opacity: 0.9,
          }}
        />
      ))}
    </div>
  )
}

// ─── AI Loading Overlay ───────────────────────────────────────────────────────

const AI_MESSAGES = [
  'Analyzing your thoughts…',
  'Prioritizing tomorrow\'s mission…',
  'Preparing your day…',
  'Crafting your plan…',
]

function ModelSetupOverlay({ status, progress, message, onStartDownload }: { status: ModelStatus, progress: number, message?: string, onStartDownload: () => void }) {
  const isError = status === ModelStatus.ERROR;
  const isDownloading = status === ModelStatus.DOWNLOADING;
  const isVerifying = status === ModelStatus.VERIFYING;
  const isLoading = status === ModelStatus.LOADING;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(7,14,36,0.95)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: '32px',
        textAlign: 'center'
      }}
    >
      <div style={{ marginBottom: '32px', animation: 'floatMoon 4s ease-in-out infinite' }}>
        <svg viewBox="0 0 24 24" width={64} height={64} fill={night.accent}>
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
        </svg>
      </div>

      <h2 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: '24px', color: night.text, marginBottom: '12px' }}>
        NightNote AI Setup
      </h2>

      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '15px', color: night.textDim, lineHeight: 1.6, maxWidth: '300px', marginBottom: '32px' }}>
        {status === ModelStatus.NOT_INSTALLED && "NightNote uses a local AI model so your task processing can run privately on your device."}
        {isDownloading && "Downloading NightNote AI model..."}
        {isVerifying && "Verifying model integrity..."}
        {isLoading && "Preparing NightNote AI..."}
        {isError && `Error: ${message || 'Failed to setup model'}`}
      </p>

      {(isDownloading || isVerifying || isLoading) && (
        <div style={{ width: '100%', maxWidth: '240px', marginBottom: '24px' }}>
          <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', background: night.accent, width: `${progress}%`, transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
            <span style={{ color: night.textDim, fontSize: '12px', fontWeight: 600 }}>{progress}%</span>
            <span style={{ color: night.textDim, fontSize: '12px' }}>{MODEL_CONFIG.SIZE_MB} MB</span>
          </div>
        </div>
      )}

      {status === ModelStatus.NOT_INSTALLED && (
        <button
          onClick={onStartDownload}
          style={{
            background: night.accent,
            color: '#0d1b3e',
            border: 'none',
            borderRadius: '16px',
            padding: '16px 32px',
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 700,
            fontSize: '16px',
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(245,200,66,0.3)',
          }}
        >
          Download AI Model
        </button>
      )}

      {isError && (
        <button
          onClick={onStartDownload}
          style={{
            background: 'rgba(212,74,58,0.2)',
            color: '#f87171',
            border: `1.5px solid #d44a3a`,
            borderRadius: '16px',
            padding: '12px 24px',
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Retry Installation
        </button>
      )}

      <p style={{ marginTop: '24px', fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Sans', sans-serif" }}>
        Model Version: {MODEL_CONFIG.VERSION}
      </p>
    </div>
  )
}

function AILoadingOverlay({ onCancel }: { onCancel?: () => void }) {
  const [msgIdx, setMsgIdx] = useState(0)
  const [secondsElapsed, setSecondsElapsed] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % AI_MESSAGES.length), 1100)
    const secTimer = setInterval(() => setSecondsElapsed((s) => s + 1), 1000)
    return () => {
      clearInterval(t)
      clearInterval(secTimer)
    }
  }, [])

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(7,14,36,0.92)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        animation: 'overlayIn 0.3s ease',
      }}
    >
      {/* AI processing spinner */}
      <div style={{ position: 'relative', width: '80px', height: '80px', marginBottom: '32px' }}>
        <div
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            border: '2px solid rgba(245,200,66,0.12)',
            position: 'absolute',
          }}
        />
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: '10px',
              height: '10px',
              marginTop: '-5px',
              marginLeft: '-5px',
              borderRadius: '50%',
              background: CONFETTI_COLORS[i],
              animation: `aiOrbit ${1.4 + i * 0.15}s ${i * 0.22}s linear infinite`,
              transformOrigin: '5px 5px',
            }}
          />
        ))}
        <div
          style={{
            position: 'absolute',
            inset: '20px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(245,200,66,0.15) 0%, transparent 70%)',
            animation: 'glowPulse 1.8s ease-in-out infinite',
          }}
        />
        <svg
          viewBox="0 0 24 24"
          style={{ position: 'absolute', inset: '26px', fill: night.accent }}
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
        </svg>
      </div>

      {/* Animated message */}
      <div style={{ height: '28px', overflow: 'hidden', position: 'relative' }}>
        <p
          key={msgIdx}
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 600,
            fontSize: '16px',
            color: night.text,
            textAlign: 'center',
            animation: 'loadingMessage 1.1s ease forwards',
          }}
        >
          {AI_MESSAGES[msgIdx]}
        </p>
      </div>

      {/* Shimmer dots */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '20px', marginBottom: '24px' }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: night.accent,
              animation: `shimmerDot 1.2s ${i * 0.2}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>

      {onCancel && secondsElapsed >= 3 && (
        <button
          onClick={onCancel}
          style={{
            background: 'rgba(245,200,66,0.12)',
            border: `1px solid rgba(245,200,66,0.3)`,
            borderRadius: '12px',
            padding: '8px 16px',
            color: night.accent,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
            animation: 'fadeIn 0.3s ease',
          }}
        >
          ⚡ Use Smart Local Plan Now
        </button>
      )}
    </div>
  )
}

// ─── Mission Ready Modal ──────────────────────────────────────────────────────

function MissionReadyModal({
  onClose,
  onEditThoughts,
}: {
  onClose: () => void
  onEditThoughts: () => void
}) {
  const stars = [
    { x: 52, y: 28, delay: '0s', size: 14 },
    { x: 78, y: 44, delay: '0.4s', size: 10 },
    { x: 32, y: 52, delay: '0.7s', size: 8 },
    { x: 68, y: 18, delay: '0.2s', size: 6 },
    { x: 88, y: 62, delay: '0.9s', size: 7 },
    { x: 22, y: 38, delay: '0.5s', size: 9 },
    { x: 44, y: 14, delay: '1.1s', size: 5 },
  ]

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(5,10,28,0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 60,
        padding: '24px',
        animation: 'overlayIn 0.35s ease',
      }}
    >
      <div
        style={{
          width: '100%',
          background: 'linear-gradient(145deg, rgba(26,40,95,0.95) 0%, rgba(18,28,72,0.98) 100%)',
          backdropFilter: 'blur(24px)',
          borderRadius: '28px',
          border: '1px solid rgba(245,200,66,0.22)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(245,200,66,0.08)',
          padding: '32px 28px',
          animation: 'modalIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: 'absolute',
            top: '-40px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '200px',
            height: '200px',
            background: 'radial-gradient(circle, rgba(245,200,66,0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Stars */}
        {stars.map((s, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${s.x}%`,
              top: `${s.y}%`,
              animation: `twinkle ${1.5 + i * 0.3}s ${s.delay} ease-in-out infinite`,
              pointerEvents: 'none',
            }}
          >
            <svg viewBox="0 0 12 12" width={s.size} height={s.size} fill={night.accent}>
              <path d="M6 0 L6.8 4.8 L12 6 L6.8 7.2 L6 12 L5.2 7.2 L0 6 L5.2 4.8 Z" />
            </svg>
          </div>
        ))}

        {/* Moon illustration */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <div style={{ position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                inset: '-16px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(245,200,66,0.18) 0%, transparent 70%)',
                animation: 'glowPulse 2.5s ease-in-out infinite',
              }}
            />
            <svg
              viewBox="0 0 60 60"
              width={72}
              height={72}
              style={{ animation: 'floatMoon 4s ease-in-out infinite', position: 'relative' }}
            >
              <defs>
                <radialGradient id="moonGrad" cx="40%" cy="35%">
                  <stop offset="0%" stopColor="#fff9e0" />
                  <stop offset="100%" stopColor="#f5c842" />
                </radialGradient>
              </defs>
              <path
                d="M38 10 A22 22 0 1 1 14 42 A16 16 0 0 0 38 10Z"
                fill="url(#moonGrad)"
              />
              <circle cx="28" cy="24" r="2.5" fill="rgba(180,140,0,0.25)" />
              <circle cx="36" cy="34" r="1.8" fill="rgba(180,140,0,0.2)" />
              <circle cx="22" cy="36" r="1.5" fill="rgba(180,140,0,0.18)" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h2
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 800,
            fontSize: '22px',
            color: night.text,
            textAlign: 'center',
            letterSpacing: '-0.02em',
            marginBottom: '12px',
          }}
        >
          🌙 Tomorrow's Mission is Ready
        </h2>

        {/* Description */}
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '14px',
            color: night.textDim,
            textAlign: 'center',
            lineHeight: 1.65,
            marginBottom: '8px',
          }}
        >
          Your thoughts have been transformed into a realistic mission for tomorrow.
        </p>
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '14px',
            color: night.accent,
            textAlign: 'center',
            marginBottom: '28px',
            fontWeight: 500,
          }}
        >
          Sleep well. We'll remind you in the morning.
        </p>

        {/* Divider */}
        <div
          style={{
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(245,200,66,0.2), transparent)',
            marginBottom: '24px',
          }}
        />

        {/* Buttons */}
        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '15px',
            borderRadius: '16px',
            border: 'none',
            background: `linear-gradient(135deg, ${night.accent} 0%, #e5b030 100%)`,
            color: '#0d1b3e',
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 700,
            fontSize: '16px',
            cursor: 'pointer',
            marginBottom: '10px',
            boxShadow: '0 4px 20px rgba(245,200,66,0.3)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          Good Night ✨
        </button>
        <button
          onClick={onEditThoughts}
          style={{
            width: '100%',
            padding: '13px',
            borderRadius: '16px',
            border: `1px solid ${night.border}`,
            background: 'transparent',
            color: night.textDim,
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'color 0.2s, border-color 0.2s',
          }}
        >
          Edit Thoughts
        </button>
      </div>
    </div>
  )
}

// ─── Mission Complete Modal ───────────────────────────────────────────────────

function MissionCompleteModal({
  onViewProgress,
  onHome,
  stats,
  day = lightDayTheme,
}: {
  onViewProgress: () => void
  onHome: () => void
  stats?: ProgressStats
  day?: DayTheme
}) {
  const currentStats = stats || getStats()

  let totalTasks = 0
  let completedTasks = 0
  try {
    const stored = localStorage.getItem('morningTasks')
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length > 0) {
        totalTasks = parsed.length
        completedTasks = parsed.filter((t: Task) => t.done).length
      }
    }
  } catch (e) {
    console.error('Failed to parse morning tasks in MissionCompleteModal', e)
  }

  if (totalTasks === 0) {
    totalTasks = 1
    completedTasks = 1
  }

  const completionRate = Math.round((completedTasks / totalTasks) * 100)
  const streak = currentStats.streak || 0
  const isDark = day.bg === darkDayTheme.bg

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: isDark ? 'rgba(15,23,42,0.88)' : 'rgba(247,244,238,0.88)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 60,
        padding: '24px',
        animation: 'overlayIn 0.35s ease',
      }}
    >
      <Confetti />

      <div
        style={{
          width: '100%',
          background: day.surface,
          borderRadius: '28px',
          border: `1px solid ${day.border}`,
          boxShadow: isDark ? '0 20px 60px rgba(0,0,0,0.5)' : '0 20px 60px rgba(0,0,0,0.1)',
          padding: '32px 28px',
          animation: 'modalIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Trophy */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: isDark
                ? 'linear-gradient(135deg, rgba(245,200,66,0.25) 0%, rgba(245,200,66,0.1) 100%)'
                : 'linear-gradient(135deg, #fff8dc 0%, #fef3c7 100%)',
              border: isDark ? '1px solid rgba(245,200,66,0.4)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 24px rgba(245,200,66,0.35)',
              animation: 'trophyBounce 2s ease-in-out infinite',
              fontSize: '36px',
            }}
          >
            🏆
          </div>
        </div>

        <h2
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 800,
            fontSize: '24px',
            color: day.text,
            textAlign: 'center',
            letterSpacing: '-0.02em',
            marginBottom: '8px',
          }}
        >
          🎉 Mission Complete!
        </h2>
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '14px',
            color: day.textDim,
            textAlign: 'center',
            lineHeight: 1.6,
            marginBottom: '24px',
          }}
        >
          Great job! You completed today's mission
          <br />and stayed consistent.
        </p>

        {/* Stats card */}
        <div
          style={{
            background: day.surfaceAlt,
            borderRadius: '18px',
            padding: '18px',
            marginBottom: '24px',
            border: `1px solid ${day.border}`,
          }}
        >
          {[
            { icon: '✅', label: 'Tasks Completed', value: `${completedTasks} / ${totalTasks}` },
            { icon: '🔥', label: 'Current Streak', value: `${streak} day${streak === 1 ? '' : 's'}` },
            { icon: '📈', label: 'Completion Rate', value: `${completionRate}%` },
          ].map((stat, idx, arr) => (
            <div
              key={stat.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: idx < arr.length - 1 ? `1px solid ${day.border}` : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '16px' }}>{stat.icon}</span>
                <span
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '14px',
                    color: day.textDim,
                  }}
                >
                  {stat.label}
                </span>
              </div>
              <span
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontWeight: 700,
                  fontSize: '15px',
                  color: day.text,
                }}
              >
                {stat.value}
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={onViewProgress}
          style={{
            width: '100%',
            padding: '15px',
            borderRadius: '16px',
            border: 'none',
            background: `linear-gradient(135deg, ${day.accent} 0%, #d4802a 100%)`,
            color: isDark ? '#0f172a' : '#fff',
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 700,
            fontSize: '16px',
            cursor: 'pointer',
            marginBottom: '10px',
            boxShadow: '0 4px 20px rgba(232,144,58,0.3)',
            transition: 'transform 0.15s',
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          View Progress
        </button>
        <button
          onClick={onHome}
          style={{
            width: '100%',
            padding: '13px',
            borderRadius: '16px',
            border: `1px solid ${day.border}`,
            background: 'transparent',
            color: day.text,
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Back to Home
        </button>
      </div>
    </div>
  )
}

// ─── Smart Trim Modal ─────────────────────────────────────────────────────────

function SmartTrimModal({
  originalTasks,
  onApply,
  onCancel,
  day = lightDayTheme,
}: {
  originalTasks: TaskItem[]
  onApply: (trimmed: TaskItem[]) => void
  onCancel: () => void
  day?: DayTheme
}) {
  const [isTrimming, setIsTrimming] = useState(true)
  const [previewTasks, setPreviewTasks] = useState<TaskItem[]>([])

  useEffect(() => {
    let active = true
    async function runTrim() {
      setIsTrimming(true)
      try {
        const trimmed = await smartTrim(originalTasks)
        if (active) {
          setPreviewTasks(sortTasksByPriority(trimmed))
        }
      } catch (err) {
        console.warn('Smart Trim error:', err)
        if (active) {
          setPreviewTasks(originalTasks)
        }
      } finally {
        if (active) setIsTrimming(false)
      }
    }
    runTrim()
    return () => {
      active = false
    }
  }, [originalTasks])

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: day.bg === darkDayTheme.bg ? 'rgba(15,23,42,0.88)' : 'rgba(247,244,238,0.88)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 100,
        padding: '0 0 16px',
        animation: 'overlayIn 0.3s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '480px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          background: day.surface,
          borderRadius: '28px 28px 24px 24px',
          border: `1px solid ${day.border}`,
          boxShadow: '0 -8px 40px rgba(0,0,0,0.3)',
          padding: '24px 20px 20px',
          animation: 'modalIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {/* Handle */}
        <div
          style={{
            width: '36px',
            height: '4px',
            borderRadius: '99px',
            background: day.border,
            margin: '0 auto 16px',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '13px',
              background: 'linear-gradient(135deg, rgba(232,144,58,0.15) 0%, rgba(245,200,66,0.12) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
            }}
          >
            ✨
          </div>
          <div>
            <h3
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontWeight: 800,
                fontSize: '18px',
                color: day.text,
                letterSpacing: '-0.02em',
              }}
            >
              Smart Trim Suggested Mission
            </h3>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: day.textDim }}>
              {isTrimming
                ? 'AI is analyzing workload & protecting high priority tasks...'
                : `Optimized from ${originalTasks.length} to ${previewTasks.length} task${previewTasks.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>

        {isTrimming ? (
          <div style={{ padding: '36px 16px', textAlign: 'center' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                border: `3px solid ${day.accent}`,
                borderTopColor: 'transparent',
                borderRadius: '50%',
                margin: '0 auto 16px',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '14px', color: day.text, fontWeight: 500 }}>
              Analyzing workload and trimming optional tasks...
            </p>
          </div>
        ) : (
          <>
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(232,144,58,0.08) 0%, rgba(245,200,66,0.05) 100%)',
                border: `1px solid rgba(232,144,58,0.2)`,
                borderRadius: '14px',
                padding: '12px 14px',
                marginBottom: '14px',
              }}
            >
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: day.text, lineHeight: 1.5, fontWeight: 500, margin: 0 }}>
                🛡️ High-priority tasks are preserved. Optional & lower-priority tasks have been shortened or consolidated.
              </p>
            </div>

            {/* Task Preview Scroll Area */}
            <div style={{ overflowY: 'auto', maxHeight: '340px', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
              {previewTasks.map((t) => {
                const priorityColor =
                  t.priority === 'high' ? day.red : t.priority === 'medium' ? day.accent : day.textDim
                const priorityBg =
                  t.priority === 'high'
                    ? 'rgba(212,74,58,0.1)'
                    : t.priority === 'medium'
                    ? 'rgba(232,144,58,0.1)'
                    : 'rgba(100,116,139,0.1)'

                return (
                  <div
                    key={t.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '12px',
                      background: day.surfaceAlt,
                      border: `1px solid ${day.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: day.text, fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.text}
                      </p>
                      {t.description && (
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', color: day.textDim, margin: '2px 0 0' }}>
                          {t.description}
                        </p>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: priorityColor,
                          background: priorityBg,
                          padding: '2px 6px',
                          borderRadius: '6px',
                          fontFamily: "'Outfit', sans-serif",
                        }}
                      >
                        {t.priority}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: day.textDim,
                          background: day.border,
                          padding: '2px 6px',
                          borderRadius: '6px',
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        {t.duration}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            <button
              onClick={() => onApply(previewTasks)}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '16px',
                border: 'none',
                background: `linear-gradient(135deg, ${day.accent} 0%, #d4802a 100%)`,
                color: '#fff',
                fontFamily: "'Outfit', sans-serif",
                fontWeight: 700,
                fontSize: '15px',
                cursor: 'pointer',
                marginBottom: '10px',
                boxShadow: '0 4px 20px rgba(232,144,58,0.28)',
              }}
            >
              Apply Changes
            </button>
            <button
              onClick={onCancel}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '16px',
                border: `1px solid ${day.border}`,
                background: 'transparent',
                color: day.textDim,
                fontFamily: "'Outfit', sans-serif",
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Bottom Nav ───────────────────────────────────────────────────────────────

function BottomNav({
  active,
  onChange,
  day = lightDayTheme,
}: {
  active: Screen
  onChange: (s: Screen) => void
  isDark?: boolean
  day?: DayTheme
}) {
  const [pressedTab, setPressedTab] = useState<Screen | null>(null)

  const tabs: { id: Screen; label: string; icon: React.ReactNode }[] = [
    {
      id: 'night',
      label: 'Night',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
        </svg>
      ),
    },
    {
      id: 'morning',
      label: 'Morning',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ),
    },
    {
      id: 'progress',
      label: 'Progress',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
  ]

  const bg = active === 'night' ? night.surface : day.surface
  const border = active === 'night' ? night.border : day.border
  const activeColor = active === 'night' ? night.accent : day.accent
  const inactiveColor = active === 'night' ? night.textDim : day.textDim

  return (
    <div
      style={{
        background: bg,
        borderTop: `1px solid ${border}`,
        backdropFilter: 'blur(12px)',
        paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))',
      }}
      className="flex items-center justify-around px-2 pt-3"
    >
      {tabs.map((tab) => {
        const isActive = active === tab.id
        const isPressed = pressedTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            onMouseDown={() => setPressedTab(tab.id)}
            onMouseUp={() => setPressedTab(null)}
            onMouseLeave={() => setPressedTab(null)}
            className="flex flex-col items-center gap-1 px-4"
            style={{
              color: isActive ? activeColor : inactiveColor,
              transition: 'color 0.2s',
            }}
          >
            <span
              style={{
                transform: isPressed ? 'scale(0.88)' : isActive ? 'scale(1.1)' : 'scale(1)',
                transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
                display: 'block',
              }}
            >
              {tab.icon}
            </span>
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '10px',
                fontWeight: isActive ? 600 : 400,
                letterSpacing: '0.03em',
                transition: 'font-weight 0.2s',
              }}
            >
              {tab.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Night Capture Screen ─────────────────────────────────────────────────────

function NightCapture({
  onGenerateMission,
  isLocked,
  showDialog,
  onContinueEditing,
  onDone,
  onGoToMorning,
}: {
  onGenerateMission: (thought: string) => void
  isLocked: boolean
  showDialog: boolean
  onContinueEditing: () => void
  onDone: () => void
  onGoToMorning: () => void
}) {
  if (isLocked) {
    return (
      <div className="flex flex-col flex-1 px-6 py-8 items-center justify-center text-center" style={{ background: 'linear-gradient(160deg, #0d1b3e 0%, #0b1530 60%, #07102a 100%)' }}>
        <svg viewBox="0 0 24 24" width={48} height={48} stroke={night.accent} fill="none" strokeWidth={1.5} className="mb-6"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '20px', color: night.text, marginBottom: '12px', lineHeight: 1.4 }}>Night planning is available after today's mission.</h2>
        <button onClick={onGoToMorning} style={{ background: night.accent, color: '#0d1b3e', padding: '12px 24px', borderRadius: '12px', fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: '15px', border: 'none', cursor: 'pointer', marginTop: '24px' }}>Go to Morning Mission</button>
      </div>
    )
  }

  if (showDialog) {
    return (
      <div className="flex flex-col flex-1 px-6 py-8 items-center justify-center text-center" style={{ background: 'linear-gradient(160deg, #0d1b3e 0%, #0b1530 60%, #07102a 100%)' }}>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '24px', color: night.text, marginBottom: '32px' }}>Already remembered something?</h2>
        <div className="flex flex-col gap-3 w-full max-w-[260px]">
          <button onClick={onContinueEditing} style={{ background: night.accent, color: '#0d1b3e', padding: '14px', borderRadius: '12px', fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: '15px', border: 'none', cursor: 'pointer' }}>Continue Editing</button>
          <button onClick={onDone} style={{ background: 'transparent', color: night.text, padding: '14px', borderRadius: '12px', fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: '15px', border: `1px solid ${night.border}`, cursor: 'pointer' }}>I'm Done</button>
        </div>
      </div>
    )
  }

  const [isRecording, setIsRecording] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [thought, setThought] = useState(() => localStorage.getItem('nightEntryThought') || '')
  const voiceSessionRef = useRef<VoiceSession | null>(null)

  if (!voiceSessionRef.current) {
    voiceSessionRef.current = new VoiceSession()
  }

  useEffect(() => {
    // Request microphone permission on first enter
    voiceSessionRef.current?.requestMicrophonePermission()
  }, [])

  useEffect(() => {
    localStorage.setItem('nightEntryThought', thought)
  }, [thought])

  const toggleRecording = () => {
    if (isRecording) {
      voiceSessionRef.current?.stopListening()
      setIsRecording(false)
      setInterimTranscript('')
    } else {
      setVoiceError(null)
      voiceSessionRef.current?.startListening({
        onStart: () => {
          setIsRecording(true)
          setVoiceError(null)
        },
        onResult: (transcript, isFinal) => {
          if (isFinal) {
            setThought((prev) => smartAppendThought(prev, transcript))
            setInterimTranscript('')
          } else {
            setInterimTranscript(cleanRepeatedWords(transcript))
          }
        },
        onError: (errMsg) => {
          setVoiceError(errMsg)
          setIsRecording(false)
          setInterimTranscript('')
        },
        onEnd: () => {
          setIsRecording(false)
          setInterimTranscript('')
        },
      })
    }
  }

  return (
    <div
      className="flex flex-col flex-1 px-6 py-8 overflow-y-auto"
      style={{ background: 'linear-gradient(160deg, #0d1b3e 0%, #0b1530 60%, #07102a 100%)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-8">
        <svg viewBox="0 0 24 24" fill={night.accent} className="w-6 h-6"
          style={{ animation: 'floatMoon 6s ease-in-out infinite' }}>
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
        </svg>
        <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '22px', color: night.text, letterSpacing: '-0.02em' }}>
          NightNote
        </span>
      </div>

      {/* Headline */}
      <div className="mb-10">
        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: '32px', lineHeight: 1.15, color: night.text, letterSpacing: '-0.03em' }}>
          Dump your<br />
          <span style={{ color: night.accent }}>thoughts.</span>
        </h1>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '14px', color: night.textDim, marginTop: '8px' }}>
          No pressure. Just let it out before sleep.
        </p>
      </div>

      {/* Mic Button */}
      <div className="flex flex-col items-center mb-8">
        <button
          onClick={toggleRecording}
          className="relative flex items-center justify-center rounded-full"
          style={{
            width: '140px',
            height: '140px',
            background: isRecording
              ? 'radial-gradient(circle, #f5c842 0%, #d4a010 100%)'
              : 'radial-gradient(circle, #1e2d6e 0%, #162050 100%)',
            boxShadow: isRecording
              ? '0 0 40px rgba(245,200,66,0.6), 0 0 80px rgba(245,200,66,0.2)'
              : undefined,
            border: `2px solid ${isRecording ? 'rgba(255,255,255,0.3)' : night.border}`,
            transform: isRecording ? 'scale(1.04)' : 'scale(1)',
            animation: isRecording ? undefined : 'softPulse 3s ease-in-out infinite',
            transition: 'transform 0.3s, border-color 0.3s, background 0.3s',
          }}
        >
          {isRecording && (
            <>
              <span className="absolute rounded-full animate-ping"
                style={{ width: '160px', height: '160px', background: 'rgba(245,200,66,0.15)', animationDuration: '1.2s' }} />
              <span className="absolute rounded-full animate-ping"
                style={{ width: '180px', height: '180px', background: 'rgba(245,200,66,0.08)', animationDuration: '1.6s', animationDelay: '0.3s' }} />
            </>
          )}
          <svg viewBox="0 0 24 24" fill="none"
            stroke={isRecording ? '#0d1b3e' : night.accent}
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>
        <p style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: '13px',
          color: isRecording ? night.accent : night.textDim,
          marginTop: '14px', fontWeight: isRecording ? 600 : 400, transition: 'color 0.3s',
          textAlign: 'center',
        }}>
          {isRecording ? 'Listening… tap mic to finish' : 'Tap to speak'}
        </p>

        {/* Live Interim Transcript Badge */}
        {isRecording && interimTranscript && (
          <div style={{
            marginTop: '8px',
            padding: '6px 12px',
            borderRadius: '12px',
            background: 'rgba(245,200,66,0.15)',
            border: `1px solid rgba(245,200,66,0.3)`,
            color: night.accent,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '12px',
            fontStyle: 'italic',
            maxWidth: '280px',
            textAlign: 'center',
          }}>
            "{interimTranscript}…"
          </div>
        )}

        {/* Voice Error Banner */}
        {voiceError && (
          <div style={{
            marginTop: '10px',
            padding: '8px 12px',
            borderRadius: '10px',
            background: 'rgba(212,74,58,0.18)',
            border: '1px solid rgba(212,74,58,0.35)',
            color: '#f87171',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '12px',
            maxWidth: '280px',
            textAlign: 'center',
          }}>
            ⚠️ {voiceError}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 mb-6">
        <div style={{ flex: 1, height: '1px', background: night.border }} />
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: night.textDim }}>or type</span>
        <div style={{ flex: 1, height: '1px', background: night.border }} />
      </div>

      {/* Text Input */}
      <div className="relative mb-4">
        <textarea
          value={thought}
          onChange={(e) => setThought(e.target.value)}
          placeholder="Enter your thoughts or speak above..."
          rows={4}
          style={{
            width: '100%', background: night.surface,
            border: `1.5px solid ${thought ? night.accent : night.border}`,
            borderRadius: '16px', padding: '16px', color: night.text,
            fontFamily: "'DM Sans', sans-serif", fontSize: '15px', lineHeight: 1.6,
            resize: 'none', outline: 'none', transition: 'border-color 0.2s',
          }}
        />
      </div>

      {/* Generate Mission Button */}
      <button
        onClick={() => onGenerateMission(thought)}
        disabled={!thought.trim()}
        style={{
          background: thought.trim() ? night.accent : 'rgba(245,200,66,0.08)',
          border: thought.trim() ? `1.5px solid ${night.accent}` : `1.5px solid ${night.border}`,
          borderRadius: '14px', padding: '14px',
          color: thought.trim() ? '#0d1b3e' : night.accent,
          fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '15px',
          cursor: thought.trim() ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          opacity: thought.trim() ? 1 : 0.5,
        }}
      >
        <svg viewBox="0 0 20 20" width={18} height={18} fill={thought.trim() ? '#0d1b3e' : night.accent}>
          <path d="M10 0 L12.5 7.5 L20 10 L12.5 12.5 L10 20 L7.5 12.5 L0 10 L7.5 7.5 Z" />
        </svg>
        Generate Tomorrow's Mission
      </button>

      {/* Stars */}
      <div className="flex justify-center mt-8 gap-6 opacity-20">
        {['✦', '✧', '✦', '✧', '✦'].map((s, i) => (
          <span key={i} style={{ color: night.accent, fontSize: i % 2 === 0 ? '10px' : '7px',
            animation: `twinkle ${2 + i * 0.4}s ${i * 0.3}s ease-in-out infinite` }}>
            {s}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onToggle,
  onUpdatePriority,
  onDragStartTask,
  onDragEndTask,
  isDragging = false,
  day = lightDayTheme,
}: {
  task: Task
  onToggle: () => void
  onUpdatePriority?: (newPriority: Priority) => void
  onDragStartTask?: (id: string) => void
  onDragEndTask?: () => void
  isDragging?: boolean
  day?: DayTheme
}) {
  const [pressed, setPressed] = useState(false)
  const s = priorityStyle(task.priority, day)
  
  const [localDone, setLocalDone] = useState(task.done)
  const [isCollapsing, setIsCollapsing] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)

  const handleToggle = () => {
    if (!localDone) {
      setLocalDone(true)
      setIsCompleting(true)
      setTimeout(() => {
        setIsCollapsing(true)
        setTimeout(() => {
          onToggle()
        }, 300) // collapse duration
      }, 500) // delay before collapse
    } else {
      setLocalDone(false)
      setIsCompleting(false)
      onToggle()
    }
  }

  if (task.done && !localDone && !isCollapsing) {
    setLocalDone(true)
  }

  if (isCollapsing && task.done) {
    return null; // hide immediately if parent re-renders and it's already done
  }

  return (
    <div
      draggable={!localDone}
      onDragStart={(e) => {
        if (localDone) return
        e.dataTransfer.setData('text/plain', task.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStartTask?.(task.id)
      }}
      onDragEnd={() => {
        onDragEndTask?.()
      }}
      onTouchStart={() => {
        if (!localDone) onDragStartTask?.(task.id)
      }}
      onClick={handleToggle}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        '--initial-bg': s.bg,
        background: localDone ? 'rgba(0,0,0,0.03)' : s.bg,
        border: `1.5px solid ${localDone ? day.border : isDragging ? s.dot : s.border}`,
        borderRadius: '16px',
        padding: isCollapsing ? '0 16px' : '14px 16px',
        marginBottom: isCollapsing ? '0' : '0',
        maxHeight: isCollapsing ? '0' : '120px',
        opacity: localDone ? 0.6 : isDragging ? 0.4 : 1,
        transform: isDragging ? 'scale(1.02) translateY(-2px)' : pressed ? 'scale(0.98)' : 'scale(1)',
        boxShadow: isDragging ? `0 8px 24px ${s.dot}33` : '0 2px 8px rgba(0,0,0,0.03)',
        cursor: localDone ? 'default' : 'grab',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        overflow: 'hidden',
        transition: 'padding 0.3s, max-height 0.3s, opacity 0.2s, transform 0.15s, box-shadow 0.2s, border-color 0.2s',
        animation: isCompleting ? 'taskCompleteFlash 0.5s ease forwards' : undefined,
        userSelect: 'none',
      } as React.CSSProperties}
    >
      {/* Drag Grip Handle */}
      {!localDone && (
        <div
          title="Drag to reprioritize"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: day.textDim,
            opacity: 0.5,
            cursor: 'grab',
            flexShrink: 0,
            padding: '2px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor">
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </div>
      )}

      {/* Checkbox */}
      <div
        style={{
          width: '22px',
          height: '22px',
          borderRadius: '7px',
          border: `2px solid ${localDone ? day.textDim : s.dot}`,
          background: localDone ? s.dot : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'background 0.2s, border-color 0.2s',
        }}
      >
        {localDone && (
          <svg viewBox="0 0 12 12" width={14} height={14} fill="none"
            stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <polyline
              points="2,6 5,9 10,3"
              style={{
                strokeDasharray: 20,
                strokeDashoffset: 0,
                animation: 'checkDraw 0.3s ease forwards',
              }}
            />
          </svg>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <p style={{
          fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: '15px',
          color: day.text,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          position: 'relative',
          display: 'inline-block',
          maxWidth: '100%'
        }}>
          {task.text}
          {localDone && (
            <span style={{
              position: 'absolute',
              top: '50%',
              left: 0,
              width: '100%',
              height: '1.5px',
              background: day.textDim,
              transformOrigin: 'left',
              animation: 'strikeDraw 0.3s ease-out forwards',
            }} />
          )}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
          <span style={{ fontSize: '11px', color: day.textDim, fontFamily: "'DM Sans', sans-serif" }}>
            ⏱ {task.duration}
          </span>
        </div>
      </div>

      {/* Priority Chip with Quick Selector */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          if (!onUpdatePriority || localDone) return
          const nextP: Record<Priority, Priority> = {
            high: 'medium',
            medium: 'low',
            low: 'high',
          }
          onUpdatePriority(nextP[task.priority])
        }}
        title="Click to cycle priority (High → Medium → Low)"
        style={{
          padding: '4px 10px',
          borderRadius: '99px',
          background: s.bg,
          border: `1px solid ${s.border}`,
          color: s.dot,
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '11px',
          fontWeight: 700,
          flexShrink: 0,
          opacity: localDone ? 0.4 : 1,
          cursor: localDone ? 'default' : 'pointer',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
        }}
      >
        <span>{s.label}</span>
        {!localDone && (
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
            <path d="M7 10l5 5 5-5" />
          </svg>
        )}
      </button>
    </div>
  )
}

// ─── Spatial Priority Region Drop Zone Component ───────────────────────────────

function PriorityRegionZone({
  priority,
  title,
  subtitle,
  badgeText,
  accentColor,
  icon,
  tasks,
  draggedTaskId,
  isDragTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  onToggleTask,
  onUpdatePriority,
  onDragStartTask,
  onDragEndTask,
  day = lightDayTheme,
}: {
  priority: Priority
  title: string
  subtitle: string
  badgeText: string
  accentColor: string
  bgTint?: string
  icon: React.ReactNode
  tasks: Task[]
  draggedTaskId: string | null
  isDragTarget: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onToggleTask: (id: string) => void
  onUpdatePriority: (id: string, newP: Priority) => void
  onDragStartTask: (id: string) => void
  onDragEndTask: () => void
  day?: DayTheme
}) {
  return (
    <div
      data-region-priority={priority}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        background: isDragTarget ? `linear-gradient(180deg, ${accentColor}18 0%, ${day.surface} 100%)` : day.surface,
        border: isDragTarget ? `2px dashed ${accentColor}` : `1.5px solid ${day.border}`,
        borderRadius: '20px',
        padding: '18px',
        transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
        boxShadow: isDragTarget ? `0 0 28px ${accentColor}25` : '0 2px 12px rgba(0,0,0,0.03)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        minHeight: '110px',
        width: '100%',
      }}
    >
      {/* Region Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: `${accentColor}18`,
              border: `1px solid ${accentColor}33`,
              color: accentColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
          <div>
            <h3
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontWeight: 800,
                fontSize: '13px',
                color: day.text,
                letterSpacing: '0.04em',
                lineHeight: 1.2,
              }}
            >
              {title}
            </h3>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', color: day.textDim, marginTop: '1px' }}>
              {subtitle}
            </p>
          </div>
        </div>

        {/* Region Count Badge */}
        <span
          style={{
            padding: '4px 10px',
            borderRadius: '99px',
            background: `${accentColor}15`,
            border: `1px solid ${accentColor}30`,
            color: accentColor,
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 700,
            fontSize: '11px',
            flexShrink: 0,
          }}
        >
          {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
        </span>
      </div>

      {/* Drag Over Visual Affordance */}
      {isDragTarget && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: '12px',
            background: `${accentColor}20`,
            border: `1px solid ${accentColor}50`,
            color: accentColor,
            fontSize: '12px',
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 700,
            textAlign: 'center',
            letterSpacing: '0.01em',
            animation: 'twinkle 1.5s ease-in-out infinite',
          }}
        >
          ↓ Drop here to move to {badgeText} Priority
        </div>
      )}

      {/* Task Tiles Container */}
      {tasks.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 12px',
            borderRadius: '14px',
            border: `1.5px dashed ${isDragTarget ? accentColor : day.border}`,
            background: 'rgba(0,0,0,0.01)',
            textAlign: 'center',
            minHeight: '90px',
          }}
        >
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: day.textDim, fontWeight: 500 }}>
            {isDragTarget ? 'Release to drop here' : `No ${badgeText.toLowerCase()} priority tasks`}
          </p>
          <span style={{ fontSize: '11px', color: day.textDim, opacity: 0.7, marginTop: '2px' }}>
            Drag a task card into this region
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onToggle={() => onToggleTask(task.id)}
              onUpdatePriority={(newP) => onUpdatePriority(task.id, newP)}
              onDragStartTask={onDragStartTask}
              onDragEndTask={onDragEndTask}
              isDragging={draggedTaskId === task.id}
              day={day}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Morning Mission Screen ───────────────────────────────────────────────────

function MorningMission({
  onAllComplete,
  onUpdateStats,
  day = lightDayTheme,
}: {
  onAllComplete: (taskCount: number) => void
  onNavigate?: (s: Screen) => void
  onUpdateStats?: (s: ProgressStats) => void
  day?: DayTheme
}) {
  const [tasks, setTasks] = useState<Task[]>(() => {
    try {
      const stored = localStorage.getItem('morningTasks');
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) return sortTasksByPriority(parsed)
      }
    } catch (e) {
      console.error('Failed to parse tasks', e);
    }
    return [];
  })

  // Drag and Drop States
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverRegion, setDragOverRegion] = useState<Priority | null>(null)

  // Sync tasks from storage on mount/view transition
  useEffect(() => {
    try {
      const stored = localStorage.getItem('morningTasks');
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          setTasks(sortTasksByPriority(parsed))
        }
      }
    } catch (e) {
      console.error('Failed to sync tasks from storage', e)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('morningTasks', JSON.stringify(tasks));
    if (onUpdateStats) {
      const updatedStats = recordTaskActivity(tasks)
      onUpdateStats(updatedStats)
    }
  }, [tasks, onUpdateStats]);

  const [showAdd, setShowAdd] = useState(false)
  const [newText, setNewText] = useState('')
  const [newPriority, setNewPriority] = useState<Priority>('medium')
  const [newDuration, setNewDuration] = useState('30m')
  const [showTrimModal, setShowTrimModal] = useState(false)
  const completeFiredRef = useRef(false)

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  useEffect(() => {
    if (tasks.length > 0 && tasks.every((t) => t.done) && !completeFiredRef.current) {
      completeFiredRef.current = true
      setTimeout(() => onAllComplete(tasks.length), 500)
    }
    if (!tasks.every((t) => t.done)) completeFiredRef.current = false
  }, [tasks, onAllComplete])

  const toggle = (id: string) =>
    setTasks((ts) => sortTasksByPriority(ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t))))

  const handleMoveTaskPriority = useCallback((taskId: string, targetPriority: Priority) => {
    setTasks((prevTasks) => {
      const updated = prevTasks.map((t) => (t.id === taskId ? { ...t, priority: targetPriority } : t))
      return sortTasksByPriority(updated)
    })
  }, [])

  // Touch Move / Drag event listener for mobile devices
  useEffect(() => {
    if (!draggedTaskId) return

    const handleTouchMove = (e: TouchEvent) => {
      if (!e.touches[0]) return
      const touch = e.touches[0]
      const elem = document.elementFromPoint(touch.clientX, touch.clientY)
      const regionElem = elem?.closest('[data-region-priority]') as HTMLElement | null
      if (regionElem) {
        const region = regionElem.getAttribute('data-region-priority') as Priority | null
        if (region && (region === 'high' || region === 'medium' || region === 'low')) {
          setDragOverRegion(region)
        }
      }
    }

    const handleTouchEnd = () => {
      if (draggedTaskId && dragOverRegion) {
        handleMoveTaskPriority(draggedTaskId, dragOverRegion)
      }
      setDraggedTaskId(null)
      setDragOverRegion(null)
    }

    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('touchend', handleTouchEnd)
    window.addEventListener('touchcancel', handleTouchEnd)

    return () => {
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [draggedTaskId, dragOverRegion, handleMoveTaskPriority])

  const addTask = () => {
    if (!newText.trim()) return
    const newTask: Task = {
      id: Date.now().toString(),
      text: newText.trim(),
      priority: newPriority,
      duration: newDuration,
      done: false,
    }
    setTasks((ts) => sortTasksByPriority([...ts, newTask]))
    setNewText('')
    setShowAdd(false)
  }

  const handleApplyTrim = (trimmedTasks: TaskItem[]) => {
    setTasks(sortTasksByPriority(trimmedTasks))
    setShowTrimModal(false)
  }

  const isEmpty = tasks.length === 0

  // Priority Region Configurations
  const regionConfigs: {
    priority: Priority
    title: string
    subtitle: string
    badgeText: string
    accentColor: string
    bgTint: string
    icon: React.ReactNode
  }[] = [
    {
      priority: 'high',
      title: 'HIGH PRIORITY',
      subtitle: 'Core Focus · Critical Impact',
      badgeText: 'High',
      accentColor: day.green || '#10b981',
      bgTint: 'rgba(16, 185, 129, 0.05)',
      icon: (
        <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      ),
    },
    {
      priority: 'medium',
      title: 'MEDIUM PRIORITY',
      subtitle: 'Secondary Actions · Today',
      badgeText: 'Medium',
      accentColor: day.yellow || '#f5c842',
      bgTint: 'rgba(245, 200, 66, 0.05)',
      icon: (
        <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
        </svg>
      ),
    },
    {
      priority: 'low',
      title: 'LOW PRIORITY',
      subtitle: 'Flexible · When Time Permits',
      badgeText: 'Low',
      accentColor: day.red || '#ef4444',
      bgTint: 'rgba(239, 68, 68, 0.04)',
      icon: (
        <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
  ]

  return (
    <div className="flex flex-col flex-1 overflow-y-auto" style={{ background: day.bg, position: 'relative' }}>
      <div className="px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <svg viewBox="0 0 24 24" fill={day.accent} className="w-6 h-6">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" stroke={day.accent} strokeWidth={2} strokeLinecap="round" />
            <line x1="12" y1="21" x2="12" y2="23" stroke={day.accent} strokeWidth={2} strokeLinecap="round" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke={day.accent} strokeWidth={2} strokeLinecap="round" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke={day.accent} strokeWidth={2} strokeLinecap="round" />
            <line x1="1" y1="12" x2="3" y2="12" stroke={day.accent} strokeWidth={2} strokeLinecap="round" />
            <line x1="21" y1="12" x2="23" y2="12" stroke={day.accent} strokeWidth={2} strokeLinecap="round" />
          </svg>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '22px', color: day.text, letterSpacing: '-0.02em' }}>
            NightNote
          </span>
        </div>

        <div className="flex items-start justify-between mb-1">
          <div>
            <h2 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: '24px', color: day.text, letterSpacing: '-0.03em' }}>
              Morning Mission
            </h2>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: day.textDim, marginTop: '2px' }}>
              {today}
            </p>
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            style={{
              background: day.accent, border: 'none', borderRadius: '10px',
              padding: '8px 14px', color: '#fff',
              fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: '13px',
              cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'transform 0.15s',
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.94)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            + Add Task
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', marginTop: '6px' }}>
          <p style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: '15px', color: day.textDim }}>
            {"Prioritization Board"}
          </p>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: day.textDim, opacity: 0.8 }}>
            Drag tiles between regions to reprioritize
          </span>
        </div>

        {/* Add task form */}
        {showAdd && (
          <div className="mb-4 p-4 rounded-2xl" style={{ background: day.surface, border: `1px solid ${day.border}` }}>
            <input
              autoFocus value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTask()}
              placeholder="What do you need to do?"
              style={{
                width: '100%', background: day.surfaceAlt,
                border: `1px solid ${day.border}`, borderRadius: '10px',
                padding: '10px 14px', fontFamily: "'DM Sans', sans-serif",
                fontSize: '14px', color: day.text, outline: 'none', marginBottom: '10px',
              }}
            />
            <input
              value={newDuration}
              onChange={(e) => setNewDuration(e.target.value)}
              placeholder="Duration (e.g. 30m)"
              style={{
                width: '100%', background: day.surfaceAlt,
                border: `1px solid ${day.border}`, borderRadius: '10px',
                padding: '10px 14px', fontFamily: "'DM Sans', sans-serif",
                fontSize: '14px', color: day.text, outline: 'none', marginBottom: '10px',
              }}
            />
            <div className="flex gap-2 mb-3">
              {(['high', 'medium', 'low'] as Priority[]).map((p) => {
                const s = priorityStyle(p, day)
                return (
                  <button key={p} onClick={() => setNewPriority(p)}
                    style={{
                      flex: 1, padding: '6px', borderRadius: '8px',
                      border: `1.5px solid ${newPriority === p ? s.border : day.border}`,
                      background: newPriority === p ? s.bg : 'transparent',
                      color: newPriority === p ? s.dot : day.textDim,
                      fontFamily: "'DM Sans', sans-serif", fontSize: '12px', fontWeight: 600,
                      cursor: 'pointer', textTransform: 'capitalize',
                    }}>
                    {p}
                  </button>
                )
              })}
            </div>
            <button onClick={addTask}
              style={{
                width: '100%', background: day.accent, border: 'none',
                borderRadius: '10px', padding: '10px', color: '#fff',
                fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: '14px', cursor: 'pointer',
              }}>
              Add
            </button>
          </div>
        )}

        {/* Empty state */}
        {isEmpty ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0 16px', textAlign: 'center' }}>
            {/* Coffee + sunrise illustration */}
            <svg viewBox="0 0 120 100" width={140} height={116} style={{ marginBottom: '20px' }}>
              {/* Sunrise arcs */}
              <path d="M20 75 Q60 20 100 75" fill="none" stroke="rgba(232,144,58,0.15)" strokeWidth="3" />
              <path d="M30 75 Q60 32 90 75" fill="none" stroke="rgba(232,144,58,0.25)" strokeWidth="2.5" />
              <path d="M40 75 Q60 44 80 75" fill="none" stroke="rgba(232,144,58,0.4)" strokeWidth="2" />
              {/* Sun */}
              <circle cx="60" cy="56" r="14" fill={day.accent} opacity={0.85} />
              {/* Rays */}
              {[0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => (
                <line key={i}
                  x1={60 + Math.cos(a * Math.PI / 180) * 18}
                  y1={56 + Math.sin(a * Math.PI / 180) * 18}
                  x2={60 + Math.cos(a * Math.PI / 180) * 24}
                  y2={56 + Math.sin(a * Math.PI / 180) * 24}
                  stroke={day.accent} strokeWidth="2.5" strokeLinecap="round" opacity={0.7}
                />
              ))}
              {/* Coffee mug */}
              <rect x="46" y="72" width="28" height="22" rx="4" fill="#c8956a" />
              <path d="M74 78 Q82 80 74 86" fill="none" stroke="#c8956a" strokeWidth="3.5" strokeLinecap="round" />
              {/* Steam */}
              <path d="M54 68 Q57 62 54 57" fill="none" stroke="rgba(200,149,106,0.5)" strokeWidth="2" strokeLinecap="round" />
              <path d="M60 66 Q63 60 60 55" fill="none" stroke="rgba(200,149,106,0.5)" strokeWidth="2" strokeLinecap="round" />
              <path d="M66 68 Q69 62 66 57" fill="none" stroke="rgba(200,149,106,0.5)" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <h3 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '18px', color: day.text, marginBottom: '8px' }}>
              No mission for today.
            </h3>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '14px', color: day.textDim, lineHeight: 1.6 }}>
              Plan one tonight using the<br />Night Capture screen.
            </p>
          </div>
        ) : (
          /* Vertically Stacked 3-Region Prioritization Board */
          <div className="flex flex-col gap-5 mb-6 w-full max-w-3xl mx-auto">
            {regionConfigs.map((cfg) => {
              const regionTasks = tasks.filter((t) => t.priority === cfg.priority)
              const isTarget = dragOverRegion === cfg.priority

              return (
                <PriorityRegionZone
                  key={cfg.priority}
                  priority={cfg.priority}
                  title={cfg.title}
                  subtitle={cfg.subtitle}
                  badgeText={cfg.badgeText}
                  accentColor={cfg.accentColor}
                  bgTint={cfg.bgTint}
                  icon={cfg.icon}
                  tasks={regionTasks}
                  draggedTaskId={draggedTaskId}
                  isDragTarget={isTarget}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    if (dragOverRegion !== cfg.priority) setDragOverRegion(cfg.priority)
                  }}
                  onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node)) return
                    if (dragOverRegion === cfg.priority) setDragOverRegion(null)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId
                    if (taskId) {
                      handleMoveTaskPriority(taskId, cfg.priority)
                    }
                    setDraggedTaskId(null)
                    setDragOverRegion(null)
                  }}
                  onToggleTask={toggle}
                  onUpdatePriority={handleMoveTaskPriority}
                  onDragStartTask={(id) => setDraggedTaskId(id)}
                  onDragEndTask={() => {
                    setDraggedTaskId(null)
                    setDragOverRegion(null)
                  }}
                  day={day}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Feeling overwhelmed CTA */}
      {!isEmpty && (
        <div className="px-6 pb-4 mt-auto">
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(232,144,58,0.13) 0%, rgba(245,200,66,0.09) 100%)',
              border: '1px solid rgba(232,144,58,0.22)',
              borderRadius: '20px',
              padding: '18px 20px',
              boxShadow: '0 4px 20px rgba(232,144,58,0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '15px', color: day.text, marginBottom: '4px' }}>
                  Feeling overwhelmed?
                </p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: day.textDim, lineHeight: 1.5 }}>
                  Let AI simplify today's mission while protecting your important tasks.
                </p>
              </div>
              <button
                onClick={() => setShowTrimModal(true)}
                style={{
                  background: `linear-gradient(135deg, ${day.accent} 0%, #d4802a 100%)`,
                  border: 'none', borderRadius: '20px',
                  padding: '9px 18px', color: '#fff',
                  fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '13px',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  boxShadow: '0 3px 12px rgba(232,144,58,0.28)',
                  transition: 'transform 0.15s',
                }}
                onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.95)')}
                onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                Smart Trim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smart Trim Modal */}
      {showTrimModal && (
        <SmartTrimModal
          originalTasks={tasks}
          onApply={handleApplyTrim}
          onCancel={() => setShowTrimModal(false)}
          day={day}
        />
      )}
    </div>
  )
}

// ─── Progress Screen ──────────────────────────────────────────────────────────

function ProgressScreen({ hasData = true, stats, day = lightDayTheme }: { hasData?: boolean; stats: ProgressStats; day?: DayTheme }) {
  return <ProgressDashboard hasData={hasData} stats={stats} day={day} />
}



function MorningLockedModal({ onClose, day = lightDayTheme }: { onClose: () => void; day?: DayTheme }) {
  const isDark = day.bg === darkDayTheme.bg
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: isDark ? 'rgba(15,23,42,0.85)' : 'rgba(247,244,238,0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '24px',
        animation: 'overlayIn 0.3s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '440px',
          background: day.surface,
          borderRadius: '24px',
          border: `1px solid ${day.border}`,
          padding: '28px 24px',
          textAlign: 'center',
          boxShadow: isDark ? '0 20px 40px rgba(0,0,0,0.5)' : '0 20px 40px rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ fontSize: '38px', marginBottom: '12px' }}>🌙</div>
        <h3 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '20px', color: day.text, marginBottom: '8px' }}>
          Rest well tonight.
        </h3>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '14px', color: day.textDim, lineHeight: 1.5, marginBottom: '24px' }}>
          Your mission is saved and will be ready for you in the morning at 5:00 AM. Sleep tight!
        </p>
        <button
          onClick={onClose}
          style={{
            width: '100%',
            background: day.accent,
            color: isDark ? '#0d1b3e' : '#ffffff',
            padding: '12px',
            borderRadius: '12px',
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 700,
            fontSize: '15px',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Return to Night Note
        </button>
      </div>
    </div>
  )
}

function AIToastBanner() {
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'warning' | 'error' | 'success' } | null>(null)

  useEffect(() => {
    const handleToast = (e: any) => {
      if (e.detail) {
        setToast(e.detail)
        const timer = setTimeout(() => {
          setToast((prev) => (prev?.message === e.detail.message ? null : prev))
        }, 4000)
        return () => clearTimeout(timer)
      }
    }
    window.addEventListener('ai-status-toast', handleToast)
    return () => window.removeEventListener('ai-status-toast', handleToast)
  }, [])

  if (!toast) return null

  const bg =
    toast.type === 'error'
      ? 'rgba(212, 74, 58, 0.95)'
      : toast.type === 'warning'
      ? 'rgba(232, 144, 58, 0.95)'
      : toast.type === 'success'
      ? 'rgba(34, 197, 94, 0.95)'
      : 'rgba(30, 41, 59, 0.95)'

  return (
    <div
      style={{
        position: 'absolute',
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 999,
        background: bg,
        color: '#ffffff',
        padding: '10px 16px',
        borderRadius: '14px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.28)',
        fontFamily: "'DM Sans', sans-serif",
        fontSize: '12px',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        maxWidth: '88%',
        animation: 'modalIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
    >
      <span>
        {toast.type === 'error' ? '❌' : toast.type === 'warning' ? '⚠️' : toast.type === 'success' ? '⚡' : 'ℹ️'}
      </span>
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={() => setToast(null)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'rgba(255,255,255,0.8)',
          cursor: 'pointer',
          padding: '0 2px',
          fontSize: '12px',
        }}
      >
        ✕
      </button>
    </div>
  )
}

// ─── App Shell ────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>('night')
  const [settings, setSettings] = useState<AppSettings>(getSettings)
  const [showAILoading, setShowAILoading] = useState(false)
  const [showMissionReady, setShowMissionReady] = useState(false)
  const [showMissionComplete, setShowMissionComplete] = useState(false)
  const [showMorningLockedModal, setShowMorningLockedModal] = useState(false)

  // Local AI Model State
  const [modelStatus, setModelStatus] = useState<ModelStatus>(ModelStatus.LOADING)
  const [modelProgress, setModelProgress] = useState(0)
  const [modelMessage, setModelMessage] = useState<string | undefined>()

  useEffect(() => {
    // Purge any stale legacy cloud credentials/endpoints
    cleanupLegacyCredentials()

    // Check initial status
    getLocalModelStatus().then(({ status, progress }) => {
      setModelStatus(status)
      if (progress !== undefined) setModelProgress(progress)

      // If ready but not loaded, load it
      if (status === ModelStatus.READY) {
        initializeLocalModel()
      }
    })

    // Listen for updates
    const statusListener = NightNoteLocalAI.addListener('modelStatusChanged', (data) => {
      setModelStatus(data.status)
      if (data.progress !== undefined) setModelProgress(data.progress)
      if (data.message) setModelMessage(data.message)

      // Auto-load once ready
      if (data.status === ModelStatus.READY) {
        initializeLocalModel()
      }
    })

    const progressListener = NightNoteLocalAI.addListener('modelDownloadProgress', (data) => {
      setModelProgress(data.progress)
    })

    return () => {
      statusListener.then(l => l.remove())
      progressListener.then(l => l.remove())
    }
  }, [])

  const handleStartModelDownload = useCallback(async () => {
    try {
      await startModelDownload()
    } catch (err: any) {
      notifyAIToast('Failed to start download: ' + err.message, 'error')
    }
  }, [])

  const handleUpdateSettings = useCallback((newSettings: AppSettings) => {
    setSettings(newSettings)
    saveSettings(newSettings)
  }, [])

  const day = getDayTheme(settings.darkTheme)

  const todayStr = new Date().toDateString()
  const todayDayName = new Date().toLocaleDateString('en-US', { weekday: 'short' })
  const [nightEntryDate, setNightEntryDate] = useState(() => localStorage.getItem('nightEntryDate') || '')
  const [missionCompleteDate, setMissionCompleteDate] = useState(() => localStorage.getItem('missionCompleteDate') || '')
  const [dismissedDialog, setDismissedDialog] = useState(false)
  
  const [stats, setStats] = useState<ProgressStats>(getStats)

  const handleResetData = useCallback(() => {
    localStorage.removeItem('progressStats')
    localStorage.removeItem('morningTasks')
    localStorage.removeItem('nightEntryDate')
    localStorage.removeItem('missionCompleteDate')
    localStorage.removeItem('nightEntryThought')
    setStats(DEFAULT_STATS)
    setNightEntryDate('')
    setMissionCompleteDate('')
    setDismissedDialog(false)
  }, [])

  const isNightLocked = DEMO_MODE ? false : (nightEntryDate !== '' && nightEntryDate !== todayStr && missionCompleteDate !== todayStr);
  const showAlreadyPlannedDialog = DEMO_MODE ? false : (nightEntryDate === todayStr && !dismissedDialog);

  const isMorningUnlocked = useCallback(() => {
    if (DEMO_MODE) return true
    const nightDate = localStorage.getItem('nightEntryDate') || ''
    const currentHour = new Date().getHours()

    if (!nightDate || nightDate !== todayStr) return true
    if (currentHour >= 5 && currentHour < 22) return true
    if (missionCompleteDate === todayStr) return true

    return false
  }, [todayStr, missionCompleteDate])

  const handleTabChange = useCallback((s: Screen) => {
    if (s === 'morning') {
      if (!isMorningUnlocked()) {
        setShowMorningLockedModal(true)
        return
      }
    }
    setScreen(s)
  }, [isMorningUnlocked])

  const isNight = screen === 'night'

  const handleGenerateMission = useCallback(async (thought: string) => {
    setShowAILoading(true)
    
    try {
      const generatedTasks = await generateMission(thought)
      localStorage.setItem('morningTasks', JSON.stringify(generatedTasks))
      localStorage.setItem('nightEntryDate', todayStr)
      setNightEntryDate(todayStr)
      
      incrementNotes()
      setStats(getStats())
      
      setShowAILoading(false)
      setShowMissionReady(true)
    } catch (error: any) {
      console.warn('Mission generation fallback:', error)
      setShowAILoading(false)
      const generatedTasks = generateLocalTasks(thought)
      localStorage.setItem('morningTasks', JSON.stringify(generatedTasks))
      localStorage.setItem('nightEntryDate', todayStr)
      setNightEntryDate(todayStr)
      
      incrementNotes()
      setStats(getStats())
      setShowMissionReady(true)
    }
  }, [todayStr])

  const handleUseOfflineMode = useCallback(() => {
    setShowAILoading(false)
    const storedThought = localStorage.getItem('nightEntryThought') || 'Plan my day and stay focused'
    const generatedTasks = generateLocalTasks(storedThought)
    
    localStorage.setItem('morningTasks', JSON.stringify(generatedTasks))
    localStorage.setItem('nightEntryDate', todayStr)
    setNightEntryDate(todayStr)
    
    incrementNotes()
    setStats(getStats())
    setShowMissionReady(true)
  }, [todayStr])

  const handleMissionReadyClose = useCallback(() => {
    setShowMissionReady(false)
    setDismissedDialog(false)
    setScreen('night')
  }, [])

  const handleEditThoughts = useCallback(() => {
    setShowMissionReady(false)
    setScreen('night')
    setDismissedDialog(true)
  }, [])

  const handleAllComplete = useCallback((taskCount: number) => {
    if (missionCompleteDate !== todayStr) {
      localStorage.setItem('missionCompleteDate', todayStr)
      setMissionCompleteDate(todayStr)
      recordMissionComplete(taskCount, todayStr, todayDayName)
      setStats(getStats())
    }
    setShowMissionComplete(true)
  }, [todayStr, todayDayName, missionCompleteDate])

  const handleViewProgress = useCallback(() => {
    setShowMissionComplete(false)
    setScreen('progress')
  }, [])

  const handleMissionCompleteHome = useCallback(() => {
    setShowMissionComplete(false)
    setScreen('morning')
  }, [])

  const navigate = useCallback((s: Screen) => handleTabChange(s), [handleTabChange])

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100dvh',
        background: isNight
          ? night.bg
          : (settings.darkTheme ? darkDayTheme.bg : lightDayTheme.bg),
        fontFamily: "'DM Sans', sans-serif",
        transition: 'background 0.4s ease',
      }}
    >
      {/* Requirement: Small app + One-time download UI */}
      {modelStatus !== ModelStatus.LOADED && modelStatus !== ModelStatus.READY && (
        <ModelSetupOverlay
          status={modelStatus}
          progress={modelProgress}
          message={modelMessage}
          onStartDownload={handleStartModelDownload}
        />
      )}

      {/* App container */}
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          height: '100%',
          maxHeight: '100dvh',
          background: isNight ? night.bg : day.bg,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          transition: 'background 0.4s ease',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        <AIToastBanner />
        {/* Screen content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {screen === 'night' && (
            <NightCapture 
              onGenerateMission={handleGenerateMission}
              isLocked={isNightLocked}
              showDialog={showAlreadyPlannedDialog}
              onContinueEditing={() => setDismissedDialog(true)}
              onDone={() => setDismissedDialog(true)}
              onGoToMorning={() => handleTabChange('morning')}
            />
          )}
          {screen === 'morning' && <MorningMission onAllComplete={handleAllComplete} onNavigate={navigate} onUpdateStats={setStats} day={day} />}
          {screen === 'progress' && <ProgressScreen hasData={stats.notes > 0 || stats.tasksDone > 0 || stats.weeklyData.some((d) => (d.planned || 0) > 0 || (d.completed || 0) > 0)} stats={stats} day={day} />}
          {screen === 'settings' && (
            <SettingsScreen
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              onReset={handleResetData}
              day={day}
            />
          )}

          {/* AI Loading overlay */}
          {showAILoading && <AILoadingOverlay onCancel={() => handleUseOfflineMode()} />}

          {/* Mission Ready Modal */}
          {showMissionReady && (
            <MissionReadyModal onClose={handleMissionReadyClose} onEditThoughts={handleEditThoughts} />
          )}

          {/* Mission Complete Modal */}
          {showMissionComplete && (
            <MissionCompleteModal onViewProgress={handleViewProgress} onHome={handleMissionCompleteHome} stats={stats} day={day} />
          )}

          {/* Morning Locked Modal */}
          {showMorningLockedModal && (
            <MorningLockedModal onClose={() => setShowMorningLockedModal(false)} day={day} />
          )}
        </div>

        {/* Bottom Nav */}
        <BottomNav active={screen} onChange={handleTabChange} isDark={isNight} day={day} />
      </div>
    </div>
  )
}
