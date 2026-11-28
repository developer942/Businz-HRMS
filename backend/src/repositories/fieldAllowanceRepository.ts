import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '../config/database.js';
import type {
  FieldAllowanceApproval,
  FieldAllowanceDailyReport,
  FieldAllowanceDecision,
  FieldAllowanceDetail,
  FieldAllowanceDistribution,
  FieldAllowanceRequest,
  FieldAllowanceStatus,
  FieldAllowanceSummary,
} from '../types/fieldAllowance.js';

const dateValue = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || '').slice(0, 10);
};

const dateTimeValue = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : String(value || new Date().toISOString());

let balanceReturnSchemaReady = false;
async function ensureBalanceReturnSchema(): Promise<void> {
  if (balanceReturnSchemaReady) return;
  try {
    await query(`
      ALTER TABLE public.field_allowance_requests
        ADD COLUMN IF NOT EXISTS returned_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS balance_return_status TEXT NOT NULL DEFAULT 'NONE',
        ADD COLUMN IF NOT EXISTS balance_returned_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS balance_return_mode TEXT,
        ADD COLUMN IF NOT EXISTS balance_return_reference TEXT,
        ADD COLUMN IF NOT EXISTS balance_return_proof_path TEXT,
        ADD COLUMN IF NOT EXISTS balance_return_remarks TEXT,
        ADD COLUMN IF NOT EXISTS balance_received_by TEXT,
        ADD COLUMN IF NOT EXISTS balance_received_by_name TEXT,
        ADD COLUMN IF NOT EXISTS balance_received_at TIMESTAMPTZ;

      ALTER TABLE public.field_allowance_requests
        DROP CONSTRAINT IF EXISTS field_allowance_requests_status_check;

      ALTER TABLE public.field_allowance_requests
        ADD CONSTRAINT field_allowance_requests_status_check CHECK (status IN (
          'DRAFT','PENDING_APPROVAL','PENDING_ADVANCE_APPROVAL','APPROVED',
          'PENDING_DISTRIBUTION','AMOUNT_DISTRIBUTED','ACTIVE_VISIT','IN_PROGRESS',
          'CLAIM_SUBMITTED','PENDING_SETTLEMENT_VERIFICATION','PENDING_REIMBURSEMENT',
          'PENDING_RETURN','COMPLETED','SETTLED','CORRECTION_REQUESTED','REJECTED'
        ));

      ALTER TABLE public.field_allowance_daily_reports
        DROP CONSTRAINT IF EXISTS field_allowance_daily_reports_category_check;

      ALTER TABLE public.field_allowance_daily_reports
        ADD CONSTRAINT field_allowance_daily_reports_category_check CHECK (category IN (
          'TRAVEL','BUS','TRAIN','TAXI_AUTO','FUEL','FOOD','ROOM','PARKING','TOLL','OTHER'
        ));
    `);
    // Ensure any completed trip that was marked RECEIVED_BY_ACCOUNTS without an Accounts reference/proof
    // (e.g. from the old FieldAllowance table button) is placed in SUBMITTED_TO_ACCOUNTS so it appears in Accounts Payment Disbursement
    await query(`
      UPDATE public.field_allowance_requests
      SET balance_return_status = 'SUBMITTED_TO_ACCOUNTS'
      WHERE status IN ('COMPLETED', 'SETTLED')
        AND returned_amount > 0
        AND balance_return_status = 'RECEIVED_BY_ACCOUNTS'
        AND balance_return_reference IS NULL
        AND balance_return_proof_path IS NULL;
    `);
    balanceReturnSchemaReady = true;
  } catch {
    // Ignore in isolated mock tests without live DB
  }
}

