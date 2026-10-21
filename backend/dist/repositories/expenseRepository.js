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
    async list(companyId, employeeId) {
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
        if (employeeId) {
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
}
export const expenseRepository = new ExpenseRepository();
//# sourceMappingURL=expenseRepository.js.map