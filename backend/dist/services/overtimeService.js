import { overtimeRepository } from '../repositories/overtimeRepository.js';
import { employeeRepository } from '../repositories/employeeRepository.js';
import { isCeoOrOwnerEmployee } from './calculationEngine.js';
export class OvertimeService {
    async getAllOvertime() {
        const all = await overtimeRepository.getAllOvertime();
        return all.filter(ot => !isCeoOrOwnerEmployee({ employeeId: ot.employeeId }));
    }
    async createOvertime(data) {
        if (isCeoOrOwnerEmployee({ employeeId: data.employee_id })) {
            throw new Error('CEO is the company owner and is exempt from overtime calculation and records.');
        }
        const emp = await employeeRepository.getEmployeeById(data.employee_id).catch(() => null);
        if (emp && isCeoOrOwnerEmployee(emp)) {
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
    async approveOvertime(id, approverName = 'Authorized Manager') {
        const approved = await overtimeRepository.approveOvertime(id, approverName);
        if (!approved) {
            throw new Error(`Overtime record ${id} not found`);
        }
        return approved;
    }
}
export const overtimeService = new OvertimeService();
//# sourceMappingURL=overtimeService.js.map