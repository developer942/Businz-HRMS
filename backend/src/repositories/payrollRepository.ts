import { getSupabaseAdmin, isRealSupabaseConfigured } from '../config/supabase.js';
import {
  PayrollRunModel,
  PayrollRunStatus,
  FullPayrollCalculationResult,
  PayslipResponseData,
} from '../types/payroll.js';
import { employeeRepository } from './employeeRepository.js';
import { settingsRepository } from './settingsRepository.js';
import { randomUUID } from 'crypto';
import { query, withTransaction } from '../config/database.js';

// In-memory data store for payroll runs & processed records during active session
const inMemoryRuns: PayrollRunModel[] = [];
const inMemoryRecords: Map<string, FullPayrollCalculationResult[]> = new Map();

const mapPayrollRecord = (row: any): FullPayrollCalculationResult => ({
  employeeId: row.employee_code,
  status: row.status,
  payrollMonth: Number(row.payroll_month), payrollYear: Number(row.payroll_year),
  monthlySalary: Number(row.monthly_salary ?? row.gross_salary),
  basicSalary: Number(row.basic_salary), da: Number(row.da), conveyance: Number(row.conveyance), hra: Number(row.hra),
  fixedGross: Number(row.basic_salary) + Number(row.da) + Number(row.conveyance) + Number(row.hra),
  attendanceBonus: Number(row.attendance_bonus), overtimeHours: Number(row.overtime_hours || 0),
  overtimeRate: 0, overtimeAmount: Number(row.overtime_amount), bonus: Number(row.bonus),
  incentive: Number(row.incentive), commission: Number(row.commission), otherEarnings: Number(row.other_earnings),
  grossSalary: Number(row.gross_salary), pfBase: Number(row.pf_base), pfRate: Number(row.pf_rate),
  pfAmount: Number(row.pf_amount), esicBase: Number(row.esic_base), esicRate: Number(row.esic_rate),
  esicAmount: Number(row.esic_amount), professionalTax: Number(row.professional_tax),
  workingDays: Number(row.working_days || 0), presentDays: Number(row.present_days || 0),
  lopDays: Number(row.lop_days), dailySalary: Number(row.working_days) > 0 ? Number(row.gross_salary) / Number(row.working_days) : 0,
  lopAmount: Number(row.lop_amount), advanceRecovery: Number(row.advance_recovery), loanRecovery: Number(row.loan_recovery),
  otherDeductions: Number(row.other_deductions), totalDeductions: Number(row.total_deductions), netSalary: Number(row.net_salary),
  earningsBreakdown: [], deductionsBreakdown: [],
});

