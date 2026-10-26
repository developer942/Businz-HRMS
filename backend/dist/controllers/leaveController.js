import { leaveRepository } from '../repositories/leaveRepository.js';
import { auditRepository } from '../repositories/auditRepository.js';
import { createLeaveSchema, reviewLeaveSchema } from '../validators/leaveValidators.js';
import { rangesOverlap, isActiveRequestStatus, DUPLICATE_REQUEST_ERROR_MESSAGE } from '../utils/requestValidation.js';
export const getLeaves = async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }
        const isHrOrAdmin = ['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin', 'HR', 'Department Manager', 'Department Head'].includes(user.role);
        const { status } = req.query;
        let employeeId = req.query.employeeId;
        // IDOR / BOLA Prevention: Non-admin employees can only view their own leave requests
        if (!isHrOrAdmin) {
            if (employeeId && user.employeeId && employeeId.toLowerCase() !== user.employeeId.toLowerCase()) {
                res.status(403).json({
                    success: false,
                    error: {
                        code: 'FORBIDDEN',
                        message: 'Access denied: You are not authorized to view leave applications for other employees.',
                        details: [`Requested employee ID: ${employeeId}`],
                    },
                });
                return;
            }
            employeeId = user.employeeId;
        }
        const leaves = await leaveRepository.getLeaves({
            employeeId,
            status: status,
        });
        res.status(200).json({
            success: true,
            data: leaves,
        });
    }
    catch (err) {
        next(err);
    }
};
export const createLeave = async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }
        const validated = createLeaveSchema.parse(req.body);
        const isHrOrAdmin = ['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin', 'HR'].includes(user.role);
        const requestedEmpId = validated.employeeId?.trim();
        let targetEmpId = user.employeeId;
        // Leave Impersonation Prevention: Employees cannot apply for leave on behalf of other staff
        if (requestedEmpId && user.employeeId && requestedEmpId.toLowerCase() !== user.employeeId.toLowerCase()) {
            if (!isHrOrAdmin) {
                res.status(403).json({
                    success: false,
                    error: {
                        code: 'FORBIDDEN',
                        message: 'Access denied: You are not authorized to submit leave applications on behalf of another employee.',
                        details: [`Target employee: ${requestedEmpId}`],
                    },
                });
                return;
            }
            // Authorized HR/Admin manual override
            targetEmpId = requestedEmpId;
            await auditRepository.recordLog('LEAVE_MANUAL_OVERRIDE', targetEmpId, user.email, {
                overrideBy: user.email,
                overrideRole: user.role,
                targetEmployeeId: targetEmpId,
                leaveType: validated.leaveType,
                startDate: validated.startDate,
                endDate: validated.endDate,
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
        // Rule 2: Prevent duplicate active requests (Pending/Approved) with overlapping dates
        const existingLeaves = await leaveRepository.getLeaves({ employeeId: targetEmpId });
        const hasDuplicate = existingLeaves.some(l => {
            if (!isActiveRequestStatus(l.status))
                return false;
            return rangesOverlap(validated.startDate, validated.endDate, l.startDate, l.endDate);
        });
        if (hasDuplicate) {
            res.status(409).json({
                success: false,
                error: {
                    code: 'DUPLICATE_REQUEST',
                    message: DUPLICATE_REQUEST_ERROR_MESSAGE,
                    details: [],
                },
            });
            return;
        }
        const leave = await leaveRepository.createLeave({
            ...validated,
            employeeId: targetEmpId,
        });
        res.status(201).json({
            success: true,
            data: leave,
        });
    }
    catch (err) {
        next(err);
    }
};
export const reviewLeave = async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const validated = reviewLeaveSchema.parse(req.body);
        const normalizedDecision = validated.decision.toLowerCase() === 'approved' ? 'Approved' : 'Rejected';
        const approverName = req.user?.name ? `${req.user.name} (${req.user.role})` : 'Pavithra (HR Manager)';
        const updated = await leaveRepository.updateLeaveStatus(id, normalizedDecision, approverName, validated.comment);
        if (!updated) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: `Leave request ${id} not found`,
                    details: [],
                },
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: updated,
        });
    }
    catch (err) {
        next(err);
    }
};
export const getLeaveBalances = async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }
        const isHrOrAdmin = ['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin', 'HR', 'Department Manager', 'Department Head'].includes(user.role);
        const requestedEmpId = String(req.params.employeeId || user.employeeId);
        // IDOR / BOLA Prevention: Non-admin employees can only view their own leave balances
        if (!isHrOrAdmin && user.employeeId && requestedEmpId.toLowerCase() !== user.employeeId.toLowerCase() && user.id.toLowerCase() !== requestedEmpId.toLowerCase()) {
            res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Access denied: You are not authorized to view leave balances for other employees.',
                    details: [`Requested employee ID: ${requestedEmpId}`],
                },
            });
            return;
        }
        const employeeId = isHrOrAdmin ? requestedEmpId : (user.employeeId || requestedEmpId);
        const balances = await leaveRepository.getLeaveBalances(employeeId);
        res.status(200).json({
            success: true,
            data: balances,
        });
    }
    catch (err) {
        next(err);
    }
};
//# sourceMappingURL=leaveController.js.map