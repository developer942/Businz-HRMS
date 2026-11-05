import { fieldAdvanceRepository } from '../repositories/fieldAdvanceRepository.js';
import { createFieldVisitSchema, approveAdvanceSchema, disburseAdvanceSchema, createExpenseItemSchema, reviewSettlementSchema, reportBalanceReturnSchema, confirmBalanceReturnSchema, disburseReimbursementSchema, } from '../validators/fieldAdvanceValidators.js';
const isCeo = (req) => {
    const role = String(req.user?.role || '').trim().toLowerCase();
    const desig = String(req.user?.designation || '').trim().toLowerCase();
    return (role === 'ceo' ||
        desig === 'ceo' ||
        desig.includes('chief executive') ||
        desig.includes('managing director') ||
        req.user?.employeeId === 'EMP-000');
};
const isSuperAdmin = (req) => {
    const role = String(req.user?.role || '').trim().toLowerCase();
    return role === 'super admin' || role === 'admin' || role === 'erp administrator';
};
const isAccountsUser = (req) => {
    const role = String(req.user?.role || '').trim().toLowerCase();
    const dept = String(req.user?.department || '').trim().toLowerCase();
    const desig = String(req.user?.designation || '').trim().toLowerCase();
    return (role.includes('finance') ||
        role.includes('account') ||
        dept.includes('finance') ||
        dept.includes('account') ||
        desig.includes('finance') ||
        desig.includes('account') ||
        isSuperAdmin(req));
};
const isCeoOrHrUser = (req) => {
    const role = String(req.user?.role || '').trim().toLowerCase();
    const dept = String(req.user?.department || '').trim().toLowerCase();
    const desig = String(req.user?.designation || '').trim().toLowerCase();
    // Strictly block Accounts / Finance personnel from acting as CEO/HR approvers
    if (role.includes('finance') ||
        role.includes('account') ||
        dept.includes('finance') ||
        dept.includes('account') ||
        desig.includes('finance') ||
        desig.includes('account')) {
        return false;
    }
    return (isCeo(req) ||
        isSuperAdmin(req) ||
        role.includes('director') ||
        role.includes('hr') ||
        dept === 'hr' ||
        dept.includes('human resource') ||
        dept.includes('management') ||
        desig.includes('hr'));
};
const isClaimantHrStaff = (visit) => {
    const dept = String(visit.department_name || '').trim().toLowerCase();
    const name = String(visit.employee_name || '').trim().toLowerCase();
    const code = String(visit.employee_code || visit.employee_id || '').trim().toUpperCase();
    return (dept === 'hr' ||
        dept.includes('human resource') ||
        dept.includes('hr ') ||
        name.includes('(hr)') ||
        name.includes('hr manager') ||
        name.includes('hr admin') ||
        code === 'EMP-006' ||
        code === 'EMP-008' ||
        code.startsWith('HR-'));
};
const isSameEmployee = (req, visit) => {
    const userIds = [
        String(req.user?.id || '').trim().toLowerCase(),
        String(req.user?.employeeId || '').trim().toLowerCase(),
    ].filter(Boolean);
    const visitIds = [
        String(visit.employee_id || '').trim().toLowerCase(),
        String(visit.employee_code || '').trim().toLowerCase(),
    ].filter(Boolean);
    return userIds.some((u) => visitIds.includes(u));
};
export const listFieldVisits = async (req, res, next) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId || 'company-a';
        const isAccounts = isAccountsUser(req);
        const isCeoHr = isCeoOrHrUser(req);
        const isRegularEmployee = !isAccounts && !isCeoHr;
        const { fundingType, status, tab, search } = req.query;
        let employeeId = undefined;
        if (isRegularEmployee) {
            employeeId = req.user?.employeeId || req.user?.id;
        }
        else if (tab === 'my_visits' || req.query.employeeId) {
            employeeId = req.query.employeeId || req.user?.employeeId || req.user?.id;
        }
        const visits = await fieldAdvanceRepository.listVisits(companyId, {
            employeeId,
            fundingType: fundingType,
            status: status,
            tab: tab,
            search: search,
        });
        res.json({ success: true, data: visits });
    }
    catch (error) {
        next(error);
    }
};
export const getFieldVisitDetail = async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const detail = await fieldAdvanceRepository.getVisitDetail(id);
        if (!detail) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Field visit not found' } });
            return;
        }
        const isPrivileged = isAccountsUser(req) || isCeoOrHrUser(req);
        if (!isPrivileged && !isSameEmployee(req, detail.visit)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Unauthorized to view this field visit.' } });
            return;
        }
        res.json({ success: true, data: detail });
    }
    catch (error) {
        next(error);
    }
};
export const createFieldVisit = async (req, res, next) => {
    try {
        if (isCeo(req)) {
            res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'CEO has administrative oversight and approval capabilities only and cannot create advance requests or expense claims.',
                },
            });
            return;
        }
        const parsed = createFieldVisitSchema.parse(req.body);
        const companyId = req.user?.company_id || req.user?.companyId || 'company-a';
        const actor = {
            id: req.user?.id || req.user?.employeeId || 'unknown',
            name: req.user?.name || parsed.employee_name,
            role: req.user?.role || 'Employee',
        };
        const visit = await fieldAdvanceRepository.createVisit(companyId, parsed, actor);
        res.status(201).json({ success: true, data: visit, message: 'Field visit created successfully.' });
    }
    catch (error) {
        next(error);
    }
};
export const approveAdvance = async (req, res, next) => {
    try {
        if (!isCeoOrHrUser(req)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only CEO or HR can approve advance requests. Accounts and standard employees are not permitted.' } });
            return;
        }
        const id = String(req.params.id);
        const detail = await fieldAdvanceRepository.getVisitDetail(id);
        if (!detail) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Field visit not found' } });
            return;
        }
        // 1. Self-approval strictly blocked
        if (isSameEmployee(req, detail.visit)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Self-approval is strictly forbidden. You cannot approve your own advance request.' } });
            return;
        }
        // 2. HR claimant rule: HR claims can ONLY be approved by CEO
        if (isClaimantHrStaff(detail.visit) && !isCeo(req) && !isSuperAdmin(req)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'HR employee advance requests must be approved by the CEO.' } });
            return;
        }
        const parsed = approveAdvanceSchema.parse(req.body);
        const actor = {
            id: req.user?.id || req.user?.employeeId || 'unknown',
            name: req.user?.name || 'Approver',
            role: req.user?.role || 'CEO',
        };
        const updated = await fieldAdvanceRepository.approveAdvance(id, parsed, actor);
        res.json({ success: true, data: updated, message: `Advance request marked as ${parsed.decision}.` });
    }
    catch (error) {
        next(error);
    }
};
export const disburseAdvance = async (req, res, next) => {
    try {
        if (!isAccountsUser(req)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Accounts or Finance personnel can disburse advances.' } });
            return;
        }
        const id = String(req.params.id);
        const parsed = disburseAdvanceSchema.parse(req.body);
        const actor = {
            id: req.user?.id || req.user?.employeeId || 'unknown',
            name: req.user?.name || 'Accounts User',
            role: req.user?.role || 'Finance',
        };
        const updated = await fieldAdvanceRepository.disburseAdvance(id, parsed, actor);
        res.json({ success: true, data: updated, message: 'Advance disbursed and field visit activated.' });
    }
    catch (error) {
        if (error?.message?.includes('Duplicate transaction blocked')) {
            res.status(409).json({ success: false, error: { code: 'DUPLICATE_TRANSACTION', message: error.message } });
            return;
        }
        next(error);
    }
};
export const addExpenseItem = async (req, res, next) => {
    try {
        if (isCeo(req)) {
            res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'CEO is not permitted to create or submit expense claims.',
                },
            });
            return;
        }
        const id = String(req.params.id);
        const parsed = createExpenseItemSchema.parse(req.body);
        const actor = {
            id: req.user?.id || req.user?.employeeId || 'unknown',
            name: req.user?.name || 'Employee',
            role: req.user?.role || 'Employee',
        };
        const expense = await fieldAdvanceRepository.addExpenseItem(id, parsed, actor);
        res.status(201).json({ success: true, data: expense, message: 'Expense item added.' });
    }
    catch (error) {
        next(error);
    }
};
export const updateExpenseItem = async (req, res, next) => {
    try {
        if (isCeo(req)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'CEO is not permitted to modify employee expense claims.' } });
            return;
        }
        const expenseId = String(req.params.expenseId);
        const parsed = createExpenseItemSchema.partial().parse(req.body);
        const actor = {
            id: req.user?.id || req.user?.employeeId || 'unknown',
            name: req.user?.name || 'Employee',
            role: req.user?.role || 'Employee',
        };
        const updated = await fieldAdvanceRepository.updateExpenseItem(expenseId, parsed, actor);
        res.json({ success: true, data: updated, message: 'Expense item updated.' });
    }
    catch (error) {
        next(error);
    }
};
export const deleteExpenseItem = async (req, res, next) => {
    try {
        const expenseId = String(req.params.expenseId);
        const actor = {
            id: req.user?.id || req.user?.employeeId || 'unknown',
            name: req.user?.name || 'Employee',
            role: req.user?.role || 'Employee',
        };
        await fieldAdvanceRepository.deleteExpenseItem(expenseId, actor);
        res.json({ success: true, message: 'Expense item removed.' });
    }
    catch (error) {
        next(error);
    }
};
export const submitSettlement = async (req, res, next) => {
    try {
        if (isCeo(req)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'CEO cannot submit expense claims.' } });
            return;
        }
        const id = String(req.params.id);
        const { remarks } = req.body;
        const actor = {
            id: req.user?.id || req.user?.employeeId || 'unknown',
            name: req.user?.name || 'Employee',
            role: req.user?.role || 'Employee',
        };
        const settlement = await fieldAdvanceRepository.submitSettlement(id, remarks, actor);
        res.json({ success: true, data: settlement, message: 'Settlement submitted for CEO / HR approval.' });
    }
    catch (error) {
        next(error);
    }
};
export const reviewSettlement = async (req, res, next) => {
    try {
        if (!isCeoOrHrUser(req)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only CEO or HR can approve expense claims and settlements. Accounts cannot approve claims.' } });
            return;
        }
        const id = String(req.params.id);
        const detail = await fieldAdvanceRepository.getVisitDetail(id);
        if (!detail) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Field visit not found' } });
            return;
        }
        // 1. Self-approval blocked
        if (isSameEmployee(req, detail.visit)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Self-approval is strictly forbidden. You cannot approve your own claim.' } });
            return;
        }
        // 2. HR claimant rule: HR claims can ONLY be approved by CEO
        if (isClaimantHrStaff(detail.visit) && !isCeo(req) && !isSuperAdmin(req)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'HR employee expense claims can only be reviewed and approved by CEO.' } });
            return;
        }
        const parsed = reviewSettlementSchema.parse(req.body);
        const actor = {
            id: req.user?.id || req.user?.employeeId || 'unknown',
            name: req.user?.name || 'CEO',
            role: req.user?.role || 'CEO',
        };
        const result = await fieldAdvanceRepository.reviewSettlement(id, parsed, actor);
        res.json({ success: true, data: result, message: `Settlement reviewed: ${parsed.decision}.` });
    }
    catch (error) {
        next(error);
    }
};
export const getCeoMasterAnalytics = async (req, res, next) => {
    try {
        if (!isCeo(req) && !isCeoOrHrUser(req) && !isAccountsUser(req)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Unauthorized access to master analytics.' } });
            return;
        }
        const companyId = req.user?.company_id || req.user?.companyId || 'company-a';
        const analytics = await fieldAdvanceRepository.getMasterAnalytics(companyId);
        res.json({ success: true, data: analytics });
    }
    catch (error) {
        next(error);
    }
};
export const listDailyExpensesHandler = async (req, res, next) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId || 'company-a';
        const isAccounts = isAccountsUser(req);
        const isCeoHr = isCeoOrHrUser(req);
        const isRegular = !isAccounts && !isCeoHr;
        let employeeId = undefined;
        if (isRegular) {
            employeeId = req.user?.employeeId || req.user?.id;
        }
        else if (req.query.employeeId) {
            employeeId = String(req.query.employeeId);
        }
        const { category, startDate, endDate, status } = req.query;
        const expenses = await fieldAdvanceRepository.listAllDailyExpenses(companyId, {
            employeeId,
            category: category ? String(category) : undefined,
            startDate: startDate ? String(startDate) : undefined,
            endDate: endDate ? String(endDate) : undefined,
            status: status ? String(status) : undefined,
        });
        res.json({ success: true, data: expenses });
    }
    catch (error) {
        next(error);
    }
};
export const reportBalanceReturn = async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const parsed = reportBalanceReturnSchema.parse(req.body);
        const actor = {
            id: req.user?.id || req.user?.employeeId || 'unknown',
            name: req.user?.name || 'Employee',
            role: req.user?.role || 'Employee',
        };
        const record = await fieldAdvanceRepository.reportBalanceReturn(id, parsed, actor);
        res.status(201).json({ success: true, data: record, message: 'Balance return reported. Awaiting confirmation from Accounts.' });
    }
    catch (error) {
        next(error);
    }
};
export const confirmBalanceReturn = async (req, res, next) => {
    try {
        if (!isAccountsUser(req)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Accounts or Finance personnel can confirm received balances.' } });
            return;
        }
        const returnId = String(req.params.returnId);
        const parsed = confirmBalanceReturnSchema.parse(req.body);
        const actor = {
            id: req.user?.id || req.user?.employeeId || 'unknown',
            name: req.user?.name || 'Accounts Staff',
            role: req.user?.role || 'Finance',
        };
        const record = await fieldAdvanceRepository.confirmBalanceReturn(returnId, parsed, actor);
        res.json({ success: true, data: record, message: 'Balance return confirmed by Accounts.' });
    }
    catch (error) {
        if (error?.message?.includes('Duplicate transaction blocked')) {
            res.status(409).json({ success: false, error: { code: 'DUPLICATE_TRANSACTION', message: error.message } });
            return;
        }
        next(error);
    }
};
export const disburseReimbursement = async (req, res, next) => {
    try {
        if (!isAccountsUser(req)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Accounts or Finance personnel can issue reimbursement payments.' } });
            return;
        }
        const id = String(req.params.id);
        const parsed = disburseReimbursementSchema.parse(req.body);
        const actor = {
            id: req.user?.id || req.user?.employeeId || 'unknown',
            name: req.user?.name || 'Accounts Staff',
            role: req.user?.role || 'Finance',
        };
        const record = await fieldAdvanceRepository.disburseReimbursement(id, parsed, actor);
        res.json({ success: true, data: record, message: 'Reimbursement payment processed successfully.' });
    }
    catch (error) {
        if (error?.message?.includes('Duplicate transaction blocked') || error?.message?.includes('Overpayment blocked')) {
            res.status(409).json({ success: false, error: { code: 'DUPLICATE_TRANSACTION', message: error.message } });
            return;
        }
        next(error);
    }
};
export const getFinancialSummary = async (req, res, next) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId || 'company-a';
        const isAccounts = isAccountsUser(req);
        const isCeoHr = isCeoOrHrUser(req);
        const isRegularEmployee = !isAccounts && !isCeoHr;
        const employeeId = isRegularEmployee ? (req.user?.employeeId || req.user?.id) : undefined;
        const summary = await fieldAdvanceRepository.getFinancialSummary(companyId, employeeId);
        res.json({ success: true, data: summary });
    }
    catch (error) {
        next(error);
    }
};
//# sourceMappingURL=fieldAdvanceController.js.map