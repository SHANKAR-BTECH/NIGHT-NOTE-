import { useState, useEffect, useMemo } from 'react'
import { DayTheme, lightDayTheme, darkDayTheme } from '../App'
import { ProgressStats } from '../stats'
import {
  getDashboardMetrics,
  ProgressDashboardMetrics,
  DailyPerformanceItem,
} from '../services/progressAnalyticsService'
import { generateWeeklySummary } from '../services/customLLMService'

interface ProgressDashboardProps {
  hasData?: boolean
  stats: ProgressStats
  day?: DayTheme
}

export function ProgressDashboard({ stats, day = lightDayTheme }: ProgressDashboardProps) {
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [summaryText, setSummaryText] = useState(stats.weeklyInsight || 'Complete night notes and morning tasks to unlock personalized AI weekly analysis.')
  const [selectedDay, setSelectedDay] = useState<DailyPerformanceItem | null>(null)
  const [showCategoryDetails, setShowCategoryDetails] = useState(false)

  // Compute live metrics from service layer
  const metrics: ProgressDashboardMetrics = useMemo(() => {
    return getDashboardMetrics()
  }, [stats])

  useEffect(() => {
    if (stats.weeklyInsight) {
      setSummaryText(stats.weeklyInsight)
    }
  }, [stats.weeklyInsight])

  const handleFetchWeeklySummary = async () => {
    setLoadingSummary(true)
    try {
      const summary = await generateWeeklySummary(stats)
      setSummaryText(summary)
    } catch (e) {
      console.error('Weekly summary error:', e)
    } finally {
      setLoadingSummary(false)
    }
  }

  const isDark = day.bg === darkDayTheme.bg

  return (
    <div
      className="flex flex-col flex-1 overflow-y-auto"
      style={{
        background: day.bg,
        color: day.text,
        scrollBehavior: 'smooth',
      }}
    >
      <div className="px-5 py-6 max-w-xl mx-auto w-full pb-24 space-y-6">
        {/* Header Title */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <svg viewBox="0 0 24 24" fill={day.accent} className="w-5 h-5">
                <circle cx="12" cy="12" r="5" />
              </svg>
              <span
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontWeight: 800,
                  fontSize: '20px',
                  color: day.text,
                  letterSpacing: '-0.02em',
                }}
              >
                PROGRESS
              </span>
            </div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: day.textDim }}>
              Your week at a glance
            </p>
          </div>

          <div
            className="px-3 py-1.5 rounded-full flex items-center gap-1.5"
            style={{
              background: day.surface,
              border: `1px solid ${day.border}`,
              fontSize: '12px',
              fontFamily: "'DM Sans', sans-serif",
              color: day.textDim,
            }}
          >
            <span style={{ color: day.accent, fontWeight: 700 }}>●</span> Live Analytics
          </div>
        </div>

        {/* ─── FEATURE 1 — WEEKLY OVERVIEW ────────────────────────────── */}
        <section className="space-y-3">
          {/* Main Hero Card */}
          <div
            className="p-5 rounded-2xl relative overflow-hidden transition-transform duration-200"
            style={{
              background: day.surface,
              border: `1px solid ${day.border}`,
              boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.25)' : '0 4px 16px rgba(0,0,0,0.04)',
            }}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <span
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontWeight: 700,
                    fontSize: '11px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: day.textDim,
                  }}
                >
                  WEEKLY PERFORMANCE
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span
                    style={{
                      fontFamily: "'Outfit', sans-serif",
                      fontWeight: 800,
                      fontSize: '36px',
                      color: day.text,
                      lineHeight: 1,
                    }}
                  >
                    {metrics.weeklyOverview.tasksCompleted} / {metrics.weeklyOverview.tasksCreated}
                  </span>
                  <span
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 500,
                      fontSize: '15px',
                      color: day.textDim,
                    }}
                  >
                    Tasks completed
                  </span>
                </div>
              </div>

              {/* Progress Circle Pill */}
              <div
                className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl"
                style={{
                  background: day.accentDim,
                  border: `1px solid ${day.accent}33`,
                }}
              >
                <span
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontWeight: 800,
                    fontSize: '16px',
                    color: day.accent,
                  }}
                >
                  {metrics.weeklyOverview.completionRate}%
                </span>
                <span style={{ fontSize: '9px', color: day.textDim, textTransform: 'uppercase', fontWeight: 700 }}>
                  Done
                </span>
              </div>
            </div>

            {/* Visual Bar */}
            <div style={{ height: '8px', borderRadius: '99px', background: day.surfaceAlt, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${metrics.weeklyOverview.completionRate}%`,
                  background: `linear-gradient(90deg, ${day.accent} 0%, ${day.green} 100%)`,
                  borderRadius: '99px',
                  transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            </div>

            {/* Secondary Metrics Grid */}
            <div className="grid grid-cols-3 gap-2.5 mt-4 pt-4" style={{ borderTop: `1px solid ${day.border}` }}>
              <div className="p-2.5 rounded-xl text-center" style={{ background: day.surfaceAlt }}>
                <p style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: '18px', color: day.text }}>
                  {metrics.weeklyOverview.tasksCarriedOver}
                </p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', color: day.textDim }}>
                  Carried over
                </p>
              </div>

              <div className="p-2.5 rounded-xl text-center" style={{ background: day.surfaceAlt }}>
                <p style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: '18px', color: day.text }}>
                  {metrics.weeklyOverview.averageTasksPerDay}
                </p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', color: day.textDim }}>
                  Avg tasks/day
                </p>
              </div>

              <div className="p-2.5 rounded-xl text-center" style={{ background: day.surfaceAlt }}>
                <p style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: '18px', color: day.green }}>
                  {metrics.weeklyOverview.activeDaysCount}/7
                </p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', color: day.textDim }}>
                  Active days
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── FEATURE 2 — STREAK SYSTEM ──────────────────────────────── */}
        <section
          className="p-4 rounded-2xl flex items-center justify-between"
          style={{
            background: day.surface,
            border: `1px solid ${day.border}`,
            boxShadow: isDark ? '0 2px 12px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,0,0,0.03)',
          }}
        >
          <div className="flex items-center gap-3.5">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
              }}
            >
              🔥
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: '18px', color: day.text }}>
                  {metrics.streak.currentStreak} Day Streak
                </span>
                <span
                  className="px-2 py-0.5 rounded-md text-xs"
                  style={{
                    background: day.accentDim,
                    color: day.accent,
                    fontWeight: 700,
                    fontFamily: "'Outfit', sans-serif",
                  }}
                >
                  Best: {metrics.streak.longestStreak}d
                </span>
              </div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: day.textDim, marginTop: '2px' }}>
                "{metrics.streak.message}"
              </p>
            </div>
          </div>
        </section>

        {/* ─── FEATURE 3 — DAILY PERFORMANCE ─────────────────────────── */}
        <section
          className="p-5 rounded-2xl space-y-3"
          style={{
            background: day.surface,
            border: `1px solid ${day.border}`,
          }}
        >
          <div className="flex items-center justify-between">
            <h3
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontWeight: 700,
                fontSize: '13px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: day.accent,
              }}
            >
              DAILY PERFORMANCE
            </h3>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: day.textDim }}>
              Tap day for details
            </span>
          </div>

          {/* Daily Cards / Heatmap */}
          <div className="grid grid-cols-7 gap-1.5 pt-2">
            {metrics.dailyPerformance.map((item) => {
              const isSelected = selectedDay?.day === item.day
              let bgColor = day.surfaceAlt
              let textColor = day.textDim
              let barColor = day.textDim

              if (item.status === 'strong') {
                bgColor = day.greenBg
                textColor = day.green
                barColor = day.green
              } else if (item.status === 'moderate') {
                bgColor = day.yellowBg
                textColor = day.yellow
                barColor = day.yellow
              } else if (item.status === 'light') {
                bgColor = day.accentDim
                textColor = day.accent
                barColor = day.accent
              }

              return (
                <button
                  key={item.day}
                  onClick={() => setSelectedDay(isSelected ? null : item)}
                  className="flex flex-col items-center py-2.5 px-1 rounded-xl transition-all"
                  style={{
                    background: isSelected ? day.accentDim : bgColor,
                    border: `1px solid ${isSelected ? day.accent : item.planned > 0 ? barColor + '44' : 'transparent'}`,
                    transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                  }}
                >
                  <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '11px', color: textColor }}>
                    {item.day}
                  </span>

                  {/* Indicator Meter */}
                  <div
                    className="my-2 rounded-full"
                    style={{
                      width: '6px',
                      height: '24px',
                      background: day.surfaceAlt,
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        width: '100%',
                        height: `${item.rate}%`,
                        background: barColor,
                        borderRadius: '99px',
                        transition: 'height 0.6s ease',
                      }}
                    />
                  </div>

                  <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: '11px', color: textColor }}>
                    {item.planned > 0 ? `${item.rate}%` : '-'}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Selected Day Details Popover */}
          {selectedDay && (
            <div
              className="mt-3 p-3.5 rounded-xl flex items-center justify-between animate-fadeIn"
              style={{
                background: day.surfaceAlt,
                border: `1px solid ${day.border}`,
              }}
            >
              <div>
                <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '14px', color: day.text }}>
                  {selectedDay.day} Details
                </span>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: day.textDim }}>
                  {selectedDay.completed} of {selectedDay.planned} tasks completed ({selectedDay.rate}%)
                </p>
              </div>

              <div
                className="px-2.5 py-1 rounded-lg text-xs font-bold"
                style={{
                  background: selectedDay.rate >= 75 ? day.greenBg : day.accentDim,
                  color: selectedDay.rate >= 75 ? day.green : day.accent,
                }}
              >
                {selectedDay.rate >= 75 ? 'Strong Day' : selectedDay.planned === 0 ? 'No Tasks' : 'Active'}
              </div>
            </div>
          )}
        </section>

        {/* ─── FEATURE 4 — PRIORITY PERFORMANCE ──────────────────────── */}
        <section
          className="p-5 rounded-2xl space-y-4"
          style={{
            background: day.surface,
            border: `1px solid ${day.border}`,
          }}
        >
          <div>
            <h3
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontWeight: 700,
                fontSize: '13px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: day.accent,
              }}
            >
              PRIORITY PERFORMANCE
            </h3>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: day.textDim, marginTop: '2px' }}>
              How well do you follow through on NightNote priorities?
            </p>
          </div>

          <div className="space-y-3.5">
            {/* HIGH */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: '#ef4444', boxShadow: '0 0 8px rgba(239,68,68,0.5)' }}
                  />
                  <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '14px', color: day.text }}>
                    HIGH PRIORITY
                  </span>
                </div>
                <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: '14px', color: '#ef4444' }}>
                  {metrics.priorityPerformance.high.rate}%
                </span>
              </div>
              <div style={{ height: '8px', borderRadius: '99px', background: day.surfaceAlt, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${metrics.priorityPerformance.high.rate}%`,
                    background: '#ef4444',
                    borderRadius: '99px',
                    transition: 'width 1s ease',
                  }}
                />
              </div>
            </div>

            {/* MEDIUM */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: day.yellow, boxShadow: '0 0 8px rgba(245,200,66,0.4)' }}
                  />
                  <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '14px', color: day.text }}>
                    MEDIUM PRIORITY
                  </span>
                </div>
                <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: '14px', color: day.yellow }}>
                  {metrics.priorityPerformance.medium.rate}%
                </span>
              </div>
              <div style={{ height: '8px', borderRadius: '99px', background: day.surfaceAlt, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${metrics.priorityPerformance.medium.rate}%`,
                    background: day.yellow,
                    borderRadius: '99px',
                    transition: 'width 1s ease',
                  }}
                />
              </div>
            </div>

            {/* LOW */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: day.textDim }} />
                  <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '14px', color: day.text }}>
                    LOW PRIORITY
                  </span>
                </div>
                <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: '14px', color: day.textDim }}>
                  {metrics.priorityPerformance.low.rate}%
                </span>
              </div>
              <div style={{ height: '8px', borderRadius: '99px', background: day.surfaceAlt, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${metrics.priorityPerformance.low.rate}%`,
                    background: day.textDim,
                    borderRadius: '99px',
                    transition: 'width 1s ease',
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ─── FEATURE 5 — CATEGORY ANALYTICS (COMPACT) ───────────────── */}
        <section
          className="p-4 rounded-2xl space-y-3"
          style={{
            background: day.surface,
            border: `1px solid ${day.border}`,
          }}
        >
          <div className="flex items-center justify-between">
            <h3
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontWeight: 700,
                fontSize: '12px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: day.accent,
              }}
            >
              CATEGORIES
            </h3>
            <button
              onClick={() => setShowCategoryDetails(!showCategoryDetails)}
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '12px',
                color: day.accent,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {showCategoryDetails ? 'Hide' : 'View details →'}
            </button>
          </div>

          {/* Compact Category Horizontal Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {metrics.categoryPerformance.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl flex-shrink-0"
                style={{
                  background: day.surfaceAlt,
                  border: `1px solid ${day.border}`,
                  fontSize: '13px',
                }}
              >
                <span>{cat.icon}</span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, color: day.text }}>
                  {cat.name}
                </span>
                <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, color: day.accent, marginLeft: '2px' }}>
                  {cat.rate}%
                </span>
              </div>
            ))}
          </div>

          {/* Expanded Details */}
          {showCategoryDetails && (
            <div className="grid grid-cols-2 gap-2 pt-2 animate-fadeIn" style={{ borderTop: `1px solid ${day.border}` }}>
              {metrics.categoryPerformance.map((cat) => (
                <div key={cat.id} className="p-2.5 rounded-xl" style={{ background: day.surfaceAlt }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span>{cat.icon}</span>
                    <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '13px', color: day.text }}>
                      {cat.name}
                    </span>
                  </div>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', color: day.textDim }}>
                    {cat.completed} of {cat.total} tasks done ({cat.rate}%)
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ─── FEATURE 7 — "KNOW YOURSELF" PROFILE (COMPACT) ───────────── */}
        <section
          className="p-4 rounded-2xl relative overflow-hidden"
          style={{
            background: isDark
              ? 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)'
              : 'linear-gradient(135deg, #ffffff 0%, #f0ece2 100%)',
            border: `1px solid ${day.accent}44`,
            boxShadow: `0 2px 14px ${day.accent}10`,
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span style={{ fontSize: '15px' }}>🧠</span>
              <span
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontWeight: 800,
                  fontSize: '11px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: day.accent,
                }}
              >
                {metrics.behavioralProfile.title}
              </span>
            </div>
            <span
              className="px-2.5 py-0.5 rounded-full text-xs font-bold"
              style={{
                background: day.accentDim,
                color: day.accent,
                fontFamily: "'Outfit', sans-serif",
                fontSize: '11px',
              }}
            >
              {metrics.behavioralProfile.subtitle}
            </span>
          </div>

          <h3
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontWeight: 800,
              fontSize: '17px',
              color: day.text,
              letterSpacing: '-0.01em',
              marginBottom: '4px',
            }}
          >
            "{metrics.behavioralProfile.archetype}"
          </h3>

          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '12.5px',
              color: day.textDim,
              lineHeight: 1.45,
              marginBottom: '10px',
            }}
          >
            {metrics.behavioralProfile.description}
          </p>

          <div
            className="p-2.5 rounded-xl flex items-center gap-2"
            style={{
              background: day.accentDim,
              border: `1px solid ${day.accent}25`,
            }}
          >
            <span style={{ fontSize: '14px', flexShrink: 0 }}>💡</span>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11.5px', color: day.text, lineHeight: 1.35 }}>
              <strong style={{ color: day.accent }}>Pro Tip:</strong> {metrics.behavioralProfile.advice}
            </p>
          </div>
        </section>

        {/* ─── FEATURE 6 — ACHIEVEMENTS ───────────────────────────────── */}
        <section
          className="p-5 rounded-2xl space-y-3"
          style={{
            background: day.surface,
            border: `1px solid ${day.border}`,
          }}
        >
          <div className="flex items-center justify-between">
            <h3
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontWeight: 700,
                fontSize: '12px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: day.accent,
              }}
            >
              ACHIEVEMENTS
            </h3>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: day.textDim }}>
              {metrics.achievements.filter((a) => a.unlocked).length} / {metrics.achievements.length} Unlocked
            </span>
          </div>

          {/* Horizontal Scrollable Badges */}
          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {metrics.achievements.map((ach) => (
              <div
                key={ach.id}
                className="flex-shrink-0 w-36 p-3 rounded-xl flex flex-col items-center text-center transition-all"
                style={{
                  background: ach.unlocked ? day.accentDim : day.surfaceAlt,
                  border: `1px solid ${ach.unlocked ? day.accent + '66' : day.border}`,
                  opacity: ach.unlocked ? 1 : 0.65,
                }}
              >
                <span className="text-2xl mb-1">{ach.icon}</span>
                <span
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontWeight: 700,
                    fontSize: '13px',
                    color: day.text,
                    marginBottom: '2px',
                  }}
                >
                  {ach.title}
                </span>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '10px', color: day.textDim, lineHeight: 1.3 }}>
                  {ach.description}
                </p>
                <span
                  className="mt-2 text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: ach.unlocked ? day.accent : day.border,
                    color: ach.unlocked ? '#0f172a' : day.textDim,
                    fontFamily: "'Outfit', sans-serif",
                  }}
                >
                  {ach.progressText}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ─── WEEKLY AI SUMMARY (CUSTOM AI INTEGRATION) ────────────────── */}
        <section
          className="p-5 rounded-2xl relative overflow-hidden shadow-sm"
          style={{
            background: `linear-gradient(135deg, ${day.accent} 0%, #d4802a 100%)`,
          }}
        >
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h3 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '16px', color: '#fff', marginBottom: '8px' }}>
              Weekly AI Summary
            </h3>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '14px', color: 'rgba(255,255,255,0.95)', lineHeight: 1.5, marginBottom: '16px' }}>
              {loadingSummary ? '⚡ Analyzing week with AI…' : summaryText}
            </p>
            <button
              onClick={handleFetchWeeklySummary}
              disabled={loadingSummary}
              style={{
                background: 'rgba(255,255,255,0.22)',
                border: 'none',
                borderRadius: '10px',
                padding: '8px 16px',
                color: '#fff',
                fontFamily: "'Outfit', sans-serif",
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.32)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.22)')}
            >
              {loadingSummary ? 'Generating…' : 'Refresh Summary (AI) →'}
            </button>
          </div>
          <div style={{ position: 'absolute', right: '-20px', top: '-20px', width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ position: 'absolute', right: '40px', bottom: '-30px', width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
        </section>
      </div>
    </div>
  )
}
