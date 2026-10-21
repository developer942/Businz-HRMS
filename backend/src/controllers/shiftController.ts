import { Request, Response, NextFunction } from 'express';
import { shiftRepository } from '../repositories/shiftRepository.js';
import { createShiftSchema, assignEmployeesSchema, createShiftRequestSchema, updateShiftRequestSchema } from '../validators/shiftValidators.js';

export const getShifts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user?.company_id || req.user?.companyId || 'company-a';
    const shifts = await shiftRepository.getShifts(companyId);
    res.status(200).json({
      success: true,
      data: shifts,
    });
  } catch (err) {
    next(err);
  }
};

export const getShiftAssignmentSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user?.company_id || req.user?.companyId || 'company-a';
    const businessDate = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const summary = await shiftRepository.getAssignmentSummary(companyId, businessDate, req.dataAccessScope);
    res.status(200).json({ success: true, data: summary, meta: { companyId, businessDate } });
  } catch (err) {
    next(err);
  }
};

export const createShift = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = createShiftSchema.parse(req.body);
    const companyId = req.user?.company_id || req.user?.companyId || 'company-a';
    const newShift = await shiftRepository.createShift(validated, companyId);

    res.status(201).json({
      success: true,
      data: newShift,
    });
  } catch (err) {
    next(err);
  }
};

export const assignEmployeesToShift = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = String(req.params.id);
    const validated = assignEmployeesSchema.parse(req.body);

    const companyId = req.user?.company_id || req.user?.companyId || 'company-a';
    const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const updatedShift = await shiftRepository.assignEmployees(id, validated.employeeIds, companyId, businessDate);

    if (!updatedShift) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Shift ${id} not found`,
          details: [],
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: updatedShift,
    });
  } catch (err) {
    next(err);
  }
};

export const createShiftRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = createShiftRequestSchema.parse(req.body);
    const employeeId = req.user?.employeeId || req.user?.id;
    if (!employeeId) {
      res.status(422).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Authenticated employee identity is required', details: [] },
      });
      return;
    }

    const request = await shiftRepository.createShiftRequest({
      ...validated,
      employeeId,
      employeeName: req.user?.name || validated.employeeName,
    });
    res.status(201).json({ success: true, data: request });
  } catch (err) {
    next(err);
  }
};

export const updateShiftRequestReason = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = updateShiftRequestSchema.parse(req.body);
    const employeeId = req.user?.employeeId || req.user?.id;
    if (!employeeId) {
      res.status(422).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Authenticated employee identity is required', details: [] },
      });
      return;
    }

    const request = await shiftRepository.updateShiftRequestReason(String(req.params.id), employeeId, validated.reason);
    if (!request) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Pending shift request not found', details: [] },
      });
      return;
    }
    res.status(200).json({ success: true, data: request });
  } catch (err) {
    next(err);
  }
};
