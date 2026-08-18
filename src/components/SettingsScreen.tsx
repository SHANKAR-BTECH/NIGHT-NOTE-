import React, { useState, useEffect } from 'react'
import { AppSettings } from '../settings'
import { DayTheme, lightDayTheme } from '../App'
import { MODEL_CONFIG } from '../config/modelConfig'
import { testCustomLLMConnection, notifyAIToast } from '../services/customLLMService'

interface ToggleProps {
  value: boolean
  onChange: (v: boolean) => void
  accentColor?: string
  day?: DayTheme
}

export function Toggle({ value, onChange, accentColor, day = lightDayTheme }: ToggleProps) {
  const accent = accentColor || day.accent
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: '44px',
        height: '24px',
        borderRadius: '99px',
        background: value ? accent : day.border,
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.25s',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '2px',
          left: value ? '22px' : '2px',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          transition: 'left 0.25s',
        }}
      />
    </button>
  )
}

interface SettingRowProps {
  icon: React.ReactNode
  label: string
  sub?: string
  right: React.ReactNode
  day?: DayTheme
}

export function SettingRow({ icon, label, sub, right, day = lightDayTheme }: SettingRowProps) {
  return (
    <div className="flex items-center gap-3 py-4" style={{ borderBottom: `1px solid ${day.border}` }}>
      <div
        className="flex items-center justify-center rounded-xl"
        style={{ width: '36px', height: '36px', background: day.surfaceAlt, flexShrink: 0 }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: '15px', color: day.text }}>
          {label}
        </p>
        {sub && (
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: day.textDim, marginTop: '1px' }}>
            {sub}
          </p>
        )}
      </div>
      <div className="flex-shrink-0">{right}</div>
    </div>
  )
}

export function SectionHeader({ title, day = lightDayTheme }: { title: string; day?: DayTheme }) {
  return (
    <p
      style={{
        fontFamily: "'Outfit', sans-serif",
        fontWeight: 700,
        fontSize: '11px',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: day.accent,
        marginTop: '24px',
        marginBottom: '2px',
        paddingLeft: '2px',
      }}
    >
      {title}
    </p>
  )
}

interface SettingsLocalAISectionProps {
  day: DayTheme
}

