import { AIMessage } from '../types/aiAssistant';
import { API_BASE_URL } from '../config/api';

const STORAGE_KEY_API = 'VRM_GEMINI_API_KEY';
const STORAGE_KEY_MODEL = 'VRM_GEMINI_MODEL';
const STORAGE_KEY_OCR_MODEL = 'VRM_GEMINI_OCR_MODEL';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GEMINI_OCR_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GEMINI_API_KEY = '';

export interface GeminiModelInfo { name: string; displayName: string; description: string; supportedGenerationMethods: string[]; isVisionCapable?: boolean }

const token = () => sessionStorage.getItem('vrm_auth_token') || localStorage.getItem('vrm_auth_token') || localStorage.getItem('token');
const headers = () => ({ 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) });
export const cleanApiKey = (key: string) => (key || '').trim().replace(/^['"]|['"]$/g, '').replace(/^Bearer\s+/i, '').trim();

// API keys are deliberately never returned from or persisted in browser storage.
export function getStoredGeminiApiKey(): string {
  if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY_API);
  return '';
}
export function setStoredGeminiApiKey(_key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY_API);
  try {
    const raw = localStorage.getItem('vrm_enterprise_integrations_v6');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.gemini_ai) parsed.gemini_ai.apiKey = '';
      localStorage.setItem('vrm_enterprise_integrations_v6', JSON.stringify(parsed));
    }
  } catch { /* legacy store cleanup only */ }
}
export function getStoredGeminiModel(): string { return localStorage.getItem(STORAGE_KEY_MODEL) || DEFAULT_GEMINI_MODEL; }
export function setStoredGeminiModel(model: string): void { localStorage.setItem(STORAGE_KEY_MODEL, model || DEFAULT_GEMINI_MODEL); }
export function getStoredGeminiOcrModel(): string { return localStorage.getItem(STORAGE_KEY_OCR_MODEL) || DEFAULT_GEMINI_OCR_MODEL; }
export function setStoredGeminiOcrModel(model: string): void { localStorage.setItem(STORAGE_KEY_OCR_MODEL, model || DEFAULT_GEMINI_OCR_MODEL); }

const responseJson = async (response: Response) => {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) throw new Error(body.error?.message || `Request failed with HTTP ${response.status}`);
  return body.data;
};

export async function listGeminiModels(apiKey = ''): Promise<GeminiModelInfo[]> {
  const data = await responseJson(await fetch(`${API_BASE_URL}/ai/models`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ ...(cleanApiKey(apiKey) ? { apiKey: cleanApiKey(apiKey) } : {}) }),
  }));
  return data.models || [];
}

export async function syncApiKeyToBackend(apiKey: string, model: string, ocrModel?: string): Promise<void> {
  await responseJson(await fetch(`${API_BASE_URL}/ai/config`, { method: 'POST', headers: headers(), body: JSON.stringify({
    ...(cleanApiKey(apiKey) ? { apiKey: cleanApiKey(apiKey) } : {}), model, ocrModel: ocrModel || getStoredGeminiOcrModel(),
  }) }));
  setStoredGeminiApiKey(''); setStoredGeminiModel(model); setStoredGeminiOcrModel(ocrModel || getStoredGeminiOcrModel());
}

export async function checkAiServerStatus(): Promise<{ isConfigured: boolean; model: string; ocrModel?: string }> {
  const data = await responseJson(await fetch(`${API_BASE_URL}/ai/status`, { headers: headers() }));
  if (data.model) setStoredGeminiModel(data.model);
  if (data.ocrModel) setStoredGeminiOcrModel(data.ocrModel);
  return { isConfigured: Boolean(data.isConfigured), model: data.model || DEFAULT_GEMINI_MODEL, ocrModel: data.ocrModel };
}

export async function validateGeminiKey(apiKey: string): Promise<boolean> {
  try { return (await listGeminiModels(apiKey)).length > 0; } catch { return false; }
}

export async function callGeminiGenerateContent(
  userPrompt: string,
  hrmsContext: { verifiedFacts?: string; [key: string]: any },
  userLanguageHint: string,
  chatHistory: AIMessage[],
  _overrideKey?: string,
  _overrideModel?: string
): Promise<{ text: string; intent?: string; modelUsed: string }> {
  const history = (chatHistory || []).filter(message => message.text?.trim()).slice(-4).map(message => ({
    role: message.sender === 'user' ? 'user' as const : 'model' as const, text: message.text,
  }));
  const data = await responseJson(await fetch(`${API_BASE_URL}/ai/generate`, { method: 'POST', headers: headers(), body: JSON.stringify({
    prompt: userPrompt, verifiedFacts: hrmsContext.verifiedFacts || '', language: userLanguageHint, history,
  }) }));
  return { text: data.text, modelUsed: data.modelUsed };
}
