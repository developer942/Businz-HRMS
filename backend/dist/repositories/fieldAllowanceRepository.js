import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '../config/database.js';
const dateValue = (value) => {
    if (value instanceof Date)
        return value.toISOString().slice(0, 10);
    return String(value || '').slice(0, 10);
};
const dateTimeValue = (value) => value instanceof Date ? value.toISOString() : String(value || new Date().toISOString());
const mapRequest = (row) => ({
    id: row.id,
    company_id: row.company_id,
    trip_code: row.trip_code,
    employee_id: row.employee_id,
    employee_name: row.employee_name,
    department_id: row.department_id,
    department_name: row.department_name || '',
    purpose: row.purpose,
    customer_site_name: row.customer_site_name,
    destination: row.destination,
    start_date: dateValue(row.start_date),
    end_date: dateValue(row.end_date),
    travel_mode: row.travel_mode,
    description: row.description,
    advance_required: Boolean(row.advance_required),
    requested_amount: Number(row.requested_amount || 0),
    approved_amount: Number(row.approved_amount || 0),
    allocated_amount: Number(row.allocated_amount || 0),
    total_spent: Number(row.total_spent || 0),
    balance: Number(row.allocated_amount || 0) - Number(row.total_spent || 0),
    status: row.status,
    created_at: dateTimeValue(row.created_at),
    updated_at: dateTimeValue(row.updated_at),
});
const requestSelect = `
  SELECT r.*,
    COALESCE((SELECT SUM(d.distributed_amount) FROM public.field_allowance_distributions d WHERE d.request_id = r.id), 0) AS allocated_amount,
    COALESCE((SELECT SUM(e.amount) FROM public.field_allowance_daily_reports e WHERE e.request_id = r.id), 0) AS total_spent
  FROM public.field_allowance_requests r`;
