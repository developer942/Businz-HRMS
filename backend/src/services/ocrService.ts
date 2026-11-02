import { ExtractedCardDetails } from '../types/customer.js';
import { getEffectiveKey, getEffectiveOcrModel } from '../controllers/aiController.js';
import { validateExtractedCardData } from '../utils/cardValidator.js';

type GeminiAttemptError = Error & { status?: number; type?: string };

// Lean, schema-constrained extraction request: ~3x fewer output tokens than the old free-form JSON,
// which is what makes the scan fast, while "read character by character" keeps small print accurate.
const EXTRACTION_PROMPT = `Read this visiting card carefully, character by character, and extract the contact details.
Rules:
- Use only text that is visible on the card. Never guess, invent or "fix" characters. Copy digits and e-mail characters exactly.
- The card may be rotated, tilted, photographed on a table or have glare: read it in its correct orientation.
- Ignore logos, icons, slogans, certifications (ISO, Govt Regd, "Quality First") and decorative text.
- Keep person name, designation, company and address in separate fields. Keep Indian initials (e.g. "S. Sangeetha") and original capitalisation.
- phone_numbers: every phone/mobile/WhatsApp/landline number exactly as printed, mobile numbers first, one entry per number, never merged.
- emails: every e-mail address. website: the website as printed.
- address: the full postal address on one line (door/plot, street, area, city, pincode, state).
- If a field is missing or unreadable use null (or an empty array). If the card has two sides or several people, use the main cardholder.
- raw_text: all printed text on the card, one printed line per line.`;

const EXTRACTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    person_name: { type: 'STRING', nullable: true },
    designation: { type: 'STRING', nullable: true },
    company_name: { type: 'STRING', nullable: true },
    phone_numbers: { type: 'ARRAY', items: { type: 'STRING' } },
    emails: { type: 'ARRAY', items: { type: 'STRING' } },
    website: { type: 'STRING', nullable: true },
    address: { type: 'STRING', nullable: true },
    raw_text: { type: 'STRING' }
  },
  required: ['person_name', 'designation', 'company_name', 'phone_numbers', 'emails', 'website', 'address', 'raw_text']
};

const PER_ATTEMPT_TIMEOUT_MS = 20000;
const HEDGE_AFTER_MS = 5000;

export class OcrService {
  private extractPhoneNumbers(text: string): { primary: string; alternate?: string } {
    const phoneRegex = /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}|[6-9]\d{9}|0[6-9]\d{9}/g;
    const matches = text.match(phoneRegex) || [];
    const cleanNumbers = Array.from(new Set(matches.map(m => m.replace(/[\s-]/g, ''))));