const mapRequest = (row: any): FieldAllowanceRequest => {
  const allocatedAmount = Number(row.allocated_amount || 0);
  const totalSpent = Number(row.total_spent || 0);
  const returnedAmount = Number(row.returned_amount || 0);
  const returnStatus = row.balance_return_status || (returnedAmount > 0 ? 'SUBMITTED_TO_ACCOUNTS' : 'NONE');
  // Only deduct returned_amount from balance once Accounts has actually confirmed/settled it
  const settledReturnAmount = returnStatus === 'RECEIVED_BY_ACCOUNTS' ? returnedAmount : 0;

  const rawReports = Array.isArray(row.daily_reports) ? row.daily_reports : [];
  const dailyReports: FieldAllowanceDailyReport[] = rawReports.map((r: any) => ({
    id: r.id,
    request_id: r.request_id || row.id,
    employee_id: r.employee_id || row.employee_id,
    expense_date: dateValue(r.expense_date),
    category: r.category,
    amount: Number(r.amount || 0),
    description: r.description || '',
    attachment_path: r.attachment_path || null,
    created_at: dateTimeValue(r.created_at),
    updated_at: dateTimeValue(r.updated_at),
  }));

  return {
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
    allocated_amount: allocatedAmount,
    total_spent: totalSpent,
    returned_amount: returnedAmount,
    balance: allocatedAmount - totalSpent - settledReturnAmount,
    balance_return_status: returnStatus,
    balance_returned_at: row.balance_returned_at ? dateTimeValue(row.balance_returned_at) : null,
    balance_return_mode: row.balance_return_mode || null,
    balance_return_reference: row.balance_return_reference || null,
    balance_return_proof_path: row.balance_return_proof_path || null,
    balance_return_remarks: row.balance_return_remarks || null,
    balance_received_by: row.balance_received_by || null,
    balance_received_by_name: row.balance_received_by_name || null,
    balance_received_at: row.balance_received_at ? dateTimeValue(row.balance_received_at) : null,
    decision_remarks: row.decision_remarks || null,
    decided_by_name: row.decided_by_name || null,
    decided_at: row.decided_at ? dateTimeValue(row.decided_at) : null,
    daily_reports: dailyReports,
    status: row.status,
    created_at: dateTimeValue(row.created_at),
    updated_at: dateTimeValue(row.updated_at),
  };
};

const requestSelect = `
  SELECT r.*,
    COALESCE((SELECT SUM(d.distributed_amount) FROM public.field_allowance_distributions d WHERE d.request_id = r.id), 0) AS allocated_amount,
    COALESCE((SELECT SUM(e.amount) FROM public.field_allowance_daily_reports e WHERE e.request_id = r.id), 0) AS total_spent,
    (SELECT a.remarks FROM public.field_allowance_approvals a WHERE a.request_id = r.id ORDER BY a.decided_at DESC LIMIT 1) AS decision_remarks,
    (SELECT a.approver_name FROM public.field_allowance_approvals a WHERE a.request_id = r.id ORDER BY a.decided_at DESC LIMIT 1) AS decided_by_name,
    (SELECT a.decided_at FROM public.field_allowance_approvals a WHERE a.request_id = r.id ORDER BY a.decided_at DESC LIMIT 1) AS decided_at,
    COALESCE(
      (SELECT json_agg(json_build_object(
        'id', e.id,
        'request_id', e.request_id,
        'employee_id', e.employee_id,
        'expense_date', e.expense_date,
        'category', e.category,
        'amount', e.amount,
        'description', e.description,
        'attachment_path', e.attachment_path,
        'created_at', e.created_at,
        'updated_at', e.updated_at
      ) ORDER BY e.expense_date DESC, e.created_at DESC)
      FROM public.field_allowance_daily_reports e WHERE e.request_id = r.id),
      '[]'::json
    ) AS daily_reports
  FROM public.field_allowance_requests r`;

