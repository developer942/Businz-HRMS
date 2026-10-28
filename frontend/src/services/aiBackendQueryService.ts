import { API_BASE_URL } from '../config/api';
import { CanonicalIntent, ExtractedEntities, RichPayload } from '../types/aiAssistant';

const authToken = () => sessionStorage.getItem('vrm_auth_token') || localStorage.getItem('vrm_auth_token') || localStorage.getItem('token');

export interface VerifiedQueryResult {
  responseText: string;
  payload: RichPayload;
  verifiedFacts: string;
  source: 'postgresql';
  timings?: { totalMs?: number; networkRoundTripMs?: number };
}

export async function executeVerifiedHRMSQuery(intent: CanonicalIntent, entities: ExtractedEntities,
  options: { search?: string; page?: number; pageSize?: number } = {}): Promise<VerifiedQueryResult> {
  const requestStarted = performance.now();
  const token = authToken();
  const response = await fetch(`${API_BASE_URL}/ai/query`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ intent, entities, search: options.search, page: options.page || 1, pageSize: options.pageSize || 10 }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) {
    const error: any = new Error(body.error?.message || "I couldn't verify this information from the HRMS database.");
    error.code = body.error?.code; error.status = response.status; throw error;
  }
  return { responseText: body.data.text, payload: body.data.payload || { type: 'none' },
    verifiedFacts: body.data.verifiedFacts, source: body.data.source,
    timings: { ...body.data.timings, networkRoundTripMs: Math.round(performance.now() - requestStarted) } };
}