    return {
      primary: cleanNumbers[0] || '',
      alternate: cleanNumbers[1] || ''
    };
  }

  private extractEmail(text: string): string {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const match = text.match(emailRegex);
    return match ? match[0].toLowerCase() : '';
  }

  private extractWebsite(text: string): string {
    const webRegex = /(?:https?:\/\/)?(?:www\.)[a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+(?:\/[^\s]*)?/i;
    const match = text.match(webRegex);
    return match && !match[0].includes('@') ? match[0] : '';
  }

  /** Single Gemini vision call. Throws a classified error on failure. */
  private async callGemini(
    modelName: string,
    apiKey: string,
    mimeType: string,
    base64: string,
    signal: AbortSignal
  ): Promise<any> {
    const buildBody = (highRes: boolean) => JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: EXTRACTION_PROMPT }
        ]
      }],
      generationConfig: {
        // NOTE: temperature/top_p/top_k are deprecated for Gemini 3.5+ models, so they are intentionally omitted.
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        responseSchema: EXTRACTION_SCHEMA,
        ...(highRes ? { mediaResolution: 'MEDIA_RESOLUTION_HIGH' } : {})
      }
    });

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`;
    const post = (highRes: boolean) => fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: buildBody(highRes),
      signal
    });

    let res = await post(true);
    if (res.status === 400) {
      // Some model aliases reject optional tuning fields: retry once with the bare request.
      const probe: any = await res.clone().json().catch(() => ({}));
      if (/media_?resolution/i.test(probe?.error?.message || '')) res = await post(false);
    }

    if (!res.ok) {
      const errJson: any = await res.json().catch(() => ({}));
      const errMsg: string = errJson?.error?.message || `HTTP ${res.status}`;
      let type = 'general_error';
      if (res.status === 401 || res.status === 403 || errMsg.includes('API key')) type = 'auth_failure';
      else if (res.status === 429 || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED')) type = 'quota_exceeded';
      else if (res.status === 404 || errMsg.includes('not found')) type = 'unsupported_model';
      else if (res.status === 400) type = 'invalid_image';
      const error: GeminiAttemptError = new Error(errMsg);
      error.status = res.status;
      error.type = type;
      throw error;
    }

    const geminiData: any = await res.json();
    const parts: any[] = geminiData.candidates?.[0]?.content?.parts || [];
    // Join every non-thought text part (thinking models may emit a thought part first)
    const rawCandidate = parts.filter(p => !p.thought).map(p => p.text || '').join('').trim();
    if (!rawCandidate) {
      const error: GeminiAttemptError = new Error('Empty response candidate');
      error.type = 'extraction_failure';
      throw error;
    }

    const cleanedJson = rawCandidate.replace(/```json/gi, '').replace(/```/g, '').trim();
    try {
      return JSON.parse(cleanedJson);
    } catch {
      const jsonMatch = cleanedJson.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        const error: GeminiAttemptError = new Error('Could not parse structured JSON from vision model');
        error.type = 'extraction_failure';
        throw error;
      }
      return JSON.parse(jsonMatch[0]);
    }
  }

  /**
   * Starts the preferred model immediately; if it has not answered after HEDGE_AFTER_MS (or it fails),
   * the next candidate is started in parallel. The first successful answer wins, so a slow/overloaded
   * model never makes the user wait for sequential time-outs.
   */
  private runHedged(
    models: string[],
    run: (model: string, signal: AbortSignal) => Promise<any>
  ): Promise<{ parsed: any; model: string }> {
    return new Promise((resolve, reject) => {
      const controllers: AbortController[] = [];
      const errors: { model: string; status?: number; message: string; type: string }[] = [];
      let started = 0;
      let finished = 0;
      let done = false;
      let hedgeTimer: ReturnType<typeof setTimeout> | undefined;

      const startNext = () => {
        if (done || started >= models.length) return;
        const model = models[started++];
        const controller = new AbortController();
        controllers.push(controller);
        const killTimer = setTimeout(() => controller.abort(), PER_ATTEMPT_TIMEOUT_MS);

        run(model, controller.signal)
          .then(parsed => {
            clearTimeout(killTimer);
            if (done) return;
            done = true;
            if (hedgeTimer) clearTimeout(hedgeTimer);
            controllers.forEach(c => c.abort());
            resolve({ parsed, model });
          })
          .catch((err: GeminiAttemptError) => {
            clearTimeout(killTimer);
            finished++;
            if (done) return;
            errors.push({
              model,
              status: err.status,
              message: err.name === 'AbortError' ? 'Timed out' : (err.message || 'Unknown error'),
              type: err.type || (err.name === 'AbortError' ? 'timeout' : 'exception')
            });
            console.warn(`[OCR Gemini] Model ${model} failed (${errors[errors.length - 1].type}): ${errors[errors.length - 1].message}`);
            if (started < models.length) {
              startNext();
            } else if (finished >= started) {
              done = true;
              if (hedgeTimer) clearTimeout(hedgeTimer);
              reject(errors);
            }
          });

        if (started < models.length) {
          if (hedgeTimer) clearTimeout(hedgeTimer);
          hedgeTimer = setTimeout(startNext, HEDGE_AFTER_MS);
        }
      };

      startNext();
    });
  }

  /**
   * Visiting Card OCR Extraction:
   * Gemini multimodal vision with schema-constrained JSON, hedged model fallback, deterministic
   * regex back-fill for phones/e-mails/website and strict field validation.
   */
  async extractCardDetails(
    imageBase64: string,
    mimeType: string = 'image/jpeg',
    apiKey?: string,
    requestedOcrModel?: string
  ): Promise<ExtractedCardDetails> {
    const cleanKey = getEffectiveKey(apiKey);
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9.+]+;base64,/i, '');
    const cleanMime = mimeType || 'image/jpeg';

    if (cleanKey) {
      const preferredModel = requestedOcrModel || getEffectiveOcrModel() || 'gemini-3.5-flash-lite';
      // gemini-2.5/2.0/1.5 are retired for this key; the fast, accurate default is 3.5 Flash-Lite.
      const retired = new Set(['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.5-pro']);
      const candidateModels = Array.from(new Set([
        retired.has(preferredModel) ? 'gemini-3.5-flash-lite' : preferredModel,
        'gemini-3.5-flash-lite',
        'gemini-flash-lite-latest'
      ])).filter(Boolean);

      try {
        const { parsed, model } = await this.runHedged(
          candidateModels,
          (m, signal) => this.callGemini(m, cleanKey, cleanMime, cleanBase64, signal)
        );

        const rawText: string = String(parsed.raw_text || '');
        const textLines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

        // Deterministic back-fill: if the model left a contact field empty but the text clearly contains it
        let phones: string[] = Array.isArray(parsed.phone_numbers) ? parsed.phone_numbers.filter(Boolean) : [];
        if (phones.length === 0 && rawText) {
          const found = this.extractPhoneNumbers(rawText);
          phones = [found.primary, found.alternate].filter(Boolean) as string[];
        }
        let emails: string[] = Array.isArray(parsed.emails) ? parsed.emails.filter(Boolean) : [];
        if (emails.length === 0 && rawText) {
          const found = this.extractEmail(rawText);
          if (found) emails = [found];
        }
        const website: string | null = parsed.website || (rawText ? this.extractWebsite(rawText) : '') || null;

        const validated = validateExtractedCardData({
          person_name: parsed.person_name || null,
          customerName: parsed.person_name || null,
          company_name: parsed.company_name || null,
          companyName: parsed.company_name || null,
          designation: parsed.designation || null,
          phone_numbers: phones,
          contactNumber: phones[0] || null,
          alternateContactNumber: phones[1] || null,
          emails,
          email: emails[0] || null,
          website,
          address: parsed.address || null,
          raw_text: rawText,
          review_required_fields: [],
          // Evidence defaults to the extracted value itself; the validator marks anything doubtful for review
          evidence: {},
          visibleTextBlocks: textLines
        }, 'gemini');
        validated.modelUsed = model;
        return validated;
      } catch (errs: any) {
        const errors: { model: string; type: string; message: string }[] = Array.isArray(errs) ? errs : [{ model: 'unknown', type: 'exception', message: errs?.message || 'Unknown error' }];
        const primaryErr = errors[0];
        const errorSummary = primaryErr
          ? `${primaryErr.type.toUpperCase()}: ${primaryErr.message}`
          : 'All AI models unavailable';
        console.warn('[OCR Gemini] All candidate models failed:', errors.map(e => `${e.model} (${e.type})`).join(' | '));

        return validateExtractedCardData({
          customerName: null,
          companyName: null,
          designation: null,
          contactNumber: null,
          alternateContactNumber: null,
          email: null,
          website: null,
          address: null,
          notes: `AI scan unavailable (${errorSummary}). Please enter or review fields manually.`
        }, 'rule_based');
      }
    }

    // Rule-based Fallback if no key configured
    return validateExtractedCardData({
      customerName: null,
      companyName: null,
      designation: null,
      contactNumber: null,
      alternateContactNumber: null,
      email: null,
      website: null,
      address: null,
      notes: 'No Gemini key found. Please configure Gemini API key in Settings -> Integrations.'
    }, 'rule_based');
  }
}

export const ocrService = new OcrService();
