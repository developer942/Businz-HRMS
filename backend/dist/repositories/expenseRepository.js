import { hasDatabaseColumn, query, withTransaction } from '../config/database.js';
const mapExpense = (row) => ({
    id: row.id,
    employeeId: row.employee_code || row.employee_id,
    employeeName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
    department: row.department_name || 'General',
    category: row.category,
    amount: Number(row.amount),
    date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date),
    description: row.description || '',
    receiptUrl: row.receipt_url || '',
    status: row.status,
});
export class ExpenseRepository {
    async list(companyId, employeeId, isAccountsStaff = false) {
        const hasCompanyId = await hasDatabaseColumn('employees', 'company_id');
        if (!hasCompanyId && companyId !== 'company-a') {
            throw new Error('Tenant-scoped expense claims require migration 014');
        }
        const values = [];
        const conditions = [];
        if (hasCompanyId) {
            values.push(companyId);
            conditions.push(`employee.company_id = $${values.length}`);
        }
        if (employeeId && isAccountsStaff) {
            // Accounts staff: can view their own claims OR claims approved by CEO ready for/completed payment
            values.push(employeeId);
            conditions.push(`(employee.employee_id = $${values.length} OR expense.status IN ('Approved', 'Reimbursed'))`);
        }
        else if (employeeId) {
            // Standard employee: can ONLY view own claims
            values.push(employeeId);
            conditions.push(`employee.employee_id = $${values.length}`);
        }
        const result = await query(`SELECT expense.*, employee.employee_id AS employee_code, employee.first_name, employee.last_name,
              department.name AS department_name
       FROM expenses expense
       JOIN employees employee ON employee.id = expense.employee_id
       LEFT JOIN departments department ON department.id = employee.department_id
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY expense.date DESC, expense.created_at DESC`, values);
        return result.rows.map(mapExpense);
    }
    async create(companyId, input) {
        const hasCompanyId = await hasDatabaseColumn('employees', 'company_id');
        if (!hasCompanyId && companyId !== 'company-a') {
            throw new Error('Tenant-scoped expense claims require migration 014');
        }
        return withTransaction(async (client) => {
            const employeeValues = [input.employeeId];
            const employeeConditions = [
                /^[0-9a-f-]{36}$/i.test(input.employeeId) ? 'employee.id = $1' : 'employee.employee_id = $1',
            ];
            if (hasCompanyId) {
                employeeValues.push(companyId);
                employeeConditions.push(`employee.company_id = $${employeeValues.length}`);
            }
            const employeeResult = await client.query(`SELECT employee.id, employee.employee_id, employee.first_name, employee.last_name,
                department.name AS department_name
         FROM employees employee
         LEFT JOIN departments department ON department.id = employee.department_id
         WHERE ${employeeConditions.join(' AND ')}
         LIMIT 1`, employeeValues);
            const employee = employeeResult.rows[0];
            if (!employee)
                throw new Error('Employee profile not found for this company');
            const duplicate = await client.query(`SELECT id FROM expenses
         WHERE employee_id = $1 AND category = $2 AND amount = $3 AND date = $4
         LIMIT 1`, [employee.id, input.category, input.amount, input.date]);
            if (duplicate.rowCount)
                throw new Error('You have already submitted an identical expense claim for this date and category.');
            const inserted = await client.query(`INSERT INTO expenses (employee_id, category, amount, date, description, receipt_url, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'Pending Manager')
         RETURNING id, employee_id, category, amount, date, description, receipt_url, status, created_at`, [employee.id, input.category, input.amount, input.date, input.description, input.receiptUrl]);
            return mapExpense({ ...inserted.rows[0], employee_code: employee.employee_id, ...employee });
        });
    }
    async approve(expenseId, approvedById) {
        return withTransaction(async (client) => {
            const existing = await client.query(`SELECT id, status FROM expenses WHERE id = $1 LIMIT 1`, [expenseId]);
            if (!existing.rowCount)
                throw new Error('Expense claim not found');
            if (existing.rows[0].status === 'Approved' || existing.rows[0].status === 'Reimbursed') {
                throw new Error('Expense claim is already approved');
            }
            // Check if approvedById is a valid UUID
            const validUuid = approvedById && /^[0-9a-f-]{36}$/i.test(approvedById) ? approvedById : null;
            const updated = await client.query(`UPDATE expenses 
         SET status = 'Approved', ${validUuid ? 'approved_by = $2,' : ''} updated_at = NOW()
         WHERE id = $1
         RETURNING *`, validUuid ? [expenseId, validUuid] : [expenseId]);
            return updated.rows[0];
        });
    }
    async reject(expenseId, _rejectionReason, approvedById) {
        return withTransaction(async (client) => {
            const existing = await client.query(`SELECT id, status FROM expenses WHERE id = $1 LIMIT 1`, [expenseId]);
            if (!existing.rowCount)
                throw new Error('Expense claim not found');
            const validUuid = approvedById && /^[0-9a-f-]{36}$/i.test(approvedById) ? approvedById : null;
            const updated = await client.query(`UPDATE expenses 
         SET status = 'Rejected', ${validUuid ? 'approved_by = $2,' : ''} updated_at = NOW()
         WHERE id = $1
         RETURNING *`, validUuid ? [expenseId, validUuid] : [expenseId]);
            return updated.rows[0];
        });
    }
    async disburse(expenseId, disburseData) {
        return withTransaction(async (client) => {
            const existing = await client.query(`SELECT id, amount, status FROM expenses WHERE id = $1 LIMIT 1`, [expenseId]);
            if (!existing.rowCount)
                throw new Error('Expense claim not found');
            if (existing.rows[0].status !== 'Approved') {
                throw new Error(`Cannot disburse: claim status is "${existing.rows[0].status}". Only CEO-approved claims can be disbursed.`);
            }
            if (disburseData.amountPaid > Number(existing.rows[0].amount)) {
                throw new Error(`Paid amount (₹${disburseData.amountPaid}) cannot exceed approved amount of ₹${existing.rows[0].amount}`);
            }
            const updated = await client.query(`UPDATE expenses 
         SET status = 'Reimbursed', updated_at = NOW()
         WHERE id = $1
         RETURNING *`, [expenseId]);
            return updated.rows[0];
        });
    }
}
export const expenseRepository = new ExpenseRepository();
//# sourceMappingURL=expenseRepository.js.map