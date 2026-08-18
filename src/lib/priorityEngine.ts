import { AITask } from './aiTypes'
import { CategoryScore } from './categoryScores'

export interface ScoredTask extends AITask {
  final_score: number
  is_deadline_driven: boolean
  reason: string
}

export interface PriorityWeights {
  urgency: number
  importance: number
  history: number
}

export const DEFAULT_WEIGHTS: PriorityWeights = {
  urgency: 0.5,
  importance: 0.3,
  history: 0.2,
}

/**
 * Pure deterministic priority engine that computes scores, applies deadline overrides,
 * attaches human-readable explainability reasons, and orders tasks.
 */
export function prioritizeTasks(
  tasks: AITask[],
  categoryScores: CategoryScore[] = [],
  weights: PriorityWeights = DEFAULT_WEIGHTS
): ScoredTask[] {
  if (!tasks || tasks.length === 0) {
    return []
  }

  // Build O(1) category score lookup map
  const categoryMap = new Map<string, CategoryScore>()
  if (Array.isArray(categoryScores)) {
    for (const cs of categoryScores) {
      if (cs && cs.category) {
        categoryMap.set(cs.category.toUpperCase().trim(), cs)
      }
    }
  }

  const scoredList: { task: ScoredTask; originalIndex: number }[] = tasks.map((t, index) => {
    const catKey = (t.category || '').toUpperCase().trim()
    const catScore = categoryMap.get(catKey)

    // Base score from AI urgency and importance
    const urgency = typeof t.ai_urgency === 'number' ? Math.max(0, Math.min(1, t.ai_urgency)) : 0.5
    const importance = typeof t.ai_importance === 'number' ? Math.max(0, Math.min(1, t.ai_importance)) : 0.5
    const baseScore = (urgency * weights.urgency) + (importance * weights.importance)

    // History adjustment (NULL floor = neutral 0)
    let historyAdjustment = 0
    const hasHistory = catScore && typeof catScore.weighted_avg_score === 'number' && !isNaN(catScore.weighted_avg_score)
    if (hasHistory) {
      const norm = catScore!.weighted_avg_score! / 3.0
      historyAdjustment = norm * weights.history
    }

    const finalScore = Number((baseScore + historyAdjustment).toFixed(4))

    // Deadline override rule
    const isDeadlineDriven =
      (t.priority === 'high' && urgency >= 0.8) ||
      (Boolean(catScore?.has_recent_deadline_task) && t.priority === 'high')

    // Explainability reason
    let reason = ''
    if (isDeadlineDriven) {
      reason = 'Prioritized — urgent deadline'
    } else if (hasHistory && catScore!.weighted_avg_score! >= 2.0) {
      const displayCategory = t.category ? t.category.toUpperCase() : 'THIS CATEGORY'
      reason = `You usually finish ${displayCategory} tasks first`
    } else if (hasHistory && catScore!.weighted_avg_score! <= 0.8) {
      const displayCategory = t.category ? t.category.toUpperCase() : 'THIS CATEGORY'
      reason = `You often postpone ${displayCategory} — placed lower`
    } else if (urgency >= 0.75 && urgency > importance) {
      reason = 'Time-sensitive right now'
    } else if (hasHistory) {
      reason = 'Balanced urgency and historical completion pace'
    } else {
      reason = 'Based on urgency and importance'
    }

    const scoredTask: ScoredTask = {
      ...t,
      final_score: finalScore,
      is_deadline_driven: isDeadlineDriven,
      reason,
    }

    return { task: scoredTask, originalIndex: index }
  })

  // Sort: deadline-driven first, then by final_score descending; preserve original index for ties
  scoredList.sort((a, b) => {
    if (a.task.is_deadline_driven !== b.task.is_deadline_driven) {
      return a.task.is_deadline_driven ? -1 : 1
    }
    if (b.task.final_score !== a.task.final_score) {
      return b.task.final_score - a.task.final_score
    }
    return a.originalIndex - b.originalIndex
  })

  return scoredList.map((item) => item.task)
}

/**
 * Groups scored tasks by their original task.priority region ('high' | 'medium' | 'low').
 * Does not re-derive priority from final_score — preserves user/board priority boundaries.
 */
export function groupByPriorityRegion(scored: ScoredTask[]): {
  high: ScoredTask[]
  medium: ScoredTask[]
  low: ScoredTask[]
} {
  const result: { high: ScoredTask[]; medium: ScoredTask[]; low: ScoredTask[] } = {
    high: [],
    medium: [],
    low: [],
  }

  for (const task of scored) {
    if (task.priority === 'high') {
      result.high.push(task)
    } else if (task.priority === 'low') {
      result.low.push(task)
    } else {
      result.medium.push(task)
    }
  }

  return result
}