export class FieldAllowanceRepository {
  async create(input: Omit<FieldAllowanceRequest, 'id' | 'trip_code' | 'approved_amount' | 'allocated_amount' | 'total_spent' | 'returned_amount' | 'balance' | 'balance_return_status' | 'created_at' | 'updated_at'>): Promise<FieldAllowanceRequest> {
    await ensureBalanceReturnSchema();
    const id = randomUUID();
    const tripCode = `FA-${new Date().getFullYear()}-${id.slice(0, 8).toUpperCase()}`;
    await query(
      `INSERT INTO public.field_allowance_requests (
        id, company_id, trip_code, employee_id, employee_name, department_id, department_name,
        purpose, customer_site_name, destination, start_date, end_date, travel_mode, description,
        advance_required, requested_amount, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [id, input.company_id, tripCode, input.employee_id, input.employee_name, input.department_id,
        input.department_name, input.purpose, input.customer_site_name, input.destination, input.start_date,
        input.end_date, input.travel_mode, input.description, input.advance_required, input.requested_amount, input.status]
    );
    return (await this.getById(input.company_id, id))!;
  }

  async updateDraft(companyId: string, id: string, employeeId: string, input: Partial<FieldAllowanceRequest>, submit: boolean): Promise<FieldAllowanceRequest | null> {
    await ensureBalanceReturnSchema();
    const nextStatus = submit
      ? (input.advance_required ? 'PENDING_APPROVAL' : 'ACTIVE_VISIT')
      : (input.status || 'DRAFT');
    const result = await query(
      `UPDATE public.field_allowance_requests SET
        purpose=$4, customer_site_name=$5, destination=$6, start_date=$7, end_date=$8,
        travel_mode=$9, description=$10, advance_required=$11, requested_amount=$12,
        status=$13, updated_at=NOW()
       WHERE company_id=$1 AND id=$2 AND employee_id=$3 AND status IN ('DRAFT','CORRECTION_REQUESTED')
       RETURNING id`,
      [companyId, id, employeeId, input.purpose, input.customer_site_name, input.destination,
        input.start_date, input.end_date, input.travel_mode, input.description, input.advance_required,
        input.requested_amount, nextStatus]
    );
    if (!result.rowCount) return null;
    return this.getById(companyId, id);
  }

  async list(companyId: string, filters: { employeeId?: string; status?: string; department?: string; search?: string } = {}): Promise<FieldAllowanceRequest[]> {
    await ensureBalanceReturnSchema();
    const values: unknown[] = [companyId];
    const clauses = ['r.company_id = $1'];
    if (filters.employeeId) { values.push(filters.employeeId); clauses.push(`r.employee_id = $${values.length}`); }
    if (filters.status) { values.push(filters.status); clauses.push(`r.status = $${values.length}`); }
    if (filters.department) { values.push(filters.department); clauses.push(`r.department_name = $${values.length}`); }
    if (filters.search) {
      values.push(`%${filters.search}%`);
      clauses.push(`(r.employee_name ILIKE $${values.length} OR r.employee_id ILIKE $${values.length} OR r.trip_code ILIKE $${values.length} OR r.purpose ILIKE $${values.length} OR r.destination ILIKE $${values.length})`);
    }
    const result = await query(`${requestSelect} WHERE ${clauses.join(' AND ')} ORDER BY r.created_at DESC`, values);
    return result.rows.map(mapRequest);
  }

  async getById(companyId: string, id: string): Promise<FieldAllowanceRequest | null> {
    await ensureBalanceReturnSchema();
    const result = await query(`${requestSelect} WHERE r.company_id=$1 AND r.id=$2 LIMIT 1`, [companyId, id]);
    return result.rows[0] ? mapRequest(result.rows[0]) : null;
  }

  async getDetail(companyId: string, id: string): Promise<FieldAllowanceDetail | null> {
    const request = await this.getById(companyId, id);
    if (!request) return null;
    const [approvals, distributions, reports] = await Promise.all([
      query('SELECT * FROM public.field_allowance_approvals WHERE request_id=$1 ORDER BY decided_at DESC', [id]),
      query('SELECT * FROM public.field_allowance_distributions WHERE request_id=$1 ORDER BY distribution_date DESC, created_at DESC', [id]),
      query('SELECT * FROM public.field_allowance_daily_reports WHERE request_id=$1 ORDER BY expense_date DESC, created_at DESC', [id]),
    ]);
    return {
      ...request,
      approvals: approvals.rows.map((r: any): FieldAllowanceApproval => ({ ...r, approved_amount: Number(r.approved_amount), decided_at: dateTimeValue(r.decided_at) })),
      distributions: distributions.rows.map((r: any): FieldAllowanceDistribution => ({ ...r, distributed_amount: Number(r.distributed_amount), distribution_date: dateValue(r.distribution_date), created_at: dateTimeValue(r.created_at) })),
      daily_reports: reports.rows.map((r: any): FieldAllowanceDailyReport => ({ ...r, amount: Number(r.amount), expense_date: dateValue(r.expense_date), created_at: dateTimeValue(r.created_at), updated_at: dateTimeValue(r.updated_at) })),
    };
  }

  async decide(input: {
    companyId: string;
    requestId: string;
    approvedBy: string;
    approverName: string;
    decision: FieldAllowanceDecision;
    approvedAmount?: number;
    remarks?: string | null;
  }): Promise<FieldAllowanceRequest | null> {
    await ensureBalanceReturnSchema();
    return withTransaction(async (client) => {
      const current = await this.getById(input.companyId, input.requestId);
      if (!current) return null;

      let nextStatus: FieldAllowanceStatus;
      let finalApprovedAmount = Number(current.approved_amount || 0);

      if (input.decision === 'REJECTED') {
        nextStatus = 'REJECTED';
      } else if (input.decision === 'CORRECTION_REQUESTED') {
        nextStatus = 'CORRECTION_REQUESTED';
      } else {
        // APPROVED
        if (current.status === 'CLAIM_SUBMITTED') {
          // Workflow A: Reimbursement Claim Approved -> moves to PENDING_REIMBURSEMENT
          nextStatus = 'PENDING_REIMBURSEMENT';
          finalApprovedAmount = input.approvedAmount !== undefined ? Number(input.approvedAmount) : Number(current.total_spent || 0);
        } else if (current.status === 'PENDING_SETTLEMENT_VERIFICATION') {
          // Workflow B: Settlement Approved -> evaluate net balance
          const net = Number(current.allocated_amount || 0) - Number(current.total_spent || 0);
          if (net < 0) {
            // Overspent: Company owes employee reimbursement
            nextStatus = 'PENDING_REIMBURSEMENT';
          } else if (net > 0) {
            // Underspent: Employee owes unspent advance return
            nextStatus = 'PENDING_RETURN';
          } else {
            nextStatus = 'SETTLED';
          }
          finalApprovedAmount = input.approvedAmount !== undefined ? Number(input.approvedAmount) : Number(current.total_spent || 0);
        } else {
          // Advance request approved -> moves to APPROVED (ready for Accounts distribution)
          nextStatus = 'APPROVED';
          finalApprovedAmount = input.approvedAmount !== undefined ? Number(input.approvedAmount) : Number(current.requested_amount || 0);
        }
      }

      const updated = await client.query(
        `UPDATE public.field_allowance_requests
         SET status = $3,
             approved_amount = $4,
             updated_at = NOW()
         WHERE company_id = $1 AND id = $2
         RETURNING id, approved_amount`,
        [input.companyId, input.requestId, nextStatus, finalApprovedAmount]
      );
      if (!updated.rowCount) return null;

      await client.query(
        `INSERT INTO public.field_allowance_approvals
         (request_id, approved_by, approver_name, decision, approved_amount, remarks)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [input.requestId, input.approvedBy, input.approverName, input.decision, finalApprovedAmount, input.remarks]
      );
      return this.getById(input.companyId, input.requestId);
    });
  }

  async distribute(input: {
    companyId: string;
    requestId: string;
    distributedBy: string;
    distributorName: string;
    distributedAmount: number;
    distributionDate: string;
    paymentMethod: string;
    referenceNumber?: string | null;
    paymentProofPath?: string | null;
    remarks?: string | null;
  }): Promise<FieldAllowanceDistribution | null> {
    return withTransaction(async (client) => {
      const locked = await client.query(
        `SELECT approved_amount, status, advance_required, total_spent FROM public.field_allowance_requests WHERE company_id=$1 AND id=$2 FOR UPDATE`,
        [input.companyId, input.requestId]
      );
      if (!locked.rows[0]) return null;
      const currentStatus = locked.rows[0].status;

      // Allow advance distribution (APPROVED) OR reimbursement payment (PENDING_REIMBURSEMENT)
      if (!['APPROVED', 'PENDING_REIMBURSEMENT'].includes(currentStatus)) {
        throw new Error(`Cannot disburse funds for request currently in status ${currentStatus}`);
      }

      const created = await client.query(
        `INSERT INTO public.field_allowance_distributions
         (request_id, distributed_by, distributor_name, distributed_amount, distribution_date, payment_method, reference_number, payment_proof_path, remarks)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [input.requestId, input.distributedBy, input.distributorName, input.distributedAmount, input.distributionDate, input.paymentMethod, input.referenceNumber, input.paymentProofPath, input.remarks]
      );

      // Transition to AMOUNT_DISTRIBUTED for advances, or SETTLED for reimbursement payments
      const nextStatus = currentStatus === 'PENDING_REIMBURSEMENT' ? 'SETTLED' : 'AMOUNT_DISTRIBUTED';
      await client.query("UPDATE public.field_allowance_requests SET status=$2, updated_at=NOW() WHERE id=$1", [input.requestId, nextStatus]);
      const row = created.rows[0];
      return { ...row, distributed_amount: Number(row.distributed_amount), distribution_date: dateValue(row.distribution_date), created_at: dateTimeValue(row.created_at) };
    });
  }

  async addDailyReport(input: Omit<FieldAllowanceDailyReport, 'id' | 'created_at' | 'updated_at'>): Promise<FieldAllowanceDailyReport> {
    return withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO public.field_allowance_daily_reports
         (request_id, employee_id, expense_date, category, amount, description, attachment_path)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [input.request_id, input.employee_id, input.expense_date, input.category, input.amount, input.description, input.attachment_path]
      );
      await client.query(
        `UPDATE public.field_allowance_requests
         SET status='IN_PROGRESS', updated_at=NOW()
         WHERE id=$1 AND status IN ('APPROVED','AMOUNT_DISTRIBUTED','ACTIVE_VISIT')`,
        [input.request_id]
      );
      const row = result.rows[0];
      return { ...row, amount: Number(row.amount), expense_date: dateValue(row.expense_date), created_at: dateTimeValue(row.created_at), updated_at: dateTimeValue(row.updated_at) };
    });
  }

  async complete(companyId: string, id: string, employeeId: string): Promise<FieldAllowanceRequest | null> {
    await ensureBalanceReturnSchema();
    const current = await this.getById(companyId, id);
    if (!current || current.employee_id !== employeeId) return null;

    let targetStatus: FieldAllowanceStatus;
    if (!current.advance_required) {
      // Workflow A: No Advance Required
      // If expenses were recorded, submit claim for review; otherwise mark settled
      targetStatus = Number(current.total_spent || 0) > 0 ? 'CLAIM_SUBMITTED' : 'SETTLED';
    } else {
      // Workflow B: Advance Required -> Submit for settlement verification
      targetStatus = 'PENDING_SETTLEMENT_VERIFICATION';
    }

    const result = await query(
      `UPDATE public.field_allowance_requests SET status=$4, updated_at=NOW()
       WHERE company_id=$1 AND id=$2 AND employee_id=$3 AND status IN ('AMOUNT_DISTRIBUTED','IN_PROGRESS','ACTIVE_VISIT','APPROVED') RETURNING id`,
      [companyId, id, employeeId, targetStatus]
    );
    return result.rowCount ? this.getById(companyId, id) : null;
  }

  async submitBalanceToAccounts(input: {
    companyId: string;
    requestId: string;
    paymentMethod?: string | null;
    referenceNumber?: string | null;
    paymentProofPath?: string | null;
    remarks?: string | null;
  }): Promise<FieldAllowanceRequest | null> {
    await ensureBalanceReturnSchema();
    const current = await this.getById(input.companyId, input.requestId);
    if (!current) return null;

    const diff = Math.abs(Number(current.allocated_amount || 0) - Number(current.total_spent || 0));
    if (diff <= 0) {
      throw new Error('No remaining advance balance or reimbursement amount to submit to Accounts');
    }

    const result = await query(
      `UPDATE public.field_allowance_requests SET
        status = 'COMPLETED',
        returned_amount = $3,
        balance_return_status = 'SUBMITTED_TO_ACCOUNTS',
        balance_returned_at = NOW(),
        balance_return_mode = $4,
        balance_return_reference = $5,
        balance_return_proof_path = COALESCE($6, balance_return_proof_path),
        balance_return_remarks = $7,
        updated_at = NOW()
       WHERE company_id = $1 AND id = $2
       RETURNING id`,
      [
        input.companyId,
        input.requestId,
        diff,
        input.paymentMethod || 'Cash',
        input.referenceNumber || null,
        input.paymentProofPath || null,
        input.remarks || 'Remaining balance submitted to Accounts after trip completion',
      ]
    );
    return result.rowCount ? this.getById(input.companyId, input.requestId) : null;
  }

  async confirmBalanceReceived(input: {
    companyId: string;
    requestId: string;
    receivedBy: string;
    receivedByName: string;
    paymentMethod?: string | null;
    referenceNumber?: string | null;
    paymentProofPath?: string | null;
    remarks?: string | null;
  }): Promise<FieldAllowanceRequest | null> {
    await ensureBalanceReturnSchema();
    const result = await query(
      `UPDATE public.field_allowance_requests SET
        status = 'SETTLED',
        balance_return_status = 'RECEIVED_BY_ACCOUNTS',
        balance_received_by = $3,
        balance_received_by_name = $4,
        balance_received_at = NOW(),
        balance_return_mode = COALESCE($5, balance_return_mode),
        balance_return_reference = COALESCE($6, balance_return_reference),
        balance_return_proof_path = COALESCE($7, balance_return_proof_path),
        balance_return_remarks = COALESCE($8, balance_return_remarks),
        updated_at = NOW()
       WHERE company_id = $1 AND id = $2 AND returned_amount > 0
       RETURNING id`,
      [
        input.companyId,
        input.requestId,
        input.receivedBy,
        input.receivedByName,
        input.paymentMethod || null,
        input.referenceNumber || null,
        input.paymentProofPath || null,
        input.remarks || null,
      ]
    );
    return result.rowCount ? this.getById(input.companyId, input.requestId) : null;
  }

  async distributionHistory(companyId: string, search?: string, startDate?: string, endDate?: string): Promise<any[]> {
    await ensureBalanceReturnSchema();
    const values: unknown[] = [companyId];
    const clauses = ['r.company_id=$1'];
    if (search) { values.push(`%${search}%`); clauses.push(`(r.trip_code ILIKE $${values.length} OR r.employee_name ILIKE $${values.length} OR d.reference_number ILIKE $${values.length})`); }
    if (startDate) { values.push(startDate); clauses.push(`d.distribution_date >= $${values.length}`); }
    if (endDate) { values.push(endDate); clauses.push(`d.distribution_date <= $${values.length}`); }
    const result = await query(
      `SELECT d.*, r.trip_code, r.employee_name, r.status FROM public.field_allowance_distributions d
       JOIN public.field_allowance_requests r ON r.id=d.request_id WHERE ${clauses.join(' AND ')}
       ORDER BY d.distribution_date DESC, d.created_at DESC`, values
    );
    return result.rows.map((r: any) => ({ ...r, distributed_amount: Number(r.distributed_amount), distribution_date: dateValue(r.distribution_date), created_at: dateTimeValue(rowDate(r.created_at)) }));
  }

  async summary(companyId: string): Promise<FieldAllowanceSummary> {
    await ensureBalanceReturnSchema();
    const result = await query(
      `SELECT COUNT(*)::int AS total_requests,
        COUNT(*) FILTER (WHERE status IN ('PENDING_APPROVAL', 'PENDING_ADVANCE_APPROVAL', 'CLAIM_SUBMITTED', 'PENDING_SETTLEMENT_VERIFICATION'))::int AS pending_approval,
        COUNT(*) FILTER (WHERE status IN ('APPROVED','AMOUNT_DISTRIBUTED','ACTIVE_VISIT','IN_PROGRESS','PENDING_REIMBURSEMENT','PENDING_RETURN','COMPLETED','SETTLED'))::int AS approved_requests,
        COALESCE((SELECT SUM(d.distributed_amount) FROM public.field_allowance_distributions d JOIN public.field_allowance_requests x ON x.id=d.request_id WHERE x.company_id=$1),0) AS total_distributed_amount,
        COUNT(*) FILTER (WHERE status IN ('AMOUNT_DISTRIBUTED','ACTIVE_VISIT','IN_PROGRESS'))::int AS active_trips,
        COALESCE((SELECT SUM(e.amount) FROM public.field_allowance_daily_reports e JOIN public.field_allowance_requests x ON x.id=e.request_id WHERE x.company_id=$1),0) AS total_spent_amount,
        COALESCE((SELECT SUM(x.returned_amount) FROM public.field_allowance_requests x WHERE x.company_id=$1 AND x.balance_return_status='RECEIVED_BY_ACCOUNTS'),0) AS total_returned_amount
       FROM public.field_allowance_requests WHERE company_id=$1`, [companyId]
    );
    const r = result.rows[0] || {};
    return {
      total_requests: Number(r.total_requests || 0), pending_approval: Number(r.pending_approval || 0),
      approved_requests: Number(r.approved_requests || 0), total_distributed_amount: Number(r.total_distributed_amount || 0),
      active_trips: Number(r.active_trips || 0), total_spent_amount: Number(r.total_spent_amount || 0),
      total_returned_amount: Number(r.total_returned_amount || 0),
    };
  }
}

const rowDate = (v: unknown) => v;

export const fieldAllowanceRepository = new FieldAllowanceRepository();