export function SettingsLocalAISection({ day }: SettingsLocalAISectionProps) {
  const [aiStatus, setAiStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [isTestingAI, setIsTestingAI] = useState(false)

  useEffect(() => {
    let active = true
    async function check() {
      setIsTestingAI(true)
      const res = await testCustomLLMConnection()
      if (active) {
        setAiStatus(res)
        setIsTestingAI(false)
      }
    }
    check()
    return () => {
      active = false
    }
  }, [])

  const handleTestAI = async () => {
    setIsTestingAI(true)
    const res = await testCustomLLMConnection()
    setAiStatus(res)
    setIsTestingAI(false)
    if (res.ok) {
      notifyAIToast('Local Lite V2 Engine ready & active', 'success')
    } else {
      notifyAIToast(`Local AI Status: ${res.message}`, 'error')
    }
  }

  const isModelReady = Boolean(aiStatus?.ok)

  return (
    <div
      className="rounded-2xl overflow-hidden px-4 py-4"
      style={{ background: day.surface, border: `1px solid ${day.border}` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center rounded-xl"
            style={{ width: '40px', height: '40px', background: 'rgba(59, 130, 246, 0.12)', flexShrink: 0 }}
          >
            <svg
              viewBox="0 0 24 24"
              width={18}
              height={18}
              stroke="#3b82f6"
              fill="none"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '15px', color: day.text }}>
                NightNote Lite V2
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: 'rgba(34, 197, 94, 0.12)',
                  color: day.green,
                }}
              >
                Local • Offline
              </span>
            </div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: day.textDim, marginTop: '2px' }}>
              {isTestingAI
                ? 'Checking local engine status…'
                : isModelReady
                ? 'Model Ready • On-device native execution'
                : aiStatus?.message || 'Model Not Ready'}
            </p>
          </div>
        </div>
        <button
          onClick={handleTestAI}
          disabled={isTestingAI}
          style={{
            background: isTestingAI
              ? day.surfaceAlt
              : isModelReady
              ? 'rgba(34, 197, 94, 0.12)'
              : 'rgba(59, 130, 246, 0.12)',
            border: `1px solid ${isModelReady ? day.green : '#3b82f6'}`,
            borderRadius: '10px',
            padding: '6px 12px',
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 600,
            fontSize: '12px',
            color: isModelReady ? day.green : '#3b82f6',
            cursor: isTestingAI ? 'wait' : 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {isTestingAI ? 'Checking…' : isModelReady ? '● Model Ready' : 'Verify Model'}
        </button>
      </div>

      <div className="mt-3 pt-3 flex flex-col gap-1" style={{ borderTop: `1px solid ${day.border}` }}>
        <div className="flex items-center justify-between text-xs" style={{ color: day.textDim }}>
          <span>Status</span>
          <span style={{ fontWeight: 600, color: isModelReady ? day.green : day.yellow }}>
            {isModelReady ? 'Model Ready (Loaded)' : 'Model Not Ready'}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs" style={{ color: day.textDim }}>
          <span>Model Architecture</span>
          <span style={{ fontFamily: 'monospace', color: day.text }}>SmolLM2-135M (Q5_K_M)</span>
        </div>
        <div className="flex items-center justify-between text-xs" style={{ color: day.textDim }}>
          <span>Model File</span>
          <span style={{ fontFamily: 'monospace', color: day.text }}>{MODEL_CONFIG.FILENAME}</span>
        </div>
        <div className="flex items-center justify-between text-xs" style={{ color: day.textDim }}>
          <span>Engine Footprint</span>
          <span style={{ color: day.text }}>{MODEL_CONFIG.SIZE_MB} MB on-device</span>
        </div>
      </div>
    </div>
  )
}

export interface SettingsScreenProps {
  settings: AppSettings
  onUpdateSettings: (s: AppSettings) => void
  onReset: () => void
  day?: DayTheme
}

