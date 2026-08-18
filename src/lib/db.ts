import { createClient } from '@supabase/supabase-js'

// ─── Environment Variables & Client Initialization ────────────────────────────
// Note: Only this module is allowed to import @supabase/supabase-js or use `supabase`.

const supabaseUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || ''
const supabaseAnonKey =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || ''

// Module-private Supabase client
const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
)

// ─── Exported Types ───────────────────────────────────────────────────────────
export interface Note {
  id: string
  user_id: string
  raw_text: string
  created_at: string
}

export interface Task {
  id: string
  user_id: string
  note_id?: string | null
  text: string
  category?: string | null
  priority: 'high' | 'medium' | 'low'
  ai_urgency?: number | null
  ai_importance?: number | null
  duration?: string | null
  status: 'pending' | 'completed' | 'skipped' | 'carried_over'
  completion_rank?: number | null
  completed_at?: string | null
  created_at: string
}

export interface TaskInput {
  text: string
  category?: string
  priority?: 'high' | 'medium' | 'low'
  ai_urgency?: number
  ai_importance?: number
  duration?: string
  status?: 'pending' | 'completed' | 'skipped' | 'carried_over'
}

export interface TaskEvent {
  id: string
  user_id: string
  task_id: string
  event: 'created' | 'completed' | 'skipped' | 'carried_over'
  occurred_at: string
}

// ─── Auth Session Helper ──────────────────────────────────────────────────────
/**
 * Ensures an active anonymous session exists in Supabase.
 * Returns the active user_id.
 */
export async function ensureAnonymousSession(): Promise<string> {
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) {
    console.warn('[db.ts] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing. Supabase operations will fail until keys are provided.')
    return 'demo-offline-user'
  }

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      console.warn('[db.ts] Error checking existing session:', sessionError.message)
    }

    if (sessionData?.session?.user) {
      return sessionData.session.user.id
    }

    const { data: authData, error: authError } = await supabase.auth.signInAnonymously()
    if (authError) {
      throw new Error(`[db.ts] Anonymous sign-in failed: ${authError.message}`)
    }

    if (!authData.user) {
      throw new Error('[db.ts] Anonymous sign-in succeeded but no user object returned.')
    }

    return authData.user.id
  } catch (err: any) {
    console.error('[db.ts] ensureAnonymousSession error:', err)
    throw err
  }
}

/**
 * Gets the current active session access token for API Authorization headers.
 */
export async function getAccessToken(): Promise<string | null> {
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) {
    return null
  }
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token || null
}

// ─── Helper to enforce authenticated user ID ─────────────────────────────────
async function getAuthenticatedUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const user = data?.session?.user
  if (!user) {
    // Attempt anonymous sign-in
    return await ensureAnonymousSession()
  }
  return user.id
}

// ─── CRUD Helpers ─────────────────────────────────────────────────────────────

/**
 * Creates a raw night note record for the authenticated user.
 */
export async function createNote(rawText: string): Promise<Note> {
  const userId = await getAuthenticatedUserId()

  const { data, error } = await supabase
    .from('notes')
    .insert({
      user_id: userId,
      raw_text: rawText,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`[db.ts] createNote failed: ${error.message}`)
  }

  return data as Note
}

/**
 * Creates multiple task items associated with a note (or standalone).
 */
export async function createTasks(
  noteId: string | null,
  tasks: TaskInput[]
): Promise<Task[]> {
  const userId = await getAuthenticatedUserId()

  const insertPayload = tasks.map((t) => ({
    user_id: userId,
    note_id: noteId,
    text: t.text,
    category: t.category || null,
    priority: t.priority || 'medium',
    ai_urgency: t.ai_urgency ?? null,
    ai_importance: t.ai_importance ?? null,
    duration: t.duration || null,
    status: t.status || 'pending',
  }))

  const { data, error } = await supabase
    .from('tasks')
    .insert(insertPayload)
    .select()

  if (error) {
    throw new Error(`[db.ts] createTasks failed: ${error.message}`)
  }

  // Log 'created' events for each task
  if (data && data.length > 0) {
    const events = data.map((taskItem) => ({
      user_id: userId,
      task_id: taskItem.id,
      event: 'created',
    }))
    await supabase.from('task_events').insert(events)
  }

  return data as Task[]
}

/**
 * Fetches all tasks for the current authenticated user (enforced by RLS).
 */
export async function getTasks(): Promise<Task[]> {
  const userId = await getAuthenticatedUserId()

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`[db.ts] getTasks failed: ${error.message}`)
  }

  return data as Task[]
}

/**
 * Updates status of a task and logs the status change event.
 */
export async function updateTaskStatus(
  taskId: string,
  status: 'pending' | 'completed' | 'skipped' | 'carried_over',
  completionRank?: number
): Promise<void> {
  const userId = await getAuthenticatedUserId()

  const updateData: Record<string, any> = {
    status,
  }

  if (status === 'completed') {
    updateData.completed_at = new Date().toISOString()
    if (completionRank !== undefined) {
      updateData.completion_rank = completionRank
    }
  } else {
    updateData.completed_at = null;
    updateData.completion_rank = null;
  }

  const { error } = await supabase
    .from('tasks')
    .update(updateData)
    .eq('id', taskId)
    .eq('user_id', userId)

  if (error) {
    throw new Error(`[db.ts] updateTaskStatus failed: ${error.message}`)
  }

  // Log status change event if status is a tracked event
  if (status !== 'pending') {
    await logEvent(taskId, status)
  }
}

/**
 * Updates priority ('high' | 'medium' | 'low') of a task.
 */
export async function updateTaskPriority(
  taskId: string,
  priority: 'high' | 'medium' | 'low'
): Promise<void> {
  const userId = await getAuthenticatedUserId()

  const { error } = await supabase
    .from('tasks')
    .update({ priority })
    .eq('id', taskId)
    .eq('user_id', userId)

  if (error) {
    throw new Error(`[db.ts] updateTaskPriority failed: ${error.message}`)
  }
}

/**
 * Logs a behavioral event to the append-only task_events log.
 */
export async function logEvent(
  taskId: string,
  event: 'created' | 'completed' | 'skipped' | 'carried_over'
): Promise<void> {
  const userId = await getAuthenticatedUserId()

  const { error } = await supabase.from('task_events').insert({
    user_id: userId,
    task_id: taskId,
    event,
  })

  if (error) {
    throw new Error(`[db.ts] logEvent failed: ${error.message}`)
  }
}

/**
 * Fetches raw computed category behavioral scores from the category_behavior_scores SQL view.
 * Respects RLS on underlying tables (security_invoker).
 */
export async function getRawCategoryScores(): Promise<any[]> {
  try {
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) {
      return []
    }
    await getAuthenticatedUserId()
    const { data, error } = await supabase
      .from('category_behavior_scores')
      .select('*')

    if (error) {
      console.warn('[db.ts] getRawCategoryScores warning:', error.message)
      return []
    }

    return data || []
  } catch (err: any) {
    console.warn('[db.ts] getRawCategoryScores error:', err?.message || err)
    return []
  }
}
