import { z } from 'zod';
const isValidIsoDate = (value) => {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match)
        return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1)
        return false;
    return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
};
export const createExpenseSchema = z.object({
    employeeId: z.string().trim().max(50).optional(),
    category: z.enum(['Travel', 'Meals', 'Equipment', 'Training', 'Utilities', 'Other']),
    amount: z.coerce.number().positive().max(100000),
    date: z.string().refine(isValidIsoDate, 'Expense date must be valid.'),
    description: z.string().trim().min(1).max(1000),
    receiptUrl: z.string().min(1, 'Bill or receipt proof is required.'),
});
//# sourceMappingURL=expenseValidators.js.map