import { generateLocalInference, initializeLocalModel, getLocalModelStatus } from './localInferenceService'
import { ModelStatus } from '../plugins/nightnoteLocalAI'

export interface TaskItem {
  id: string
  text: string
  priority: 'high' | 'medium' | 'low'
  duration: string
  done: boolean
  description?: string
  category?: string
  deadline?: string | null
  urgency?: number
  importance?: number
  sourceClause?: string
  sourceText?: string
}

// ─── Legacy Storage Cleanup ──────────────────────────────────────────────────

/**
 * Purges obsolete remote/cloud LLM keys from localStorage and sessionStorage.
 */
export function cleanupLegacyCredentials() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('CUSTOM_LLM_API_KEY')
    localStorage.removeItem('CUSTOM_LLM_ENDPOINT')
    localStorage.removeItem('CUSTOM_LLM_MODEL')
    localStorage.removeItem('NIGHTNOTE_API_KEY_FRIEND')
    sessionStorage.removeItem('CUSTOM_LLM_API_KEY')
    sessionStorage.removeItem('CUSTOM_LLM_ENDPOINT')
    sessionStorage.removeItem('CUSTOM_LLM_MODEL')
  }
}

// ─── Phase 2 & 3: Validation, Action Boundaries & Compound Splitting ─────────

/**
 * Validates whether a text string contains an actionable semantic payload.
 * Rejects dangling introductory fragments (e.g. "I want", "I need to", "Tomorrow I")
 * and pure non-actionable chatter.
 */
