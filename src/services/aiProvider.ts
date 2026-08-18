import { AIProvider, AIResponse, AITask } from '../lib/aiTypes'
import { generateMission, generateLocalTasks, TaskItem } from './customLLMService'

/**
 * LocalNightNoteProvider: Local-first AI provider using on-device SmolLM2 Lite V2 GGUF inference.
 */
export class LocalNightNoteProvider implements AIProvider {
  async generateTasks(rawThought: string): Promise<AIResponse> {
    const tasks = await generateMission(rawThought)
    const aiTasks: AITask[] = tasks.map((t) => ({
      text: t.text,
      category: t.category || 'OTHER',
      priority: t.priority,
      ai_urgency: t.urgency ?? (t.priority === 'high' ? 0.8 : t.priority === 'medium' ? 0.5 : 0.2),
      ai_importance: t.importance ?? (t.priority === 'high' ? 0.8 : t.priority === 'medium' ? 0.5 : 0.2),
      duration: t.duration || '30m',
      description: t.description || '',
    }))

    return {
      tasks: aiTasks,
    }
  }
}

/**
 * Factory function for selecting the active AI provider (Local Lite V2 Engine).
 */
export function getAIProvider(): AIProvider {
  return new LocalNightNoteProvider()
}

/**
 * Convenience helper to generate tasks via local provider with rule fallback.
 */
export async function generateMissionViaProvider(thought: string): Promise<AITask[]> {
  try {
    const provider = getAIProvider()
    const response = await provider.generateTasks(thought)
    return response.tasks
  } catch (err: any) {
    console.warn('[aiProvider] Local Provider call failed, triggering rule fallback:', err?.message || err)
    
    // Offline local fallback
    const localItems: TaskItem[] = generateLocalTasks(thought)

    return localItems.map((item) => {
      const urgency = item.priority === 'high' ? 0.8 : item.priority === 'medium' ? 0.5 : 0.2
      return {
        text: item.text,
        category: 'OTHER',
        priority: item.priority,
        ai_urgency: urgency,
        ai_importance: urgency,
        duration: item.duration || '30m',
        description: item.description || '',
      }
    })
  }
}
