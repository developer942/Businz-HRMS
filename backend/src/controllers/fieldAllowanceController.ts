import type { NextFunction, Request, Response } from 'express';
import { fieldAllowanceService } from '../services/fieldAllowanceService.js';
import {
  fieldAllowanceDailyReportSchema,
  fieldAllowanceDecisionSchema,
  fieldAllowanceDistributionSchema,
  fieldAllowanceRequestSchema,
} from '../validators/fieldAllowanceValidators.js';

const notFound = (res: Response, message: string) => res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message, details: [] } });

export class FieldAllowanceController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const payload = fieldAllowanceRequestSchema.parse(req.body);
      const data = await fieldAllowanceService.create(req.user!, payload);
      res.status(201).json({ success: true, data, message: payload.submit ? 'Field Allowance request submitted' : 'Draft saved' });
    } catch (error) { next(error); }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const payload = fieldAllowanceRequestSchema.parse(req.body);
      const data = await fieldAllowanceService.update(req.user!, String(req.params.id), payload);
      if (!data) { notFound(res, 'Editable Field Allowance request not found'); return; }
      res.json({ success: true, data, message: payload.submit ? 'Field Allowance request submitted' : 'Draft saved' });
    } catch (error) { next(error); }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await fieldAllowanceService.list(req.user!, {
        status: req.query.status as string | undefined, department: req.query.department as string | undefined,
        search: req.query.search as string | undefined,
        scope: req.query.scope === 'mine' ? 'mine' : undefined,
      });
      res.json({ success: true, data });
    } catch (error) { next(error); }
  }

  async detail(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await fieldAllowanceService.detail(req.user!, String(req.params.id));
      if (!data) { notFound(res, 'Field Allowance trip not found'); return; }
      res.json({ success: true, data });
    } catch (error) { next(error); }
  }

  async decide(req: Request, res: Response, next: NextFunction) {
    try {
      const payload = fieldAllowanceDecisionSchema.parse(req.body);
      const data = await fieldAllowanceService.decide(req.user!, String(req.params.id), payload);
      if (!data) { notFound(res, 'Pending Field Allowance request not found'); return; }
      res.json({ success: true, data, message: `Request ${payload.decision.toLowerCase().replace('_', ' ')}` });
    } catch (error) { next(error); }
  }

  async distribute(req: Request, res: Response, next: NextFunction) {
    try {
      const payload = fieldAllowanceDistributionSchema.parse(req.body);
      const data = await fieldAllowanceService.distribute(req.user!, String(req.params.id), payload);
      if (!data) { notFound(res, 'Approved Field Allowance request not found'); return; }
      res.status(201).json({ success: true, data, message: 'Amount distribution recorded' });
    } catch (error) { next(error); }
  }

  async addDailyReport(req: Request, res: Response, next: NextFunction) {
    try {
      const payload = fieldAllowanceDailyReportSchema.parse(req.body);
      const data = await fieldAllowanceService.addDailyReport(req.user!, String(req.params.id), payload);
      res.status(201).json({ success: true, data, message: 'Daily expense added' });
    } catch (error) { next(error); }
  }

  async complete(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await fieldAllowanceService.complete(req.user!, String(req.params.id));
      if (!data) { notFound(res, 'Active Field Allowance trip not found'); return; }
      res.json({ success: true, data, message: 'Field visit completed' });
    } catch (error) { next(error); }
  }

  async history(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await fieldAllowanceService.history(req.user!, {
        search: req.query.search as string | undefined, startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
      });
      res.json({ success: true, data });
    } catch (error) { next(error); }
  }

  async summary(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await fieldAllowanceService.summary(req.user!) }); }
    catch (error) { next(error); }
  }
}

export const fieldAllowanceController = new FieldAllowanceController();