export function isValidTaskText(text: string): boolean {
  if (!text || typeof text !== 'string') return false
  const lower = text.toLowerCase().trim()
  if (lower.length < 3) return false

  // Reject dangling introductory fragments that lack an action payload
  const incompleteFragmentRegex = /^(?:i\s+)?(?:want|wants|wanted|need|needs|needed|have|has|had|must|plan|plans|planned|gonna|gotta|wanna|remember|don't\s+forget|then|and\s+also|and|also|tomorrow|tomorrow\s+i|then\s+i|maybe|maybe\s+later|later|soon|next|someday|try|trying|start|starting)(\s+to)?\s*$/i
  if (incompleteFragmentRegex.test(lower)) {
    return false
  }

  // Reject conversational chatter / state-of-being expressions
  const chatterRegex = /^(?:today|man|boy|girl|phew|damn|wow|omg|gosh|i|i'm|im|just|feeling)\s+(?:today\s+)?(?:was|is|feel|feeling|am)?\s*(?:so\s+)?(?:exhausting|exhausted|tiring|tired|crazy|wild|great|rough|brutal|busy|long|hectic|good|bad|sleepy|chilling|relaxing|done for the day|heading to bed|going to sleep)$/i
  if (chatterRegex.test(lower)) return false

  const greetingsRegex = /^(?:good\s+night|sleep\s+well|sweet\s+dreams|hello|hi|hey|bye|just\s+chilling|thinking\s+about\s+life)[\s!.]*$/i
  if (greetingsRegex.test(lower)) return false

  const pastCompletedRegex = /^(?:already\s+finished|already\s+submitted|already\s+done|already\s+paid|paid\s+the\s+.*yesterday|finished\s+my\s+|completed\s+my\s+|went\s+to\s+.*this\s+morning|just\s+finished|already\s+finished\s+everything)$/i
  if (pastCompletedRegex.test(lower)) return false

  if (/^(?:maybe|later|tomorrow|tonight|yesterday|sometime|nothing|none|n\/a)$/i.test(lower)) return false

  return true
}

/**
 * Splits user input into separate actionable clauses while protecting common phrases,
 * compound nouns, abbreviations, and list structures.
 */
export function splitCompoundActions(input: string): string[] {
  if (!input || !input.trim()) return []

  const text = input.trim()

  // Case A: Multiline or numbered / bulleted input
  if (text.includes('\n') || /^\s*(?:\d+[\.\)]|[-*•])\s+/m.test(text)) {
    const rawLines = text.split(/\r?\n+/)
    const lines: string[] = []
    for (const raw of rawLines) {
      const trimmed = raw.trim().replace(/^[-*•\d.)\s]+/, '').trim()
      if (trimmed.length > 0 && isValidTaskText(trimmed)) {
        lines.push(trimmed)
      }
    }
    if (lines.length > 1) {
      return lines
    }
  }

  // Case B: Single line text with potential multi-task clauses
  const protections: { regex: RegExp; key: string }[] = [
    { regex: /\bDr\.\s+[A-Z][a-z]+/gi, key: '__PROT_DRNAME__' },
    { regex: /\b(?:Dr|Mr|Mrs|Ms|Prof)\.\s*/gi, key: '__PROT_TITLE__' },
    { regex: /\b(?:Chapter|Chap|Ch)\.?\s*\d+\s*(?:and|&|n|\+|,|\s+to\s+|-)\s*\d+\b/gi, key: '__PROT_CHAP__' },
    { regex: /\be\.g\.,?\s*/gi, key: '__PROT_EG__' },
    { regex: /\bi\.e\.,?\s*/gi, key: '__PROT_IE__' },
    { regex: /\bvs\.\s*/gi, key: '__PROT_VS__' },
    { regex: /\betc\.\s*/gi, key: '__PROT_ETC__' },
    { regex: /\br\s*&\s*d\b/gi, key: '__PROT_RD__' },
    { regex: /\bai\s*&\s*ml\b/gi, key: '__PROT_AIML__' },
    { regex: /\bbread\s+(?:and|&|n)\s+butter\b/gi, key: '__PROT_BB__' },
    { regex: /\bsalt\s+and\s+pepper\b/gi, key: '__PROT_SP__' },
    { regex: /\bmac\s+and\s+cheese\b/gi, key: '__PROT_MC__' },
    { regex: /\bmom\s+(?:and|&|n)\s+dad\b/gi, key: '__PROT_MD__' },
    { regex: /\bmilk\s*,\s*eggs\s*,\s*(?:and\s+)?bread\b/gi, key: '__PROT_GROC1__' },
    { regex: /\bmilk\s+eggs\s+bread\b/gi, key: '__PROT_GROC2__' },
  ]

  let processed = text
  const mapping: Record<string, string> = {}
  protections.forEach((p, idx) => {
    processed = processed.replace(p.regex, (match) => {
      const key = `__PROT_${idx}__`
      mapping[key] = match
      return key
    })
  })

  const intentPhrases = '(?:i\\s+(?:want|need|have|must|gotta|gonna|wanna|plan)\\s+to|i\\s+(?:want|need|have|must|gotta|wanna|plan))'
  const actionVerbPattern = '(?:call|cll|phone|ring|message|text|email|contact|buy|purchase|order|get|pick up|grab|shop for|fetch|pay|renew|recharge|settle|study|stdy|learn|revise|review|practice|research|prepare|prep|write|complete|finish|submit|solve|go to|hit the|workout|exercise|run|gym|cardio|yoga|clean|organize|wash|fix|repair|set up|pack|schedule|book|reserve|meet|see|resolve|check|chck|inspect|update|send|upload|download|compile|code|debug|test|create|draft|do|attend|need to|have to|must|remember to|don\\\'t forget to|gonna|gotta|plan to|want to|wanna)'
  const strongActionVerbs = '(?:call|cll|phone|ring|message|text|email|buy|purchase|order|pay|renew|study|stdy|revise|prepare|prep|write|finish|complete|submit|send|upload|go to|hit the|clean|schedule|book|reserve|research)'

  const smartSplitRegex = new RegExp(
    `;\\s*|` +
    `(?<=[\\w\\)])\\.\\s+(?=[A-Z]|${actionVerbPattern}\\b|${intentPhrases}\\b)|` +
    `,\\s*(?:and\\s+|also\\s+|then\\s+|plus\\s+)?(?=${intentPhrases}\\b|${actionVerbPattern}\\b)|` +
    `\\s+(?:and\\s+then|and\\s+also|and\\s+${intentPhrases}|and|then|after\\s+that|plus)\\s+(?=${intentPhrases}\\b|${actionVerbPattern}\\b)|` +
    `\\s+(?=${intentPhrases}\\s+)|` +
    `(?<!\\b(?:the|a|an|to|for|on|about|with|before|after|of|in|at|into|through|during|and|or|plus|also|my|our|their|his|her|your|this|that|these|those|gonna|gotta|wanna|will|shall|can|could|would|should|must|need|have|going|want|wants|wanted|wishing|wish|like|likes|liked|hope|trying|try|start|started|begin|began))\\s+(?=${strongActionVerbs}\\b)`,
    'gi'
  )

  const rawClauses = processed.split(smartSplitRegex)
  const clauses: string[] = []

  for (const c of rawClauses) {
    let restored = c.trim()
    Object.keys(mapping).forEach(k => {
      restored = restored.replace(new RegExp(k, 'g'), mapping[k])
    })
    // Strip leading conversational connectors & casual lead-ins
    restored = restored
      .replace(/^(?:bro\s+tmrw\s+i\s+gotta|tmrw\s+i\s+gotta|tomorrow\s+i\s+need\s+to|tomorrow\s+i\s+gotta|tomorrow\s+i\s+want\s+to|i\s+gotta|i\s+need\s+to|i\s+want\s+to|i\s+have\s+to|i\s+wanna|also|and|then|plus|but|so|remember to|don't forget to|please)\s+/i, '')
      .trim()
    if (restored.length > 1 && isValidTaskText(restored)) {
      clauses.push(restored)
    }
  }

  return clauses.length > 0 ? clauses : (isValidTaskText(text) ? [text] : [])
}

// ─── Phase 6 & 7: Deduplication and Category Grounding ───────────────────────

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  EDUCATION: ['exam', 'assignment', 'dbms', 'study', 'class', 'homework', 'essay', 'lecture', 'revise', 'school', 'university', 'submit', 'algorithms', 'midterm', 'quiz', 'course', 'math', 'physics', 'chemistry', 'biology', 'calculus'],
  WORK: ['client', 'report', 'meeting', 'email', 'professional', 'office', 'work', 'zoom', 'slack', 'reply', 'schedule', 'sprint', 'backlog', 'pr', 'pull request', 'contract', 'proposal', 'presentation', 'deck', 'slides', 'standup', 'cybersecurity', 'r&d', 'bug', 'deploy', 'code', 'strategy', 'marketing'],
  HEALTH: ['prescription', 'medicine', 'doctor', 'clinic', 'pharmacy', 'health', 'dentist', 'vitamins', 'renew', 'physical', 'checkup', 'hospital', 'therapy', 'appointment'],
  RELATIONSHIP: ['mom', 'dad', 'family', 'girlfriend', 'boyfriend', 'partner', 'friend', 'call', 'talk', 'resolve', 'disagreement', 'sarah', 'john', 'parents', 'mother', 'father', 'sister', 'brother', 'date'],
  FITNESS: ['gym', 'running', 'workout', 'exercise', 'training', 'yoga', 'lift', 'cardio'],
  ERRANDS: ['groceries', 'shopping', 'bill', 'utilities', 'rent', 'buy', 'purchase', 'toothpaste', 'milk', 'grocery', 'pay', 'wifi', 'post office', 'package', 'walmart', 'clean desk', 'clean', 'insurance', 'dinner', 'eggs', 'bread'],
  ENTERTAINMENT: ['gaming', 'video game', 'movie', 'watch', 'play', 'xbox', 'playstation', 'stream', 'game', 'netflix', 'concert'],
}

/**
 * Deterministically assigns a category based on keyword density.
 */
export function groundCategory(text: string, currentCategory?: string): string {
  const lower = text.toLowerCase()
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => new RegExp(`\\b${k}\\b`, 'i').test(lower) || lower.includes(k))) {
      return cat
    }
  }
  return currentCategory ? currentCategory.toUpperCase() : 'OTHER'
}

