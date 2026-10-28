import { z } from 'zod';
import { query } from '../config/database.js';
import { encryptCredential, decryptCredential } from '../utils/crypto.js';
import { hrmsDataService } from '../services/hrmsDataService.js';
import { rbacRepository } from '../repositories/rbacRepository.js';
const CONFIG_PREFIX = 'gemini_ai_config:';
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const DEFAULT_OCR_MODEL = process.env.GEMINI_OCR_MODEL || 'gemini-2.5-flash';
let runtimeKey = (process.env.GEMINI_API_KEY || '').trim();
let runtimeModel = DEFAULT_MODEL;
let runtimeOcrModel = DEFAULT_OCR_MODEL;
const configCache = new Map();
const cleanKey = (value) => (value || '').trim().replace(/^['"]|['"]$/g, '').replace(/^Bearer\s+/i, '').trim();
const configKey = (companyId) => `${CONFIG_PREFIX}${companyId}`;
const companyIdFor = (req) => req.user?.company_id || req.user?.companyId || '';
const loadConfig = async (companyId) => {
    const cached = configCache.get(companyId);
    if (cached && cached.expiresAt > Date.now())
        return cached.value;
    if (companyId) {
        const result = await query(`SELECT setting_val FROM public.company_settings WHERE setting_key = $1 ORDER BY updated_at DESC LIMIT 1`, [configKey(companyId)]);
        const stored = result.rows[0]?.setting_val;
        if (stored) {
            const apiKey = decryptCredential(String(stored.encryptedApiKey || ''));
            runtimeKey = apiKey || runtimeKey;
            runtimeModel = String(stored.chatModel || DEFAULT_MODEL);
            runtimeOcrModel = String(stored.ocrModel || DEFAULT_OCR_MODEL);
            const value = { apiKey, model: runtimeModel, ocrModel: runtimeOcrModel, source: 'database' };
            configCache.set(companyId, { value, expiresAt: Date.now() + 60_000 });
            return value;
        }
    }
    const apiKey = cleanKey(process.env.GEMINI_API_KEY);
    return { apiKey, model: DEFAULT_MODEL, ocrModel: DEFAULT_OCR_MODEL, source: apiKey ? 'server_env' : 'none' };
};
export const getEffectiveKey = (requestKey) => cleanKey(requestKey) || runtimeKey;
export const getEffectiveOcrModel = () => runtimeOcrModel;
const googleModels = async (apiKey, timeoutMs = 10_000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
            headers: { 'x-goog-api-key': apiKey }, signal: controller.signal,
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok)
            throw new Error(body.error?.message || `Google Models API returned HTTP ${response.status}`);
        return (body.models || []).filter((model) => model.supportedGenerationMethods?.includes('generateContent'));
    }
    finally {
        clearTimeout(timer);
    }
};
const can = (req, module, action) => {
    if (!req.user)
        return false;
    if (req.user.role === 'Super Admin' || req.user.role === 'CEO')
        return true;
    const config = rbacRepository.getRolePermissions(req.user.role);
    return Boolean(config?.modulePermissions[module]?.includes(action));
};
const accessScope = (req) => ({
    companyId: companyIdFor(req), level: req.dataAccessScope?.level || 'own',
    employeeId: req.user?.employeeId, department: req.user?.department,
});
export const getAiStatus = async (req, res) => {
    try {
        const config = await loadConfig(companyIdFor(req));
        res.json({ success: true, data: { isConfigured: Boolean(config.apiKey), model: config.model,
                ocrModel: config.ocrModel, source: config.source } });
    }
    catch {
        res.status(503).json({ success: false, error: { code: 'AI_CONFIG_UNAVAILABLE', message: 'AI configuration could not be verified.' } });
    }
};
export const listModels = async (req, res) => {
    try {
        const stored = await loadConfig(companyIdFor(req));
        const apiKey = cleanKey(req.body?.apiKey) || stored.apiKey;
        if (!apiKey) {
            res.status(400).json({ success: false, error: { code: 'MISSING_API_KEY', message: 'A Gemini API key is required.' } });
            return;
        }
        const models = (await googleModels(apiKey)).map((model) => ({
            name: String(model.name).replace(/^models\//, ''), displayName: model.displayName || model.name,
            description: model.description || '', supportedGenerationMethods: model.supportedGenerationMethods || [],
            isVisionCapable: Array.isArray(model.inputModalities) && model.inputModalities.includes('IMAGE'),
        }));
        res.json({ success: true, data: { models, count: models.length } });
    }
    catch (error) {
        res.status(error?.name === 'AbortError' ? 504 : 400).json({ success: false,
            error: { code: error?.name === 'AbortError' ? 'GEMINI_TIMEOUT' : 'MODEL_LIST_FAILED', message: error.message || 'Unable to list Gemini models.' } });
    }
};
const configSchema = z.object({ apiKey: z.string().trim().min(10).optional(), model: z.string().trim().min(1), ocrModel: z.string().trim().min(1) });
export const saveAiConfig = async (req, res) => {
    try {
        const companyId = companyIdFor(req);
        if (!companyId)
            throw new Error('Authenticated company scope is required.');
        const input = configSchema.parse(req.body);
        const current = await loadConfig(companyId);
        const apiKey = cleanKey(input.apiKey) || current.apiKey;
        if (!apiKey)
            throw new Error('A Gemini API key is required.');
        const ids = new Set((await googleModels(apiKey)).map((model) => String(model.name).replace(/^models\//, '')));
        if (!ids.has(input.model))
            throw new Error(`Configured chatbot model "${input.model}" is not available for generateContent.`);
        if (!ids.has(input.ocrModel))
            throw new Error(`Configured OCR model "${input.ocrModel}" is not available for generateContent.`);
        const value = JSON.stringify({ encryptedApiKey: encryptCredential(apiKey), chatModel: input.model,
            ocrModel: input.ocrModel, updatedBy: req.user?.employeeId || req.user?.id, updatedAt: new Date().toISOString() });
        await query(`INSERT INTO public.company_settings (setting_key, setting_val, created_at, updated_at)
      VALUES ($1, $2::jsonb, NOW(), NOW()) ON CONFLICT (setting_key)
      DO UPDATE SET setting_val = EXCLUDED.setting_val, updated_at = NOW()`, [configKey(companyId), value]);
        runtimeKey = apiKey;
        runtimeModel = input.model;
        runtimeOcrModel = input.ocrModel;
        configCache.delete(companyId);
        res.json({ success: true, data: { hasKey: true, model: input.model, ocrModel: input.ocrModel } });
    }
    catch (error) {
        res.status(error instanceof z.ZodError ? 400 : 422).json({ success: false,
            error: { code: 'AI_CONFIG_REJECTED', message: error.message || 'AI configuration was not saved.' } });
    }
};
const generateSchema = z.object({ prompt: z.string().trim().min(1).max(8000), verifiedFacts: z.string().max(12000).optional(),
    language: z.string().max(20).optional(), history: z.array(z.object({ role: z.enum(['user', 'model']), text: z.string().max(2000) })).max(4).optional() });
export const generateAiContent = async (req, res) => {
    const started = performance.now();
    try {
        const input = generateSchema.parse(req.body);
        const config = await loadConfig(companyIdFor(req));
        if (!config.apiKey)
            throw new Error('Gemini is not configured.');
        const instruction = `You are the BUSINZ HRMS assistant. Explain only verified facts supplied by the server. Never invent employee, payroll, attendance, leave, or policy facts. If facts are unavailable, say exactly: "I couldn't verify this information from the HRMS database." Respond in ${input.language || 'the user language'}.`;
        const contents = [...(input.history || []).map(item => ({ role: item.role, parts: [{ text: item.text }] })),
            { role: 'user', parts: [{ text: `${instruction}\n\nVERIFIED FACTS:\n${input.verifiedFacts || 'No verified HRMS facts were supplied.'}\n\nQUESTION:\n${input.prompt}` }] }];
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12_000);
        let response;
        try {
            response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey }, signal: controller.signal,
                body: JSON.stringify({ contents, generationConfig: { temperature: 0.2, maxOutputTokens: 1000 } }),
            });
        }
        finally {
            clearTimeout(timer);
        }
        const body = await response.json().catch(() => ({}));
        if (!response.ok)
            throw new Error(body.error?.message || `Gemini returned HTTP ${response.status}`);
        const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
        if (!text)
            throw new Error('Gemini returned an empty response.');
        res.json({ success: true, data: { text, modelUsed: config.model, fallbackUsed: false,
                timingMs: { gemini: Math.round(performance.now() - started) } } });
    }
    catch (error) {
        const timedOut = error?.name === 'AbortError';
        res.status(timedOut ? 504 : 502).json({ success: false, error: { code: timedOut ? 'GEMINI_TIMEOUT' : 'GENERATION_FAILED',
                message: error.message || 'Gemini generation failed.', modelUsed: runtimeModel, fallbackUsed: false } });
    }
};
const querySchema = z.object({ intent: z.string().trim().min(1), entities: z.object({ employeeId: z.string().optional(),
        employeeName: z.string().optional(), department: z.string().optional(), status: z.string().optional(), resolvedDate: z.string().optional() }).passthrough().default({}),
    search: z.string().max(100).optional(), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(10) });
