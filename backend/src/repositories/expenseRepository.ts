import { hasDatabaseColumn, query, withTransaction } from '../config/database.js';

export interface CreateExpenseData {
  employeeId: string;
  category: string;
  amount: number;
  date: string;
  description: string;
  receiptUrl: string;
}

let expenseAuditSchemaReady = false;
async function ensureExpenseAuditSchema(): Promise<void> {
  if (expenseAuditSchemaReady) return;
  try {
    await query(`
      ALTER TABLE public.expenses
        ADD COLUMN IF NOT EXISTS approved_by_name TEXT,
        ADD COLUMN IF NOT EXISTS approved_by_role TEXT,
        ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS disbursed_amount NUMERIC(14,2),
        ADD COLUMN IF NOT EXISTS payment_mode TEXT,
        ADD COLUMN IF NOT EXISTS transaction_ref TEXT,
        ADD COLUMN IF NOT EXISTS payment_proof_path TEXT,
        ADD COLUMN IF NOT EXISTS disbursement_remarks TEXT,
        ADD COLUMN IF NOT EXISTS disbursed_by_name TEXT,
        ADD COLUMN IF NOT EXISTS disbursed_at TIMESTAMPTZ;
    `);
    expenseAuditSchemaReady = true;
  } catch {
    // Ignore in isolated mock tests without live DB
  }
}

const resolveApproverDisplay = (row: any): string | undefined => {
  if (row.approved_by_name && String(row.approved_by_name).trim() && row.approved_by_name !== 'HR / CEO') {
    const raw = String(row.approved_by_name).trim();
    if (raw.includes('(')) return raw;
    if (row.approved_by_role) return `${raw} (${row.approved_by_role})`;
    return raw;
  }
  const joinedName = `${row.approver_first_name || ''} ${row.approver_last_name || ''}`.trim() || row.approver_user_name || '';
  const joinedRole = String(row.approver_user_role || row.approver_designation || '').trim();
  if (joinedName) {
    const roleLower = joinedRole.toLowerCase();
    const tag = (roleLower === 'ceo' || roleLower === 'super admin' || roleLower.includes('ceo') || roleLower.includes('managing director'))
      ? 'CEO'
      : roleLower.includes('hr')
        ? 'HR'
        : joinedRole || 'CEO';
    return joinedName.includes('(') ? joinedName : `${joinedName} (${tag})`;
  }
  if (row.status === 'Approved' || row.status === 'Reimbursed') {
    return row.approved_by_role ? `By ${row.approved_by_role}` : 'Velmurugan M (CEO)';
  }
  return undefined;
};

const INLINE_BLOB_THRESHOLD = 2048;

const mapExpense = (row: any) => ({
  id: row.id,
  employeeId: row.employee_code || row.employee_id,
  employeeName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
  department: row.department_name || 'General',
  category: row.category,
  amount: Number(row.amount),
  date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date),
  description: row.description || '',
  receiptUrl: row.receipt_url || '',
  hasReceipt: row.has_receipt !== undefined ? Boolean(row.has_receipt) : Boolean(row.receipt_url),
  status: row.status,
  approvedBy: resolveApproverDisplay(row),
  approvedAt: row.approved_at
    ? (row.approved_at instanceof Date ? row.approved_at.toISOString().slice(0, 10) : String(row.approved_at).slice(0, 10))
    : undefined,
  reimbursedBy: row.disbursed_by_name || undefined,
  reimbursedDate: row.disbursed_at
    ? (row.disbursed_at instanceof Date ? row.disbursed_at.toISOString().slice(0, 10) : String(row.disbursed_at).slice(0, 10))
    : undefined,
  paymentMode: row.payment_mode || undefined,
  transactionRef: row.transaction_ref || undefined,
  paymentProofPath: row.payment_proof_path || undefined,
  hasPaymentProof: row.has_payment_proof !== undefined ? Boolean(row.has_payment_proof) : Boolean(row.payment_proof_path),
  disbursementRemarks: row.disbursement_remarks || undefined,
});

