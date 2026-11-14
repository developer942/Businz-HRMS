import { overtimeRepository, OvertimeModel } from '../repositories/overtimeRepository.js';
import { employeeRepository } from '../repositories/employeeRepository.js';
import { isCeoOrOwnerEmployee } from './calculationEngine.js';

export class OvertimeService {
  async getAllOvertime(): Promise<OvertimeModel[]> {
    const all = await overtimeRepository.getAllOvertime();
    return all.filter(ot => !isCeoOrOwnerEmployee({ employeeId: ot.employeeId }));
  }

  async createOvertime(data: {
    employee_id: string;
    date: string;
    hours: number;
    hourly_rate?: number;
    reason?: string;
  }): Promise<OvertimeModel> {
    if (isCeoOrOwnerEmployee({ employeeId: data.employee_id })) {
      throw new Error('CEO is the company owner and is exempt from overtime calculation and records.');
    }
    const emp = await employeeRepository.getEmployeeById(data.employee_id).catch(() => null);
    if (emp && isCeoOrOwnerEmployee(emp as any)) {
      throw new Error('CEO is the company owner and is exempt from overtime calculation and records.');
    }
    return overtimeRepository.createOvertime({
      employeeId: data.employee_id,
      date: data.date,
      hours: data.hours,
      hourlyRate: data.hourly_rate ?? 100,
      reason: data.reason,
    });
  }

  async approveOvertime(id: string, approverName = 'Authorized Manager'): Promise<OvertimeModel> {
    const approved = await overtimeRepository.approveOvertime(id, approverName);
    if (!approved) {
      throw new Error(`Overtime record ${id} not found`);
    }
    return approved;
  }
}

export const overtimeService = new OvertimeService();
