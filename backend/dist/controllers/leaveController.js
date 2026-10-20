import { leaveRepository } from '../repositories/leaveRepository.js';
import { createLeaveSchema, reviewLeaveSchema } from '../validators/leaveValidators.js';
import { rangesOverlap, isActiveRequestStatus, DUPLICATE_REQUEST_ERROR_MESSAGE } from '../utils/requestValidation.js';
export const getLeaves = async (req, res, next) => {
    try {
        const { employeeId, status } = req.query;
        const leaves = await leaveRepository.getLeaves({
            employeeId: employeeId,
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
        const validated = createLeaveSchema.parse(req.body);
        const targetEmpId = validated.employeeId || req.user?.employeeId;
        if (!targetEmpId) {
            res.status(422).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'employeeId, startDate, and endDate are required',
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
        const employeeId = String(req.params.employeeId || req.user?.employeeId || 'EMP-001');
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