export class ExpenseRepository {
  async list(
    companyId: string,
    employeeId?: string,
    isAccountsStaff: boolean = false,
    options?: { includeInlineBlobs?: boolean }
  ) {
    await ensureExpenseAuditSchema();
    const hasCompanyId = await hasDatabaseColumn('employees', 'company_id');
    if (!hasCompanyId && companyId !== 'company-a') {
      throw new Error('Tenant-scoped expense claims require migration 014');
    }
    const values: unknown[] = [];
    const conditions: string[] = [];
    if (hasCompanyId) {
      values.push(companyId);
      conditions.push(`employee.company_id = $${values.length}`);
    }
    if (employeeId && isAccountsStaff) {
      // Accounts staff: can view their own claims OR claims approved by CEO ready for/completed payment
      values.push(employeeId);
      conditions.push(`(employee.employee_id = $${values.length} OR expense.status IN ('Approved', 'Reimbursed'))`);
    } else if (employeeId) {
      // Standard employee: can ONLY view own claims
      values.push(employeeId);
      conditions.push(`employee.employee_id = $${values.length}`);
    }
    const includeBlobs = options?.includeInlineBlobs === true;
    // Strip multi-MB base64 data URIs (>2KB) from list queries to keep payload <15KB instead of >5MB.
    // Full receipt/proof images are fetched lazily via GET /api/v1/expenses/:id/receipt when viewed.
    const receiptSelect = includeBlobs
      ? `expense.receipt_url, (expense.receipt_url IS NOT NULL AND expense.receipt_url <> '') AS has_receipt`
      : `CASE WHEN length(COALESCE(expense.receipt_url, '')) <= ${INLINE_BLOB_THRESHOLD} THEN expense.receipt_url ELSE '' END AS receipt_url,
         (expense.receipt_url IS NOT NULL AND expense.receipt_url <> '') AS has_receipt`;
    const proofSelect = includeBlobs
      ? `expense.payment_proof_path, (expense.payment_proof_path IS NOT NULL AND expense.payment_proof_path <> '') AS has_payment_proof`
      : `CASE WHEN length(COALESCE(expense.payment_proof_path, '')) <= ${INLINE_BLOB_THRESHOLD} THEN expense.payment_proof_path ELSE NULL END AS payment_proof_path,
         (expense.payment_proof_path IS NOT NULL AND expense.payment_proof_path <> '') AS has_payment_proof`;

    const result = await query(
      `SELECT expense.id, expense.employee_id, expense.category, expense.amount, expense.date,
              expense.description, expense.status, expense.approved_by, expense.approved_by_name,
              expense.approved_by_role, expense.approved_at, expense.disbursed_amount,
              expense.payment_mode, expense.transaction_ref, expense.disbursement_remarks,
              expense.disbursed_by_name, expense.disbursed_at, expense.created_at, expense.updated_at,
              ${receiptSelect},
              ${proofSelect},
              employee.employee_id AS employee_code, employee.first_name, employee.last_name,
              department.name AS department_name,
              approver_emp.first_name AS approver_first_name,
              approver_emp.last_name AS approver_last_name,
              approver_emp.designation AS approver_designation
       FROM expenses expense
       JOIN employees employee ON employee.id = expense.employee_id
       LEFT JOIN departments department ON department.id = employee.department_id
       LEFT JOIN employees approver_emp ON approver_emp.id = expense.approved_by
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY expense.date DESC, expense.created_at DESC`,
      values
    );
    return result.rows.map(mapExpense);
  }

  async getReceiptById(expenseId: string, companyId: string, employeeId?: string, isAccountsStaff: boolean = false) {
    await ensureExpenseAuditSchema();
    const hasCompanyId = await hasDatabaseColumn('employees', 'company_id');
    const values: unknown[] = [expenseId];
    const conditions: string[] = ['expense.id = $1'];
    if (hasCompanyId) {
      values.push(companyId);
      conditions.push(`employee.company_id = $${values.length}`);
    }
    if (employeeId && isAccountsStaff) {
      values.push(employeeId);
      conditions.push(`(employee.employee_id = $${values.length} OR expense.status IN ('Approved', 'Reimbursed'))`);
    } else if (employeeId) {
      values.push(employeeId);
      conditions.push(`employee.employee_id = $${values.length}`);
    }
    const result = await query(
      `SELECT expense.id, expense.receipt_url, expense.payment_proof_path
       FROM expenses expense
       JOIN employees employee ON employee.id = expense.employee_id
       WHERE ${conditions.join(' AND ')}
       LIMIT 1`,
      values
    );
    if (!result.rows.length) return null;
    return {
      id: result.rows[0].id,
      receiptUrl: result.rows[0].receipt_url || '',
      paymentProofPath: result.rows[0].payment_proof_path || '',
    };
  }

