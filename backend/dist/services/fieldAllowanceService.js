import { fieldAllowanceRepository } from '../repositories/fieldAllowanceRepository.js';
const managementRoles = new Set(['CEO', 'Super Admin', 'Admin', 'HR', 'HR Manager', 'HR Admin', 'Management', 'ERP Administrator']);
const accountsRoles = new Set(['finance manager', 'finance', 'accountant', 'accounts', 'accounts manager', 'accounts executive']);
const employeeKey = (actor) => actor.employeeId || actor.id;
const formatActorWithRole = (actor) => {
    const rawName = (actor.name || actor.email || '').trim();
    if (rawName.includes('('))
        return rawName;
    const roleLower = (actor.role || '').trim().toLowerCase();
    const desigLower = (actor.designation || '').trim().toLowerCase();
    const deptLower = (actor.department || '').trim().toLowerCase();
    let roleTag = actor.role || 'Approver';
    if (roleLower === 'ceo' || roleLower === 'super admin' || desigLower.includes('ceo') || desigLower.includes('managing director')) {
        roleTag = 'CEO';
    }
    else if (roleLower.includes('hr') || desigLower.includes('hr') || deptLower.includes('hr')) {
        roleTag = 'HR';
    }
    else if (accountsRoles.has(roleLower) || deptLower.includes('account') || deptLower.includes('finance')) {
        roleTag = 'Accounts';
    }
    return `${rawName} (${roleTag})`;
};
export class FieldAllowanceService {
    isManagement(actor) { return managementRoles.has(actor.role); }
    isCeo(actor) {
        const role = (actor.role || '').trim().toLowerCase();
        const designation = (actor.designation || '').trim().toLowerCase();
        return role === 'ceo' || role === 'super admin' || designation.includes('ceo') || designation.includes('managing director');
    }
    isHr(actor) {
        const role = (actor.role || '').trim().toLowerCase();
        const department = (actor.department || '').trim().toLowerCase();
        const designation = (actor.designation || '').trim().toLowerCase();
        return role.includes('hr') || role.includes('human') ||
            department.includes('hr') || department.includes('human') ||
            designation.includes('hr') || designation.includes('human');
    }
    isAccounts(actor) {
        const role = actor.role.trim().toLowerCase();
        const department = (actor.department || '').trim().toLowerCase();
        const designation = (actor.designation || '').trim().toLowerCase();
        return accountsRoles.has(role) || department.includes('accounts') || department.includes('finance') ||
            designation.includes('account') || designation.includes('finance');
    }
    company(actor) { return actor.company_id || actor.companyId || 'company-a'; }
    async create(actor, payload) {
        if (this.isCeo(actor)) {
            throw new Error('CEO accounts cannot create personal Finance and Claims requests');
        }
        const isAdvance = Boolean(payload.advanceRequired);
        const initialStatus = payload.submit
            ? (isAdvance ? 'PENDING_APPROVAL' : 'ACTIVE_VISIT')
            : 'DRAFT';
        return fieldAllowanceRepository.create({
            company_id: this.company(actor),
            employee_id: employeeKey(actor),
            employee_name: actor.name || actor.email,
            department_id: null,
            department_name: actor.department || '',
            purpose: payload.purpose,
            customer_site_name: payload.customerSiteName || null,
            destination: payload.destination,
            start_date: payload.startDate,
            end_date: payload.endDate,
            travel_mode: payload.travelMode || null,
            description: payload.description || null,
            advance_required: isAdvance,
            requested_amount: isAdvance ? payload.requestedAmount : 0,
            status: initialStatus,
        });
    }
    async update(actor, id, payload) {
        const isAdvance = Boolean(payload.advanceRequired);
        const targetStatus = payload.submit
            ? (isAdvance ? 'PENDING_APPROVAL' : 'ACTIVE_VISIT')
            : (payload.status || 'DRAFT');
        return fieldAllowanceRepository.updateDraft(this.company(actor), id, employeeKey(actor), {
            purpose: payload.purpose,
            customer_site_name: payload.customerSiteName || null,
            destination: payload.destination,
            start_date: payload.startDate,
            end_date: payload.endDate,
            travel_mode: payload.travelMode || null,
            description: payload.description || null,
            advance_required: isAdvance,
            requested_amount: isAdvance ? payload.requestedAmount : 0,
            status: targetStatus,
        }, payload.submit);
    }
    async list(actor, filters) {
        const { scope, ...repositoryFilters } = filters;
        return fieldAllowanceRepository.list(this.company(actor), {
            ...repositoryFilters,
            employeeId: scope === 'mine' || (!this.isManagement(actor) && !this.isAccounts(actor)) ? employeeKey(actor) : undefined,
        });
    }
    async detail(actor, id) {
        const detail = await fieldAllowanceRepository.getDetail(this.company(actor), id);
        if (!detail)
            return null;
        if (!this.isManagement(actor) && !this.isAccounts(actor) && detail.employee_id !== employeeKey(actor))
            return null;
        return detail;
    }
    async decide(actor, requestId, payload) {
        if (!this.isManagement(actor)) {
            throw new Error('Only HR or CEO can review Finance and Claims requests');
        }
        if (this.isAccounts(actor) && !this.isManagement(actor)) {
            throw new Error('Accounts personnel cannot approve or reject claims');
        }
        const request = await fieldAllowanceRepository.getById(this.company(actor), requestId);
        if (!request)
            throw new Error('Finance and Claims request was not found');
        // Self-approval prohibition
        if (request.employee_id === employeeKey(actor)) {
            throw new Error('You cannot review your own Finance and Claims request');
        }
        // HR personal claim rule: HR staff requests can only be approved by CEO
        const dept = (request.department_name || '').toLowerCase();
        const isTargetHr = dept.includes('hr') || dept.includes('human') ||
            request.employee_name.toLowerCase().includes('(hr)');
        if (isTargetHr && !this.isCeo(actor)) {
            throw new Error('HR staff claims and advance requests must be approved by the CEO only');
        }
        return fieldAllowanceRepository.decide({
            companyId: this.company(actor),
            requestId,
            approvedBy: actor.id,
            approverName: formatActorWithRole(actor),
            decision: payload.decision,
            approvedAmount: payload.decision === 'APPROVED' ? Number(payload.approvedAmount ?? (request.advance_required ? request.requested_amount : request.total_spent)) : 0,
            remarks: payload.remarks,
        });
    }
    async distribute(actor, requestId, payload) {
        if (!this.isAccounts(actor) && !this.isManagement(actor)) {
            throw new Error('Only Accounts or authorized Management can disburse funds');
        }
        if (payload.distributedAmount <= 0)
            throw new Error('Disbursed amount must be greater than zero');
        return fieldAllowanceRepository.distribute({
            companyId: this.company(actor),
            requestId,
            distributedBy: actor.id,
            distributorName: formatActorWithRole(actor),
            distributedAmount: payload.distributedAmount,
            distributionDate: payload.distributionDate,
            paymentMethod: payload.paymentMethod,
            referenceNumber: payload.referenceNumber,
            paymentProofPath: payload.paymentProofPath,
            remarks: payload.remarks,
        });
    }
    async addDailyReport(actor, requestId, payload) {
        const request = await fieldAllowanceRepository.getById(this.company(actor), requestId);
        if (!request || request.employee_id !== employeeKey(actor))
            throw new Error('Field trip was not found');
        const canReport = request.advance_required
            ? ['AMOUNT_DISTRIBUTED', 'IN_PROGRESS'].includes(request.status)
            : ['ACTIVE_VISIT', 'IN_PROGRESS', 'APPROVED', 'DRAFT', 'CORRECTION_REQUESTED'].includes(request.status);
        if (!canReport) {
            throw new Error(request.advance_required
                ? 'Daily reports can be added after distribution of the approved advance'
                : `Daily expenses cannot be recorded while trip status is ${request.status}`);
        }
        if (payload.expenseDate < request.start_date || payload.expenseDate > request.end_date) {
            throw new Error('Expense date must fall within the trip dates');
        }
        return fieldAllowanceRepository.addDailyReport({
            request_id: requestId,
            employee_id: employeeKey(actor),
            expense_date: payload.expenseDate,
            category: payload.category,
            amount: payload.amount,
            description: payload.description,
            attachment_path: payload.attachmentPath || null,
        });
    }
    async complete(actor, requestId) {
        const request = await fieldAllowanceRepository.getById(this.company(actor), requestId);
        if (!request || request.employee_id !== employeeKey(actor))
            throw new Error('Field trip was not found');
        const canComplete = request.advance_required
            ? ['AMOUNT_DISTRIBUTED', 'IN_PROGRESS'].includes(request.status)
            : ['ACTIVE_VISIT', 'IN_PROGRESS', 'APPROVED'].includes(request.status);
        if (!canComplete) {
            throw new Error(request.advance_required
                ? 'This field visit cannot be completed before the approved advance is distributed'
                : `This field visit cannot be completed while in status ${request.status}`);
        }
        return fieldAllowanceRepository.complete(this.company(actor), requestId, employeeKey(actor));
    }
    async submitBalance(actor, requestId, payload) {
        const request = await fieldAllowanceRepository.getById(this.company(actor), requestId);
        if (!request)
            throw new Error('Field trip was not found');
        if (!this.isManagement(actor) && !this.isAccounts(actor) && request.employee_id !== employeeKey(actor)) {
            throw new Error('You are not authorized to submit balance for this field trip');
        }
        if (!['AMOUNT_DISTRIBUTED', 'IN_PROGRESS', 'COMPLETED'].includes(request.status)) {
            throw new Error('Balance can only be submitted to Accounts for active or completed field visits');
        }
        return fieldAllowanceRepository.submitBalanceToAccounts({
            companyId: this.company(actor),
            requestId,
            paymentMethod: payload.paymentMethod,
            referenceNumber: payload.referenceNumber,
            paymentProofPath: payload.paymentProofPath,
            remarks: payload.remarks,
        });
    }
    async confirmBalance(actor, requestId, payload) {
        if (!this.isAccounts(actor) && !this.isManagement(actor)) {
            throw new Error('Only Accounts, HR, or CEO can confirm balance receipt');
        }
        return fieldAllowanceRepository.confirmBalanceReceived({
            companyId: this.company(actor),
            requestId,
            receivedBy: actor.id,
            receivedByName: formatActorWithRole(actor),
            paymentMethod: payload.paymentMethod,
            referenceNumber: payload.referenceNumber,
            paymentProofPath: payload.paymentProofPath,
            remarks: payload.remarks,
        });
    }
    async history(actor, filters) {
        if (!this.isAccounts(actor) && !this.isManagement(actor))
            throw new Error('Only Accounts, HR, or CEO can view distribution history');
        return fieldAllowanceRepository.distributionHistory(this.company(actor), filters.search, filters.startDate, filters.endDate);
    }
    async summary(actor) {
        if (!this.isManagement(actor))
            throw new Error('Only HR or CEO can view the Field Allowance summary');
        return fieldAllowanceRepository.summary(this.company(actor));
    }
}
export const fieldAllowanceService = new FieldAllowanceService();
//# sourceMappingURL=fieldAllowanceService.js.map