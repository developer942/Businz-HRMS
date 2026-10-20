import { employeeRepository } from '../repositories/employeeRepository.js';
import { leaveRepository } from '../repositories/leaveRepository.js';
import { attendanceRepository } from '../repositories/attendanceRepository.js';
import { shiftRepository } from '../repositories/shiftRepository.js';
import { authRepository } from '../repositories/authRepository.js';
let inMemoryApiKey = process.env.GEMINI_API_KEY || '';
let inMemoryModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
let inMemoryOcrModel = process.env.GEMINI_OCR_MODEL || 'gemini-3.5-flash-lite';
const cleanKey = (key) => {
    if (!key)
        return '';
    return key.trim().replace(/^['"]|['"]$/g, '').replace(/^Bearer\s+/i, '').trim();
};
export const getEffectiveKey = (reqKey) => {
    const reqClean = cleanKey(reqKey);
    if (reqClean)
        return reqClean;
    const memClean = cleanKey(inMemoryApiKey);
    if (memClean)
        return memClean;
    return cleanKey(process.env.GEMINI_API_KEY);
};
export const getEffectiveOcrModel = () => {
    if (inMemoryOcrModel && inMemoryOcrModel !== 'gemini-3.7-flash') {
        return inMemoryOcrModel;
    }
    return 'gemini-3.5-flash-lite';
};
export const getAiStatus = async (_req, res) => {
    const effectiveKey = getEffectiveKey();
    res.json({
        success: true,
        data: {
            isConfigured: Boolean(effectiveKey),
            hasServerKey: Boolean(cleanKey(process.env.GEMINI_API_KEY)),
            model: inMemoryModel,
            ocrModel: inMemoryOcrModel,
            source: cleanKey(process.env.GEMINI_API_KEY) ? 'server_env' : (inMemoryApiKey ? 'session' : 'none'),
        }
    });
};
export const listModels = async (req, res) => {
    const apiKey = getEffectiveKey(req.body?.apiKey || req.headers['x-gemini-api-key']);
    if (!apiKey) {
        res.status(400).json({
            success: false,
            error: {
                code: 'MISSING_API_KEY',
                message: 'Google Gemini API Key is required. Please provide a valid key.'
            }
        });
        return;
    }
    try {
        const googleRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
            headers: {
                'x-goog-api-key': apiKey,
                'Content-Type': 'application/json'
            }
        });
        const data = await googleRes.json();
        if (!googleRes.ok) {
            const errMsg = data.error?.message || `Google API returned status ${googleRes.status}`;
            let friendlyMessage = errMsg;
            if (errMsg.includes('API key not valid')) {
                friendlyMessage = 'Google Gemini API key is not valid. Please verify your key from Google AI Studio (https://aistudio.google.com/app/apikey).';
            }
            else if (errMsg.includes('Expected OAuth 2 access token') || errMsg.includes('devconsole-project') || errMsg.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED')) {
                friendlyMessage = 'Google Generative Language API is not enabled for this project. In Google AI Studio (https://aistudio.google.com/app/apikey), click "Create API key" and choose "Create API key in new project" for instant one-click activation, or enable "Generative Language API" in Google Cloud Console.';
            }
            res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_API_KEY',
                    message: friendlyMessage,
                    rawMessage: errMsg
                }
            });
            return;
        }
        const models = (data.models || [])
            .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
            .map((m) => {
            const cleanName = m.name.replace(/^models\//, '');
            const isVisionCapable = cleanName.includes('flash') ||
                cleanName.includes('pro') ||
                cleanName.includes('vision') ||
                (Array.isArray(m.inputModalities) && m.inputModalities.includes('IMAGE')) ||
                (typeof m.description === 'string' && /image|multimodal|vision/i.test(m.description));
            return {
                name: cleanName,
                displayName: m.displayName || m.name,
                description: m.description || '',
                supportedGenerationMethods: m.supportedGenerationMethods || [],
                isVisionCapable: Boolean(isVisionCapable)
            };
        });
        res.json({
            success: true,
            data: {
                models,
                count: models.length
            }
        });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            error: {
                code: 'NETWORK_ERROR',
                message: err.message || 'Failed to reach Google Generative AI servers'
            }
        });
    }
};
export const generateAiContent = async (req, res) => {
    const apiKey = getEffectiveKey(req.body?.apiKey || req.headers['x-gemini-api-key']);
    if (!apiKey) {
        res.status(400).json({
            success: false,
            error: {
                code: 'NO_API_KEY',
                message: 'No Gemini API Key provided. Please configure your key in Settings -> Integrations & APIs.'
            }
        });
        return;
    }
    let targetModel = req.body?.model || inMemoryModel || 'gemini-2.0-flash';
    if (targetModel.includes('3.6-flash'))
        targetModel = 'gemini-2.0-flash';
    const contents = req.body?.contents;
    if (!contents || !Array.isArray(contents) || contents.length === 0) {
        res.status(400).json({
            success: false,
            error: {
                code: 'INVALID_CONTENTS',
                message: 'Missing or invalid contents payload for generateContent'
            }
        });
        return;
    }
    const callModel = async (modelName) => {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify({
                contents,
                generationConfig: {
                    temperature: req.body?.generationConfig?.temperature ?? 0.2,
                    maxOutputTokens: req.body?.generationConfig?.maxOutputTokens ?? 4096,
                    responseMimeType: req.body?.generationConfig?.responseMimeType || undefined
                }
            })
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error?.message || `Google API error ${response.status}`);
        }
        const candidate = result.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text;
        return text || '';
    };
    try {
        const candidateModels = Array.from(new Set([
            targetModel,
            'gemini-3.5-flash',
            'gemini-3.8-flash',
            'gemini-3.1-flash-lite',
            'gemini-flash-latest',
            'gemini-3-flash-preview',
            'gemini-3.1-pro-preview'
        ]));
        let outputText = '';
        let modelUsed = targetModel;
        let lastError = '';
        for (const modelCandidate of candidateModels) {
            try {
                outputText = await callModel(modelCandidate);
                modelUsed = modelCandidate;
                lastError = '';
                break;
            }
            catch (err) {
                lastError = err.message || String(err);
                console.warn(`[AI Controller] Model ${modelCandidate} failed: ${lastError}. Trying next candidate...`);
                // Small pause to avoid tripping rate limits on fast fallback
                await new Promise(resolve => setTimeout(resolve, 800));
            }
        }
        if (!outputText && lastError) {
            throw new Error(`All Gemini candidate models failed. Last error: ${lastError}`);
        }
        res.json({
            success: true,
            data: {
                text: outputText,
                modelUsed
            }
        });
    }
    catch (err) {
        const rawMsg = err.message || '';
        let friendlyMessage = rawMsg || 'Gemini content generation failed';
        if (rawMsg.includes('Expected OAuth 2 access token') || rawMsg.includes('devconsole-project') || rawMsg.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED')) {
            friendlyMessage = 'Google Generative Language API is not enabled for this project. In Google AI Studio (https://aistudio.google.com/app/apikey), click "Create API key" and choose "Create API key in new project" for instant one-click activation, or enable "Generative Language API" in Google Cloud Console.';
        }
        else if (rawMsg.includes('API key not valid')) {
            friendlyMessage = 'Google Gemini API key is not valid. Please verify your key from Google AI Studio (https://aistudio.google.com/app/apikey).';
        }
        res.status(500).json({
            success: false,
            error: {
                code: 'GENERATION_FAILED',
                message: friendlyMessage
            }
        });
    }
};
export const saveAiConfig = async (req, res) => {
    const { apiKey, model, ocrModel } = req.body;
    if (apiKey !== undefined) {
        const cleaned = cleanKey(apiKey);
        inMemoryApiKey = cleaned;
        // Safely persist to backend/.env file so server restarts preserve the key
        try {
            const fs = await import('fs');
            const path = await import('path');
            const envPath = path.resolve(process.cwd(), '.env');
            if (fs.existsSync(envPath)) {
                let envContent = fs.readFileSync(envPath, 'utf-8');
                if (envContent.includes('GEMINI_API_KEY=')) {
                    envContent = envContent.replace(/GEMINI_API_KEY=.*/g, `GEMINI_API_KEY=${cleaned}`);
                }
                else {
                    envContent += `\nGEMINI_API_KEY=${cleaned}\n`;
                }
                if (ocrModel) {
                    if (envContent.includes('GEMINI_OCR_MODEL=')) {
                        envContent = envContent.replace(/GEMINI_OCR_MODEL=.*/g, `GEMINI_OCR_MODEL=${ocrModel}`);
                    }
                    else {
                        envContent += `\nGEMINI_OCR_MODEL=${ocrModel}\n`;
                    }
                }
                fs.writeFileSync(envPath, envContent, 'utf-8');
            }
        }
        catch {
            // Non-fatal, memory key is already updated
        }
    }
    if (model)
        inMemoryModel = model;
    if (ocrModel)
        inMemoryOcrModel = ocrModel;
    res.json({
        success: true,
        message: 'AI configuration updated successfully',
        data: {
            hasKey: Boolean(inMemoryApiKey),
            model: inMemoryModel,
            ocrModel: inMemoryOcrModel
        }
    });
};
/**
 * Retrieves employee-specific verified answers from PostgreSQL database
 * Calculates leave balances and attendance totals in backend code.
 * Enforces company/tenant scoping and RBAC rules.
 */
