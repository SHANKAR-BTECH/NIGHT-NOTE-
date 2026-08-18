import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-custom-llm-key, x-custom-llm-endpoint',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// In-memory sliding rate limit tracker (max 20 requests/min per user identifier)
const rateTracker = new Map<string, number[]>()

function isRateLimited(identifier: string): boolean {
  const now = Date.now()
  const windowMs = 60 * 1000 // 1 minute
  const maxRequests = 20

  const userLogs = rateTracker.get(identifier) || []
  const recentLogs = userLogs.filter((time) => now - time < windowMs)

  if (recentLogs.length >= maxRequests) {
    return true
  }

  recentLogs.push(now)
  rateTracker.set(identifier, recentLogs)
  return false
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed. Must use POST.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // 1. Rate Limit Check
    const authHeader = req.headers.get('Authorization') || 'anonymous'
    if (isRateLimited(authHeader)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded (max 20 requests per minute).' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Validate Request Body
    let body: any
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON request body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const thought = body?.thought || body?.text || ''
    if (!thought || typeof thought !== 'string' || !thought.trim()) {
      return new Response(
        JSON.stringify({ error: 'Thought is required and cannot be empty' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Environment Secret & Custom LLM Engine Configuration Check
    const customHeaderKey = req.headers.get('x-custom-llm-key')
    const apiKey =
      (customHeaderKey && customHeaderKey.trim()) ||
      Deno.env.get('CUSTOM_LLM_API_KEY') ||
      Deno.env.get('NIGHTNOTE_API_KEY_FRIEND') ||
      ''

    const customHeaderEndpoint = req.headers.get('x-custom-llm-endpoint')
    const customEndpoint =
      (customHeaderEndpoint && customHeaderEndpoint.trim()) ||
      Deno.env.get('CUSTOM_LLM_ENDPOINT') ||
      ''

    if (!apiKey) {
      console.warn(
        `[NightNote Edge Function] Method: POST, Endpoint: ${customEndpoint}, Status: 500, KeyExists: false, TaskCount: 0, ResponseStatus: MISSING_SERVER_KEY`
      )
      return new Response(
        JSON.stringify({ error: 'AI not configured on server (CUSTOM_LLM_API_KEY missing)' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Invoke NightNote Custom LLM /v1/extract
    const response = await fetch(customEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: thought.trim(),
      }),
    })

    const httpStatus = response.status
    let data: any = null
    try {
      data = await response.json()
    } catch {
      data = null
    }

    const taskCount = Array.isArray(data?.tasks) ? data.tasks.length : 0
    const metaStatus = data?.meta?.status || (httpStatus === 200 ? 'SUCCESS' : `HTTP_${httpStatus}`)

    // SAFE DIAGNOSTICS LOGGING (strictly no secrets, no auth headers logged)
    console.log(
      `[NightNote Edge Function] Method: POST, Endpoint: ${customEndpoint}, Status: ${httpStatus}, KeyExists: ${Boolean(apiKey)}, TaskCount: ${taskCount}, ResponseStatus: ${metaStatus}`
    )

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: data?.detail || `Custom LLM API responded with status ${httpStatus}`,
        }),
        { status: httpStatus, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Parse & Validate NightNote Task Array
    const rawTasks = Array.isArray(data?.tasks) ? data.tasks : []
    const tasks = rawTasks.map((t: any) => {
      const rawPriority = String(t.priority || 'medium').toLowerCase().trim()
      const priority: 'high' | 'medium' | 'low' =
        rawPriority === 'high' ? 'high' : rawPriority === 'low' ? 'low' : 'medium'

      const defaultUrgency = priority === 'high' ? 0.85 : priority === 'low' ? 0.2 : 0.5
      const defaultImportance = priority === 'high' ? 0.85 : priority === 'low' ? 0.2 : 0.5

      const text = String(t.title || t.text || 'Action item').trim()
      const category = String(t.category || 'OTHER').toUpperCase().trim()
      const duration = ['15m', '30m', '45m', '1h'].includes(t.duration) ? t.duration : (priority === 'high' ? '30m' : '30m')
      const deadline = t.deadline || null
      const description = String(t.description || (category ? `Category: ${category}${deadline ? ` · Due: ${deadline}` : ''}` : ''))

      return {
        text,
        category,
        priority,
        deadline,
        ai_urgency: typeof t.urgency === 'number' ? Math.min(1, Math.max(0, t.urgency)) : defaultUrgency,
        ai_importance: typeof t.importance === 'number' ? Math.min(1, Math.max(0, t.importance)) : defaultImportance,
        duration,
        description,
      }
    })

    return new Response(JSON.stringify({ tasks, meta: data?.meta || { status: 'SUCCESS', task_count: tasks.length } }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error(`[NightNote Edge Function] Error: ${err?.message || err}`)
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

