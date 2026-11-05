import { Decimal } from 'decimal.js';
import { query } from '../config/database.js';
export class FieldAdvanceRepository {
    // In-memory synchronized store for offline and test environments
    advances = new Map();
    approvals = [];
    disbursements = [];
    expenses = new Map();
    settlements = new Map();
    balanceReturns = new Map();
    reimbursements = [];
    auditLogs = [];
    lockPromise = Promise.resolve();
    async acquireLock(work) {
        let release;
        const waitPromise = new Promise((resolve) => {
            release = resolve;
        });
        const currentLock = this.lockPromise;
        this.lockPromise = this.lockPromise.then(() => waitPromise);
        await currentLock;
        try {
            return await work();
        }
        finally {
            release();
        }
    }
    // ============================================================
    // AUDIT LOGGING HELPER
    // ============================================================
    async logAudit(params) {
        const entry = {
            id: `fva-log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            entity_type: params.entity_type,
            entity_id: params.entity_id,
            action: params.action,
            actor_id: params.actor_id || null,
            actor_name: params.actor_name || null,
            actor_role: params.actor_role || null,
            previous_status: params.previous_status || null,
            new_status: params.new_status || null,
            event_payload: params.event_payload || {},
            created_at: new Date().toISOString(),
        };
        this.auditLogs.unshift(entry);
        try {
            await query(`INSERT INTO public.field_visit_audit_logs 
          (id, entity_type, entity_id, action, actor_id, actor_name, actor_role, previous_status, new_status, event_payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [
                entry.id,
                entry.entity_type,
                entry.entity_id,
                entry.action,
                entry.actor_id,
                entry.actor_name,
                entry.actor_role,
                entry.previous_status,
                entry.new_status,
                JSON.stringify(entry.event_payload || {}),
                entry.created_at,
            ]);
        }
        catch {
            // In-memory fallback retained
        }
    }
    // ============================================================
    // REQUEST NUMBER GENERATOR
    // ============================================================
    async generateRequestNumber(companyId) {
        const now = new Date();
        const prefix = `FVA-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        try {
            const res = await query(`SELECT COUNT(*) as count FROM public.field_visit_advances WHERE company_id = $1 AND request_number LIKE $2`, [companyId, `${prefix}%`]);
            const count = Number(res?.rows?.[0]?.count || 0) + 1;
            return `${prefix}-${String(count).padStart(4, '0')}`;
        }
        catch {
            let count = 1;
            for (const adv of this.advances.values()) {
                if (adv.company_id === companyId && adv.request_number.startsWith(prefix)) {
                    count++;
                }
            }
            return `${prefix}-${String(count).padStart(4, '0')}`;
        }
    }
    // ============================================================
    // 1. CREATE FIELD VISIT
    // ============================================================
    async createVisit(companyId, data, actor) {
        return this.acquireLock(async () => {
            const id = `fva-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            const reqNumber = await this.generateRequestNumber(companyId);
            const isAdvance = data.funding_type === 'advance';
            const requestedAmt = isAdvance ? Number(data.requested_amount || 0) : 0;
            const initialStatus = isAdvance ? 'Pending Advance Approval' : 'Active';
            const now = new Date().toISOString();
            const visit = {
                id,
                request_number: reqNumber,
                company_id: companyId,
                employee_id: data.employee_id,
                employee_code: data.employee_code || '',
                employee_name: data.employee_name,
                department_id: data.department_id || null,
                department_name: data.department_name || null,
                purpose: data.purpose,
                client_name: data.client_name,
                destination: data.destination,
                start_date: data.start_date,
                end_date: data.end_date,
                funding_type: data.funding_type,
                requested_amount: requestedAmt,
                approved_amount: null,
                disbursed_amount: 0,
                travel_mode: data.travel_mode || null,
                justification: data.justification || null,
                estimated_breakdown: data.estimated_breakdown || [],
                supporting_documents: data.supporting_documents || [],
                remarks: data.remarks || null,
                status: initialStatus,
                created_by: actor?.id || data.employee_id,
                created_at: now,
                updated_at: now,
            };
            this.advances.set(id, visit);
            try {
                await query(`INSERT INTO public.field_visit_advances 
            (id, request_number, company_id, employee_id, employee_code, employee_name, department_id, department_name, 
             purpose, client_name, destination, start_date, end_date, funding_type, requested_amount, approved_amount, 
             disbursed_amount, travel_mode, justification, estimated_breakdown, supporting_documents, remarks, status, 
             created_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)`, [
                    visit.id,
                    visit.request_number,
                    visit.company_id,
                    visit.employee_id,
                    visit.employee_code,
                    visit.employee_name,
                    visit.department_id,
                    visit.department_name,
                    visit.purpose,
                    visit.client_name,
                    visit.destination,
                    visit.start_date,
                    visit.end_date,
                    visit.funding_type,
                    visit.requested_amount,
                    visit.approved_amount,
                    visit.disbursed_amount,
                    visit.travel_mode,
                    visit.justification,
                    JSON.stringify(visit.estimated_breakdown || []),
                    JSON.stringify(visit.supporting_documents || []),
                    visit.remarks,
                    visit.status,
                    visit.created_by,
                    visit.created_at,
                    visit.updated_at,
                ]);
            }
            catch {
                // In-memory fallback
            }
            await this.logAudit({
                entity_type: 'ADVANCE',
                entity_id: visit.id,
                action: isAdvance ? 'FIELD_VISIT_ADVANCE_REQUESTED' : 'FIELD_VISIT_PERSONAL_STARTED',
                actor_id: actor?.id,
                actor_name: actor?.name,
                actor_role: actor?.role,
                previous_status: null,
                new_status: visit.status,
                event_payload: {
                    funding_type: visit.funding_type,
                    requested_amount: visit.requested_amount,
                    client_name: visit.client_name,
                    destination: visit.destination,
                },
            });
            return visit;
        });
    }
    // ============================================================
    // 2. CEO / HR ADVANCE APPROVAL
    // ============================================================
    async approveAdvance(advanceId, input, actor) {
        return this.acquireLock(async () => {
            const visit = await this.getVisitById(advanceId);
            if (!visit) {
                throw new Error(`Field visit with ID ${advanceId} not found.`);
            }
            if (visit.funding_type !== 'advance') {
                throw new Error(`Cannot approve advance for personal-money visit.`);
            }
            if (visit.status !== 'Pending Advance Approval' && visit.status !== 'Advance Correction Requested') {
                throw new Error(`Field visit is in '${visit.status}' status and cannot be approved.`);
            }
            const prevStatus = visit.status;
            let newStatus;
            let finalApprovedAmount = null;
            if (input.decision === 'Approved') {
                newStatus = 'Advance Approved';
                finalApprovedAmount = input.approved_amount !== undefined && input.approved_amount !== null
                    ? Number(input.approved_amount)
                    : visit.requested_amount;
                if (finalApprovedAmount <= 0) {
                    throw new Error('Approved advance amount must be greater than 0.');
                }
            }
            else if (input.decision === 'Rejected') {
                newStatus = 'Advance Rejected';
            }
            else {
                newStatus = 'Advance Correction Requested';
            }
            const approvalRecord = {
                id: `fva-app-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                advance_id: advanceId,
                approver_id: actor.id,
                approver_name: actor.name || null,
                decision: input.decision,
                approved_amount: finalApprovedAmount,
                reason: input.reason || null,
                created_at: new Date().toISOString(),
            };
            this.approvals.push(approvalRecord);
            visit.status = newStatus;
            visit.approved_amount = finalApprovedAmount;
            visit.updated_at = new Date().toISOString();
            this.advances.set(advanceId, visit);
            try {
                await query(`INSERT INTO public.field_visit_advance_approvals 
            (id, advance_id, approver_id, approver_name, decision, approved_amount, reason, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
                    approvalRecord.id,
                    approvalRecord.advance_id,
                    approvalRecord.approver_id,
                    approvalRecord.approver_name,
                    approvalRecord.decision,
                    approvalRecord.approved_amount,
                    approvalRecord.reason,
                    approvalRecord.created_at,
                ]);
                await query(`UPDATE public.field_visit_advances 
           SET status = $1, approved_amount = $2, updated_at = $3
           WHERE id = $4`, [visit.status, visit.approved_amount, visit.updated_at, visit.id]);
            }
            catch {
                // Fallback maintained in memory
            }
            await this.logAudit({
                entity_type: 'ADVANCE',
                entity_id: visit.id,
                action: `ADVANCE_${input.decision.toUpperCase().replace(/\s+/g, '_')}`,
                actor_id: actor.id,
                actor_name: actor.name,
                actor_role: actor.role,
                previous_status: prevStatus,
                new_status: visit.status,
                event_payload: {
                    decision: input.decision,
                    approved_amount: visit.approved_amount,
                    reason: input.reason,
                },
            });
            return visit;
        });
    }
    // ============================================================
    // 3. ACCOUNTS DISBURSE ADVANCE
    // ============================================================
    async disburseAdvance(advanceId, input, actor) {
        return this.acquireLock(async () => {
            const visit = await this.getVisitById(advanceId);
            if (!visit) {
                throw new Error(`Field visit with ID ${advanceId} not found.`);
            }
            if (visit.funding_type !== 'advance') {
                throw new Error(`Personal funded visits do not require advance disbursement.`);
            }
            if (visit.status !== 'Advance Approved' && visit.status !== 'Active' && visit.status !== 'Advance Disbursed') {
                throw new Error(`Duplicate transaction blocked or invalid state: Advance must be in 'Advance Approved' status before disbursement. Current status: ${visit.status}`);
            }
            if (input.payment_reference &&
                this.disbursements.some((d) => d.advance_id === advanceId && d.payment_reference === input.payment_reference)) {
                throw new Error(`Duplicate transaction blocked: Payment reference '${input.payment_reference}' has already been recorded for this advance.`);
            }
            if (visit.status === 'Active' && !input.payment_reference) {
                throw new Error(`Duplicate transaction blocked: Advance has already been disbursed for this visit.`);
            }
            const prevStatus = visit.status;
            const amount = new Decimal(input.amount).toNumber();
            if (amount <= 0) {
                throw new Error('Disbursed amount must be greater than zero.');
            }
            const disbursementRecord = {
                id: `fva-disb-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                advance_id: advanceId,
                amount,
                payment_method: input.payment_method,
                payment_reference: input.payment_reference || null,
                proof_reference: input.proof_reference || null,
                accounts_user_id: actor.id,
                accounts_user_name: actor.name || null,
                remarks: input.remarks || null,
                disbursed_at: new Date().toISOString(),
                status: 'Disbursed',
            };
            this.disbursements.push(disbursementRecord);
            visit.disbursed_amount = new Decimal(visit.disbursed_amount || 0).plus(amount).toNumber();
            visit.status = 'Active'; // Immediately active for expense logging
            visit.updated_at = new Date().toISOString();
            this.advances.set(advanceId, visit);
            try {
                await query(`INSERT INTO public.field_visit_advance_disbursements 
            (id, advance_id, amount, payment_method, payment_reference, proof_reference, accounts_user_id, accounts_user_name, remarks, disbursed_at, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [
                    disbursementRecord.id,
                    disbursementRecord.advance_id,
                    disbursementRecord.amount,
                    disbursementRecord.payment_method,
                    disbursementRecord.payment_reference,
                    disbursementRecord.proof_reference,
                    disbursementRecord.accounts_user_id,
                    disbursementRecord.accounts_user_name,
                    disbursementRecord.remarks,
                    disbursementRecord.disbursed_at,
                    disbursementRecord.status,
                ]);
                await query(`UPDATE public.field_visit_advances 
           SET disbursed_amount = $1, status = $2, updated_at = $3
           WHERE id = $4`, [visit.disbursed_amount, visit.status, visit.updated_at, visit.id]);
            }
            catch {
                // In-memory fallback
            }
            await this.logAudit({
                entity_type: 'DISBURSEMENT',
                entity_id: disbursementRecord.id,
                action: 'ADVANCE_DISBURSED',
                actor_id: actor.id,
                actor_name: actor.name,
                actor_role: actor.role,
                previous_status: prevStatus,
                new_status: visit.status,
                event_payload: {
                    disbursed_amount: amount,
                    payment_method: input.payment_method,
                    payment_reference: input.payment_reference,
                },
            });
            return visit;
        });
    }
    // ============================================================
    // 4. DAILY EXPENSE ENTRIES
    // ============================================================
    async addExpenseItem(advanceId, input, actor) {
        return this.acquireLock(async () => {
            const visit = await this.getVisitById(advanceId);
            if (!visit) {
                throw new Error(`Field visit with ID ${advanceId} not found.`);
            }
            const allowedStatuses = ['Active', 'Draft', 'Settlement Correction Requested'];
            if (!allowedStatuses.includes(visit.status)) {
                throw new Error(`Cannot add expenses when visit is in '${visit.status}' status.`);
            }
            const id = `fva-exp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            const now = new Date().toISOString();
            const expenseItem = {
                id,
                advance_id: advanceId,
                employee_id: visit.employee_id,
                expense_date: input.expense_date,
                category: input.category,
                amount: new Decimal(input.amount).toNumber(),
                description: input.description,
                payment_method: input.payment_method || null,
                remarks: input.remarks || null,
                receipt_url: input.receipt_url || null,
                receipt_file_name: input.receipt_file_name || null,
                approval_status: 'Submitted',
                rejection_reason: null,
                created_by: actor.id,
                created_at: now,
                updated_at: now,
            };
            this.expenses.set(id, expenseItem);
            try {
                await query(`INSERT INTO public.field_visit_expenses 
            (id, advance_id, employee_id, expense_date, category, amount, description, payment_method, remarks, receipt_url, receipt_file_name, approval_status, rejection_reason, created_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`, [
                    expenseItem.id,
                    expenseItem.advance_id,
                    expenseItem.employee_id,
                    expenseItem.expense_date,
                    expenseItem.category,
                    expenseItem.amount,
                    expenseItem.description,
                    expenseItem.payment_method,
                    expenseItem.remarks,
                    expenseItem.receipt_url,
                    expenseItem.receipt_file_name,
                    expenseItem.approval_status,
                    expenseItem.rejection_reason,
                    expenseItem.created_by,
                    expenseItem.created_at,
                    expenseItem.updated_at,
                ]);
            }
            catch {
                // In-memory fallback
            }
            await this.logAudit({
                entity_type: 'EXPENSE',
                entity_id: expenseItem.id,
                action: 'EXPENSE_RECORDED',
                actor_id: actor.id,
                actor_name: actor.name,
                actor_role: actor.role,
                previous_status: null,
                new_status: expenseItem.approval_status,
                event_payload: {
                    category: expenseItem.category,
                    amount: expenseItem.amount,
                    expense_date: expenseItem.expense_date,
                },
            });
            return expenseItem;
        });
    }
    async updateExpenseItem(expenseId, input, actor) {
        return this.acquireLock(async () => {
            let expense = this.expenses.get(expenseId) || null;
            if (!expense) {
                try {
                    const res = await query(`SELECT * FROM public.field_visit_expenses WHERE id = $1`, [expenseId]);
                    if (res?.rows?.[0]) {
                        expense = {
                            ...res.rows[0],
                            amount: Number(res.rows[0].amount),
                        };
                    }
                }
                catch {
                    // ignore
                }
            }
            if (!expense) {
                throw new Error(`Expense item with ID ${expenseId} not found.`);
            }
            const visit = await this.getVisitById(expense.advance_id);
            if (!visit || !['Active', 'Draft', 'Settlement Correction Requested'].includes(visit.status)) {
                throw new Error(`Cannot edit expense when visit is in '${visit?.status}' status.`);
            }
            if (input.expense_date !== undefined)
                expense.expense_date = input.expense_date;
            if (input.category !== undefined)
                expense.category = input.category;
            if (input.amount !== undefined)
                expense.amount = new Decimal(input.amount).toNumber();
            if (input.description !== undefined)
                expense.description = input.description;
            if (input.receipt_url !== undefined)
                expense.receipt_url = input.receipt_url;
            if (input.receipt_file_name !== undefined)
                expense.receipt_file_name = input.receipt_file_name;
            expense.updated_at = new Date().toISOString();
            this.expenses.set(expenseId, expense);
            try {
                await query(`UPDATE public.field_visit_expenses 
           SET expense_date = $1, category = $2, amount = $3, description = $4, receipt_url = $5, receipt_file_name = $6, updated_at = $7
           WHERE id = $8`, [
                    expense.expense_date,
                    expense.category,
                    expense.amount,
                    expense.description,
                    expense.receipt_url,
                    expense.receipt_file_name,
                    expense.updated_at,
                    expense.id,
                ]);
            }
            catch {
                // In-memory fallback
            }
            await this.logAudit({
                entity_type: 'EXPENSE',
                entity_id: expense.id,
                action: 'EXPENSE_UPDATED',
                actor_id: actor.id,
                actor_name: actor.name,
                actor_role: actor.role,
                event_payload: {
                    category: expense.category,
                    amount: expense.amount,
                },
            });
            return expense;
        });
    }
    async deleteExpenseItem(expenseId, actor) {
        return this.acquireLock(async () => {
            let expense = this.expenses.get(expenseId) || null;
            if (!expense) {
                try {
                    const res = await query(`SELECT * FROM public.field_visit_expenses WHERE id = $1`, [expenseId]);
                    if (res?.rows?.[0]) {
                        expense = { ...res.rows[0], amount: Number(res.rows[0].amount) };
                    }
                }
                catch {
                    // ignore
                }
            }
            if (!expense) {
                throw new Error(`Expense item with ID ${expenseId} not found.`);
            }
            const visit = await this.getVisitById(expense.advance_id);
            if (!visit || !['Active', 'Draft', 'Settlement Correction Requested'].includes(visit.status)) {
                throw new Error(`Cannot delete expense when visit is in '${visit?.status}' status.`);
            }
            this.expenses.delete(expenseId);
            try {
                await query(`DELETE FROM public.field_visit_expenses WHERE id = $1`, [expenseId]);
            }
            catch {
                // in-memory fallback
            }
            await this.logAudit({
                entity_type: 'EXPENSE',
                entity_id: expenseId,
                action: 'EXPENSE_DELETED',
                actor_id: actor.id,
                actor_name: actor.name,
                actor_role: actor.role,
                event_payload: { advance_id: expense.advance_id, amount: expense.amount },
            });
        });
    }
    // ============================================================
    // 5. SUBMIT SETTLEMENT
    // ============================================================
    async submitSettlement(advanceId, employeeRemarks, actor) {
        return this.acquireLock(async () => {
            const visit = await this.getVisitById(advanceId);
            if (!visit) {
                throw new Error(`Field visit with ID ${advanceId} not found.`);
            }
            if (!['Active', 'Advance Disbursed', 'Settlement Correction Requested'].includes(visit.status)) {
                throw new Error(`Cannot submit settlement for field visit in status '${visit.status}'.`);
            }
            const expenses = await this.getExpensesForAdvance(advanceId);
            if (expenses.length === 0) {
                throw new Error('At least one expense must be recorded before submitting settlement.');
            }
            // Exact decimal arithmetic
            const A = new Decimal(visit.disbursed_amount || 0); // Confirmed advance
            let D = new Decimal(0); // Total recorded expenses
            for (const exp of expenses) {
                D = D.plus(exp.amount);
            }
            const B = A.minus(D); // Provisional balance (negative if excess)
            const prevStatus = visit.status;
            const now = new Date().toISOString();
            let settlement = await this.getSettlementForAdvance(advanceId);
            const settlementId = settlement?.id || `fva-set-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            settlement = {
                id: settlementId,
                advance_id: advanceId,
                total_disbursed: A.toNumber(),
                total_recorded_expense: D.toNumber(),
                total_eligible_expense: 0, // Not yet approved
                provisional_balance: B.toNumber(),
                net_settlement: 0,
                return_due: 0,
                reimbursement_due: 0,
                actual_returned: settlement?.actual_returned || 0,
                actual_reimbursed: settlement?.actual_reimbursed || 0,
                employee_remarks: employeeRemarks || null,
                approver_id: null,
                approver_name: null,
                approval_reason: null,
                approval_status: 'Pending Approval',
                settlement_status: 'Pending Approval',
                submitted_at: now,
                approved_at: null,
                completed_at: null,
                created_at: settlement?.created_at || now,
                updated_at: now,
            };
            this.settlements.set(advanceId, settlement);
            visit.status = 'Settlement Submitted';
            visit.updated_at = now;
            this.advances.set(advanceId, visit);
            try {
                await query(`INSERT INTO public.field_visit_settlements 
            (id, advance_id, total_disbursed, total_recorded_expense, total_eligible_expense, provisional_balance, 
             net_settlement, return_due, reimbursement_due, actual_returned, actual_reimbursed, employee_remarks, 
             approval_status, settlement_status, submitted_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
           ON CONFLICT (advance_id) DO UPDATE SET 
             total_disbursed = EXCLUDED.total_disbursed,
             total_recorded_expense = EXCLUDED.total_recorded_expense,
             provisional_balance = EXCLUDED.provisional_balance,
             employee_remarks = EXCLUDED.employee_remarks,
             approval_status = EXCLUDED.approval_status,
             settlement_status = EXCLUDED.settlement_status,
             submitted_at = EXCLUDED.submitted_at,
             updated_at = EXCLUDED.updated_at`, [
                    settlement.id,
                    settlement.advance_id,
                    settlement.total_disbursed,
                    settlement.total_recorded_expense,
                    settlement.total_eligible_expense,
                    settlement.provisional_balance,
                    settlement.net_settlement,
                    settlement.return_due,
                    settlement.reimbursement_due,
                    settlement.actual_returned,
                    settlement.actual_reimbursed,
                    settlement.employee_remarks,
                    settlement.approval_status,
                    settlement.settlement_status,
                    settlement.submitted_at,
                    settlement.created_at,
                    settlement.updated_at,
                ]);
                await query(`UPDATE public.field_visit_advances SET status = $1, updated_at = $2 WHERE id = $3`, [visit.status, visit.updated_at, visit.id]);
            }
            catch {
                // In-memory fallback
            }
            await this.logAudit({
                entity_type: 'SETTLEMENT',
                entity_id: settlement.id,
                action: 'SETTLEMENT_SUBMITTED',
                actor_id: actor.id,
                actor_name: actor.name,
                actor_role: actor.role,
                previous_status: prevStatus,
                new_status: visit.status,
                event_payload: {
                    total_disbursed: settlement.total_disbursed,
                    total_recorded_expense: settlement.total_recorded_expense,
                    provisional_balance: settlement.provisional_balance,
                },
            });
            return settlement;
        });
    }
    // ============================================================
    // 6. CEO / HR SETTLEMENT APPROVAL & REVIEW
    // ============================================================
    async reviewSettlement(advanceId, input, actor) {
        return this.acquireLock(async () => {
            const visit = await this.getVisitById(advanceId);
            if (!visit) {
                throw new Error(`Field visit with ID ${advanceId} not found.`);
            }
            if (visit.status !== 'Settlement Submitted') {
                throw new Error(`Settlement must be in 'Settlement Submitted' status. Current status: ${visit.status}`);
            }
            let settlement = await this.getSettlementForAdvance(advanceId);
            if (!settlement) {
                throw new Error('Settlement record not found.');
            }
            const prevStatus = visit.status;
            const now = new Date().toISOString();
            if (input.decision === 'Correction Requested') {
                visit.status = 'Settlement Correction Requested';
                visit.updated_at = now;
                settlement.approval_status = 'Correction Requested';
                settlement.settlement_status = 'Correction Requested';
                settlement.approval_reason = input.approval_reason || null;
                settlement.approver_id = actor.id;
                settlement.approver_name = actor.name || null;
                settlement.updated_at = now;
                this.advances.set(advanceId, visit);
                this.settlements.set(advanceId, settlement);
                try {
                    await query(`UPDATE public.field_visit_settlements 
             SET approval_status = $1, settlement_status = $2, approval_reason = $3, approver_id = $4, approver_name = $5, updated_at = $6
             WHERE advance_id = $7`, [settlement.approval_status, settlement.settlement_status, settlement.approval_reason, settlement.approver_id, settlement.approver_name, now, advanceId]);
                    await query(`UPDATE public.field_visit_advances SET status = $1, updated_at = $2 WHERE id = $3`, [visit.status, now, advanceId]);
                }
                catch {
                    // fallback
                }
                await this.logAudit({
                    entity_type: 'SETTLEMENT',
                    entity_id: settlement.id,
                    action: 'SETTLEMENT_CORRECTION_REQUESTED',
                    actor_id: actor.id,
                    actor_name: actor.name,
                    actor_role: actor.role,
                    previous_status: prevStatus,
                    new_status: visit.status,
                    event_payload: { reason: input.approval_reason },
                });
                return { visit, settlement };
            }
            if (input.decision === 'Rejected') {
                visit.status = 'Active';
                visit.updated_at = now;
                settlement.approval_status = 'Rejected';
                settlement.settlement_status = 'Draft';
                settlement.approval_reason = input.approval_reason || null;
                settlement.approver_id = actor.id;
                settlement.approver_name = actor.name || null;
                settlement.updated_at = now;
                this.advances.set(advanceId, visit);
                this.settlements.set(advanceId, settlement);
                try {
                    await query(`UPDATE public.field_visit_settlements 
             SET approval_status = $1, settlement_status = $2, approval_reason = $3, approver_id = $4, approver_name = $5, updated_at = $6
             WHERE advance_id = $7`, [settlement.approval_status, settlement.settlement_status, settlement.approval_reason, settlement.approver_id, settlement.approver_name, now, advanceId]);
                    await query(`UPDATE public.field_visit_advances SET status = $1, updated_at = $2 WHERE id = $3`, [visit.status, now, advanceId]);
                }
                catch {
                    // fallback
                }
                await this.logAudit({
                    entity_type: 'SETTLEMENT',
                    entity_id: settlement.id,
                    action: 'SETTLEMENT_REJECTED',
                    actor_id: actor.id,
                    actor_name: actor.name,
                    actor_role: actor.role,
                    previous_status: prevStatus,
                    new_status: visit.status,
                    event_payload: { reason: input.approval_reason },
                });
                return { visit, settlement };
            }
            // DECISION IS APPROVED:
            // Update individual expense items if provided
            const expenses = await this.getExpensesForAdvance(advanceId);
            const itemStatusMap = new Map();
            if (input.expense_items && input.expense_items.length > 0) {
                input.expense_items.forEach((item) => {
                    itemStatusMap.set(item.id, {
                        approval_status: item.approval_status,
                        rejection_reason: item.rejection_reason || null,
                    });
                });
            }
            let E = new Decimal(0); // Approved eligible expenses
            for (const exp of expenses) {
                const itemOverride = itemStatusMap.get(exp.id);
                const approvedState = itemOverride ? itemOverride.approval_status : 'Approved';
                const rejectionReason = itemOverride ? itemOverride.rejection_reason || null : null;
                exp.approval_status = approvedState;
                exp.rejection_reason = rejectionReason;
                exp.updated_at = now;
                this.expenses.set(exp.id, exp);
                try {
                    await query(`UPDATE public.field_visit_expenses 
             SET approval_status = $1, rejection_reason = $2, updated_at = $3
             WHERE id = $4`, [approvedState, rejectionReason, now, exp.id]);
                }
                catch {
                    // fallback
                }
                if (approvedState === 'Approved') {
                    E = E.plus(exp.amount);
                }
            }
            const A = new Decimal(visit.disbursed_amount || 0); // Confirmed company advance
            const F = A.minus(E); // Final Approved Settlement Balance: F = A - E
            let newVisitStatus;
            let newSettlementStatus;
            let returnDue = 0;
            let reimbursementDue = 0;
            if (F.gt(0)) {
                // Scenario 1: Advance > Eligible Expenses -> Employee returns unused balance
                returnDue = F.toNumber();
                reimbursementDue = 0;
                newVisitStatus = 'Pending Balance Collection';
                newSettlementStatus = 'Pending Balance Collection';
            }
            else if (F.lt(0)) {
                // Scenario 2 / Scenario 3: Expenses exceed advance (or personal money) -> Reimburse employee
                returnDue = 0;
                reimbursementDue = F.abs().toNumber();
                newVisitStatus = 'Pending Reimbursement';
                newSettlementStatus = 'Pending Reimbursement';
            }
            else {
                // Exactly balanced: F = 0
                returnDue = 0;
                reimbursementDue = 0;
                newVisitStatus = 'Completed';
                newSettlementStatus = 'Completed';
                settlement.completed_at = now;
            }
            settlement.total_disbursed = A.toNumber();
            settlement.total_eligible_expense = E.toNumber();
            settlement.net_settlement = F.toNumber();
            settlement.return_due = returnDue;
            settlement.reimbursement_due = reimbursementDue;
            settlement.approval_status = 'Approved';
            settlement.settlement_status = newSettlementStatus;
            settlement.approver_id = actor.id;
            settlement.approver_name = actor.name || null;
            settlement.approval_reason = input.approval_reason || null;
            settlement.approved_at = now;
            settlement.updated_at = now;
            visit.status = newVisitStatus;
            visit.updated_at = now;
            this.settlements.set(advanceId, settlement);
            this.advances.set(advanceId, visit);
            try {
                await query(`UPDATE public.field_visit_settlements 
           SET total_eligible_expense = $1, net_settlement = $2, return_due = $3, reimbursement_due = $4, 
               approval_status = $5, settlement_status = $6, approver_id = $7, approver_name = $8, 
               approval_reason = $9, approved_at = $10, completed_at = $11, updated_at = $12
           WHERE advance_id = $13`, [
                    settlement.total_eligible_expense,
                    settlement.net_settlement,
                    settlement.return_due,
                    settlement.reimbursement_due,
                    settlement.approval_status,
                    settlement.settlement_status,
                    settlement.approver_id,
                    settlement.approver_name,
                    settlement.approval_reason,
                    settlement.approved_at,
                    settlement.completed_at,
                    settlement.updated_at,
                    advanceId,
                ]);
                await query(`UPDATE public.field_visit_advances SET status = $1, updated_at = $2 WHERE id = $3`, [
                    visit.status,
                    now,
                    advanceId,
                ]);
            }
            catch {
                // fallback
            }
            await this.logAudit({
                entity_type: 'SETTLEMENT',
                entity_id: settlement.id,
                action: 'SETTLEMENT_APPROVED',
                actor_id: actor.id,
                actor_name: actor.name,
                actor_role: actor.role,
                previous_status: prevStatus,
                new_status: visit.status,
                event_payload: {
                    confirmed_advance: A.toNumber(),
                    eligible_expenses: E.toNumber(),
                    net_settlement: F.toNumber(),
                    return_due: returnDue,
                    reimbursement_due: reimbursementDue,
                    final_status: newVisitStatus,
                },
            });
            return { visit, settlement };
        });
    }
    // ============================================================
    // 7. FINANCIAL RESOLUTION: SCENARIO 1 (UNUSED ADVANCE RETURN)
    // ============================================================
    async reportBalanceReturn(advanceId, input, actor) {
        return this.acquireLock(async () => {
            const visit = await this.getVisitById(advanceId);
            if (!visit) {
                throw new Error(`Field visit with ID ${advanceId} not found.`);
            }
            const settlement = await this.getSettlementForAdvance(advanceId);
            if (!settlement) {
                throw new Error('Settlement record not found.');
            }
            if (settlement.return_due <= 0) {
                throw new Error('No balance return is due for this visit.');
            }
            const id = `fva-ret-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            const amount = new Decimal(input.employee_reported_amount).toNumber();
            const returnRecord = {
                id,
                settlement_id: settlement.id,
                advance_id: advanceId,
                employee_reported_amount: amount,
                actual_received_amount: null,
                payment_method: input.payment_method,
                payment_reference: input.payment_reference || null,
                proof_reference: input.proof_reference || null,
                handover_date: input.handover_date,
                receipt_date: null,
                employee_remarks: input.employee_remarks || null,
                accounts_remarks: null,
                confirmed_by: null,
                confirmed_by_name: null,
                confirmed_at: null,
                status: 'Awaiting Confirmation',
            };
            this.balanceReturns.set(id, returnRecord);
            try {
                await query(`INSERT INTO public.field_visit_balance_returns 
            (id, settlement_id, advance_id, employee_reported_amount, actual_received_amount, payment_method, 
             payment_reference, proof_reference, handover_date, receipt_date, employee_remarks, accounts_remarks, 
             confirmed_by, confirmed_by_name, confirmed_at, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`, [
                    returnRecord.id,
                    returnRecord.settlement_id,
                    returnRecord.advance_id,
                    returnRecord.employee_reported_amount,
                    returnRecord.actual_received_amount,
                    returnRecord.payment_method,
                    returnRecord.payment_reference,
                    returnRecord.proof_reference,
                    returnRecord.handover_date,
                    returnRecord.receipt_date,
                    returnRecord.employee_remarks,
                    returnRecord.accounts_remarks,
                    returnRecord.confirmed_by,
                    returnRecord.confirmed_by_name,
                    returnRecord.confirmed_at,
                    returnRecord.status,
                ]);
            }
            catch {
                // fallback
            }
            await this.logAudit({
                entity_type: 'RETURN',
                entity_id: returnRecord.id,
                action: 'BALANCE_RETURN_REPORTED',
                actor_id: actor.id,
                actor_name: actor.name,
                actor_role: actor.role,
                previous_status: null,
                new_status: 'Awaiting Confirmation',
                event_payload: {
                    employee_reported_amount: amount,
                    payment_method: input.payment_method,
                    handover_date: input.handover_date,
                },
            });
            return returnRecord;
        });
    }
    async confirmBalanceReturn(returnId, input, actor) {
        return this.acquireLock(async () => {
            let returnRecord = this.balanceReturns.get(returnId) || null;
            if (!returnRecord) {
                try {
                    const res = await query(`SELECT * FROM public.field_visit_balance_returns WHERE id = $1`, [returnId]);
                    if (res?.rows?.[0]) {
                        returnRecord = {
                            ...res.rows[0],
                            employee_reported_amount: Number(res.rows[0].employee_reported_amount),
                            actual_received_amount: res.rows[0].actual_received_amount ? Number(res.rows[0].actual_received_amount) : null,
                        };
                    }
                }
                catch {
                    // ignore
                }
            }
            if (!returnRecord) {
                throw new Error(`Balance return record ${returnId} not found.`);
            }
            if (returnRecord.status === 'Confirmed') {
                throw new Error(`Duplicate transaction blocked: Balance return ${returnId} has already been confirmed.`);
            }
            const advanceId = returnRecord.advance_id;
            const visit = await this.getVisitById(advanceId);
            const settlement = await this.getSettlementForAdvance(advanceId);
            if (!visit || !settlement) {
                throw new Error('Associated visit or settlement not found.');
            }
            const receivedAmt = new Decimal(input.actual_received_amount).toNumber();
            const now = new Date().toISOString();
            returnRecord.actual_received_amount = receivedAmt;
            returnRecord.receipt_date = input.receipt_date;
            returnRecord.accounts_remarks = input.accounts_remarks || null;
            returnRecord.confirmed_by = actor.id;
            returnRecord.confirmed_by_name = actor.name || null;
            returnRecord.confirmed_at = now;
            returnRecord.status = input.status;
            this.balanceReturns.set(returnId, returnRecord);
            // Reconcile settlement actual_returned with Decimal precision
            if (input.status === 'Confirmed' || input.status === 'Partial Receipt') {
                const totalReturned = new Decimal(settlement.actual_returned || 0).plus(receivedAmt);
                settlement.actual_returned = totalReturned.toNumber();
                settlement.updated_at = now;
                const returnDue = new Decimal(settlement.return_due);
                if (totalReturned.gte(returnDue)) {
                    // Fully collected!
                    visit.status = 'Completed';
                    settlement.settlement_status = 'Completed';
                    settlement.completed_at = now;
                }
                else {
                    // Partial collection
                    visit.status = 'Partially Collected';
                    settlement.settlement_status = 'Partially Settled';
                }
                visit.updated_at = now;
                this.settlements.set(advanceId, settlement);
                this.advances.set(advanceId, visit);
                try {
                    await query(`UPDATE public.field_visit_settlements 
             SET actual_returned = $1, settlement_status = $2, completed_at = $3, updated_at = $4
             WHERE id = $5`, [settlement.actual_returned, settlement.settlement_status, settlement.completed_at, settlement.updated_at, settlement.id]);
                    await query(`UPDATE public.field_visit_advances SET status = $1, updated_at = $2 WHERE id = $3`, [
                        visit.status,
                        visit.updated_at,
                        visit.id,
                    ]);
                }
                catch {
                    // fallback
                }
            }
            try {
                await query(`UPDATE public.field_visit_balance_returns 
           SET actual_received_amount = $1, receipt_date = $2, accounts_remarks = $3, 
               confirmed_by = $4, confirmed_by_name = $5, confirmed_at = $6, status = $7
           WHERE id = $8`, [
                    returnRecord.actual_received_amount,
                    returnRecord.receipt_date,
                    returnRecord.accounts_remarks,
                    returnRecord.confirmed_by,
                    returnRecord.confirmed_by_name,
                    returnRecord.confirmed_at,
                    returnRecord.status,
                    returnId,
                ]);
            }
            catch {
                // fallback
            }
            await this.logAudit({
                entity_type: 'RETURN',
                entity_id: returnRecord.id,
                action: 'BALANCE_RETURN_CONFIRMED',
                actor_id: actor.id,
                actor_name: actor.name,
                actor_role: actor.role,
                previous_status: 'Awaiting Confirmation',
                new_status: returnRecord.status,
                event_payload: {
                    actual_received_amount: receivedAmt,
                    settlement_total_returned: settlement.actual_returned,
                    settlement_status: settlement.settlement_status,
                },
            });
            return returnRecord;
        });
    }
    // ============================================================
    // 8. FINANCIAL RESOLUTION: SCENARIO 2 & 3 (REIMBURSEMENT PAYOUT)
    // ============================================================
    async disburseReimbursement(advanceId, input, actor) {
        return this.acquireLock(async () => {
            const visit = await this.getVisitById(advanceId);
            if (!visit) {
                throw new Error(`Field visit with ID ${advanceId} not found.`);
            }
            const settlement = await this.getSettlementForAdvance(advanceId);
            if (!settlement) {
                throw new Error('Settlement record not found.');
            }
            if (settlement.reimbursement_due <= 0) {
                throw new Error('No reimbursement is due for this visit.');
            }
            const remainingPayable = new Decimal(settlement.reimbursement_due || 0).minus(settlement.actual_reimbursed || 0);
            if (remainingPayable.lte(0) || settlement.settlement_status === 'Completed' || visit.status === 'Completed') {
                throw new Error('Duplicate transaction blocked: Reimbursement for this visit has already been settled.');
            }
            if (input.payment_reference &&
                this.reimbursements.some((r) => r.advance_id === advanceId && r.payment_reference === input.payment_reference)) {
                throw new Error(`Duplicate transaction blocked: Payment reference '${input.payment_reference}' has already been recorded.`);
            }
            const payoutAmt = new Decimal(input.amount).toNumber();
            if (payoutAmt <= 0) {
                throw new Error('Reimbursement payout amount must be greater than zero.');
            }
            if (new Decimal(payoutAmt).gt(remainingPayable)) {
                throw new Error(`Overpayment blocked: Payout amount ₹${payoutAmt} exceeds remaining reimbursement due ₹${remainingPayable.toNumber()}.`);
            }
            const id = `fva-reimb-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            const now = new Date().toISOString();
            const reimbursementRecord = {
                id,
                settlement_id: settlement.id,
                advance_id: advanceId,
                amount: payoutAmt,
                payment_method: input.payment_method,
                payment_reference: input.payment_reference || null,
                proof_reference: input.proof_reference || null,
                reimbursed_by: actor.id,
                reimbursed_by_name: actor.name || null,
                reimbursed_at: now,
                remarks: input.remarks || null,
                status: 'Completed',
            };
            this.reimbursements.push(reimbursementRecord);
            // Reconcile settlement actual_reimbursed
            const totalReimbursed = new Decimal(settlement.actual_reimbursed || 0).plus(payoutAmt);
            settlement.actual_reimbursed = totalReimbursed.toNumber();
            settlement.updated_at = now;
            const reimbursementDue = new Decimal(settlement.reimbursement_due);
            if (totalReimbursed.gte(reimbursementDue)) {
                // Fully paid!
                visit.status = 'Completed';
                settlement.settlement_status = 'Completed';
                settlement.completed_at = now;
            }
            else {
                // Partial reimbursement payout
                visit.status = 'Partially Reimbursed';
                settlement.settlement_status = 'Partially Settled';
            }
            visit.updated_at = now;
            this.settlements.set(advanceId, settlement);
            this.advances.set(advanceId, visit);
            try {
                await query(`INSERT INTO public.field_visit_reimbursements 
            (id, settlement_id, advance_id, amount, payment_method, payment_reference, proof_reference, reimbursed_by, reimbursed_by_name, reimbursed_at, remarks, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`, [
                    reimbursementRecord.id,
                    reimbursementRecord.settlement_id,
                    reimbursementRecord.advance_id,
                    reimbursementRecord.amount,
                    reimbursementRecord.payment_method,
                    reimbursementRecord.payment_reference,
                    reimbursementRecord.proof_reference,
                    reimbursementRecord.reimbursed_by,
                    reimbursementRecord.reimbursed_by_name,
                    reimbursementRecord.reimbursed_at,
                    reimbursementRecord.remarks,
                    reimbursementRecord.status,
                ]);
                await query(`UPDATE public.field_visit_settlements 
           SET actual_reimbursed = $1, settlement_status = $2, completed_at = $3, updated_at = $4
           WHERE id = $5`, [settlement.actual_reimbursed, settlement.settlement_status, settlement.completed_at, settlement.updated_at, settlement.id]);
                await query(`UPDATE public.field_visit_advances SET status = $1, updated_at = $2 WHERE id = $3`, [
                    visit.status,
                    visit.updated_at,
                    visit.id,
                ]);
            }
            catch {
                // fallback
            }
            await this.logAudit({
                entity_type: 'REIMBURSEMENT',
                entity_id: reimbursementRecord.id,
                action: 'REIMBURSEMENT_DISBURSED',
                actor_id: actor.id,
                actor_name: actor.name,
                actor_role: actor.role,
                previous_status: 'Pending Reimbursement',
                new_status: visit.status,
                event_payload: {
                    amount: payoutAmt,
                    payment_method: input.payment_method,
                    payment_reference: input.payment_reference,
                    total_reimbursed: settlement.actual_reimbursed,
                    settlement_status: settlement.settlement_status,
                },
            });
            return reimbursementRecord;
        });
    }
    // ============================================================
    // 9. QUERIES & DETAIL VIEWS
    // ============================================================
    async getVisitById(advanceId) {
        const mem = this.advances.get(advanceId);
        if (mem)
            return mem;
        try {
            const res = await query(`SELECT * FROM public.field_visit_advances WHERE id = $1`, [advanceId]);
            if (res?.rows?.[0]) {
                const row = res.rows[0];
                const item = {
                    ...row,
                    requested_amount: Number(row.requested_amount || 0),
                    approved_amount: row.approved_amount !== null ? Number(row.approved_amount) : null,
                    disbursed_amount: Number(row.disbursed_amount || 0),
                    estimated_breakdown: typeof row.estimated_breakdown === 'string' ? JSON.parse(row.estimated_breakdown) : (row.estimated_breakdown || []),
                    supporting_documents: typeof row.supporting_documents === 'string' ? JSON.parse(row.supporting_documents) : (row.supporting_documents || []),
                };
                this.advances.set(item.id, item);
                return item;
            }
        }
        catch {
            // ignore
        }
        return null;
    }
    async getExpensesForAdvance(advanceId) {
        try {
            const res = await query(`SELECT * FROM public.field_visit_expenses WHERE advance_id = $1 ORDER BY expense_date ASC, created_at ASC`, [advanceId]);
            if (res?.rows) {
                return res.rows.map((r) => ({
                    ...r,
                    amount: Number(r.amount),
                }));
            }
        }
        catch {
            // fallback to memory
        }
        const list = [];
        for (const exp of this.expenses.values()) {
            if (exp.advance_id === advanceId) {
                list.push({ ...exp });
            }
        }
        return list.sort((a, b) => a.expense_date.localeCompare(b.expense_date));
    }
    async getSettlementForAdvance(advanceId) {
        const mem = this.settlements.get(advanceId);
        if (mem)
            return mem;
        try {
            const res = await query(`SELECT * FROM public.field_visit_settlements WHERE advance_id = $1`, [advanceId]);
            if (res?.rows?.[0]) {
                const r = res.rows[0];
                const item = {
                    ...r,
                    total_disbursed: Number(r.total_disbursed || 0),
                    total_recorded_expense: Number(r.total_recorded_expense || 0),
                    total_eligible_expense: Number(r.total_eligible_expense || 0),
                    provisional_balance: Number(r.provisional_balance || 0),
                    net_settlement: Number(r.net_settlement || 0),
                    return_due: Number(r.return_due || 0),
                    reimbursement_due: Number(r.reimbursement_due || 0),
                    actual_returned: Number(r.actual_returned || 0),
                    actual_reimbursed: Number(r.actual_reimbursed || 0),
                };
                this.settlements.set(advanceId, item);
                return item;
            }
        }
        catch {
            // ignore
        }
        return null;
    }
    async getVisitDetail(advanceId) {
        const visit = await this.getVisitById(advanceId);
        if (!visit)
            return null;
        const expenses = await this.getExpensesForAdvance(advanceId);
        const settlement = await this.getSettlementForAdvance(advanceId);
        // Approvals
        let approvals = [];
        try {
            const res = await query(`SELECT * FROM public.field_visit_advance_approvals WHERE advance_id = $1 ORDER BY created_at ASC`, [advanceId]);
            if (res?.rows) {
                approvals = res.rows.map((r) => ({
                    ...r,
                    approved_amount: r.approved_amount !== null ? Number(r.approved_amount) : null,
                }));
            }
        }
        catch {
            approvals = this.approvals.filter((a) => a.advance_id === advanceId);
        }
        // Disbursements
        let disbursements = [];
        try {
            const res = await query(`SELECT * FROM public.field_visit_advance_disbursements WHERE advance_id = $1 ORDER BY disbursed_at ASC`, [advanceId]);
            if (res?.rows) {
                disbursements = res.rows.map((r) => ({ ...r, amount: Number(r.amount) }));
            }
        }
        catch {
            disbursements = this.disbursements.filter((d) => d.advance_id === advanceId);
        }
        // Balance returns
        let balanceReturns = [];
        try {
            const res = await query(`SELECT * FROM public.field_visit_balance_returns WHERE advance_id = $1 ORDER BY handover_date DESC`, [advanceId]);
            if (res?.rows) {
                balanceReturns = res.rows.map((r) => ({
                    ...r,
                    employee_reported_amount: Number(r.employee_reported_amount),
                    actual_received_amount: r.actual_received_amount !== null ? Number(r.actual_received_amount) : null,
                }));
            }
        }
        catch {
            balanceReturns = Array.from(this.balanceReturns.values()).filter((r) => r.advance_id === advanceId);
        }
        // Reimbursements
        let reimbursements = [];
        try {
            const res = await query(`SELECT * FROM public.field_visit_reimbursements WHERE advance_id = $1 ORDER BY reimbursed_at ASC`, [advanceId]);
            if (res?.rows) {
                reimbursements = res.rows.map((r) => ({ ...r, amount: Number(r.amount) }));
            }
        }
        catch {
            reimbursements = this.reimbursements.filter((r) => r.advance_id === advanceId);
        }
        // Audit logs
        let auditLogs = [];
        try {
            const res = await query(`SELECT * FROM public.field_visit_audit_logs 
         WHERE entity_id = $1 OR entity_id IN (SELECT id FROM public.field_visit_expenses WHERE advance_id = $1)
         ORDER BY created_at DESC`, [advanceId]);
            if (res?.rows) {
                auditLogs = res.rows.map((r) => ({
                    ...r,
                    event_payload: typeof r.event_payload === 'string' ? JSON.parse(r.event_payload) : (r.event_payload || {}),
                }));
            }
        }
        catch {
            auditLogs = this.auditLogs.filter((l) => l.entity_id === advanceId);
        }
        return {
            visit,
            approvals,
            disbursements,
            expenses,
            settlement,
            balanceReturns,
            reimbursements,
            auditLogs,
        };
    }
    // ============================================================
    // 10. LIST VISITS WITH AGGREGATED METRICS
    // ============================================================
    async listVisits(companyId, filters) {
        let list = [];
        try {
            const conditions = ['a.company_id = $1'];
            const params = [companyId];
            let pIdx = 2;
            if (filters?.employeeId) {
                conditions.push(`(a.employee_id = $${pIdx} OR a.employee_code = $${pIdx})`);
                params.push(filters.employeeId);
                pIdx++;
            }
            if (filters?.fundingType) {
                conditions.push(`a.funding_type = $${pIdx++}`);
                params.push(filters.fundingType);
            }
            if (filters?.status && filters.status !== 'all') {
                conditions.push(`a.status = $${pIdx++}`);
                params.push(filters.status);
            }
            // Tab specific filtering
            if (filters?.tab === 'advance_approvals') {
                conditions.push(`a.funding_type = 'advance' AND a.status IN ('Pending Advance Approval', 'Advance Correction Requested')`);
            }
            else if (filters?.tab === 'expense_approvals') {
                conditions.push(`a.status = 'Settlement Submitted'`);
            }
            else if (filters?.tab === 'disbursements') {
                conditions.push(`a.funding_type = 'advance' AND a.status = 'Advance Approved'`);
            }
            else if (filters?.tab === 'collections') {
                conditions.push(`a.status IN ('Pending Balance Collection', 'Partially Collected')`);
            }
            else if (filters?.tab === 'reimbursements') {
                conditions.push(`a.status IN ('Pending Reimbursement', 'Partially Reimbursed')`);
            }
            else if (filters?.tab === 'history') {
                conditions.push(`a.status IN ('Completed', 'Advance Rejected', 'Cancelled')`);
            }
            if (filters?.search && filters.search.trim()) {
                const s = `%${filters.search.trim()}%`;
                conditions.push(`(a.request_number ILIKE $${pIdx} OR a.employee_name ILIKE $${pIdx} OR a.purpose ILIKE $${pIdx} OR a.client_name ILIKE $${pIdx} OR a.destination ILIKE $${pIdx})`);
                params.push(s);
                pIdx++;
            }
            const sql = `
        SELECT 
          a.*,
          COALESCE((SELECT SUM(e.amount) FROM public.field_visit_expenses e WHERE e.advance_id = a.id), 0) AS expenses_total,
          COALESCE((SELECT COUNT(e.id) FROM public.field_visit_expenses e WHERE e.advance_id = a.id), 0) AS expenses_count,
          s.total_eligible_expense AS eligible_expenses_total,
          s.provisional_balance,
          s.net_settlement AS final_balance,
          s.return_due,
          s.reimbursement_due,
          s.actual_returned,
          s.actual_reimbursed,
          s.settlement_status
        FROM public.field_visit_advances a
        LEFT JOIN public.field_visit_settlements s ON s.advance_id = a.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY a.created_at DESC
      `;
            const res = await query(sql, params);
            if (res?.rows) {
                list = res.rows.map((row) => ({
                    ...row,
                    requested_amount: Number(row.requested_amount || 0),
                    approved_amount: row.approved_amount !== null ? Number(row.approved_amount) : null,
                    disbursed_amount: Number(row.disbursed_amount || 0),
                    expenses_total: Number(row.expenses_total || 0),
                    expenses_count: Number(row.expenses_count || 0),
                    eligible_expenses_total: row.eligible_expenses_total !== null && row.eligible_expenses_total !== undefined ? Number(row.eligible_expenses_total) : 0,
                    provisional_balance: row.provisional_balance !== null && row.provisional_balance !== undefined ? Number(row.provisional_balance) : Number(row.disbursed_amount || 0) - Number(row.expenses_total || 0),
                    final_balance: row.final_balance !== null && row.final_balance !== undefined ? Number(row.final_balance) : undefined,
                    return_due: row.return_due !== null && row.return_due !== undefined ? Number(row.return_due) : 0,
                    reimbursement_due: row.reimbursement_due !== null && row.reimbursement_due !== undefined ? Number(row.reimbursement_due) : 0,
                    actual_returned: row.actual_returned !== null && row.actual_returned !== undefined ? Number(row.actual_returned) : 0,
                    actual_reimbursed: row.actual_reimbursed !== null && row.actual_reimbursed !== undefined ? Number(row.actual_reimbursed) : 0,
                }));
            }
        }
        catch {
            // In-memory fallback
            for (const adv of this.advances.values()) {
                if (adv.company_id !== companyId)
                    continue;
                if (filters?.employeeId && adv.employee_id !== filters.employeeId && adv.employee_code !== filters.employeeId)
                    continue;
                if (filters?.fundingType && adv.funding_type !== filters.fundingType)
                    continue;
                if (filters?.status && filters.status !== 'all' && adv.status !== filters.status)
                    continue;
                if (filters?.tab === 'advance_approvals' && (adv.funding_type !== 'advance' || !['Pending Advance Approval', 'Advance Correction Requested'].includes(adv.status)))
                    continue;
                if (filters?.tab === 'expense_approvals' && adv.status !== 'Settlement Submitted')
                    continue;
                if (filters?.tab === 'disbursements' && (adv.funding_type !== 'advance' || adv.status !== 'Advance Approved'))
                    continue;
                if (filters?.tab === 'collections' && !['Pending Balance Collection', 'Partially Collected'].includes(adv.status))
                    continue;
                if (filters?.tab === 'reimbursements' && !['Pending Reimbursement', 'Partially Reimbursed'].includes(adv.status))
                    continue;
                if (filters?.tab === 'history' && !['Completed', 'Advance Rejected', 'Cancelled'].includes(adv.status))
                    continue;
                // Metric calculations
                const exps = Array.from(this.expenses.values()).filter((e) => e.advance_id === adv.id);
                const expTotal = exps.reduce((acc, e) => acc.plus(e.amount), new Decimal(0)).toNumber();
                const set = this.settlements.get(adv.id);
                list.push({
                    ...adv,
                    expenses_total: expTotal,
                    expenses_count: exps.length,
                    eligible_expenses_total: set?.total_eligible_expense || 0,
                    provisional_balance: set ? set.provisional_balance : (adv.disbursed_amount || 0) - expTotal,
                    final_balance: set?.net_settlement,
                    return_due: set?.return_due || 0,
                    reimbursement_due: set?.reimbursement_due || 0,
                    actual_returned: set?.actual_returned || 0,
                    actual_reimbursed: set?.actual_reimbursed || 0,
                    settlement_status: set?.settlement_status,
                });
            }
            list.sort((a, b) => b.created_at.localeCompare(a.created_at));
        }
        return list;
    }
    // ============================================================
    // 11. FINANCIAL KPI SUMMARY
    // ============================================================
    async getFinancialSummary(companyId, employeeId) {
        const visits = await this.listVisits(companyId, { employeeId });
        let totalAdvancesDisbursed = new Decimal(0);
        let totalExpensesRecorded = new Decimal(0);
        let totalEligibleApproved = new Decimal(0);
        let totalPendingReturns = new Decimal(0);
        let totalPendingReimbursements = new Decimal(0);
        let activeVisitsCount = 0;
        let pendingApprovalsCount = 0;
        let completedCount = 0;
        for (const v of visits) {
            totalAdvancesDisbursed = totalAdvancesDisbursed.plus(v.disbursed_amount || 0);
            totalExpensesRecorded = totalExpensesRecorded.plus(v.expenses_total || 0);
            totalEligibleApproved = totalEligibleApproved.plus(v.eligible_expenses_total || 0);
            if (v.return_due && v.return_due > 0) {
                totalPendingReturns = totalPendingReturns.plus(v.return_due);
            }
            if (v.reimbursement_due && v.reimbursement_due > 0) {
                totalPendingReimbursements = totalPendingReimbursements.plus(v.reimbursement_due);
            }
            if (['Active', 'Advance Disbursed'].includes(v.status)) {
                activeVisitsCount++;
            }
            if (['Pending Advance Approval', 'Settlement Submitted'].includes(v.status)) {
                pendingApprovalsCount++;
            }
            if (v.status === 'Completed') {
                completedCount++;
            }
        }
        return {
            totalAdvancesDisbursed: totalAdvancesDisbursed.toNumber(),
            totalExpensesRecorded: totalExpensesRecorded.toNumber(),
            totalEligibleApproved: totalEligibleApproved.toNumber(),
            totalPendingReturns: totalPendingReturns.toNumber(),
            totalPendingReimbursements: totalPendingReimbursements.toNumber(),
            activeVisitsCount,
            pendingApprovalsCount,
            completedCount,
        };
    }
    // ============================================================
    // 12. CEO MASTER ANALYTICS & DAILY EXPENSES
    // ============================================================
    async getMasterAnalytics(companyId) {
        const visits = await this.listVisits(companyId);
        const allocatedEmployees = new Set();
        let totalAdvancesRequested = new Decimal(0);
        let totalAdvancesApproved = new Decimal(0);
        let totalAdvancesDistributed = new Decimal(0);
        let pendingDisbursementsAmount = new Decimal(0);
        let totalDailyExpenses = new Decimal(0);
        let totalSubmittedClaimAmount = new Decimal(0);
        let totalApprovedClaimAmount = new Decimal(0);
        let totalPendingApprovals = 0;
        let openFieldVisitsCount = 0;
        let totalReimbursementDue = new Decimal(0);
        let totalReimbursementPaid = new Decimal(0);
        let totalBalancePendingReturn = new Decimal(0);
        let totalBalanceCollected = new Decimal(0);
        for (const v of visits) {
            if ((v.disbursed_amount || 0) > 0 || (v.requested_amount || 0) > 0 || (v.expenses_total || 0) > 0) {
                allocatedEmployees.add(v.employee_id || v.employee_code || v.employee_name || v.id);
            }
            totalAdvancesRequested = totalAdvancesRequested.plus(v.requested_amount || 0);
            if (v.approved_amount) {
                totalAdvancesApproved = totalAdvancesApproved.plus(v.approved_amount);
            }
            if (v.status === 'Advance Approved') {
                pendingDisbursementsAmount = pendingDisbursementsAmount.plus(v.approved_amount || v.requested_amount || 0);
            }
            totalAdvancesDistributed = totalAdvancesDistributed.plus(v.disbursed_amount || 0);
            totalDailyExpenses = totalDailyExpenses.plus(v.expenses_total || 0);
            if (v.status === 'Settlement Submitted' || v.status === 'Completed' || v.settlement_status) {
                totalSubmittedClaimAmount = totalSubmittedClaimAmount.plus(v.expenses_total || 0);
            }
            totalApprovedClaimAmount = totalApprovedClaimAmount.plus(v.eligible_expenses_total || 0);
            if (['Pending Advance Approval', 'Settlement Submitted'].includes(v.status)) {
                totalPendingApprovals++;
            }
            if (!['Completed', 'Advance Rejected', 'Cancelled'].includes(v.status)) {
                openFieldVisitsCount++;
            }
            if (v.reimbursement_due && v.reimbursement_due > 0) {
                totalReimbursementDue = totalReimbursementDue.plus(v.reimbursement_due);
            }
            if (v.actual_reimbursed) {
                totalReimbursementPaid = totalReimbursementPaid.plus(v.actual_reimbursed);
            }
            if (v.return_due && v.return_due > 0) {
                totalBalancePendingReturn = totalBalancePendingReturn.plus(v.return_due);
            }
            if (v.actual_returned) {
                totalBalanceCollected = totalBalanceCollected.plus(v.actual_returned);
            }
        }
        const totalPendingAmount = pendingDisbursementsAmount
            .plus(totalReimbursementDue)
            .plus(totalBalancePendingReturn);
        return {
            totalAllocatedMembers: allocatedEmployees.size,
            totalAdvancesRequested: totalAdvancesRequested.toNumber(),
            totalAdvancesApproved: totalAdvancesApproved.toNumber(),
            totalAdvancesDistributed: totalAdvancesDistributed.toNumber(),
            pendingDisbursementsAmount: pendingDisbursementsAmount.toNumber(),
            totalPendingAmount: totalPendingAmount.toNumber(),
            totalDailyExpenses: totalDailyExpenses.toNumber(),
            totalSubmittedClaimAmount: totalSubmittedClaimAmount.toNumber(),
            totalApprovedClaimAmount: totalApprovedClaimAmount.toNumber(),
            totalPendingApprovals,
            openFieldVisitsCount,
            totalReimbursementDue: totalReimbursementDue.toNumber(),
            totalReimbursementPaid: totalReimbursementPaid.toNumber(),
            totalBalancePendingReturn: totalBalancePendingReturn.toNumber(),
            totalBalanceCollected: totalBalanceCollected.toNumber(),
        };
    }
    async listAllDailyExpenses(companyId, filters) {
        const visits = await this.listVisits(companyId);
        const visitMap = new Map(visits.map(v => [v.id, v]));
        const allExpenses = [];
        let rawExpenses = [];
        try {
            const res = await query(`SELECT e.* FROM public.field_visit_expenses e
         JOIN public.field_visit_advances a ON a.id = e.advance_id
         WHERE a.company_id = $1
         ORDER BY e.expense_date DESC, e.created_at DESC`, [companyId]);
            if (res?.rows && res.rows.length > 0) {
                rawExpenses = res.rows.map((row) => ({
                    ...row,
                    amount: Number(row.amount || 0),
                    approved_amount: row.approved_amount !== null ? Number(row.approved_amount) : null,
                }));
            }
            else {
                rawExpenses = Array.from(this.expenses.values());
            }
        }
        catch {
            rawExpenses = Array.from(this.expenses.values());
        }
        for (const exp of rawExpenses) {
            const v = visitMap.get(exp.advance_id);
            if (!v)
                continue;
            if (filters?.employeeId && v.employee_id !== filters.employeeId && v.employee_code !== filters.employeeId)
                continue;
            if (filters?.category && exp.category !== filters.category)
                continue;
            if (filters?.startDate && exp.expense_date < filters.startDate)
                continue;
            if (filters?.endDate && exp.expense_date > filters.endDate)
                continue;
            if (filters?.status && exp.approval_status !== filters.status)
                continue;
            allExpenses.push({
                ...exp,
                employee_name: v.employee_name || 'Staff Member',
                employee_code: v.employee_code || '',
                department_name: v.department_name || 'Operations',
                request_number: v.request_number,
                purpose: v.purpose,
            });
        }
        allExpenses.sort((a, b) => b.expense_date.localeCompare(a.expense_date));
        return allExpenses;
    }
}
export const fieldAdvanceRepository = new FieldAdvanceRepository();
//# sourceMappingURL=fieldAdvanceRepository.js.map