export function SettingsScreen({
  settings,
  onUpdateSettings,
  onReset,
  day = lightDayTheme,
}: SettingsScreenProps) {
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  const confirmReset = () => {
    onReset()
    setResetDone(true)
    setShowResetConfirm(false)
    setTimeout(() => setResetDone(false), 3000)
  }

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onUpdateSettings({ ...settings, [key]: value })
  }

  const ip = {
    width: 18,
    height: 18,
    stroke: day.accent,
    fill: 'none',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  return (
    <div className="flex flex-col flex-1 overflow-y-auto" style={{ background: day.bg }}>
      <div className="px-6 py-8 pb-4">
        <div className="flex items-center gap-2 mb-6">
          <svg viewBox="0 0 24 24" fill={day.accent} className="w-6 h-6">
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontWeight: 700,
              fontSize: '22px',
              color: day.text,
              letterSpacing: '-0.02em',
            }}
          >
            NightNote
          </span>
        </div>
        <h2
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 800,
            fontSize: '26px',
            color: day.text,
            letterSpacing: '-0.03em',
            marginBottom: '4px',
          }}
        >
          Settings
        </h2>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: day.textDim, marginBottom: '8px' }}>
          Tailor NightNote to your rhythm
        </p>

        <SectionHeader title="Capture" day={day} />
        <div
          className="rounded-2xl overflow-hidden px-4"
          style={{ background: day.surface, border: `1px solid ${day.border}` }}
        >
          <SettingRow
            day={day}
            icon={
              <svg viewBox="0 0 24 24" {...ip}>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            }
            label="Nightly Reminder"
            sub="When should we prompt you?"
            right={
              <input
                type="time"
                value={settings.reminderTime}
                onChange={(e) => updateSetting('reminderTime', e.target.value)}
                style={{
                  background: day.surfaceAlt,
                  border: `1px solid ${day.border}`,
                  borderRadius: '8px',
                  padding: '6px 10px',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '14px',
                  color: day.text,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              />
            }
          />
          <SettingRow
            day={day}
            icon={
              <svg viewBox="0 0 24 24" {...ip}>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              </svg>
            }
            label="Default Input Mode"
            sub="How you prefer to capture"
            right={
              <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${day.border}` }}>
                {(['Voice', 'Text'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => updateSetting('inputMode', m)}
                    style={{
                      padding: '6px 14px',
                      background: settings.inputMode === m ? day.accent : 'transparent',
                      color: settings.inputMode === m ? '#fff' : day.textDim,
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: '13px',
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            }
          />
        </div>

        <SectionHeader title="Appearance" day={day} />
        <div
          className="rounded-2xl overflow-hidden px-4"
          style={{ background: day.surface, border: `1px solid ${day.border}` }}
        >
          <SettingRow
            day={day}
            icon={
              <svg viewBox="0 0 24 24" {...ip}>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            }
            label="Dark Mode"
            sub="Enable dark theme for day screens"
            right={<Toggle day={day} value={settings.darkTheme} onChange={(v) => updateSetting('darkTheme', v)} />}
          />
        </div>

        <SectionHeader title="AI Engine" day={day} />
        <SettingsLocalAISection day={day} />

        <SectionHeader title="Account" day={day} />
        <div
          className="rounded-2xl overflow-hidden px-4"
          style={{ background: day.surface, border: `1px solid ${day.border}` }}
        >
          <SettingRow
            day={day}
            icon={
              <svg viewBox="0 0 24 24" {...ip}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            }
            label="Local Profile"
            sub="Stored in Local Storage"
            right={
              <span style={{ fontFamily: "'DM Sans'", fontSize: '22px', color: day.textDim, lineHeight: 1 }}>
                ›
              </span>
            }
          />
        </div>

        <SectionHeader title="Progress" day={day} />
        <div
          className="rounded-2xl overflow-hidden px-4"
          style={{ background: day.surface, border: `1px solid ${day.border}` }}
        >
          {!showResetConfirm && !resetDone ? (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="w-full flex items-center gap-3 py-4"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
            >
              <div
                className="flex items-center justify-center rounded-xl"
                style={{ width: '36px', height: '36px', background: 'rgba(212,74,58,0.08)', flexShrink: 0 }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width={18}
                  height={18}
                  fill="none"
                  stroke={day.red}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 .49-4.7" />
                </svg>
              </div>
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 500,
                  fontSize: '15px',
                  color: day.red,
                }}
              >
                Reset Consistency Score
              </span>
            </button>
          ) : resetDone ? (
            <div className="py-4 flex items-center gap-3">
              <div
                className="flex items-center justify-center rounded-xl"
                style={{ width: '36px', height: '36px', background: day.greenBg, flexShrink: 0 }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width={18}
                  height={18}
                  fill="none"
                  stroke={day.green}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '15px',
                  color: day.green,
                  fontWeight: 500,
                }}
              >
                Score reset successfully
              </span>
            </div>
          ) : (
            <div className="py-4">
              <p
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '14px',
                  color: day.text,
                  marginBottom: '12px',
                }}
              >
                Are you sure? This will clear your streak and all weekly data.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '12px',
                    border: `1px solid ${day.border}`,
                    background: 'transparent',
                    fontFamily: "'Outfit', sans-serif",
                    fontWeight: 600,
                    fontSize: '14px',
                    color: day.textDim,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmReset}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '12px',
                    border: 'none',
                    background: day.red,
                    fontFamily: "'Outfit', sans-serif",
                    fontWeight: 600,
                    fontSize: '14px',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>

        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '12px',
            color: day.textDim,
            textAlign: 'center',
            marginTop: '32px',
            marginBottom: '8px',
          }}
        >
          NightNote v1.0
        </p>
      </div>
    </div>
  )
}
