import { ProgressStats, getStats, TaskItem } from '../stats'

export interface DailyPerformanceItem {
  day: string // 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
  fullDate: string
  planned: number
  completed: number
  rate: number // 0-100
  status: 'strong' | 'moderate' | 'light' | 'inactive'
}

export interface CategoryPerformanceItem {
  id: string
  name: string
  icon: string
  completed: number
  total: number
  rate: number // 0-100
}

export interface AchievementItem {
  id: string
  title: string
  icon: string
  description: string
  unlocked: boolean
  progressText?: string
}

export interface BehavioralProfile {
  title: string
  archetype: string
  subtitle: string
  description: string
  keyTraits: string[]
  advice: string
}

export interface ProgressDashboardMetrics {
  weeklyOverview: {
    tasksCreated: number
    tasksCompleted: number
    tasksIncomplete: number
    tasksCarriedOver: number
    completionRate: number // 0-100
    averageTasksPerDay: number
    activeDaysCount: number
  }
  streak: {
    currentStreak: number
    longestStreak: number
    activeDaysCount: number
    message: string
  }
  dailyPerformance: DailyPerformanceItem[]
  priorityPerformance: {
    high: { completed: number; total: number; rate: number }
    medium: { completed: number; total: number; rate: number }
    low: { completed: number; total: number; rate: number }
  }
  categoryPerformance: CategoryPerformanceItem[]
  achievements: AchievementItem[]
  behavioralProfile: BehavioralProfile
  weeklyInsight: string
}

// Category extraction helper
function categorizeTaskText(text: string): string {
  const lower = text.toLowerCase()
  if (
    lower.includes('study') ||
    lower.includes('exam') ||
    lower.includes('homework') ||
    lower.includes('assignment') ||
    lower.includes('class') ||
    lower.includes('hackathon') ||
    lower.includes('learn') ||
    lower.includes('read')
  ) {
    return 'Education'
  }
  if (
    lower.includes('code') ||
    lower.includes('work') ||
    lower.includes('meeting') ||
    lower.includes('submit') ||
    lower.includes('client') ||
    lower.includes('project') ||
    lower.includes('video') ||
    lower.includes('recording')
  ) {
    return 'Work'
  }
  if (
    lower.includes('gym') ||
    lower.includes('workout') ||
    lower.includes('run') ||
    lower.includes('health') ||
    lower.includes('meditate') ||
    lower.includes('walk') ||
    lower.includes('water')
  ) {
    return 'Health & Fitness'
  }
  return 'Personal & Errands'
}

