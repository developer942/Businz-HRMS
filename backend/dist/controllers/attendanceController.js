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
import { settingsRepository } from '../repositories/settingsRepository.js';
import { verifyPunchGeofence } from '../services/geofenceService.js';
export const recordPunch = async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }
        const validated = punchSchema.parse(req.body);
        const isHrOrAdmin = ['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin', 'HR'].includes(user.role);
        const isCeo = user.role === 'CEO' || user.designation?.toLowerCase?.().includes('ceo');
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
        // Server-side Geofence & GPS Accuracy Verification (Phase 3, 5, 7, 9)
        let isInsideGeofence = validated.inGeofence ?? true;
        const isGpsOrFacePunch = !validated.method ||
            validated.method.toLowerCase().includes('gps') ||
            validated.method.toLowerCase().includes('face') ||
            validated.method.toLowerCase().includes('mobile') ||
            validated.method.toLowerCase().includes('geofence');
        if (isGpsOrFacePunch && !isCeo) {
            const geofence = await settingsRepository.getGeofenceSettings();
            if (geofence && (geofence.isEnabled || geofence.enabled)) {
                if (typeof validated.locationLat !== 'number' || typeof validated.locationLng !== 'number') {
                    res.status(422).json({
                        success: false,
                        error: {
                            code: 'GEOFENCE_LOCATION_REQUIRED',
                            message: 'GPS location is required to punch attendance. Please enable location access in browser settings.',
                            details: [],
                        },
                    });
                    return;
                }
                const geoResult = verifyPunchGeofence({
                    userLat: validated.locationLat,
                    userLng: validated.locationLng,
                    officeLat: Number(geofence.latitude ?? geofence.centerLat),
                    officeLng: Number(geofence.longitude ?? geofence.centerLng),
                    radiusMeters: Number(geofence.radiusMeters || 200),
                    accuracyMeters: validated.accuracyMeters,
                    locationTimestamp: validated.locationTimestamp,
                    officeName: geofence.officeName || 'VRM Structures India Pvt Ltd',
                });
                if (!geoResult.valid) {
                    res.status(geoResult.statusCode || 422).json({
                        success: false,
                        error: {
                            code: geoResult.evaluation?.classification === 'UNCERTAIN' ? 'GPS_ACCURACY_INSUFFICIENT' : 'GEOFENCE_BREACH',
                            message: geoResult.error || 'Geofence boundary verification failed',
                            details: geoResult.evaluation ? [
                                `Distance: ${geoResult.evaluation.distanceMeters}m`,
                                `Radius: ${geoResult.evaluation.radiusMeters}m`,
                                `Accuracy: ±${geoResult.evaluation.accuracyMeters}m`,
                                `Classification: ${geoResult.evaluation.classification}`,
                            ] : [],
                        },
                    });
                    return;
                }
                isInsideGeofence = true;
            }
        }
        const normalizedType = (validated.type === 'OUT' || validated.type === 'Check-Out') ? 'OUT' : 'IN';
        const normalizedMethod = String(validated.method || 'Face Scan').toLowerCase();
        const isFacePunch = normalizedMethod.includes('face');
        const facePhoto = validated.photoBase64 || validated.photoUrl;
        if (isFacePunch) {
            if (!facePhoto || facePhoto.trim().length < 50) {
                res.status(422).json({
                    success: false,
                    error: { code: 'FACE_CAPTURE_REQUIRED', message: 'A fresh face photograph is required for this punch.', details: [] },
                });
                return;
            }
            const faceResult = await attendanceRepository.verifyFace(targetEmpId, facePhoto);
            if (!faceResult.verified) {
                res.status(422).json({
                    success: false,
                    error: { code: 'FACE_VERIFICATION_FAILED', message: faceResult.message || 'Face verification failed.', details: [] },
                });
                return;
            }
        }
        const punch = await attendanceRepository.recordPunch({
            ...validated,
            // Never allow a client-supplied clock to become the authoritative punch time.
            timestamp: undefined,
            type: normalizedType,
            employeeId: targetEmpId,
            inGeofence: isInsideGeofence,
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