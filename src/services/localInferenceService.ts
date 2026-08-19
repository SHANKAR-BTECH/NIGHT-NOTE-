import NightNoteLocalAI, { ModelStatus } from '../plugins/nightnoteLocalAI';
import { notifyAIToast, isValidTaskText } from './customLLMService';
import { MODEL_CONFIG } from '../config/modelConfig';

// High-precision prompt tuned for SmolLM2-135M Lite V2: meaning-preserving, structured JSON
const SYSTEM_PROMPT = `NightNote AI: Extract actionable tasks into JSON.
Preserve user's exact wording, nouns, and intent. Never invent or rewrite tasks. Do not output past completed actions or non-actionable chatter.
Format: {"tasks":[{"title":"exact task","category":"EDUCATION|WORK|HEALTH|ERRANDS|RELATIONSHIP|FITNESS|ENTERTAINMENT|OTHER","deadline":"time or null","urgency":0.0-1.0,"importance":0.0-1.0}]}`;

export async function getLocalModelStatus() {
  try {
    return await NightNoteLocalAI.getStatus();
  } catch (err) {
    console.error('Failed to get model status:', err);
    return { status: ModelStatus.ERROR, message: 'Status check failed' };
  }
}

export async function initializeLocalModel() {
  try {
    let { status } = await getLocalModelStatus();

    if (status === ModelStatus.LOADED) return true;

    if (status === ModelStatus.NOT_INSTALLED) {
      notifyAIToast('Extracting bundled local AI model...', 'info');
      await NightNoteLocalAI.extractBundledModel();
      const updated = await getLocalModelStatus();
      status = updated.status;
    }

    if (status === ModelStatus.READY) {
      notifyAIToast('Loading local NightNote Lite model...', 'info');
      const { success } = await NightNoteLocalAI.loadModel({ path: MODEL_CONFIG.INTERNAL_PATH });
      if (success) {
        notifyAIToast('Local NightNote model ready.', 'success');
      }
      return success;
    }

    return false;
  } catch (err) {
    console.error('Failed to initialize local model:', err);
    return false;
  }
}

export async function startModelDownload() {
  try {
    await NightNoteLocalAI.downloadModel({
      url: MODEL_CONFIG.DOWNLOAD_URL,
      path: MODEL_CONFIG.INTERNAL_PATH,
      sha256: MODEL_CONFIG.SHA256
    });
  } catch (err) {
    console.error('Failed to start model download:', err);
    throw err;
  }
}

/**
 * Resilient JSON parsing helper for LLM output.
 * Handles code blocks, unclosed root objects, array vs object schemas, and regex fallback.
 */
export function parseModelJSONOutput(raw: string): { tasks: any[] } {
  if (!raw || !raw.trim()) return { tasks: [] };

  // Strip markdown code fences
  let clean = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

  // Try direct parsing
  try {
    const jsonStart = clean.indexOf('{');
    const jsonEnd = clean.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd >= jsonStart) {
      const candidate = clean.substring(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(candidate);
      if (parsed && Array.isArray(parsed.tasks)) {
        return { tasks: parsed.tasks.filter((t: any) => t && isValidTaskText(t.title || t.text)) };
      }
      if (parsed && (parsed.title || parsed.text) && isValidTaskText(parsed.title || parsed.text)) {
        return { tasks: [parsed] };
      }
    }
  } catch (e) {
    // Continue to next strategies
  }

  // Try array parsing
  try {
    const arrStart = clean.indexOf('[');
    const arrEnd = clean.lastIndexOf(']');
    if (arrStart !== -1 && arrEnd !== -1 && arrEnd >= arrStart) {
      const candidate = clean.substring(arrStart, arrEnd + 1);
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) {
        return { tasks: parsed.filter((t: any) => t && isValidTaskText(t.title || t.text)) };
      }
    }
  } catch (e) {
    // Continue to next strategies
  }

  // Regex fallback: Extract individual task JSON objects even if enclosing structure is truncated
  const objectRegex = /\{[^{}]*"(?:title|text)"\s*:\s*"([^"]+)"[^{}]*\}/g;
  const extracted: any[] = [];
  let match;
  while ((match = objectRegex.exec(clean)) !== null) {
    try {
      const obj = JSON.parse(match[0]);
      if (isValidTaskText(obj.title || obj.text)) {
        extracted.push(obj);
      }
    } catch (err) {
      // Manual field recovery
      const titleMatch = match[0].match(/"(?:title|text)"\s*:\s*"([^"]+)"/);
      const catMatch = match[0].match(/"category"\s*:\s*"([^"]+)"/);
      const dlMatch = match[0].match(/"deadline"\s*:\s*"([^"]+)"/);
      if (titleMatch && isValidTaskText(titleMatch[1])) {
        extracted.push({
          title: titleMatch[1],
          category: catMatch ? catMatch[1] : 'OTHER',
          deadline: dlMatch ? dlMatch[1] : null
        });
      }
    }
  }

  return { tasks: extracted };
}

export async function generateLocalInference(thought: string): Promise<any> {
  const prompt = `<|im_start|>system\n${SYSTEM_PROMPT}<|im_end|>\n<|im_start|>user\n${thought}<|im_end|>\n<|im_start|>assistant\n`;

  try {
    const { result } = await NightNoteLocalAI.generate({ prompt });
    console.log('RAW_LLM_OUTPUT:', result);

    const parsed = parseModelJSONOutput(result || '');
    return parsed;
  } catch (err) {
    console.error('Local inference failed:', err);
    throw err;
  }
}
