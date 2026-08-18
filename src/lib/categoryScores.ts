import { getRawCategoryScores } from './db'

export interface CategoryScore {
  category: string
  event_count: number
  weighted_avg_score: number | null // null = insufficient data (< 5 events)
  has_recent_deadline_task: boolean
}

/**
 * Reads computed category behavior scores for the authenticated user.
 * Degrades gracefully to empty array [] on error or unconfigured sessions.
 */
export async function getCategoryScores(): Promise<CategoryScore[]> {
  try {
    const rawRows = await getRawCategoryScores()
    if (!Array.isArray(rawRows)) {
      return []
    }

    return rawRows.map((row) => ({
      category: String(row.category || ''),
      event_count:
        typeof row.event_count === 'number'
          ? row.event_count
          : parseInt(row.event_count, 10) || 0,
      weighted_avg_score:
        row.weighted_avg_score === null || row.weighted_avg_score === undefined
          ? null
          : typeof row.weighted_avg_score === 'number'
            ? row.weighted_avg_score
            : parseFloat(row.weighted_avg_score),
      has_recent_deadline_task: Boolean(row.has_recent_deadline_task),
    }))
  } catch (err: any) {
    console.warn('[categoryScores] Failed to read category scores:', err?.message || err)
    return []
  }
}
