-- NightNote Phase 4 Migration: Category Behavioral Scoring Engine
-- Computes per-category behavioral priority scores from task_events and tasks

CREATE OR REPLACE VIEW public.category_behavior_scores
WITH (security_invoker = true)
AS
SELECT
  e.user_id,
  t.category,
  COUNT(*)::int AS event_count,
  CASE
    WHEN COUNT(*) < 5 THEN NULL
    ELSE (
      SUM(
        (
          CASE
            WHEN e.event = 'skipped' THEN 0.0
            WHEN t.completion_rank = 1 THEN 3.0
            WHEN t.completion_rank = 2 THEN 2.0
            WHEN t.completion_rank >= 3 THEN 1.0
            ELSE 1.0 -- completed but rank null -> floor at 1
          END
        ) * (
          CASE
            WHEN e.occurred_at >= (now() - interval '30 days') THEN 1.0
            ELSE 0.5
          END
        )
      ) / NULLIF(
        SUM(
          CASE
            WHEN e.occurred_at >= (now() - interval '30 days') THEN 1.0
            ELSE 0.5
          END
        ),
        0.0
      )
    )
  END::numeric AS weighted_avg_score,
  COALESCE(
    BOOL_OR(
      e.event = 'completed'
      AND t.priority = 'high'
      AND e.occurred_at >= (now() - interval '7 days')
    ),
    false
  ) AS has_recent_deadline_task
FROM public.task_events e
JOIN public.tasks t ON e.task_id = t.id
WHERE e.event IN ('completed', 'skipped')
  AND t.category IS NOT NULL
GROUP BY e.user_id, t.category;

-- Index to accelerate user event lookups by type and time
CREATE INDEX IF NOT EXISTS idx_task_events_user_event_time
  ON public.task_events(user_id, event, occurred_at);