/**
 * Removes duplicate task intents and merges metadata.
 */
export function deduplicateTasks(tasks: TaskItem[]): TaskItem[] {
  const seen = new Map<string, TaskItem>()
  const result: TaskItem[] = []

  for (const task of tasks) {
    // Basic normalization for intent comparison
    const normalized = task.text.toLowerCase()
      .replace(/^(complete|finish|revise|study|do|start|begin|go to|call|buy|need 2|need to)\s+/i, '')
      .replace(/\s+(tonight|tomorrow|tonite|today)$/i, '')
      .trim()

    if (!seen.has(normalized)) {
      seen.set(normalized, task)
      result.push(task)
    } else {
      const existing = seen.get(normalized)!
      // Merge metadata: keep highest urgency/importance
      if (task.priority === 'high') existing.priority = 'high'
      if (typeof task.urgency === 'number') {
        existing.urgency = Math.max(existing.urgency || 0, task.urgency)
      }
      if (typeof task.importance === 'number') {
        existing.importance = Math.max(existing.importance || 0, task.importance)
      }
      if (task.deadline && !existing.deadline) existing.deadline = task.deadline
    }
  }
  return result
}

// ─── Phase 8 & 9: Safety and Priority Logic ───────────────────────────────────

/**
 * Filters out non-actionable statements and applies safety overrides.
 */