  async create(companyId: string, input: CreateExpenseData) {
    await ensureExpenseAuditSchema();
    const hasCompanyId = await hasDatabaseColumn('employees', 'company_id');
    if (!hasCompanyId && companyId !== 'company-a') {
      throw new Error('Tenant-scoped expense claims require migration 014');
    }
    return withTransaction(async (client) => {
      const employeeValues: unknown[] = [input.employeeId];
      const employeeConditions = [
        /^[0-9a-f-]{36}$/i.test(input.employeeId) ? 'employee.id = $1' : 'employee.employee_id = $1',
      ];
      if (hasCompanyId) {
        employeeValues.push(companyId);
        employeeConditions.push(`employee.company_id = $${employeeValues.length}`);
      }
      const employeeResult = await client.query(
        `SELECT employee.id, employee.employee_id, employee.first_name, employee.last_name,
                department.name AS department_name
         FROM employees employee
         LEFT JOIN departments department ON department.id = employee.department_id
         WHERE ${employeeConditions.join(' AND ')}
         LIMIT 1`,
        employeeValues
      );
      const employee = employeeResult.rows[0];
      if (!employee) throw new Error('Employee profile not found for this company');

      const duplicate = await client.query(
        `SELECT id FROM expenses
         WHERE employee_id = $1 AND category = $2 AND amount = $3 AND date = $4
         LIMIT 1`,
        [employee.id, input.category, input.amount, input.date]
      );
      if (duplicate.rowCount) throw new Error('You have already submitted an identical expense claim for this date and category.');

      const inserted = await client.query(
        `INSERT INTO expenses (employee_id, category, amount, date, description, receipt_url, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'Pending Manager')
         RETURNING id, employee_id, category, amount, date, description, receipt_url, status, created_at`,
        [employee.id, input.category, input.amount, input.date, input.description, input.receiptUrl]
      );
      return mapExpense({ ...inserted.rows[0], employee_code: employee.employee_id, ...employee });
    });
  }

  async approve(expenseId: string, approvedById?: string, approvedByName?: string, approvedByRole?: string) {
    await ensureExpenseAuditSchema();
    return withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT id, status FROM expenses WHERE id = $1 LIMIT 1`,
        [expenseId]
      );
      if (!existing.rowCount) throw new Error('Expense claim not found');
      if (existing.rows[0].status === 'Approved' || existing.rows[0].status === 'Reimbursed') {
        throw new Error('Expense claim is already approved');
      }

      const validUuid = approvedById && /^[0-9a-f-]{36}$/i.test(approvedById) ? approvedById : null;

      const updated = await client.query(
        `UPDATE expenses
         SET status = 'Approved',
             ${validUuid ? 'approved_by = $2,' : ''}
             approved_by_name = $${validUuid ? 3 : 2},
             approved_by_role = $${validUuid ? 4 : 3},
             approved_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        validUuid
          ? [expenseId, validUuid, approvedByName || null, approvedByRole || null]
          : [expenseId, approvedByName || null, approvedByRole || null]
      );
      return updated.rows[0];
    });
  }

  async reject(expenseId: string, _rejectionReason: string, approvedById?: string, approvedByName?: string, approvedByRole?: string) {
    await ensureExpenseAuditSchema();
    return withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT id, status FROM expenses WHERE id = $1 LIMIT 1`,
        [expenseId]
      );
      if (!existing.rowCount) throw new Error('Expense claim not found');

      const validUuid = approvedById && /^[0-9a-f-]{36}$/i.test(approvedById) ? approvedById : null;

      const updated = await client.query(
        `UPDATE expenses
         SET status = 'Rejected',
             ${validUuid ? 'approved_by = $2,' : ''}
             approved_by_name = $${validUuid ? 3 : 2},
             approved_by_role = $${validUuid ? 4 : 3},
             approved_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        validUuid
          ? [expenseId, validUuid, approvedByName || null, approvedByRole || null]
          : [expenseId, approvedByName || null, approvedByRole || null]
      );
      return updated.rows[0];
    });
  }

  async disburse(
    expenseId: string,
    disburseData: {
      amountPaid: number;
      paymentMode: string;
      paymentDate?: string;
      transactionRef?: string;
      paymentProofPath?: string;
      remarks?: string;
      disbursedBy?: string;
    }
  ) {
    await ensureExpenseAuditSchema();
    return withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT id, amount, status FROM expenses WHERE id = $1 LIMIT 1`,
        [expenseId]
      );
      if (!existing.rowCount) throw new Error('Expense claim not found');
      if (existing.rows[0].status !== 'Approved') {
        throw new Error(`Cannot disburse: claim status is "${existing.rows[0].status}". Only approved claims can be disbursed.`);
      }
      if (disburseData.amountPaid > Number(existing.rows[0].amount)) {
        throw new Error(`Paid amount (₹${disburseData.amountPaid}) cannot exceed approved amount of ₹${existing.rows[0].amount}`);
      }

      const updated = await client.query(
        `UPDATE expenses
         SET status = 'Reimbursed',
             disbursed_amount = $2,
             payment_mode = $3,
             transaction_ref = $4,
             payment_proof_path = $5,
             disbursement_remarks = $6,
             disbursed_by_name = $7,
             disbursed_at = COALESCE($8::timestamptz, NOW()),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          expenseId,
          disburseData.amountPaid,
          disburseData.paymentMode,
          disburseData.transactionRef || null,
          disburseData.paymentProofPath || null,
          disburseData.remarks || null,
          disburseData.disbursedBy || 'Accounts Dept',
          disburseData.paymentDate || null,
        ]
      );
      return updated.rows[0];
    });
  }
}

export const expenseRepository = new ExpenseRepository();