export class PayrollRepository {
  async getRunByMonth(month: number, year: number): Promise<PayrollRunModel | null> {
    const found = inMemoryRuns.find(r => r.payrollMonth === month && r.payrollYear === year);
    if (found) return found;

    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from('payroll_runs')
          .select('*')
          .eq('payroll_month', month)
          .eq('payroll_year', year)
          .maybeSingle();

        if (data && !error) {
          return {
            id: data.id,
            payrollMonth: data.payroll_month,
            payrollYear: data.payroll_year,
            status: data.status,
            totalEmployees: data.total_employees,
            totalGross: Number(data.total_gross),
            totalDeductions: Number(data.total_deductions),
            totalNet: Number(data.total_net),
            processedBy: data.processed_by_name || data.processed_by,
            approvedBy: data.approved_by_name || data.approved_by,
            processedAt: data.processed_at,
            approvedAt: data.approved_at,
            paidAt: data.paid_at,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          };
        }
      } catch (err) {
        console.warn('Database error in getRunByMonth:', err);
      }
    }

    return null;
  }

  async getRunById(id: string): Promise<PayrollRunModel | null> {
    const memory = inMemoryRuns.find(r => r.id === id);
    if (memory) return memory;
    if (isRealSupabaseConfigured()) {
      const { data, error } = await getSupabaseAdmin().from('payroll_runs').select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(`Payroll run lookup failed: ${error.message}`);
      if (data) return {
        id: data.id, payrollMonth: data.payroll_month, payrollYear: data.payroll_year, status: data.status,
        totalEmployees: data.total_employees, totalGross: Number(data.total_gross),
        totalDeductions: Number(data.total_deductions), totalNet: Number(data.total_net),
        processedBy: data.processed_by_name || data.processed_by, approvedBy: data.approved_by_name || data.approved_by,
        processedAt: data.processed_at, approvedAt: data.approved_at, paidAt: data.paid_at,
        createdAt: data.created_at, updatedAt: data.updated_at,
      };
    }
    return null;
  }

  async getAllRuns(): Promise<PayrollRunModel[]> {
    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from('payroll_runs')
          .select('*')
          .order('payroll_year', { ascending: false })
          .order('payroll_month', { ascending: false });

        if (data && !error && data.length > 0) {
          return data.map(d => ({
            id: d.id,
            payrollMonth: d.payroll_month,
            payrollYear: d.payroll_year,
            status: d.status,
            totalEmployees: d.total_employees,
            totalGross: Number(d.total_gross),
            totalDeductions: Number(d.total_deductions),
            totalNet: Number(d.total_net),
            processedBy: d.processed_by_name || d.processed_by,
            approvedBy: d.approved_by_name || d.approved_by,
            processedAt: d.processed_at,
            approvedAt: d.approved_at,
            paidAt: d.paid_at,
            createdAt: d.created_at,
            updatedAt: d.updated_at,
          }));
        }
      } catch (err) {
        console.warn('Database error in getAllRuns:', err);
      }
    }

    return inMemoryRuns;
  }

  async createRun(month: number, year: number): Promise<PayrollRunModel> {
    const existing = await this.getRunByMonth(month, year);
    if (existing) {
      throw new Error(`Payroll run for ${month}/${year} already exists with status ${existing.status}`);
    }

    const id = randomUUID();
    const newRun: PayrollRunModel = {
      id,
      payrollMonth: month,
      payrollYear: year,
      status: 'DRAFT',
      totalEmployees: 0,
      totalGross: 0,
      totalDeductions: 0,
      totalNet: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    inMemoryRuns.unshift(newRun);

    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const { error } = await supabase.from('payroll_runs').insert({
          id: newRun.id,
          payroll_month: newRun.payrollMonth,
          payroll_year: newRun.payrollYear,
          status: newRun.status,
          total_employees: newRun.totalEmployees,
          total_gross: newRun.totalGross,
          total_deductions: newRun.totalDeductions,
          total_net: newRun.totalNet,
        });
        if (error) throw new Error(`Payroll run was not saved: ${error.message}`);
      } catch (err) {
        inMemoryRuns.splice(inMemoryRuns.findIndex(item => item.id === newRun.id), 1);
        throw err;
      }
    }

    return newRun;
  }

  async saveProcessedRun(
    runId: string,
    records: FullPayrollCalculationResult[],
    processorName: string
  ): Promise<PayrollRunModel> {
    let run: PayrollRunModel | null = inMemoryRuns.find(r => r.id === runId) || null;
    if (!run) {
      run = await this.getRunById(runId);
    }
    if (!run) {
      throw new Error(`Payroll run ${runId} not found`);
    }

    if (run.status === 'PAID') {
      throw new Error('Cannot re-process an already PAID payroll run');
    }
    const previousRun = { ...run };

    const totalGross = records.reduce((acc, r) => acc + r.grossSalary, 0);
    const totalDeductions = records.reduce((acc, r) => acc + r.totalDeductions, 0);
    const totalNet = records.reduce((acc, r) => acc + r.netSalary, 0);

    run.status = 'PROCESSED';
    run.totalEmployees = records.length;
    run.totalGross = Number(totalGross.toFixed(2));
    run.totalDeductions = Number(totalDeductions.toFixed(2));
    run.totalNet = Number(totalNet.toFixed(2));
    run.processedBy = processorName;
    run.processedAt = new Date().toISOString();
    run.updatedAt = new Date().toISOString();

    inMemoryRecords.set(runId, records);

    if (isRealSupabaseConfigured()) {
      try {
        await withTransaction(async client => {
          const locked = await client.query(`SELECT status FROM public.payroll_runs WHERE id=$1 FOR UPDATE`, [runId]);
          if (!locked.rows[0]) throw new Error(`Payroll run ${runId} not found in PostgreSQL`);
          if (['APPROVED', 'PAID'].includes(locked.rows[0].status)) throw new Error(`Finalized payroll run ${runId} cannot be reprocessed`);
          for (const record of records) {
            const employee = await client.query(`SELECT id FROM public.employees WHERE employee_id=$1 LIMIT 1`, [record.employeeId]);
            if (!employee.rows[0]) throw new Error(`Employee ${record.employeeId} not found while saving payroll`);
            const structure = await client.query(
              `SELECT id FROM public.salary_structures WHERE employee_id=$1 AND is_active=TRUE
                AND effective_from<=make_date($2,$3,1) AND (effective_to IS NULL OR effective_to>=make_date($2,$3,1))
                ORDER BY effective_from DESC LIMIT 1`,
              [employee.rows[0].id, record.payrollYear, record.payrollMonth]
            );
            await client.query(
              `INSERT INTO public.payroll_records(payroll_run_id,employee_id,salary_structure_id,payroll_month,payroll_year,
                 basic_salary,da,conveyance,hra,attendance_bonus,overtime_amount,bonus,incentive,commission,other_earnings,
                 gross_salary,pf_base,pf_rate,pf_amount,esic_base,esic_rate,esic_amount,professional_tax,lop_days,lop_amount,
                 advance_recovery,loan_recovery,other_deductions,total_deductions,net_salary,status,needs_recalculation)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,'PROCESSED',FALSE)
               ON CONFLICT(employee_id,payroll_month,payroll_year) DO UPDATE SET
                 payroll_run_id=EXCLUDED.payroll_run_id,salary_structure_id=EXCLUDED.salary_structure_id,
                 basic_salary=EXCLUDED.basic_salary,da=EXCLUDED.da,conveyance=EXCLUDED.conveyance,hra=EXCLUDED.hra,
                 attendance_bonus=EXCLUDED.attendance_bonus,overtime_amount=EXCLUDED.overtime_amount,bonus=EXCLUDED.bonus,
                 incentive=EXCLUDED.incentive,commission=EXCLUDED.commission,other_earnings=EXCLUDED.other_earnings,
                 gross_salary=EXCLUDED.gross_salary,pf_base=EXCLUDED.pf_base,pf_rate=EXCLUDED.pf_rate,pf_amount=EXCLUDED.pf_amount,
                 esic_base=EXCLUDED.esic_base,esic_rate=EXCLUDED.esic_rate,esic_amount=EXCLUDED.esic_amount,
                 professional_tax=EXCLUDED.professional_tax,lop_days=EXCLUDED.lop_days,lop_amount=EXCLUDED.lop_amount,
                 advance_recovery=EXCLUDED.advance_recovery,loan_recovery=EXCLUDED.loan_recovery,
                 other_deductions=EXCLUDED.other_deductions,total_deductions=EXCLUDED.total_deductions,
                 net_salary=EXCLUDED.net_salary,status='PROCESSED',needs_recalculation=FALSE,updated_at=NOW()
               WHERE public.payroll_records.status='DRAFT'`,
              [runId, employee.rows[0].id, structure.rows[0]?.id || null, record.payrollMonth, record.payrollYear,
               record.basicSalary, record.da, record.conveyance, record.hra, record.attendanceBonus, record.overtimeAmount,
               record.bonus, record.incentive, record.commission, record.otherEarnings, record.grossSalary,
               record.pfBase, record.pfRate, record.pfAmount, record.esicBase, record.esicRate, record.esicAmount,
               record.professionalTax, record.lopDays, record.lopAmount, record.advanceRecovery, record.loanRecovery,
               record.otherDeductions, record.totalDeductions, record.netSalary]
            );
          }
          await client.query(
            `UPDATE public.payroll_runs SET status='PROCESSED',total_employees=$2,total_gross=$3,
               total_deductions=$4,total_net=$5,processed_by_name=$6,processed_at=$7,updated_at=NOW() WHERE id=$1`,
            [runId, run.totalEmployees, run.totalGross, run.totalDeductions, run.totalNet, processorName, run.processedAt]
          );
        });

        const supabase = getSupabaseAdmin();

        // Also save to company_settings payroll_records_data for frontend synchronization
        const { data: csData } = await supabase
          .from('company_settings')
          .select('id, setting_val')
          .eq('setting_key', 'payroll_records_data')
          .maybeSingle();

        const currentRecords: any[] = Array.isArray(csData?.setting_val) ? csData!.setting_val : [];
        const mergedRecords = [...records, ...currentRecords.filter(cr => !records.some(r => r.employeeId === cr.employeeId && r.payrollMonth === cr.payrollMonth && r.payrollYear === cr.payrollYear))];

        if (csData?.id) {
          await supabase
            .from('company_settings')
            .update({ setting_val: mergedRecords, updated_at: new Date().toISOString() })
            .eq('id', csData.id);
        } else {
          await supabase
            .from('company_settings')
            .insert({ setting_key: 'payroll_records_data', setting_val: mergedRecords });
        }
      } catch (err) {
        Object.assign(run, previousRun);
        inMemoryRecords.delete(runId);
        throw err;
      }
    }

    return run;
  }

  async updateRunStatus(runId: string, status: PayrollRunStatus, approverName?: string): Promise<PayrollRunModel> {
    let run: PayrollRunModel | null = inMemoryRuns.find(r => r.id === runId) || null;
    if (!run) {
      run = await this.getRunById(runId);
    }
    if (!run) {
      throw new Error(`Payroll run ${runId} not found`);
    }

    if (run.status === 'PAID' && status !== 'PAID') {
      throw new Error('Cannot change status of an already PAID payroll run');
    }

    if (status === 'PAID' && run.status !== 'APPROVED') {
      throw new Error('Payroll run must be APPROVED before it can be marked as PAID');
    }
    const previousRun = { ...run };

    run.status = status;
    run.updatedAt = new Date().toISOString();

    if (status === 'APPROVED') {
      run.approvedBy = approverName || 'Authorized Signatory';
      run.approvedAt = new Date().toISOString();
    } else if (status === 'PAID') {
      run.paidAt = new Date().toISOString();
    }

    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const payload: any = {
          status: run.status,
          updated_at: run.updatedAt,
        };
        if (run.approvedBy) payload.approved_by_name = run.approvedBy;
        if (run.approvedAt) payload.approved_at = run.approvedAt;
        if (run.paidAt) payload.paid_at = run.paidAt;

        const { error } = await supabase
          .from('payroll_runs')
          .update(payload)
          .eq('id', runId);
        if (error) throw new Error(`Payroll status update failed: ${error.message}`);
        if (status === 'APPROVED' || status === 'PAID') {
          const { error: recordError } = await supabase.from('payroll_records').update({ status, updated_at: run.updatedAt }).eq('payroll_run_id', runId);
          if (recordError) throw new Error(`Payroll record finalization failed: ${recordError.message}`);
        }
      } catch (err) {
        Object.assign(run, previousRun);
        throw err;
      }
    }

    return run;
  }

  async getRecordsForRun(runId: string): Promise<FullPayrollCalculationResult[]> {
    if (isRealSupabaseConfigured()) {
      try {
        const result = await query(
          `SELECT pr.*,e.employee_id AS employee_code,ss.monthly_salary,pa.working_days,pa.present_days,pa.overtime_hours
             FROM public.payroll_records pr JOIN public.employees e ON e.id=pr.employee_id
             LEFT JOIN public.salary_structures ss ON ss.id=pr.salary_structure_id
             LEFT JOIN public.payroll_attendance pa ON pa.payroll_record_id=pr.id
            WHERE pr.payroll_run_id=$1 ORDER BY e.employee_id`, [runId]
        );
        return result.rows.map(mapPayrollRecord);
      } catch (err) {
        throw err;
      }
    }
    return inMemoryRecords.get(runId) || [];
  }

  async getAllProcessedRecords(): Promise<FullPayrollCalculationResult[]> {
    if (isRealSupabaseConfigured()) {
      try {
        const result = await query(
          `SELECT pr.*,e.employee_id AS employee_code,ss.monthly_salary,pa.working_days,pa.present_days,pa.overtime_hours
             FROM public.payroll_records pr JOIN public.employees e ON e.id=pr.employee_id
             LEFT JOIN public.salary_structures ss ON ss.id=pr.salary_structure_id
             LEFT JOIN public.payroll_attendance pa ON pa.payroll_record_id=pr.id
            WHERE pr.status IN ('PROCESSED','APPROVED','PAID')
            ORDER BY pr.payroll_year DESC,pr.payroll_month DESC,e.employee_id`
        );
        return result.rows.map(mapPayrollRecord);
      } catch (err) {
        throw err;
      }
    }
    const all: FullPayrollCalculationResult[] = [];
    for (const recs of inMemoryRecords.values()) all.push(...recs);
    return all;
  }

  async getRecordForEmployee(employeeId: string, month?: number, year?: number): Promise<FullPayrollCalculationResult | null> {
    const all = await this.getAllProcessedRecords();
    return (
      all.find(r => {
        const matchesEmp = r.employeeId?.toLowerCase().trim() === employeeId.toLowerCase().trim();
        if (!month || !year) return matchesEmp;
        return matchesEmp && r.payrollMonth === month && r.payrollYear === year;
      }) || null
    );
  }

  async generatePayslip(employeeId: string, month?: number, year?: number, companyId?: string): Promise<PayslipResponseData | null> {
    const record = await this.getRecordForEmployee(employeeId, month, year);
    if (!record) return null;

    const emp = await employeeRepository.getEmployeeById(employeeId);
    if (!emp) return null;

    const targetCompanyId = companyId || emp.branch || 'company-a';
    const compSettings = await settingsRepository.getCompanySettings(targetCompanyId);

    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    return {
      company: {
        company_id: compSettings.company_id || targetCompanyId,
        companyName: compSettings.companyName || 'Corporate Organization',
        legalName: compSettings.legalCompanyName || compSettings.legalEntity || compSettings.companyName || 'Corporate Organization',
        logoUrl: compSettings.logoUrl || '',
        address: compSettings.address || '',
        registeredAddress: compSettings.registeredAddress || compSettings.address || '',
        branchAddress: compSettings.branchAddress || '',
        email: compSettings.officialEmail || compSettings.contactEmail || '',
        phone: compSettings.officialPhone || compSettings.contactPhone || '',
        website: compSettings.website || '',
        pan: compSettings.panNumber || '',
        gst: compSettings.gstNumber || compSettings.taxIdGst || '',
        cin: compSettings.cinNumber || '',
        registrationNumber: compSettings.registrationNumber || '',
        ownerName: compSettings.ownerName || '',
        authorizedSignatoryName: compSettings.authorizedSignatoryName || '',
        authorizedSignatoryDesignation: compSettings.authorizedSignatoryDesignation || 'Authorized Signatory',
        signatureImageUrl: compSettings.signatureImageUrl || '',
        stampImageUrl: compSettings.stampImageUrl || '',
      },
      employee: {
        id: emp.id,
        employeeId: emp.employeeId,
        firstName: emp.firstName,
        lastName: emp.lastName,
        email: emp.email,
        department: emp.department,
        designation: emp.designation,
        bankName: emp.bankName,
        accountNumber: emp.accountNumber,
        ifscCode: emp.ifscCode,
      },
      payroll: {
        month: record.payrollMonth,
        year: record.payrollYear,
        monthName: months[record.payrollMonth - 1] || 'August',
        workingDays: record.workingDays,
        presentDays: record.presentDays,
        lopDays: record.lopDays,
        status: record.status || 'PROCESSED',
      },
      earnings: {
        basicSalary: record.basicSalary,
        da: record.da,
        conveyance: record.conveyance,
        hra: record.hra,
        attendanceBonus: record.attendanceBonus,
        overtimeAmount: record.overtimeAmount,
        bonus: record.bonus,
        incentive: record.incentive,
        commission: record.commission,
        otherEarnings: record.otherEarnings,
        grossSalary: record.grossSalary,
      },
      deductions: {
        pf: record.pfAmount,
        pfRate: record.pfRate,
        esic: record.esicAmount,
        esicRate: record.esicRate,
        professionalTax: record.professionalTax,
        lopAmount: record.lopAmount,
        advanceRecovery: record.advanceRecovery,
        loanRecovery: record.loanRecovery,
        otherDeductions: record.otherDeductions,
        totalDeductions: record.totalDeductions,
      },
      netSalary: record.netSalary,
    };
  }
}

export const payrollRepository = new PayrollRepository();