export function isIntentActionable(input: string): boolean {
  if (!input || !input.trim()) return false
  const lower = input.toLowerCase().trim()

  if (lower.length < 3) return false

  // Pure conversational / state-of-being expressions
  const stateRegex = /^(today|man|boy|girl|phew|damn|wow|omg|gosh|i|i'm|im|just|feeling)\s+(today\s+)?(was|is|feel|feeling|am)?\s*(so\s+)?(exhausting|exhausted|tiring|tired|crazy|wild|great|rough|brutal|busy|long|hectic|good|bad|sleepy|chilling|relaxing|done for the day|heading to bed|going to sleep)/i
  if (stateRegex.test(lower)) {
    const hasExplicitTask = /\b(need\s+to|have\s+to|must|remember\s+to|don't\s+forget|pay\s+|study\s+|call\s+|buy\s+|submit\s+|finish\s+|prep\s+)\b/i.test(lower)
    if (!hasExplicitTask) {
      return false
    }
  }

  // Greetings / chatter
  if (/^(good\s+night|sleep\s+well|sweet\s+dreams|hello|hi|hey|bye|just\s+chilling|thinking\s+about\s+life)[\s!.]*$/i.test(lower)) {
    return false
  }

  // Past completed actions without future tasks
  const pastRegex = /^(already\s+finished|already\s+submitted|already\s+done|already\s+paid|paid\s+the\s+.*yesterday|finished\s+my\s+|completed\s+my\s+|went\s+to\s+.*this\s+morning|just\s+finished)/i
  if (pastRegex.test(lower)) {
    const hasFuture = /\b(tomorrow|tonight|next|again|still\s+need|need\s+to|have\s+to|must|don't\s+forget|remember\s+to)\b/i.test(lower)
    if (!hasFuture) return false
  }

  return true
}

/**
 * Deterministically calculates priority from urgency and importance.
 */
export function calculateDeterministicPriority(urgency: number, importance: number): 'high' | 'medium' | 'low' {
  const score = (urgency * 0.6) + (importance * 0.4)
  if (score >= 0.70) return 'high'
  if (score >= 0.35) return 'medium'
  return 'low'
}

export function sortTasksByPriority(tasks: TaskItem[]): TaskItem[] {
  const priorityMap: Record<'high' | 'medium' | 'low', number> = {
    high: 1,
    medium: 2,
    low: 3,
  }
  return [...tasks].sort((a, b) => (priorityMap[a.priority] || 2) - (priorityMap[b.priority] || 2))
}

export function normalizePriority(p: any): 'high' | 'medium' | 'low' {
  if (!p) return 'medium'
  const s = String(p).toLowerCase().trim()
  if (s === 'high') return 'high'
  if (s === 'low') return 'low'
  return 'medium'
}

export function generateLocalTasks(thought: string): TaskItem[] {
  if (!thought || !thought.trim()) {
    return []
  }

  const clauses = splitCompoundActions(thought).filter(isIntentActionable)
  if (clauses.length === 0) return []

  const generated: TaskItem[] = clauses
    .filter(raw => isValidTaskText(raw))
    .map((raw, idx) => {
      let clean = raw
        .replace(/^[-*•\d.)\s]+/, '')
        .replace(/^(tomorrow|need to|have to|must|should|remember to|don't forget to|i want to|plan to)\s+/i, '')
        .trim()

      if (!clean) clean = raw.trim()
      clean = clean.charAt(0).toUpperCase() + clean.slice(1)

      const cat = groundCategory(clean)
      return {
        id: `task-local-${Date.now()}-${idx}`,
        text: clean,
        priority: 'medium',
        duration: '30m',
        done: false,
        category: cat,
        description: `Action item: ${cat}`,
        sourceClause: raw,
        sourceText: thought,
      }
    })

  return deduplicateTasks(generated)
}

/**
 * Self-test Local AI Engine status
 */
export async function testCustomLLMConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const statusRes = await getLocalModelStatus()
    if (statusRes.status === ModelStatus.LOADED) {
      return { ok: true, message: 'Local Lite V2 Engine Active & Loaded' }
    }
    if (statusRes.status === ModelStatus.READY) {
      const initialized = await initializeLocalModel()
      return {
        ok: initialized,
        message: initialized ? 'Local Lite V2 Engine Ready & Initialized' : 'Model file present, initialization pending',
      }
    }
    return {
      ok: false,
      message: `Model Status: ${statusRes.status}`,
    }
  } catch (error: any) {
    return {
      ok: false,
      message: error?.message || 'Failed to connect to local engine.',
    }
  }
}

export function notifyAIToast(message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ai-status-toast', { detail: { message, type } }))
  }
}

/**
 * Conservative Fast-Path for 100% unambiguous, simple tasks.
 * Ambiguous, multi-word, or complex clauses defer to Lite V2 LLM for maximum accuracy.
 */
export function attemptFastPath(clause: string): TaskItem | null {
  const lower = clause.toLowerCase().trim()

  // Extract deadline if present
  let deadline: string | null = null
  let text = clause.charAt(0).toUpperCase() + clause.slice(1)

  const deadlinePatterns = [
    { regex: /\s+(tomorrow|tonight|today|tonite)$/i, matchIdx: 1 },
    { regex: /\s+(on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i, matchIdx: 2 },
    { regex: /\s+(at|by)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?|\d{1,2}\s*o'?clock|seven\s*pm|eight\s*pm|six\s*pm)$/i, matchIdx: 0 }
  ]

  for (const dp of deadlinePatterns) {
    const match = lower.match(dp.regex)
    if (match) {
      deadline = match[dp.matchIdx].trim()
      text = text.replace(new RegExp(dp.regex.source, 'i'), '').trim()
      break
    }
  }

  const normalizedLower = lower
    .replace(/\s+(tomorrow|tonight|today|tonite)$/i, '')
    .replace(/\s+(on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i, '')
    .replace(/\s+(at|by)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?|\d{1,2}\s*o'?clock|seven\s*pm|eight\s*pm|six\s*pm)$/i, '')
    .trim()

  // Strictly unambiguous patterns
  const strictPatterns: { regex: RegExp, cat: string, dur: string, desc: string, urgency: number, importance: number }[] = [
    { regex: /^buy\s+(groceries|grocery|milk|eggs|bread|food|water|toothpaste)$/i, cat: 'ERRANDS', dur: '20m', desc: 'Grocery run', urgency: 0.5, importance: 0.5 },
    { regex: /^call\s+(mom|dad|parents|mother|father|sister|brother|grandma|grandpa)$/i, cat: 'RELATIONSHIP', dur: '15m', desc: 'Family call', urgency: 0.6, importance: 0.7 },
    { regex: /^pay\s+(the\s+)?(electricity|water|wifi|internet|electric|utility|power)\s+bill$/i, cat: 'ERRANDS', dur: '10m', desc: 'Bill payment', urgency: 0.8, importance: 0.8 },
    { regex: /^pay\s+rent$/i, cat: 'ERRANDS', dur: '10m', desc: 'Rent payment', urgency: 0.9, importance: 0.9 },
    { regex: /^(go to|hit)\s+(the\s+)?gym$/i, cat: 'FITNESS', dur: '1h', desc: 'Workout', urgency: 0.5, importance: 0.6 },
    { regex: /^(do\s+)?(workout|cardio|yoga)$/i, cat: 'FITNESS', dur: '45m', desc: 'Fitness', urgency: 0.5, importance: 0.6 },
    { regex: /^study\s+(dbms|math|physics|chemistry|biology|calculus|algorithms)$/i, cat: 'EDUCATION', dur: '45m', desc: 'Study session', urgency: 0.7, importance: 0.8 },
  ]

  for (const p of strictPatterns) {
    if (p.regex.test(normalizedLower)) {
      return {
        id: `fast-${Date.now()}-${Math.random()}`,
        text: text,
        priority: p.urgency >= 0.7 ? 'high' : 'medium',
        duration: p.dur,
        done: false,
        category: p.cat,
        deadline: deadline,
        urgency: p.urgency,
        importance: p.importance,
        description: `${p.desc} (Fast-path)`
      }
    }
  }

  return null
}

/**
 * Primary Generation Entry Point: High-Accuracy Lite V2 Pipeline with Forensics
 */
export async function generateMission(thought: string): Promise<TaskItem[]> {
  if (!thought || !thought.trim()) return []

  const startTotal = Date.now()
  console.log('=== NIGHTNOTE_FORENSICS_START ===')
  console.log('ORIGINAL_INPUT:', thought)

  try {
    const isLocalReady = await initializeLocalModel()
    if (!isLocalReady) {
      throw new Error('Local NightNote model is not ready or missing.')
    }

    // 1. Structure-Aware Compound Task Splitting
    const allClauses = splitCompoundActions(thought).filter(isIntentActionable)
    console.log('SPLIT_CLAUSES:', JSON.stringify(allClauses))

    if (allClauses.length === 0) {
      console.log('FINAL_UI_TASKS: [] (Non-actionable input)')
      return []
    }

    const aggregatedTasks: TaskItem[] = []
    const clausesForAI: string[] = []
    const fastPathRecords: any[] = []

    // 2. High-Precision Fast-Path Filter
    allClauses.forEach(clause => {
      const fastTask = attemptFastPath(clause)
      if (fastTask) {
        fastPathRecords.push({ clause, task: fastTask.text, category: fastTask.category, deadline: fastTask.deadline })
        aggregatedTasks.push(fastTask)
      } else {
        clausesForAI.push(clause)
      }
    })
    console.log('FAST_PATH_RESULTS:', JSON.stringify(fastPathRecords))
    console.log('CLAUSES_SENT_TO_LLM:', JSON.stringify(clausesForAI))

    // 3. Batched Inference for remaining clauses
    if (clausesForAI.length > 0) {
      const inferenceInput = clausesForAI.length === 1
        ? clausesForAI[0]
        : clausesForAI.map((c, i) => `${i + 1}. ${c}`).join('\n')

      const startInference = Date.now()
      try {
        const data = await generateLocalInference(inferenceInput)
        console.log(`NN_LATENCY ai_inference_ms=${Date.now() - startInference}`)

        let rawTasksList: any[] = []
        if (data && Array.isArray(data.tasks)) {
          rawTasksList = data.tasks
        } else if (Array.isArray(data)) {
          rawTasksList = data
        } else if (data && typeof data === 'object') {
          if (data.title || data.text) {
            rawTasksList = [data]
          }
        }

        console.log('PARSED_LLM_TASKS:', JSON.stringify(rawTasksList))

        // Process extracted tasks and correlate with source clauses
        rawTasksList.forEach((t: any, idx: number) => {
          let text = String(t.title || t.text || '').trim()
          const matchedClause = clausesForAI[idx] || (clausesForAI.length === 1 ? clausesForAI[0] : '')

          // Never accept incomplete fragments — recover full semantic text from source clause if needed
          if (!isValidTaskText(text)) {
            if (matchedClause && isValidTaskText(matchedClause)) {
              text = matchedClause.trim()
            }
          }

          if (!isValidTaskText(text)) {
            return // Skip invalid fragment if no valid text can be recovered
          }

          const category = groundCategory(text, t.category)
          const urg = typeof t.urgency === 'number' ? t.urgency : 0.5
          const imp = typeof t.importance === 'number' ? t.importance : 0.5
          const priority = calculateDeterministicPriority(urg, imp)
          const duration = t.duration || (priority === 'high' ? '45m' : priority === 'low' ? '15m' : '30m')

          aggregatedTasks.push({
            id: `task-${Date.now()}-${aggregatedTasks.length}-${idx}`,
            text,
            priority,
            duration,
            done: false,
            description: t.description || `Category: ${category}`,
            category,
            deadline: t.deadline || null,
            urgency: urg,
            importance: imp,
            sourceClause: matchedClause,
            sourceText: thought,
          })
        })

        // If LLM returned fewer tasks than clauses requested, recover remaining clauses
        if (aggregatedTasks.length < allClauses.length && rawTasksList.length < clausesForAI.length) {
          const processedClauses = new Set(aggregatedTasks.map(t => t.sourceClause).filter(Boolean))
          clausesForAI.forEach(clause => {
            if (!processedClauses.has(clause)) {
              const recovered = generateLocalTasks(clause)
              aggregatedTasks.push(...recovered)
            }
          })
        }
      } catch (inferenceErr) {
        console.warn('Batched inference failed, using deterministic local extraction:', inferenceErr)
        clausesForAI.forEach(c => aggregatedTasks.push(...generateLocalTasks(c)))
      }
    }

    // 4. Task Deduplication & Sorting
    const deduplicated = deduplicateTasks(aggregatedTasks)
    const sorted = sortTasksByPriority(deduplicated)
    console.log('POST_PROCESSED_TASKS:', JSON.stringify(sorted.map(t => ({ text: t.text, cat: t.category, dl: t.deadline, prio: t.priority }))))
    console.log('FINAL_UI_TASKS:', JSON.stringify(sorted))
    console.log('=== NIGHTNOTE_FORENSICS_END ===')

    const totalTime = Date.now() - startTotal
    notifyAIToast(`Generated ${sorted.length} tasks in ${Math.round(totalTime/1000)}s`, 'success')
    return sorted
  } catch (error: any) {
    console.warn('Lite V2 Pipeline Error:', error)
    notifyAIToast(`AI fallback active: ${error.message || 'Error'}`, 'warning')
    return generateLocalTasks(thought)
  }
}

/**
 * Smart Trim Logic
 */
export async function smartTrim(tasks: TaskItem[]): Promise<TaskItem[]> {
  if (!tasks || tasks.length === 0) return []
  return localSmartTrim(tasks)
}

export function localSmartTrim(tasks: TaskItem[]): TaskItem[] {
  if (!tasks || tasks.length === 0) return []

  const highMed = tasks.filter((t) => t.priority === 'high' || t.priority === 'medium')
  const lowTasks = tasks.filter((t) => t.priority === 'low')

  let result: TaskItem[] = []
  if (lowTasks.length > 0 && tasks.length > 3) {
    const combinedText = `Consolidated: ${lowTasks.map((t) => t.text).join(', ')}`
    const consolidatedTask: TaskItem = {
      id: `trimmed-${Date.now()}`,
      text: combinedText.length > 70 ? combinedText.slice(0, 67) + '...' : combinedText,
      priority: 'low',
      duration: '15m',
      done: false,
      description: 'Optimized into single 15m catchup block',
      category: 'OTHER'
    }
    result = [...highMed, consolidatedTask]
  } else {
    result = tasks.map((t) => ({
      ...t,
      duration: t.duration === '1h' ? '30m' : t.duration === '45m' ? '25m' : '15m',
      description: 'Trimmed to lean sprint duration',
    }))
  }

  return sortTasksByPriority(result)
}

export async function generateWeeklySummary(statsData: any): Promise<string> {
  const streak = statsData?.streak ?? 0
  const notes = statsData?.notes ?? 0
  const tasksDone = statsData?.tasksDone ?? 0
  const deepFocus = statsData?.deepFocus ?? 0

  if (tasksDone > 0) {
    const focusStr = deepFocus > 0 ? ` Deep focus score is at ${deepFocus}%.` : ''
    const streakStr = streak > 0 ? ` Maintaining a ${streak}-day streak.` : ''
    return `You completed ${tasksDone} total tasks across ${notes} night notes.${focusStr}${streakStr}`
  }

  return 'Complete your first night note to start building insights.'
}
