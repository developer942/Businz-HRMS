import { trackingRepository } from '../repositories/trackingRepository.js';
import { createAssignmentSchema, updateAssignmentSchema, startTripSchema, endTripSchema, locationPointsSchema, } from '../validators/trackingValidators.js';
import { checkDuplicateFieldAssignment, DUPLICATE_REQUEST_ERROR_MESSAGE } from '../utils/requestValidation.js';
export const getAssignments = async (req, res, next) => {
    try {
        const { date, status, employeeId } = req.query;
        const assignments = await trackingRepository.getAssignments({
            date: date,
            status: status,
            employeeId: employeeId,
        });
        res.status(200).json({
            success: true,
            data: assignments,
        });
    }
    catch (err) {
        next(err);
    }
};
export const createAssignment = async (req, res, next) => {
    try {
        const validated = createAssignmentSchema.parse(req.body);
        // Business-specific duplicate validation for Field Duty Assignment
        const sDate = validated.startDate || validated.scheduledDate || new Date().toISOString().split('T')[0];
        const eDate = validated.endDate || sDate;
        const existing = await trackingRepository.getAssignments({ employeeId: validated.employeeId });
        const dupCheck = checkDuplicateFieldAssignment(existing, validated.employeeId, sDate, eDate);
        if (dupCheck.hasDuplicate) {
            res.status(409).json({
                success: false,
                error: {
                    code: 'DUPLICATE_REQUEST',
                    message: dupCheck.error || DUPLICATE_REQUEST_ERROR_MESSAGE,
                    details: [],
                },
            });
            return;
        }
        const assignment = await trackingRepository.createAssignment(validated);
        res.status(201).json({
            success: true,
            data: assignment,
        });
    }
    catch (err) {
        next(err);
    }
};
export const updateAssignment = async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const validated = updateAssignmentSchema.parse(req.body);
        const updated = await trackingRepository.updateAssignment(id, validated);
        if (!updated) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: `Field assignment ${id} not found`,
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
export const startTrip = async (req, res, next) => {
    try {
        const validated = startTripSchema.parse(req.body);
        const targetEmpId = validated.employeeId || req.user?.employeeId;
        if (!targetEmpId) {
            res.status(422).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'employeeId is required to start trip',
                    details: [],
                },
            });
            return;
        }
        const trip = await trackingRepository.startTrip({
            assignmentId: validated.assignmentId,
            employeeId: targetEmpId,
            startLat: validated.startLat,
            startLng: validated.startLng,
            startAddress: validated.startAddress,
        });
        res.status(201).json({
            success: true,
            data: trip,
        });
    }
    catch (err) {
        next(err);
    }
};
export const recordLocationPoints = async (req, res, next) => {
    try {
        const validated = locationPointsSchema.parse(req.body);
        const rawPoints = Array.isArray(validated) ? validated : [validated];
        const points = rawPoints.map((p, idx) => ({
            id: `lp-${Date.now()}-${idx}`,
            tripId: p.tripId,
            assignmentId: p.assignmentId || '',
            employeeId: p.employeeId || req.user?.employeeId || '',
            recordedAt: p.recordedAt || p.timestamp || new Date().toISOString(),
            latitude: p.latitude,
            longitude: p.longitude,
            accuracy: p.accuracy ?? 10,
            speed: p.speed ?? 0,
            batteryLevel: p.batteryLevel ?? 100,
            syncedOffline: p.syncedOffline ?? false,
        }));
        const result = await trackingRepository.recordLocationPoints(points);
        res.status(200).json({
            success: true,
            data: result,
        });
    }
    catch (err) {
        next(err);
    }
};
export const endTrip = async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const validated = endTripSchema.parse(req.body);
        const completed = await trackingRepository.endTrip(id, validated.endLat, validated.endLng, validated.endAddress, validated.totalKm);
        if (!completed) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: `Trip ${id} not found`,
                    details: [],
                },
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: completed,
        });
    }
    catch (err) {
        next(err);
    }
};
export const getTrips = async (req, res, next) => {
    try {
        const { employeeId, status } = req.query;
        const trips = await trackingRepository.getTrips({
            employeeId: employeeId,
            status: status,
        });
        res.status(200).json({
            success: true,
            data: trips,
        });
    }
    catch (err) {
        next(err);
    }
};
export const getTripLocationPoints = async (req, res, next) => {
    try {
        const tripId = String(req.params.tripId);
        const points = await trackingRepository.getTripLocationPoints(tripId);
        res.status(200).json({
            success: true,
            data: points,
        });
    }
    catch (err) {
        next(err);
    }
};
export const getAlerts = async (req, res, next) => {
    try {
        const { status } = req.query;
        const alerts = await trackingRepository.getAlerts(status);
        res.status(200).json({
            success: true,
            data: alerts,
        });
    }
    catch (err) {
        next(err);
    }
};
export const resolveAlert = async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const resolved = await trackingRepository.resolveAlert(id);
        if (!resolved) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: `Alert ${id} not found`,
                    details: [],
                },
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: resolved,
        });
    }
    catch (err) {
        next(err);
    }
};
export const getTrackingOverview = async (_req, res, next) => {
    try {
        const overview = await trackingRepository.getTrackingOverview();
        res.status(200).json({
            success: true,
            data: overview,
        });
    }
    catch (err) {
        next(err);
    }
};
//# sourceMappingURL=trackingController.js.map