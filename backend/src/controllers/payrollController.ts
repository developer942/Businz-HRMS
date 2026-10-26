import { Request, Response, NextFunction } from 'express';
import { payrollService } from '../services/payrollService.js';
import { isComponentEligible } from '../services/componentEligibilityEngine.js';
import {
  payrollPreviewSchema,
  payrollRunCreateSchema,
  payrollSettingsUpdateSchema,
} from '../validators/payrollValidators.js';
import { PayrollSettingsModel } from '../types/payroll.js';

export class PayrollController {
  async getSettings(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const settings = await payrollService.getSettings();
      res.json({ success: true, data: settings });
    } catch (err) {
      next(err);
    }
  }

  async updateSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = payrollSettingsUpdateSchema.parse(req.body);
      const updated = await payrollService.updateSettings(validated as unknown as Partial<PayrollSettingsModel>);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  async getComponents(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const components = await payrollService.getSalaryComponents();
      res.json({ success: true, data: components });
    } catch (err) {
      next(err);
    }
  }

  async updateComponents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const components = req.body?.components;
      if (!Array.isArray(components)) {
        res.status(400).json({ success: false, message: 'Invalid payload: components array expected' });
        return;
      }
      const updated = await payrollService.updateSalaryComponents(components);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async evaluateEligibility(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { employee_id, monthly_ctc, basic_salary, gross_salary, with_pf, is_continuation } = req.body;
      const components = await payrollService.getSalaryComponents();
      const ctx = {
        id: employee_id,
        employeeId: employee_id,
        monthlyCtc: Number(monthly_ctc) || 0,
        basicSalary: Number(basic_salary) || 0,
        grossSalary: Number(gross_salary) || Number(monthly_ctc) || 0,
        withPf: with_pf !== false,
        isContributionPeriodContinuation: Boolean(is_continuation),
      };

      const evaluations: Record<string, { eligible: boolean; component: any }> = {};
      const eligibleList = [];

      for (const comp of components) {
        const eligible = isComponentEligible(comp, ctx);
        evaluations[comp.code] = {
          eligible,
          component: {
            id: comp.id,
            name: comp.name,
            code: comp.code,
            type: comp.type,
            eligibilityType: comp.eligibilityType || 'ALL',
            eligibilityLimit: comp.eligibilityLimit,
            eligibilityOperator: comp.eligibilityOperator,
          }
        };
        if (eligible) eligibleList.push(comp);
      }

      res.json({
        success: true,
        data: {
          employee_id,
          monthly_ctc: ctx.monthlyCtc,
          eligible_components: eligibleList,
          evaluations,
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Authoritative Preview API matching exact specification:
   * POST /api/v1/payroll/preview
   */
  async previewPayroll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = payrollPreviewSchema.parse(req.body);
      const result = await payrollService.previewPayroll(validated);

      res.json({
        success: true,
        data: {
          employee_id: result.employeeId,
          payroll_month: result.payrollMonth,
          payroll_year: result.payrollYear,

          salary: {
            basic: result.basicSalary,
            da: result.da,
            conveyance: result.conveyance,
            hra: result.hra,
          },

          earnings: {
            attendance_bonus: result.attendanceBonus,
            overtime: result.overtimeAmount,
            bonus: result.bonus,
            incentive: result.incentive,
            commission: result.commission,
            others: result.otherEarnings,
            gross: result.grossSalary,
          },

          deductions: {
            pf_base: result.pfBase,
            pf_rate: result.pfRate,
            pf: result.pfAmount,

            esic_base: result.esicBase,
            esic_rate: result.esicRate,
            esic: result.esicAmount,

            professional_tax: result.professionalTax,
            lop: result.lopAmount,
            advance_recovery: result.advanceRecovery,
            loan_recovery: result.loanRecovery,
            other: result.otherDeductions,

            total: result.totalDeductions,
          },

          net_salary: result.netSalary,
          breakdown: {
            earnings: result.earningsBreakdown,
            deductions: result.deductionsBreakdown,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async createRun(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = payrollRunCreateSchema.parse(req.body);
      const run = await payrollService.createPayrollRun(validated.payroll_month, validated.payroll_year);
      res.status(201).json({ success: true, data: run });
    } catch (err) {
      next(err);
    }
  }

  async getAllRuns(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const runs = await payrollService.getAllRuns();
      res.json({ success: true, data: runs });
    } catch (err) {
      next(err);
    }
  }

  async getRunById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const run = await payrollService.getRunById(req.params.id as string);
      if (!run) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Payroll run ${req.params.id} not found`, details: [] },
        });
        return;
      }
      res.json({ success: true, data: run });
    } catch (err) {
      next(err);
    }
  }

  async processRun(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const processor = req.user?.name || 'Finance Admin';
      const run = await payrollService.processPayrollRun(req.params.id as string, processor);
      res.json({ success: true, data: run });
    } catch (err) {
      next(err);
    }
  }

  async approveRun(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const approver = req.user?.name || 'Authorized Signatory';
      const run = await payrollService.approvePayrollRun(req.params.id as string, approver);
      res.json({ success: true, data: run });
    } catch (err) {
      next(err);
    }
  }

  async payRun(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const run = await payrollService.payPayrollRun(req.params.id as string);
      res.json({ success: true, data: run });
    } catch (err) {
      next(err);
    }
  }

  async getRecords(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
        return;
      }

      const isPrivilegedPayrollRole = ['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Finance Manager', 'Admin', 'HR'].includes(user.role);
      const month = req.query.month ? Number(req.query.month) : undefined;
      const year = req.query.year ? Number(req.query.year) : undefined;
      let requestedEmployeeId = req.query.employeeId as string | undefined;

      if (!isPrivilegedPayrollRole) {
        // IDOR / BOLA Prevention: Non-admin employees can never query other employees' records
        if (requestedEmployeeId && user.employeeId && requestedEmployeeId.toLowerCase() !== user.employeeId.toLowerCase()) {
          res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Access denied: You are not authorized to view payroll records for other employees.',
              details: [`Requested employee ID: ${requestedEmployeeId}`],
            },
          });
          return;
        }
        // Strictly force scope to authenticated employee's own identity
        requestedEmployeeId = user.employeeId;
      }

      const records = await payrollService.getRecords({ month, year, employeeId: requestedEmployeeId });
      res.json({ success: true, data: records, total: records.length });
    } catch (err) {
      next(err);
    }
  }

  async getPayslip(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
        return;
      }

      const requestedEmpId = (req.params.employeeId || req.params.id) as string;
      const isPrivilegedPayrollRole = ['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Finance Manager', 'Admin', 'HR'].includes(user.role);

      const isOwnEmployee = Boolean(
        (user.employeeId && requestedEmpId && user.employeeId.toLowerCase() === requestedEmpId.toLowerCase()) ||
        (user.id && requestedEmpId && user.id.toLowerCase() === requestedEmpId.toLowerCase())
      );

      // IDOR / BOLA Prevention: Non-privileged users must only access their own payslip
      if (!isPrivilegedPayrollRole && !isOwnEmployee) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied: You are only authorized to view your own payslips.',
            details: [`Requested employee ID: ${requestedEmpId}`],
          },
        });
        return;
      }

      const effectiveEmpId = isPrivilegedPayrollRole ? requestedEmpId : (user.employeeId || requestedEmpId);
      const month = req.query.month ? Number(req.query.month) : 8;
      const year = req.query.year ? Number(req.query.year) : 2026;
      const companyId = user.company_id || (req.query.company_id as string) || (req.headers['x-company-id'] as string);

      const payslip = await payrollService.getPayslip(effectiveEmpId, month, year, companyId);
      res.json({ success: true, data: payslip });
    } catch (err) {
      next(err);
    }
  }
}

export const payrollController = new PayrollController();