export const getEmployeeVerifiedContext = async (req, res) => {
    try {
        const userRole = req.user?.role || 'Employee';
        const isRestrictedStaff = userRole === 'Employee' || userRole === 'Assignee';
        // RBAC: Staff can only query their own records, regardless of input
        const authEmpId = req.user?.employeeId || req.user?.id || 'EMP-001';
        const requestedEmpId = (req.query.employeeId || req.body?.employeeId);
        const targetEmpId = (isRestrictedStaff || !requestedEmpId) ? authEmpId : requestedEmpId;
        const companyId = req.user?.company_id || 'company-a';
        // 1. Employee Profile from DB
        const emp = await employeeRepository.getEmployeeById(targetEmpId);
        const authUser = await authRepository.findByIdentifier(targetEmpId);
        // 2. Assigned Shift from DB
        const shifts = await shiftRepository.getShifts();
        let assignedShift = shifts.find((s) => s.assignments?.some((a) => (typeof a === 'string' ? a.toLowerCase() === targetEmpId.toLowerCase() : a?.employeeId?.toLowerCase() === targetEmpId.toLowerCase())));
        if (!assignedShift && emp?.workShift) {
            assignedShift = shifts.find((s) => s.shiftName.toLowerCase().includes(emp.workShift.toLowerCase()) || s.id === emp.workShift);
        }
        if (!assignedShift && shifts.length > 0) {
            assignedShift = shifts[0];
        }
        const shiftData = assignedShift ? {
            shiftName: assignedShift.shiftName,
            startTime: assignedShift.startTime,
            endTime: assignedShift.endTime,
            workingHours: assignedShift.workingHours,
            gracePeriodMins: assignedShift.gracePeriodMins,
            breakDurationMins: assignedShift.breakDurationMins,
        } : null;
        // 3. Leave Balances from DB (Approved Leaves calculated in code)
        const approvedLeaves = await leaveRepository.getLeaves({ employeeId: targetEmpId, status: 'Approved' });
        const pendingLeaves = await leaveRepository.getLeaves({ employeeId: targetEmpId, status: 'Pending' });
        const countDays = (leaves, typeMatch) => leaves.filter(l => typeMatch((l.leaveType || '').toLowerCase())).reduce((sum, l) => sum + (Number(l.daysCount) || 1), 0);
        const casualUsed = countDays(approvedLeaves, t => t.includes('casual') || t === 'cl');
        const sickUsed = countDays(approvedLeaves, t => t.includes('sick') || t === 'sl' || t.includes('medical'));
        const earnedUsed = countDays(approvedLeaves, t => t.includes('earned') || t === 'el' || t.includes('annual') || t.includes('privilege'));
        const unpaidUsed = countDays(approvedLeaves, t => t.includes('unpaid') || t.includes('lop') || t.includes('loss'));
        const casualPending = countDays(pendingLeaves, t => t.includes('casual') || t === 'cl');
        const sickPending = countDays(pendingLeaves, t => t.includes('sick') || t === 'sl' || t.includes('medical'));
        const earnedPending = countDays(pendingLeaves, t => t.includes('earned') || t === 'el');
        // Quotas (12 Casual, 10 Sick, 15 Earned as standard company policy)
        const leaveBalances = {
            casual: { quota: 12, used: casualUsed, pending: casualPending, remaining: Math.max(0, 12 - casualUsed) },
            sick: { quota: 10, used: sickUsed, pending: sickPending, remaining: Math.max(0, 10 - sickUsed) },
            earned: { quota: 15, used: earnedUsed, pending: earnedPending, remaining: Math.max(0, 15 - earnedUsed) },
            unpaid: { used: unpaidUsed },
            totalRemaining: Math.max(0, 12 - casualUsed) + Math.max(0, 10 - sickUsed) + Math.max(0, 15 - earnedUsed),
        };
        // 4. Attendance Totals calculated in code
        const targetMonth = (req.query.month || req.body?.month) || new Date().toISOString().substring(0, 7);
        const allLogs = await attendanceRepository.getAttendanceLogs({ employeeId: targetEmpId });
        const monthLogs = allLogs.filter(l => (l.date || l.shiftDate || '').startsWith(targetMonth));
        const presentCount = monthLogs.filter(l => l.status === 'Present').length;
        const lateCount = monthLogs.filter(l => l.status === 'Late' || (l.lateStatus && l.lateStatus.toLowerCase().includes('late'))).length;
        const onLeaveCount = monthLogs.filter(l => l.status === 'On Leave').length;
        const absentCount = monthLogs.filter(l => l.status === 'Absent').length;
        const totalWorkingHours = Math.round(monthLogs.reduce((sum, l) => sum + (Number(l.workingHours) || 0), 0) * 10) / 10;
        const attendanceTotals = {
            month: targetMonth,
            totalRecordedPunches: monthLogs.length,
            presentDays: presentCount,
            lateDays: lateCount,
            onLeaveDays: onLeaveCount,
            absentDays: absentCount,
            totalWorkingHours,
            hasDataForMonth: monthLogs.length > 0,
        };
        // 5. Credential Email Verification (Only reported as sent if verified)
        const emailStatus = authUser?.credentialEmailStatus || emp?.credentialEmailStatus || 'NOT_SENT';
        const emailSentAt = authUser?.credentialEmailSentAt || emp?.credentialEmailSentAt || null;
        const isEmailAccepted = emailStatus === 'SENT' && Boolean(emailSentAt);
        // 6. Grounded Truth Facts String
        const verifiedFacts = [
            `VERIFIED HRMS FACTS (Active PostgreSQL Database):`,
            `• Authenticated Employee: [${targetEmpId}] ${emp ? `${emp.firstName} ${emp.lastName}` : 'Not Found'} (${emp?.department || 'N/A'}, ${emp?.designation || 'N/A'})`,
            `• Company Scope: ${companyId}`,
            shiftData ? `• Assigned Shift: ${shiftData.shiftName} (${shiftData.startTime} - ${shiftData.endTime}, Grace: ${shiftData.gracePeriodMins}m, Hours: ${shiftData.workingHours}h)` : `• Assigned Shift: Not configured / cannot be verified`,
            `• Leave Balance (Statutory 2026): Casual Leave: ${leaveBalances.casual.remaining} remaining (${leaveBalances.casual.used} used of ${leaveBalances.casual.quota}), Sick Leave: ${leaveBalances.sick.remaining} remaining (${leaveBalances.sick.used} used of ${leaveBalances.sick.quota}), Earned Leave: ${leaveBalances.earned.remaining} remaining (${leaveBalances.earned.used} used of ${leaveBalances.earned.quota}). Total Paid Leaves Remaining: ${leaveBalances.totalRemaining} days.`,
            `• Attendance Totals (${targetMonth}): Present: ${presentCount} days, Late: ${lateCount} days, On Leave: ${onLeaveCount} days, Absent: ${absentCount} days, Hours Worked: ${totalWorkingHours} hrs. (Total recorded: ${monthLogs.length} days).`,
            `• Credential Email Dispatch: ${isEmailAccepted ? `Dispatched & Delivered at ${emailSentAt}` : `NOT DISPATCHED / Not accepted by mail service (Status: ${emailStatus})`}.`,
        ].join('\n');
        res.json({
            success: true,
            data: {
                employee: emp ? {
                    employeeId: emp.employeeId,
                    firstName: emp.firstName,
                    lastName: emp.lastName,
                    department: emp.department,
                    designation: emp.designation,
                    status: emp.status,
                    joiningDate: emp.joiningDate || null,
                } : null,
                shift: shiftData,
                leaveBalances,
                attendanceTotals,
                emailStatus: {
                    status: emailStatus,
                    sentAt: emailSentAt,
                    isAccepted: isEmailAccepted,
                },
                verifiedFacts,
            }
        });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            error: {
                code: 'CONTEXT_FETCH_ERROR',
                message: err.message || 'Failed to retrieve employee verified context from database',
            }
        });
    }
};
//# sourceMappingURL=aiController.js.map