import { validateComponentEligibility } from './componentEligibilityEngine.js';
import { computeFullPayroll } from './calculationEngine.js';
import { employeeRepository } from '../repositories/employeeRepository.js';
import { settingsRepository } from '../repositories/settingsRepository.js';
import { payrollRepository } from '../repositories/payrollRepository.js';
import { overtimeRepository } from '../repositories/overtimeRepository.js';
export class PayrollService {
    async getSettings() {
        return settingsRepository.getSettings();
    }
    async updateSettings(updates) {
        return settingsRepository.updateSettings(updates);
    }
    async getPayrollSettingsConfig() {
        return settingsRepository.getPayrollSettingsConfig();
    }
    async updatePayrollSettingsConfig(updates) {
        return settingsRepository.updatePayrollSettingsConfig(updates);
    }
    async getSalaryComponents() {
        const config = await this.getPayrollSettingsConfig();
        return config.components || [];
    }
    async updateSalaryComponents(components) {
        for (const comp of components) {
            const validation = validateComponentEligibility(comp);
            if (!validation.isValid) {
                throw new Error(`Validation error for component "${comp.name}": ${validation.error}`);
            }
        }
        const updated = await this.updatePayrollSettingsConfig({ components });
        return updated.components || [];
    }
    /**
     * Preview calculation for an employee without persisting records.
     * Authoritative backend calculation using decimal.js and dynamic DB settings.
     */
    async previewPayroll(input) {
        const employee = await employeeRepository.getEmployeeById(input.employee_id);
        if (!employee) {
            throw new Error(`Employee with ID ${input.employee_id} not found`);
        }
        const structure = await employeeRepository.getSalaryStructure(input.employee_id);
        if (!structure) {
            throw new Error(`No active salary structure found for employee ${input.employee_id}`);
        }
        const settings = await settingsRepository.getSettings();
        const payrollConfig = await settingsRepository.getPayrollSettingsConfig();
        // Check approved overtime records if not explicitly passed
        let otHours = input.overtime_hours ?? 0;
        let otRate = input.overtime_rate ?? 0;
        let otAmount = 0;
        if (otHours === 0) {
            const approvedOt = await overtimeRepository.getApprovedOvertimeForMonth(employee.employeeId, input.payroll_month, input.payroll_year);
            if (approvedOt.length > 0) {
                otHours = approvedOt.reduce((sum, r) => sum + r.hours, 0);
                otAmount = approvedOt.reduce((sum, r) => sum + r.amount, 0);
            }
        }
        const workingDays = settings.standardWorkingDays || 26;
        const lopDays = input.lop_days ?? 0;
        const presentDays = Math.max(0, workingDays - lopDays);
        return computeFullPayroll({
            employeeId: employee.employeeId,
            monthlySalary: structure.monthlySalary,
            basicPercentage: structure.basicPercentage,
            daPercentage: structure.daPercentage,
            conveyancePercentage: structure.conveyancePercentage,
            hraPercentage: structure.hraPercentage,
            payrollMonth: input.payroll_month,
            payrollYear: input.payroll_year,
            withPf: structure.withPf !== undefined ? structure.withPf : (employee.withPf !== undefined ? employee.withPf : true),
            settings,
            attendance: {
                workingDays,
                presentDays,
                paidLeaveDays: 0,
                unpaidLeaveDays: lopDays,
                absentDays: 0,
                halfDays: 0,
                lopDays,
                overtimeHours: otHours,
            },
            earnings: {
                attendanceBonus: input.attendance_bonus ?? 0,
                overtimeHours: otHours,
                overtimeRate: otRate,
                overtimeAmount: otAmount,
                bonus: input.bonus ?? 0,
                incentive: input.incentive ?? 0,
                commission: input.commission ?? 0,
                otherEarnings: input.other_earnings ?? 0,
            },
            deductions: {
                advanceRecovery: input.advance_recovery ?? 0,
                loanRecovery: input.loan_recovery ?? 0,
                otherDeductions: input.other_deductions ?? 0,
            },
            configuredComponents: payrollConfig?.components || [],
            employeeContext: {
                id: employee.id,
                employeeId: employee.employeeId,
                monthlyCtc: structure.monthlySalary,
                basicSalary: structure.monthlySalary * (structure.basicPercentage / 100),
                withPf: structure.withPf !== undefined ? structure.withPf : (employee.withPf !== undefined ? employee.withPf : true),
                payrollMonth: input.payroll_month,
                payrollYear: input.payroll_year,
            },
        });
    }
    async createPayrollRun(month, year) {
        return payrollRepository.createRun(month, year);
    }
    async getAllRuns() {
        return payrollRepository.getAllRuns();
    }
    async getRunById(id) {
        return payrollRepository.getRunById(id);
    }
    /**
     * Processes a monthly payroll batch for all active employees.
     */
    async processPayrollRun(runId, processorName = 'Finance Admin') {
        const run = await payrollRepository.getRunById(runId);
        if (!run) {
            throw new Error(`Payroll run ${runId} not found`);
        }
        const employees = await employeeRepository.getAllEmployees();
        const settings = await settingsRepository.getSettings();
        const payrollConfig = await settingsRepository.getPayrollSettingsConfig();
        const processedRecords = [];
        for (const emp of employees) {
            const structure = await employeeRepository.getSalaryStructure(emp.employeeId);
            if (!structure)
                continue;
            // Check approved overtime
            const approvedOt = await overtimeRepository.getApprovedOvertimeForMonth(emp.employeeId, run.payrollMonth, run.payrollYear);
            const otHours = approvedOt.reduce((sum, r) => sum + r.hours, 0);
            const otAmount = approvedOt.reduce((sum, r) => sum + r.amount, 0);
            const workingDays = settings.standardWorkingDays || 26;
            const lopDays = 0; // Standard month or from attendance
            const calculated = computeFullPayroll({
                employeeId: emp.employeeId,
                monthlySalary: structure.monthlySalary,
                basicPercentage: structure.basicPercentage,
                daPercentage: structure.daPercentage,
                conveyancePercentage: structure.conveyancePercentage,
                hraPercentage: structure.hraPercentage,
                payrollMonth: run.payrollMonth,
                payrollYear: run.payrollYear,
                withPf: structure.withPf !== undefined ? structure.withPf : (emp.withPf !== undefined ? emp.withPf : true),
                settings,
                attendance: {
                    workingDays,
                    presentDays: workingDays,
                    paidLeaveDays: 0,
                    unpaidLeaveDays: 0,
                    absentDays: 0,
                    halfDays: 0,
                    lopDays,
                    overtimeHours: otHours,
                },
                earnings: {
                    overtimeHours: otHours,
                    overtimeAmount: otAmount,
                },
                configuredComponents: payrollConfig?.components || [],
                employeeContext: {
                    id: emp.id,
                    employeeId: emp.employeeId,
                    monthlyCtc: structure.monthlySalary,
                    basicSalary: structure.monthlySalary * (structure.basicPercentage / 100),
                    withPf: structure.withPf !== undefined ? structure.withPf : (emp.withPf !== undefined ? emp.withPf : true),
                    payrollMonth: run.payrollMonth,
                    payrollYear: run.payrollYear,
                },
            });
            processedRecords.push(calculated);
        }
        return payrollRepository.saveProcessedRun(runId, processedRecords, processorName);
    }
    async approvePayrollRun(runId, approverName = 'Authorized Signatory') {
        return payrollRepository.updateRunStatus(runId, 'APPROVED', approverName);
    }
    async payPayrollRun(runId) {
        return payrollRepository.updateRunStatus(runId, 'PAID');
    }
    async getRecords(params) {
        const all = await payrollRepository.getAllProcessedRecords();
        return all.filter(r => {
            if (params?.employeeId && r.employeeId !== params.employeeId)
                return false;
            if (params?.month && r.payrollMonth !== params.month)
                return false;
            if (params?.year && r.payrollYear !== params.year)
                return false;
            return true;
        });
    }
    async getPayslip(employeeId, month, year, companyId) {
        let payslip = await payrollRepository.generatePayslip(employeeId, month, year, companyId);
        if (!payslip) {
            // If no past processed run exists for this month, calculate a preview payslip on the fly!
            const preview = await this.previewPayroll({
                employee_id: employeeId,
                payroll_month: month || 8,
                payroll_year: year || 2026,
            });
            const emp = await employeeRepository.getEmployeeById(employeeId);
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const targetCompanyId = companyId || emp?.branch || 'company-a';
            const compSettings = await settingsRepository.getCompanySettings(targetCompanyId);
            payslip = {
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
                    id: emp?.id || employeeId,
                    employeeId: emp?.employeeId || employeeId,
                    firstName: emp?.firstName || 'Staff',
                    lastName: emp?.lastName || 'Member',
                    email: emp?.email || 'staff@businz.com',
                    department: emp?.department || 'Operations',
                    designation: emp?.designation || 'Engineer',
                    bankName: emp?.bankName,
                    accountNumber: emp?.accountNumber,
                    ifscCode: emp?.ifscCode,
                },
                payroll: {
                    month: preview.payrollMonth,
                    year: preview.payrollYear,
                    monthName: months[preview.payrollMonth - 1] || 'August',
                    workingDays: preview.workingDays,
                    presentDays: preview.presentDays,
                    lopDays: preview.lopDays,
                    status: 'Processed',
                },
                earnings: {
                    basicSalary: preview.basicSalary,
                    da: preview.da,
                    conveyance: preview.conveyance,
                    hra: preview.hra,
                    attendanceBonus: preview.attendanceBonus,
                    overtimeAmount: preview.overtimeAmount,
                    bonus: preview.bonus,
                    incentive: preview.incentive,
                    commission: preview.commission,
                    otherEarnings: preview.otherEarnings,
                    grossSalary: preview.grossSalary,
                },
                deductions: {
                    pf: preview.pfAmount,
                    pfRate: preview.pfRate,
                    esic: preview.esicAmount,
                    esicRate: preview.esicRate,
                    professionalTax: preview.professionalTax,
                    lopAmount: preview.lopAmount,
                    advanceRecovery: preview.advanceRecovery,
                    loanRecovery: preview.loanRecovery,
                    otherDeductions: preview.otherDeductions,
                    totalDeductions: preview.totalDeductions,
                },
                netSalary: preview.netSalary,
            };
        }
        return payslip;
    }
}
export const payrollService = new PayrollService();
//# sourceMappingURL=payrollService.js.map