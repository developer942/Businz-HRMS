import { fieldAllowanceRepository } from '../repositories/fieldAllowanceRepository.js';
const managementRoles = new Set(['CEO', 'Super Admin', 'Admin', 'HR', 'HR Manager', 'HR Admin', 'Management', 'ERP Administrator']);
const accountsRoles = new Set(['Finance Manager', 'Finance', 'Accountant']);
const employeeKey = (actor) => actor.employeeId || actor.id;
export class FieldAllowanceService {
    isManagement(actor) { return managementRoles.has(actor.role); }
    isAccounts(actor) { return accountsRoles.has(actor.role) || this.isManagement(actor); }
    company(actor) { return actor.company_id || actor.companyId || 'company-a'; }
    async create(actor, payload) {
        return fieldAllowanceRepository.create({
            company_id: this.company(actor), employee_id: employeeKey(actor), employee_name: actor.name || actor.email,
            department_id: null, department_name: actor.department || '', purpose: payload.purpose,
            customer_site_name: payload.customerSiteName || null, destination: payload.destination,
            start_date: payload.startDate, end_date: payload.endDate, travel_mode: payload.travelMode || null,
            description: payload.description || null, advance_required: payload.advanceRequired,
            requested_amount: payload.advanceRequired ? payload.requestedAmount : 0,
            status: payload.submit ? 'PENDING_APPROVAL' : 'DRAFT',
        });
    }
    async update(actor, id, payload) {
        return fieldAllowanceRepository.updateDraft(this.company(actor), id, employeeKey(actor), {
            purpose: payload.purpose, customer_site_name: payload.customerSiteName || null,
            destination: payload.destination, start_date: payload.startDate, end_date: payload.endDate,
            travel_mode: payload.travelMode || null, description: payload.description || null,
            advance_required: payload.advanceRequired, requested_amount: payload.advanceRequired ? payload.requestedAmount : 0,
            status: payload.submit ? 'PENDING_APPROVAL' : 'DRAFT',
        }, payload.submit);
    }
    async list(actor, filters) {
        return fieldAllowanceRepository.list(this.company(actor), {
            ...filters,
            employeeId: this.isManagement(actor) || this.isAccounts(actor) ? undefined : employeeKey(actor),
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
        if (!this.isManagement(actor))
            throw new Error('Only HR or CEO can review Field Allowance requests');
        return fieldAllowanceRepository.decide({
            companyId: this.company(actor), requestId, approvedBy: actor.id, approverName: actor.name || actor.email,
            decision: payload.decision, approvedAmount: payload.decision === 'APPROVED' ? Number(payload.approvedAmount || 0) : 0,
            remarks: payload.remarks,
        });
    }
    async distribute(actor, requestId, payload) {
        if (!this.isAccounts(actor))
            throw new Error('Only Accounts can distribute Field Allowance amounts');
        if (payload.distributedAmount <= 0)
            throw new Error('Distributed amount must be greater than zero');
        return fieldAllowanceRepository.distribute({
            companyId: this.company(actor), requestId, distributedBy: actor.id, distributorName: actor.name || actor.email,
            distributedAmount: payload.distributedAmount, distributionDate: payload.distributionDate,
            paymentMethod: payload.paymentMethod, referenceNumber: payload.referenceNumber, remarks: payload.remarks,
        });
    }
    async addDailyReport(actor, requestId, payload) {
        const request = await fieldAllowanceRepository.getById(this.company(actor), requestId);
        if (!request || request.employee_id !== employeeKey(actor))
            throw new Error('Field trip was not found');
        const canReport = ['AMOUNT_DISTRIBUTED', 'IN_PROGRESS'].includes(request.status) ||
            (!request.advance_required && request.status === 'APPROVED');
        if (!canReport)
            throw new Error('Daily reports can be added after distribution, or after approval when no advance was requested');
        if (payload.expenseDate < request.start_date || payload.expenseDate > request.end_date) {
            throw new Error('Expense date must fall within the trip dates');
        }
        return fieldAllowanceRepository.addDailyReport({
            request_id: requestId, employee_id: employeeKey(actor), expense_date: payload.expenseDate,
            category: payload.category, amount: payload.amount, description: payload.description,
            attachment_path: payload.attachmentPath || null,
        });
    }
    async complete(actor, requestId) {
        const request = await fieldAllowanceRepository.getById(this.company(actor), requestId);
        if (!request || request.employee_id !== employeeKey(actor))
            throw new Error('Field trip was not found');
        const canComplete = ['AMOUNT_DISTRIBUTED', 'IN_PROGRESS'].includes(request.status) ||
            (!request.advance_required && request.status === 'APPROVED');
        if (!canComplete)
            throw new Error('This field visit cannot be completed before the approved advance is distributed');
        return fieldAllowanceRepository.complete(this.company(actor), requestId, employeeKey(actor));
    }
    async history(actor, filters) {
        if (!this.isAccounts(actor))
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