export class FieldAllowanceRepository {
    async create(input) {
        const id = randomUUID();
        const tripCode = `FA-${new Date().getFullYear()}-${id.slice(0, 8).toUpperCase()}`;
        await query(`INSERT INTO public.field_allowance_requests (
        id, company_id, trip_code, employee_id, employee_name, department_id, department_name,
        purpose, customer_site_name, destination, start_date, end_date, travel_mode, description,
        advance_required, requested_amount, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`, [id, input.company_id, tripCode, input.employee_id, input.employee_name, input.department_id,
            input.department_name, input.purpose, input.customer_site_name, input.destination, input.start_date,
            input.end_date, input.travel_mode, input.description, input.advance_required, input.requested_amount, input.status]);
        return (await this.getById(input.company_id, id));
    }
    async updateDraft(companyId, id, employeeId, input, submit) {
        const result = await query(`UPDATE public.field_allowance_requests SET
        purpose=$4, customer_site_name=$5, destination=$6, start_date=$7, end_date=$8,
        travel_mode=$9, description=$10, advance_required=$11, requested_amount=$12,
        status=$13, updated_at=NOW()
       WHERE company_id=$1 AND id=$2 AND employee_id=$3 AND status IN ('DRAFT','CORRECTION_REQUESTED')
       RETURNING id`, [companyId, id, employeeId, input.purpose, input.customer_site_name, input.destination,
            input.start_date, input.end_date, input.travel_mode, input.description, input.advance_required,
            input.requested_amount, submit ? 'PENDING_APPROVAL' : input.status || 'DRAFT']);
        if (!result.rowCount)
            return null;
        return this.getById(companyId, id);
    }
    async list(companyId, filters = {}) {
        const values = [companyId];
        const clauses = ['r.company_id = $1'];
        if (filters.employeeId) {
            values.push(filters.employeeId);
            clauses.push(`r.employee_id = $${values.length}`);
        }
        if (filters.status) {
            values.push(filters.status);
            clauses.push(`r.status = $${values.length}`);
        }
        if (filters.department) {
            values.push(filters.department);
            clauses.push(`r.department_name = $${values.length}`);
        }
        if (filters.search) {
            values.push(`%${filters.search}%`);
            clauses.push(`(r.employee_name ILIKE $${values.length} OR r.employee_id ILIKE $${values.length} OR r.trip_code ILIKE $${values.length} OR r.purpose ILIKE $${values.length} OR r.destination ILIKE $${values.length})`);
        }
        const result = await query(`${requestSelect} WHERE ${clauses.join(' AND ')} ORDER BY r.created_at DESC`, values);
        return result.rows.map(mapRequest);
    }
    async getById(companyId, id) {
        const result = await query(`${requestSelect} WHERE r.company_id=$1 AND r.id=$2 LIMIT 1`, [companyId, id]);
        return result.rows[0] ? mapRequest(result.rows[0]) : null;
    }
    async getDetail(companyId, id) {
        const request = await this.getById(companyId, id);
        if (!request)
            return null;
        const [approvals, distributions, reports] = await Promise.all([
            query('SELECT * FROM public.field_allowance_approvals WHERE request_id=$1 ORDER BY decided_at DESC', [id]),
            query('SELECT * FROM public.field_allowance_distributions WHERE request_id=$1 ORDER BY distribution_date DESC, created_at DESC', [id]),
            query('SELECT * FROM public.field_allowance_daily_reports WHERE request_id=$1 ORDER BY expense_date DESC, created_at DESC', [id]),
        ]);
        return {
            ...request,
            approvals: approvals.rows.map((r) => ({ ...r, approved_amount: Number(r.approved_amount), decided_at: dateTimeValue(r.decided_at) })),
            distributions: distributions.rows.map((r) => ({ ...r, distributed_amount: Number(r.distributed_amount), distribution_date: dateValue(r.distribution_date), created_at: dateTimeValue(r.created_at) })),
            daily_reports: reports.rows.map((r) => ({ ...r, amount: Number(r.amount), expense_date: dateValue(r.expense_date), created_at: dateTimeValue(r.created_at), updated_at: dateTimeValue(r.updated_at) })),
        };
    }
    async decide(input) {
        return withTransaction(async (client) => {
            const status = input.decision === 'APPROVED' ? 'APPROVED' : input.decision === 'REJECTED' ? 'REJECTED' : 'CORRECTION_REQUESTED';
            const updated = await client.query(`UPDATE public.field_allowance_requests SET status=$3, approved_amount=$4, updated_at=NOW()
         WHERE company_id=$1 AND id=$2 AND status='PENDING_APPROVAL' RETURNING id`, [input.companyId, input.requestId, status, input.decision === 'APPROVED' ? input.approvedAmount : 0]);
            if (!updated.rowCount)
                return null;
            await client.query(`INSERT INTO public.field_allowance_approvals
         (request_id, approved_by, approver_name, decision, approved_amount, remarks)
         VALUES ($1,$2,$3,$4,$5,$6)`, [input.requestId, input.approvedBy, input.approverName, input.decision, input.decision === 'APPROVED' ? input.approvedAmount : 0, input.remarks]);
            return this.getById(input.companyId, input.requestId);
        });
    }
    async distribute(input) {
        return withTransaction(async (client) => {
            const locked = await client.query(`SELECT approved_amount, status FROM public.field_allowance_requests WHERE company_id=$1 AND id=$2 FOR UPDATE`, [input.companyId, input.requestId]);
            if (!locked.rows[0] || locked.rows[0].status !== 'APPROVED')
                return null;
            const already = await client.query('SELECT COALESCE(SUM(distributed_amount),0) AS total FROM public.field_allowance_distributions WHERE request_id=$1', [input.requestId]);
            if (Number(already.rows[0]?.total || 0) + input.distributedAmount > Number(locked.rows[0].approved_amount)) {
                throw new Error('Distributed amount cannot exceed the approved amount');
            }
            const created = await client.query(`INSERT INTO public.field_allowance_distributions
         (request_id, distributed_by, distributor_name, distributed_amount, distribution_date, payment_method, reference_number, payment_proof_path, remarks)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [input.requestId, input.distributedBy, input.distributorName, input.distributedAmount, input.distributionDate, input.paymentMethod, input.referenceNumber, input.paymentProofPath, input.remarks]);
            await client.query("UPDATE public.field_allowance_requests SET status='AMOUNT_DISTRIBUTED', updated_at=NOW() WHERE id=$1", [input.requestId]);
            const row = created.rows[0];
            return { ...row, distributed_amount: Number(row.distributed_amount), distribution_date: dateValue(row.distribution_date), created_at: dateTimeValue(row.created_at) };
        });
    }
    async addDailyReport(input) {
        return withTransaction(async (client) => {
            const result = await client.query(`INSERT INTO public.field_allowance_daily_reports
         (request_id, employee_id, expense_date, category, amount, description, attachment_path)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [input.request_id, input.employee_id, input.expense_date, input.category, input.amount, input.description, input.attachment_path]);
            await client.query("UPDATE public.field_allowance_requests SET status='IN_PROGRESS', updated_at=NOW() WHERE id=$1 AND status IN ('APPROVED','AMOUNT_DISTRIBUTED')", [input.request_id]);
            const row = result.rows[0];
            return { ...row, amount: Number(row.amount), expense_date: dateValue(row.expense_date), created_at: dateTimeValue(row.created_at), updated_at: dateTimeValue(row.updated_at) };
        });
    }
    async complete(companyId, id, employeeId) {
        const result = await query(`UPDATE public.field_allowance_requests SET status='COMPLETED', updated_at=NOW()
       WHERE company_id=$1 AND id=$2 AND employee_id=$3 AND status IN ('AMOUNT_DISTRIBUTED','IN_PROGRESS','APPROVED') RETURNING id`, [companyId, id, employeeId]);
        return result.rowCount ? this.getById(companyId, id) : null;
    }
    async distributionHistory(companyId, search, startDate, endDate) {
        const values = [companyId];
        const clauses = ['r.company_id=$1'];
        if (search) {
            values.push(`%${search}%`);
            clauses.push(`(r.trip_code ILIKE $${values.length} OR r.employee_name ILIKE $${values.length} OR d.reference_number ILIKE $${values.length})`);
        }
        if (startDate) {
            values.push(startDate);
            clauses.push(`d.distribution_date >= $${values.length}`);
        }
        if (endDate) {
            values.push(endDate);
            clauses.push(`d.distribution_date <= $${values.length}`);
        }
        const result = await query(`SELECT d.*, r.trip_code, r.employee_name, r.status FROM public.field_allowance_distributions d
       JOIN public.field_allowance_requests r ON r.id=d.request_id WHERE ${clauses.join(' AND ')}
       ORDER BY d.distribution_date DESC, d.created_at DESC`, values);
        return result.rows.map((r) => ({ ...r, distributed_amount: Number(r.distributed_amount), distribution_date: dateValue(r.distribution_date), created_at: dateTimeValue(r.created_at) }));
    }
    async summary(companyId) {
        const result = await query(`SELECT COUNT(*)::int AS total_requests,
        COUNT(*) FILTER (WHERE status='PENDING_APPROVAL')::int AS pending_approval,
        COUNT(*) FILTER (WHERE status IN ('APPROVED','AMOUNT_DISTRIBUTED','IN_PROGRESS','COMPLETED'))::int AS approved_requests,
        COALESCE((SELECT SUM(d.distributed_amount) FROM public.field_allowance_distributions d JOIN public.field_allowance_requests x ON x.id=d.request_id WHERE x.company_id=$1),0) AS total_distributed_amount,
        COUNT(*) FILTER (WHERE status IN ('AMOUNT_DISTRIBUTED','IN_PROGRESS'))::int AS active_trips,
        COALESCE((SELECT SUM(e.amount) FROM public.field_allowance_daily_reports e JOIN public.field_allowance_requests x ON x.id=e.request_id WHERE x.company_id=$1),0) AS total_spent_amount
       FROM public.field_allowance_requests WHERE company_id=$1`, [companyId]);
        const r = result.rows[0] || {};
        return {
            total_requests: Number(r.total_requests || 0), pending_approval: Number(r.pending_approval || 0),
            approved_requests: Number(r.approved_requests || 0), total_distributed_amount: Number(r.total_distributed_amount || 0),
            active_trips: Number(r.active_trips || 0), total_spent_amount: Number(r.total_spent_amount || 0),
        };
    }
}
export const fieldAllowanceRepository = new FieldAllowanceRepository();
//# sourceMappingURL=fieldAllowanceRepository.js.map