import { Request, Response, NextFunction } from 'express';
import { expenseRepository } from '../repositories/expenseRepository.js';
import { createExpenseSchema } from '../validators/expenseValidators.js';

const formatApproverWithRole = (user: any): { display: string; roleLabel: string } => {
  const rawName = String(user?.name || user?.email || '').trim();
  const roleLower = String(user?.role || '').trim().toLowerCase();
  const desigLower = String(user?.designation || '').trim().toLowerCase();
  const deptLower = String(user?.department || '').trim().toLowerCase();
  let roleLabel = 'CEO';
  if (roleLower === 'ceo' || roleLower === 'super admin' || desigLower.includes('ceo') || desigLower.includes('managing director')) {
    roleLabel = 'CEO';
  } else if (roleLower.includes('hr') || desigLower.includes('hr') || deptLower.includes('hr')) {
    roleLabel = 'HR';
  } else if (roleLower.includes('finance') || roleLower.includes('account') || deptLower.includes('account') || deptLower.includes('finance')) {
    roleLabel = 'Accounts';
  } else if (user?.role) {
    roleLabel = String(user.role);
  }
  const display = rawName
    ? (rawName.includes('(') ? rawName : `${rawName} (${roleLabel})`)
    : roleLabel;
  return { display, roleLabel };
};

export const listExpenses = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const role = String(req.user?.role || '');
    const isAccounts = Boolean(
      role === 'Finance Manager' || role === 'Finance' || role === 'Accountant' ||
      (req.user?.department && (req.user.department.toLowerCase().includes('accounts') || req.user.department.toLowerCase().includes('finance')))
    );
    const isEmployee = role === 'Employee' && !isAccounts;

    const ownEmployeeId = (isEmployee || isAccounts) ? req.user?.employeeId : undefined;
    if (isEmployee && !ownEmployeeId) {
      res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Employee profile is required.', details: [{ field: 'employeeId', message: 'Employee profile is required.' }] } });
      return;
    }
    const expenses = await expenseRepository.list(
      req.user?.company_id || req.user?.companyId || 'company-a',
      ownEmployeeId,
      isAccounts
    );
    res.json({ success: true, data: expenses });
  } catch (error) {
    next(error);
  }
};

export const createExpense = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const input = createExpenseSchema.parse(req.body);
    const role = String(req.user?.role || '');
    const isEmployee = role === 'Employee';
    const isHr = role === 'HR' || role === 'HR Admin' || role === 'HR Manager';
    const isAccounts = role === 'Finance Manager' || role === 'Finance' || role === 'Accountant';
    if (!isEmployee && !isHr && !isAccounts) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only employees, HR and Accounts staff can submit expense claims.', details: [] } });
      return;
    }

    const employeeId = (isEmployee || isAccounts) ? (req.user?.employeeId || req.user?.id) : input.employeeId;
    if (!employeeId) {
      res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Employee claimant is required.', details: [{ field: 'employeeId', message: 'Employee claimant is required.' }] } });
      return;
    }
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (input.date > today) {
      res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Future expense dates are not allowed.', details: [{ field: 'date', message: 'Future expense dates are not allowed.' }] } });
      return;
    }

    const expense = await expenseRepository.create(req.user?.company_id || req.user?.companyId || 'company-a', { ...input, employeeId });
    res.status(201).json({ success: true, data: expense });
  } catch (error) {
    next(error);
  }
};

export const approveExpenseClaim = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = String(req.params.id);
    if (!id) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Expense ID is required.', details: [] } });
      return;
    }

    const approvedById = req.user?.id || req.user?.employeeId;
    const { display, roleLabel } = formatApproverWithRole(req.user);
    const expense = await expenseRepository.approve(id, approvedById, display, roleLabel);
    res.json({ success: true, data: expense, message: 'Expense claim approved.' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: { code: 'APPROVAL_FAILED', message: error.message || 'Approval failed.', details: [] } });
  }
};

export const rejectExpenseClaim = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = String(req.params.id);
    const { rejectionReason } = req.body;
    if (!id) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Expense ID is required.', details: [] } });
      return;
    }
    if (!rejectionReason || !rejectionReason.trim()) {
      res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Rejection reason is required.', details: [{ field: 'rejectionReason', message: 'Rejection reason is required.' }] } });
      return;
    }

    const approvedById = req.user?.id || req.user?.employeeId;
    const { display, roleLabel } = formatApproverWithRole(req.user);
    const expense = await expenseRepository.reject(id, rejectionReason.trim(), approvedById, display, roleLabel);
    res.json({ success: true, data: expense, message: 'Expense claim rejected.' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: { code: 'REJECTION_FAILED', message: error.message || 'Rejection failed.', details: [] } });
  }
};

export const disburseExpenseClaim = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = String(req.params.id);
    const { amountPaid, paymentMode, transactionRef, paymentProofPath, paymentDate, remarks } = req.body;

    if (!id) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Expense ID is required.', details: [] } });
      return;
    }
    if (!amountPaid || Number(amountPaid) <= 0) {
      res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Valid payment amount is required.', details: [{ field: 'amountPaid', message: 'Must be greater than 0' }] } });
      return;
    }
    if (!paymentMode) {
      res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Payment mode is required.', details: [{ field: 'paymentMode', message: 'Payment mode is required.' }] } });
      return;
    }
    if (['Bank Transfer', 'UPI', 'Cheque'].includes(paymentMode) && (!transactionRef || !transactionRef.trim())) {
      res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Transaction reference is mandatory for ${paymentMode}.`, details: [{ field: 'transactionRef', message: 'Transaction reference is required.' }] } });
      return;
    }

    const { display } = formatApproverWithRole(req.user);
    const expense = await expenseRepository.disburse(id, {
      amountPaid: Number(amountPaid),
      paymentMode,
      paymentDate: paymentDate ? String(paymentDate).trim() : undefined,
      transactionRef: transactionRef ? transactionRef.trim() : undefined,
      paymentProofPath: paymentProofPath ? String(paymentProofPath).trim() : undefined,
      remarks: remarks ? remarks.trim() : undefined,
      disbursedBy: display,
    });

    res.json({ success: true, data: expense, message: 'Payment disbursement recorded successfully by Accounts.' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: { code: 'DISBURSEMENT_FAILED', message: error.message || 'Disbursement failed.', details: [] } });
  }
};
