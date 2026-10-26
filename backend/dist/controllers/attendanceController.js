import { attendanceRepository } from '../repositories/attendanceRepository.js';
import { auditRepository } from '../repositories/auditRepository.js';
import { punchSchema, verifyFaceSchema } from '../validators/attendanceValidators.js';
export const getAttendanceLogs = async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }
        const isHrOrAdmin = ['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin', 'HR'].includes(user.role);
        const { date, status } = req.query;
        let employeeId = req.query.employeeId;
        // IDOR / BOLA Prevention: Non-admin employees can only view their own attendance logs
        if (!isHrOrAdmin) {
            if (employeeId && user.employeeId && employeeId.toLowerCase() !== user.employeeId.toLowerCase()) {
                res.status(403).json({
                    success: false,
                    error: {
                        code: 'FORBIDDEN',
                        message: 'Access denied: You are not authorized to view attendance logs for other employees.',
                        details: [`Requested employee ID: ${employeeId}`],
                    },
                });
                return;
            }
            employeeId = user.employeeId;
        }
        const logs = await attendanceRepository.getAttendanceLogs({
            date: date,
            employeeId,
            status: status,
        });
        res.status(200).json({
            success: true,
            data: logs,
        });
    }
    catch (err) {
        next(err);
    }
};
export const recordPunch = async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }
        const validated = punchSchema.parse(req.body);
        const isHrOrAdmin = ['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin', 'HR'].includes(user.role);
        const requestedEmpId = validated.employeeId?.trim();
        let targetEmpId = user.employeeId;
        // Attendance Impersonation Prevention: Employees cannot punch for other employees
        if (requestedEmpId && user.employeeId && requestedEmpId.toLowerCase() !== user.employeeId.toLowerCase()) {
            if (!isHrOrAdmin) {
                res.status(403).json({
                    success: false,
                    error: {
                        code: 'FORBIDDEN',
                        message: 'Access denied: You are not authorized to record attendance on behalf of another employee.',
                        details: [`Target employee: ${requestedEmpId}`],
                    },
                });
                return;
            }
            // Authorized HR/Admin manual override
            targetEmpId = requestedEmpId;
            await auditRepository.recordLog('ATTENDANCE_MANUAL_OVERRIDE', targetEmpId, user.email, {
                overrideBy: user.email,
                overrideRole: user.role,
                targetEmployeeId: targetEmpId,
                type: validated.type,
            });
        }
        else if (!targetEmpId && requestedEmpId && isHrOrAdmin) {
            targetEmpId = requestedEmpId;
        }
        if (!targetEmpId) {
            res.status(422).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Employee identity could not be resolved from authenticated session.',
                    details: [],
                },
            });
            return;
        }
        const punch = await attendanceRepository.recordPunch({
            ...validated,
            employeeId: targetEmpId,
        });
        res.status(201).json({
            success: true,
            data: punch,
        });
    }
    catch (err) {
        next(err);
    }
};
export const verifyFace = async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }
        const validated = verifyFaceSchema.parse(req.body);
        const isHrOrAdmin = ['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin', 'HR'].includes(user.role);
        const requestedEmpId = validated.employeeId?.trim();
        let targetEmpId = user.employeeId;
        // Prevent face verification impersonation
        if (requestedEmpId && user.employeeId && requestedEmpId.toLowerCase() !== user.employeeId.toLowerCase()) {
            if (!isHrOrAdmin) {
                res.status(403).json({
                    success: false,
                    error: {
                        code: 'FORBIDDEN',
                        message: 'Access denied: You are not authorized to verify biometric attendance for another employee.',
                        details: [`Target employee: ${requestedEmpId}`],
                    },
                });
                return;
            }
            targetEmpId = requestedEmpId;
        }
        else if (!targetEmpId && requestedEmpId && isHrOrAdmin) {
            targetEmpId = requestedEmpId;
        }
        if (!targetEmpId) {
            res.status(422).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Employee identity could not be resolved from authenticated session.',
                    details: [],
                },
            });
            return;
        }
        const result = await attendanceRepository.verifyFace(targetEmpId, validated.facePhotoBase64);
        res.status(200).json({
            success: true,
            data: result,
        });
    }
    catch (err) {
        next(err);
    }
};
export const getTodaySummary = async (_req, res, next) => {
    try {
        const summary = await attendanceRepository.getTodaySummary();
        res.status(200).json({
            success: true,
            data: summary,
        });
    }
    catch (err) {
        next(err);
    }
};
export const getShiftStatus = async (req, res, next) => {
    try {
        const employeeId = req.query.employeeId || req.user?.employeeId;
        if (!employeeId) {
            res.status(422).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'employeeId is required to check shift status',
                    details: [],
                },
            });
            return;
        }
        const status = await attendanceRepository.getShiftAttendanceStatus(employeeId);
        res.status(200).json({
            success: true,
            data: status,
        });
    }
    catch (err) {
        next(err);
    }
};
//# sourceMappingURL=attendanceController.js.map