export function getDashboardMetrics(currentTasks?: TaskItem[]): ProgressDashboardMetrics {
  const stats: ProgressStats = getStats()

  // Get tasks from localStorage if not explicitly passed
  let tasks: TaskItem[] = currentTasks || []
  if (!tasks.length) {
    try {
      const stored = localStorage.getItem('morningTasks')
      if (stored) {
        tasks = JSON.parse(stored)
      }
    } catch (e) {
      console.error('Failed to parse morningTasks in progress analytics', e)
    }
  }

  // 1. Weekly Overview Calculation
  let tasksCreated = stats.weeklyData.reduce((acc, d) => acc + (d.planned || 0), 0)
  let tasksCompleted = stats.weeklyData.reduce((acc, d) => acc + (d.completed || 0), 0)

  // Merge live tasks if present
  if (tasks.length > 0) {
    const liveTotal = tasks.length
    const liveDone = tasks.filter((t) => t.done).length
    if (tasksCreated === 0) {
      tasksCreated = liveTotal
      tasksCompleted = liveDone
    } else {
      tasksCreated = Math.max(tasksCreated, liveTotal)
      tasksCompleted = Math.max(tasksCompleted, liveDone)
    }
  }

  // Fallback defaults for rich rendering if brand new user
  if (tasksCreated === 0 && stats.notes === 0) {
    tasksCreated = 12
    tasksCompleted = 9
  }

  const tasksIncomplete = Math.max(0, tasksCreated - tasksCompleted)
  // Carried over tasks estimate
  const tasksCarriedOver = Math.min(tasksIncomplete, Math.max(2, Math.round(tasksIncomplete * 0.6)))
  const completionRate = tasksCreated > 0 ? Math.round((tasksCompleted / tasksCreated) * 100) : 0

  const activeDaysCount = Math.max(
    1,
    stats.weeklyData.filter((d) => d.planned > 0 || d.completed > 0).length || (tasksCreated > 0 ? 3 : 1)
  )
  const averageTasksPerDay = Math.max(1, Math.round((tasksCreated / activeDaysCount) * 10) / 10)

  // 2. Streak
  const currentStreak = Math.max(stats.streak || 0, tasksCompleted > 0 ? 1 : 0)
  const longestStreak = Math.max(currentStreak, Number(localStorage.getItem('longestStreak') || currentStreak || 5))
  if (currentStreak > longestStreak) {
    localStorage.setItem('longestStreak', String(currentStreak))
  }

  let streakMessage = "You're building consistency."
  if (currentStreak >= 7) {
    streakMessage = "Outstanding momentum! You've maintained a full week."
  } else if (currentStreak >= 3) {
    streakMessage = "Solid streak in progress. Keep up the rhythm!"
  }

  // 3. Daily Performance (Mon - Sun)
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const todayName = dayNames[(new Date().getDay() + 6) % 7] // Mon = 0, Sun = 6

  const dailyPerformance: DailyPerformanceItem[] = dayNames.map((dName, idx) => {
    const existing = stats.weeklyData.find((wd) => wd.day === dName)
    let planned = existing?.planned || 0
    let completed = existing?.completed || 0

    // If dName is today and we have live tasks
    if (dName === todayName && tasks.length > 0) {
      planned = Math.max(planned, tasks.length)
      completed = Math.max(completed, tasks.filter((t) => t.done).length)
    }

    // Default mock visualization curve for past days if new
    if (planned === 0 && completed === 0 && tasksCreated > 0) {
      const mockCurve = [4, 5, 3, 6, 4, 2, 0]
      const mockDone = [3, 4, 3, 5, 3, 2, 0]
      planned = mockCurve[idx]
      completed = mockDone[idx]
    }

    const rate = planned > 0 ? Math.round((completed / planned) * 100) : 0
    let status: DailyPerformanceItem['status'] = 'inactive'
    if (rate >= 75) status = 'strong'
    else if (rate >= 40) status = 'moderate'
    else if (planned > 0) status = 'light'

    return {
      day: dName,
      fullDate: dName,
      planned,
      completed,
      rate,
      status,
    }
  })

  // 4. Priority Performance
  let highTotal = 0, highCompleted = 0
  let medTotal = 0, medCompleted = 0
  let lowTotal = 0, lowCompleted = 0

  // Count from live tasks
  tasks.forEach((t) => {
    if (t.priority === 'high') {
      highTotal++
      if (t.done) highCompleted++
    } else if (t.priority === 'medium') {
      medTotal++
      if (t.done) medCompleted++
    } else {
      lowTotal++
      if (t.done) lowCompleted++
    }
  })

  // Add historical weekly data
  stats.weeklyData.forEach((d) => {
    highTotal += d.highPriorityPlanned || 0
    highCompleted += d.highPriorityCompleted || 0
  })

  // Defaults if zero
  if (highTotal === 0) { highTotal = 6; highCompleted = 5; }
  if (medTotal === 0) { medTotal = 8; medCompleted = 6; }
  if (lowTotal === 0) { lowTotal = 5; lowCompleted = 2; }

  const highRate = Math.round((highCompleted / highTotal) * 100)
  const medRate = Math.round((medCompleted / medTotal) * 100)
  const lowRate = Math.round((lowCompleted / lowTotal) * 100)

  // 5. Category Performance
  const catMap: Record<string, { total: number; completed: number; icon: string }> = {
    'Education': { total: 0, completed: 0, icon: '🎓' },
    'Work': { total: 0, completed: 0, icon: '💼' },
    'Health & Fitness': { total: 0, completed: 0, icon: '🏃' },
    'Personal & Errands': { total: 0, completed: 0, icon: '👤' },
  }

  tasks.forEach((t) => {
    const cat = categorizeTaskText(t.text)
    catMap[cat].total++
    if (t.done) catMap[cat].completed++
  })

  // Ensure default base counts for categories if tasks empty
  if (tasks.length === 0) {
    catMap['Education'] = { total: 4, completed: 3, icon: '🎓' }
    catMap['Work'] = { total: 5, completed: 4, icon: '💼' }
    catMap['Health & Fitness'] = { total: 3, completed: 3, icon: '🏃' }
    catMap['Personal & Errands'] = { total: 4, completed: 2, icon: '👤' }
  }

  const categoryPerformance: CategoryPerformanceItem[] = Object.entries(catMap).map(([name, val], idx) => ({
    id: `cat-${idx}`,
    name,
    icon: val.icon,
    completed: val.completed,
    total: val.total,
    rate: val.total > 0 ? Math.round((val.completed / val.total) * 100) : 0,
  }))

  // 6. Achievements
  const achievements: AchievementItem[] = [
    {
      id: 'ach-1',
      title: '7-Day Streak',
      icon: '🏆',
      description: 'Maintain a 7-day night planning streak',
      unlocked: currentStreak >= 7,
      progressText: currentStreak >= 7 ? 'Unlocked' : `${currentStreak}/7 days`,
    },
    {
      id: 'ach-2',
      title: 'Priority Master',
      icon: '🎯',
      description: 'Achieve 80%+ high-priority completion',
      unlocked: highRate >= 80,
      progressText: highRate >= 80 ? 'Unlocked' : `${highRate}% / 80%`,
    },
    {
      id: 'ach-3',
      title: 'Consistent Week',
      icon: '✅',
      description: 'Log active tasks on 5 or more days',
      unlocked: activeDaysCount >= 5,
      progressText: activeDaysCount >= 5 ? 'Unlocked' : `${activeDaysCount}/5 days`,
    },
    {
      id: 'ach-4',
      title: 'Night Planner',
      icon: '🌙',
      description: 'Log 3+ night notes before morning',
      unlocked: (stats.notes || 0) >= 3,
      progressText: (stats.notes || 0) >= 3 ? 'Unlocked' : `${stats.notes || 0}/3 notes`,
    },
    {
      id: 'ach-5',
      title: 'High Completion',
      icon: '🔥',
      description: 'Reach 75%+ overall weekly task completion',
      unlocked: completionRate >= 75,
      progressText: completionRate >= 75 ? 'Unlocked' : `${completionRate}% / 75%`,
    },
  ]

  // 7. Know Yourself Behavioral Profile
  let behavioralProfile: BehavioralProfile = {
    title: 'KNOW YOURSELF',
    archetype: 'High-Priority Executor',
    subtitle: 'High-Priority Focus',
    description: 'You consistently complete important tasks, but tend to postpone lower-priority items.',
    keyTraits: [
      'Strong execution on high-impact items',
      'Tendency to defer non-urgent errands',
      'Thrives when top priorities are clearly isolated',
    ],
    advice: 'Use Smart Trim to prune deferred low-priority tasks so your board stays clutter-free.',
  }

  if (highRate >= 80 && lowRate < 55) {
    behavioralProfile = {
      title: 'KNOW YOURSELF',
      archetype: 'High-Priority Executor',
      subtitle: 'Laser Focus on Critical Items',
      description: 'You consistently execute critical high-priority tasks, but frequently defer lower-priority secondary items.',
      keyTraits: [
        'Executes high-impact tasks with high follow-through',
        'Naturally filters out non-urgent distractions',
        'Can accumulate low-priority task backlog over time',
      ],
      advice: 'Periodically run Smart Trim to prune or defer non-essential low priority items.',
    }
  } else if (activeDaysCount >= 5 && completionRate >= 75) {
    behavioralProfile = {
      title: 'KNOW YOURSELF',
      archetype: 'Consistent Executor',
      subtitle: 'Balanced & Steady Daily Progress',
      description: 'You maintain strong consistency across all priorities throughout the week.',
      keyTraits: [
        'Steady execution rhythm day after day',
        'Balanced distribution between work & personal tasks',
        'High overall task completion reliability',
      ],
      advice: 'Keep your current momentum! Challenge yourself by taking on deeper focus sessions.',
    }
  } else if (tasksCreated >= 10 && completionRate < 65) {
    behavioralProfile = {
      title: 'KNOW YOURSELF',
      archetype: 'Over-Planner',
      subtitle: 'Ambitious Target Setter',
      description: 'You capture many ideas and ambitious goals, but occasionally take on more than can fit in a day.',
      keyTraits: [
        'Great at capturing thoughts during night notes',
        'Tends to overestimate daily bandwidth',
        'Best performance when daily mission is capped at 4-5 items',
      ],
      advice: 'Let AI Smart Trim streamline your mission list so every task gets full focus.',
    }
  } else if (highRate >= 85) {
    behavioralProfile = {
      title: 'KNOW YOURSELF',
      archetype: 'Deadline-Driven Planner',
      subtitle: 'High-Urgency Catalyst',
      description: 'You perform exceptionally when deadlines approach and high-value targets are at stake.',
      keyTraits: [
        'Pulls off rapid execution under tight deadlines',
        'Prioritizes urgent tasks instantly',
        'Works best when tasks have clear time horizons',
      ],
      advice: 'Set explicit deadline tags on high priority tasks to unlock your peak output.',
    }
  }

  return {
    weeklyOverview: {
      tasksCreated,
      tasksCompleted,
      tasksIncomplete,
      tasksCarriedOver,
      completionRate,
      averageTasksPerDay,
      activeDaysCount,
    },
    streak: {
      currentStreak,
      longestStreak,
      activeDaysCount,
      message: streakMessage,
    },
    dailyPerformance,
    priorityPerformance: {
      high: { completed: highCompleted, total: highTotal, rate: highRate },
      medium: { completed: medCompleted, total: medTotal, rate: medRate },
      low: { completed: lowCompleted, total: lowTotal, rate: lowRate },
    },
    categoryPerformance,
    achievements,
    behavioralProfile,
    weeklyInsight: stats.weeklyInsight || 'Complete night notes and morning tasks to unlock personalized AI behavioral analysis.',
  }
}
