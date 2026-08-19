import { WebPlugin } from '@capacitor/core';
import { ModelStatus, ModelStatusResult, NightNoteLocalAIPlugin } from './nightnoteLocalAI';
import { splitCompoundActions, isValidTaskText } from '../services/customLLMService';

function extractTasksFromText(text: string): Array<{
  title: string;
  category: string;
  deadline: string | null;
  urgency: number;
  importance: number;
}> {
  if (!text || !text.trim()) return [];

  const rawSegments = splitCompoundActions(text).filter(s => isValidTaskText(s));

  const tasks: Array<{
    title: string;
    category: string;
    deadline: string | null;
    urgency: number;
    importance: number;
  }> = [];

  for (let seg of rawSegments) {
    seg = seg.replace(/^[-–—:,.\s]+/, '').trim();
    if (!seg || !isValidTaskText(seg)) continue;

    // Extract deadline/time if mentioned
    let deadline: string | null = null;
    const timeMatch = seg.match(/\b(at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|by\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|tomorrow\s+morning|tomorrow\s+afternoon|tomorrow\s+evening|tomorrow\s+night|before\s+[\w\s]+|in\s+the\s+morning)\b/i);
    if (timeMatch) {
      deadline = timeMatch[0];
    }

    // Determine category
    const lower = seg.toLowerCase();
    let category = 'OTHER';
    if (/email|client|meeting|report|presentation|board|project|code|bug|doc|contract|pitch|deck|review|office|invoice|interview/.test(lower)) {
      category = 'WORK';
    } else if (/doctor|dentist|pill|medicine|medication|therapy|checkup|vitamins|health|clinic/.test(lower)) {
      category = 'HEALTH';
    } else if (/gym|workout|run|jog|pushup|yoga|walk|exercise|fitness|stretch/.test(lower)) {
      category = 'FITNESS';
    } else if (/read|study|book|chapter|homework|course|learn|lecture|exam|assignment|dbms/.test(lower)) {
      category = 'EDUCATION';
    } else if (/grocery|groceries|laundry|clean|dishes|trash|buy|milk|store|errand|car|repair|wash|bill|pay|rent/.test(lower)) {
      category = 'ERRANDS';
    } else if (/call|mom|dad|sister|brother|parents|friend|family|dinner with|lunch with|birthday|meet/.test(lower)) {
      category = 'RELATIONSHIP';
    } else if (/movie|game|play|show|concert|music/.test(lower)) {
      category = 'ENTERTAINMENT';
    }

    // Normalize task title
    let title = seg;
    title = title.replace(/^(i\s+need\s+to|i\s+have\s+to|i\s+must|need\s+to|remember\s+to|don't\s+forget\s+to|i\s+want\s+to)\s+/i, '');
    title = title.charAt(0).toUpperCase() + title.slice(1);

    tasks.push({
      title,
      category,
      deadline,
      urgency: /urgent|asap|important|must|first thing/i.test(seg) ? 0.9 : 0.6,
      importance: /presentation|board|doctor|exam|client|tax|deadline/i.test(seg) ? 0.9 : 0.7
    });
  }

  return tasks;
}

export class NightNoteLocalAIWeb extends WebPlugin implements NightNoteLocalAIPlugin {
  private isLoaded = true;

  async getStatus(): Promise<ModelStatusResult> {
    return {
      status: ModelStatus.READY,
      progress: 100,
      message: 'Local SLM engine ready'
    };
  }

  async extractBundledModel(): Promise<{ success?: boolean; path?: string }> {
    return {
      success: true,
      path: '/assets/models/nightnote-lite-smollm2-135m-v2-q5_k_m.gguf'
    };
  }

  async downloadModel(): Promise<void> {
    this.notifyListeners('modelDownloadProgress', { progress: 100 });
    this.notifyListeners('modelStatusChanged', {
      status: ModelStatus.READY,
      progress: 100,
      message: 'Model ready'
    });
  }

  async cancelDownload(): Promise<void> {}
  async removeModel(): Promise<void> {}

  async loadModel(): Promise<{ success: boolean }> {
    this.isLoaded = true;
    this.notifyListeners('modelStatusChanged', {
      status: ModelStatus.LOADED,
      progress: 100,
      message: 'Model loaded in memory'
    });
    return { success: true };
  }

  async isModelLoaded(): Promise<{ loaded: boolean }> {
    return { loaded: this.isLoaded };
  }

  async generate(options: { prompt: string }): Promise<{ result: string }> {
    const prompt = options.prompt || '';
    let thought = prompt;
    const userMatch = prompt.match(/<\|im_start\|>user\n([\s\S]*?)<\|im_end\|>/);
    if (userMatch) {
      thought = userMatch[1].trim();
    }

    const tasks = extractTasksFromText(thought);
    return {
      result: JSON.stringify({ tasks })
    };
  }

  async releaseModel(): Promise<void> {
    this.isLoaded = false;
  }
}
