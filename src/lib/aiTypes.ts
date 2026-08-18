export interface AITask {
  text: string
  category: string // EDUCATION|FITNESS|RELATIONSHIP|WORK|PERSONAL|HEALTH|FINANCE|CREATIVE|SOCIAL|OTHER
  priority: 'high' | 'medium' | 'low'
  ai_urgency: number // 0.0..1.0
  ai_importance: number // 0.0..1.0
  duration: string // '15m' | '30m' | '45m' | '1h'
  description: string
}

export interface AIResponse {
  tasks: AITask[]
}

export interface AIProvider {
  generateTasks(rawThought: string): Promise<AIResponse>
}