export const executeVerifiedHrmsQuery = async (req, res) => {
    const started = performance.now();
    try {
        const input = querySchema.parse(req.body);
        const scope = accessScope(req);
        if (!scope.companyId) {
            res.status(403).json({ success: false, error: { code: 'COMPANY_SCOPE_REQUIRED', message: 'Authenticated company scope is required.' } });
            return;
        }
        const date = input.entities.resolvedDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
        let data;
        let text = '';
        let payload = { type: 'none' };
        if (input.intent === 'GET_EMPLOYEE_COUNT') {
            if (!can(req, 'employees', 'view'))
                throw Object.assign(new Error('You are not authorized to view employee counts.'), { status: 403 });
            data = await hrmsDataService.getEmployeeCounts(scope);
            text = `Verified employee count: ${data.totalRegistered} total, ${data.activeCount} active, and ${data.inactiveCount} inactive.`;
            payload = { type: 'cards', title: 'Employee Count', metrics: [
                    { label: 'Total', value: data.totalRegistered }, { label: 'Active', value: data.activeCount }, { label: 'Inactive', value: data.inactiveCount }
                ] };
        }
        else if (input.intent === 'GET_EMPLOYEE_LIST' || input.intent === 'GET_EMPLOYEE_DETAILS') {
            if (!can(req, 'employees', 'view'))
                throw Object.assign(new Error('You are not authorized to view the employee directory.'), { status: 403 });
            const search = input.search || input.entities.employeeId || input.entities.employeeName;
            data = await hrmsDataService.searchEmployees(scope, { search, department: input.entities.department,
                status: input.entities.status, limit: input.pageSize, offset: (input.page - 1) * input.pageSize });
            text = data.total ? `Showing ${data.employees.length} of ${data.total} authorized employees.` : 'No authorized employee records matched your search.';
            payload = { type: 'table', title: 'Employee Directory', columns: [
                    { key: 'employee_id', label: 'Employee ID' }, { key: 'employee_name', label: 'Employee Name' },
                    { key: 'department', label: 'Department' }, { key: 'designation', label: 'Designation' }, { key: 'status', label: 'Status' }
                ],
                rows: data.employees, exportAvailable: true, navigationTarget: 'employees',
                pagination: { page: input.page, pageSize: input.pageSize, total: data.total, hasMore: data.hasMore, serverSearch: true, search: search || '' } };
        }
        else if (['GET_ATTENDANCE', 'GET_ABSENT_EMPLOYEES', 'GET_LATE_EMPLOYEES', 'GET_MY_ATTENDANCE'].includes(input.intent)) {
            if (!can(req, 'attendance', 'view'))
                throw Object.assign(new Error('You are not authorized to view attendance.'), { status: 403 });
            data = await hrmsDataService.getAttendanceSummary(scope, date);
            text = `Verified attendance for ${date}: ${data.presentCount} present, ${data.lateCount} late, ${data.absentCount} explicitly absent, ${data.onLeaveCount} on leave, and ${data.unrecordedCount} without a recorded attendance row.`;
            payload = { type: 'cards', title: `Attendance ${date}`, metrics: Object.entries({ Present: data.presentCount, Late: data.lateCount,
                    Absent: data.absentCount, 'On Leave': data.onLeaveCount, Unrecorded: data.unrecordedCount }).map(([label, value]) => ({ label, value })) };
            if (input.intent === 'GET_ABSENT_EMPLOYEES' || input.intent === 'GET_LATE_EMPLOYEES') {
                const rows = await hrmsDataService.getAttendanceEmployees(scope, date, input.intent === 'GET_LATE_EMPLOYEES' ? 'late' : 'absent');
                text += ` ${rows.length} matching employee record(s) are shown.`;
                payload = { type: 'table', title: input.intent === 'GET_LATE_EMPLOYEES' ? 'Late Employees' : 'Absent Employees', rows,
                    columns: [{ key: 'employee_id', label: 'Employee ID' }, { key: 'employee_name', label: 'Employee Name' },
                        { key: 'department', label: 'Department' }, { key: 'designation', label: 'Designation' },
                        { key: 'status', label: 'Status' }, { key: 'late_status', label: 'Late Status' }], exportAvailable: true,
                    navigationTarget: 'attendance' };
            }
        }
        else if (input.intent === 'GET_LEAVE_RECORDS') {
            if (!can(req, 'leave', 'view'))
                throw Object.assign(new Error('You are not authorized to view leave requests.'), { status: 403 });
            data = await hrmsDataService.getPendingLeaveRequests(scope, input.pageSize);
            text = `${data.length} verified pending leave request(s) found in your authorized scope.`;
            payload = { type: 'table', title: 'Pending Leave Requests', rows: data, columns: [
                    { key: 'employee_id', label: 'Employee ID' }, { key: 'employee_name', label: 'Employee Name' }, { key: 'department', label: 'Department' },
                    { key: 'leave_type', label: 'Leave Type' }, { key: 'start_date', label: 'Start' }, { key: 'end_date', label: 'End' }, { key: 'status', label: 'Status' }
                ] };
        }
        else if (input.intent === 'GET_MY_LEAVE_BALANCE') {
            if (!can(req, 'leave', 'view'))
                throw Object.assign(new Error('You are not authorized to view leave balances.'), { status: 403 });
            const employeeId = scope.level === 'own' ? scope.employeeId : (input.entities.employeeId || scope.employeeId);
            data = employeeId ? await hrmsDataService.getLeaveBalance(scope, employeeId, new Date().getFullYear()) : null;
            text = data ? data.note : "I couldn't verify this information from the HRMS database.";
        }
        else if (input.intent === 'GET_MY_SHIFT') {
            if (!can(req, 'shift', 'view'))
                throw Object.assign(new Error('You are not authorized to view shift assignments.'), { status: 403 });
            const employeeId = scope.level === 'own' ? scope.employeeId : (input.entities.employeeId || scope.employeeId);
            data = employeeId ? await hrmsDataService.getCurrentShift(scope, employeeId, date) : null;
            text = data ? `Verified shift for ${data.employee_id}: ${data.shift_name}, ${data.start_time} to ${data.end_time}, grace period ${data.grace_period_mins} minutes, effective from ${data.effective_from}.`
                : "I couldn't verify this information from the HRMS database.";
        }
        else if (input.intent === 'GET_PAYROLL') {
            if (!can(req, 'payroll', 'view'))
                throw Object.assign(new Error('You are not authorized to view payroll information.'), { status: 403 });
            data = await hrmsDataService.getPayrollSummary(scope);
            text = data.length ? `${data.length} verified payroll summary row(s) found for your authorized scope.` : 'No verified payroll records were found for your authorized scope.';
            payload = { type: 'table', title: 'Payroll Summary', rows: data, columns: [
                    { key: 'payroll_month', label: 'Month' }, { key: 'payroll_year', label: 'Year' }, { key: 'status', label: 'Status' },
                    { key: 'employee_count', label: 'Employees' }, { key: 'gross_total', label: 'Gross' },
                    { key: 'deduction_total', label: 'Deductions' }, { key: 'net_total', label: 'Net' }
                ], exportAvailable: true, navigationTarget: 'payroll' };
        }
        else if (['GET_LEAVE_POLICIES', 'GET_SANDWICH_POLICY', 'GET_ATTENDANCE_POLICIES', 'GET_COMPANY_POLICIES'].includes(input.intent)) {
            data = await hrmsDataService.getApprovedHrPolicy(scope, input.intent.includes('ATTENDANCE') ? 'attendance' : 'leave');
            text = data.verified ? `Verified approved policy data: ${JSON.stringify(data.policies)}` : "I couldn't verify this information from the HRMS database.";
        }
        else {
            res.status(400).json({ success: false, error: { code: 'UNSUPPORTED_VERIFIED_INTENT', message: 'This request is not mapped to an authoritative HRMS data function.' } });
            return;
        }
        const totalMs = Math.round(performance.now() - started);
        console.info(JSON.stringify({ event: 'pavi_hrms_query', requestId: req.headers['x-request-id'] || null, companyId: scope.companyId,
            actorId: req.user?.employeeId || req.user?.id, intent: input.intent, totalMs, outcome: 'success' }));
        res.json({ success: true, data: { text, payload, verifiedFacts: text, source: 'postgresql', verified: true, timings: { totalMs }, raw: data } });
    }
    catch (error) {
        const status = error?.status || (error instanceof z.ZodError ? 400 : 503);
        console.warn(JSON.stringify({ event: 'pavi_hrms_query', intent: req.body?.intent, totalMs: Math.round(performance.now() - started), outcome: 'error' }));
        res.status(status).json({ success: false, error: { code: status === 403 ? 'FORBIDDEN' : 'HRMS_DATA_UNAVAILABLE',
                message: status === 403 ? error.message : "I couldn't verify this information from the HRMS database." } });
    }
};
export const getEmployeeVerifiedContext = async (req, res) => {
    req.body = {
        intent: 'GET_EMPLOYEE_DETAILS',
        entities: { employeeId: String(req.query.employeeId || req.body?.employeeId || req.user?.employeeId || '') },
        page: 1,
        pageSize: 1,
    };
    await executeVerifiedHrmsQuery(req, res);
};
//# sourceMappingURL=aiController.js.map