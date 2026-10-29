import { Request, Response, NextFunction } from 'express';
import { attendanceRepository } from '../repositories/attendanceRepository.js';
import { auditRepository } from '../repositories/auditRepository.js';
import { punchSchema, verifyFaceSchema, gpsDiagnosticSchema } from '../validators/attendanceValidators.js';

export const getAttendanceLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const isHrOrAdmin = ['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin', 'HR'].includes(user.role);
    const { date, status } = req.query;
    let employeeId = req.query.employeeId as string | undefined;

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
      date: date as string,
      employeeId,
      status: status as string,
    });

    res.status(200).json({
      success: true,
      data: logs,
    });
  } catch (err) {
    next(err);
  }
};

import { settingsRepository } from '../repositories/settingsRepository.js';
import { employeeRepository } from '../repositories/employeeRepository.js';
import {
  verifyPunchGeofence,
  recordGpsDiagnostic,
  getRecentGpsDiagnostics,
} from '../services/geofenceService.js';

export const recordPunch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const validated = punchSchema.parse(req.body);
    const isHrOrAdmin = ['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin', 'HR'].includes(user.role);
    const isCeo = user.role === 'CEO' || (user as any).designation?.toLowerCase?.().includes('ceo');
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
    } else if (!targetEmpId && requestedEmpId && isHrOrAdmin) {
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

    // Server-side Geofence & GPS Accuracy Verification (Phase 3, 5, 6, 7, 8, 9)
    let isInsideGeofence = validated.inGeofence ?? true;
    const isGpsOrFacePunch = !validated.method ||
      validated.method.toLowerCase().includes('gps') ||
      validated.method.toLowerCase().includes('face') ||
      validated.method.toLowerCase().includes('mobile') ||
      validated.method.toLowerCase().includes('geofence');

    const normalizedType: 'IN' | 'OUT' = (validated.type === 'OUT' || validated.type === 'Check-Out') ? 'OUT' : 'IN';
    const isAuthorizedFieldDuty = Boolean(validated.fieldDutyAuthorized);

    const [geofence, preloadedEmployee] = await Promise.all([
      isGpsOrFacePunch && !isCeo && !isAuthorizedFieldDuty
        ? settingsRepository.getGeofenceSettings()
        : Promise.resolve(null),
      employeeRepository.getEmployeeById(targetEmpId),
    ]);

    if (isGpsOrFacePunch && !isCeo && !isAuthorizedFieldDuty) {
      if (geofence && (geofence.isEnabled || geofence.enabled)) {
        const configuredRadius = Number(geofence.radiusMeters || 250);
        if (typeof validated.locationLat !== 'number' || typeof validated.locationLng !== 'number') {
          recordGpsDiagnostic({
            employeeCode: targetEmpId,
            punchType: normalizedType,
            gpsRequestDurationMs: validated.gpsDurationMs ?? 0,
            gpsAcquisitionStatus: 'POSITION_UNAVAILABLE',
            reportedAccuracyMeters: null,
            locationReadingAgeMs: null,
            calculatedDistanceMeters: null,
            configuredRadiusMeters: configuredRadius,
            errorCode: 'INVALID_COORDINATES',
            browserDeviceCategory: validated.browserDeviceCategory || String(req.headers['user-agent'] || 'Unknown').slice(0, 80),
            classification: 'N/A',
            sampleCount: validated.gpsSampleCount,
            retryCount: validated.gpsRetryCount,
          });
          res.status(422).json({
            success: false,
            error: {
              code: 'GEOFENCE_LOCATION_REQUIRED',
              message: 'Unable to obtain your location. Please retry with location services enabled.',
              details: [],
            },
          });
          return;
        }

        const readingAgeMs = validated.locationTimestamp
          ? Math.max(0, Date.now() - new Date(validated.locationTimestamp).getTime())
          : (validated.gpsReadingAgeMs ?? 0);

        const geoResult = verifyPunchGeofence({
          userLat: validated.locationLat,
          userLng: validated.locationLng,
          officeLat: Number(geofence.latitude ?? geofence.centerLat),
          officeLng: Number(geofence.longitude ?? geofence.centerLng),
          radiusMeters: configuredRadius,
          accuracyMeters: validated.accuracyMeters,
          locationTimestamp: validated.locationTimestamp,
          officeName: geofence.officeName || 'VRM Structures India Pvt Ltd',
        });

        recordGpsDiagnostic({
          employeeCode: targetEmpId,
          punchType: normalizedType,
          gpsRequestDurationMs: validated.gpsDurationMs ?? 0,
          gpsAcquisitionStatus: geoResult.valid
            ? 'SUCCESS'
            : geoResult.evaluation?.errorCode === 'LOW_GPS_ACCURACY'
              ? 'LOW_ACCURACY'
              : 'SUCCESS',
          reportedAccuracyMeters: validated.accuracyMeters ?? geoResult.evaluation?.accuracyMeters ?? null,
          locationReadingAgeMs: Number.isFinite(readingAgeMs) ? Math.round(readingAgeMs) : null,
          calculatedDistanceMeters: geoResult.evaluation?.distanceMeters ?? null,
          configuredRadiusMeters: configuredRadius,
          errorCode: geoResult.evaluation?.errorCode || (geoResult.valid ? 'NONE' : 'INVALID_COORDINATES'),
          browserDeviceCategory: validated.browserDeviceCategory || String(req.headers['user-agent'] || 'Unknown').slice(0, 80),
          classification: geoResult.evaluation?.classification || 'N/A',
          sampleCount: validated.gpsSampleCount,
          retryCount: validated.gpsRetryCount,
        });

        if (!geoResult.valid) {
          const isUncertain = geoResult.evaluation?.classification === 'UNCERTAIN';
          res.status(geoResult.statusCode || 422).json({
            success: false,
            error: {
              code: isUncertain ? 'GPS_ACCURACY_INSUFFICIENT' : 'GEOFENCE_BREACH',
              message: geoResult.evaluation?.userMessage || geoResult.error || 'Geofence boundary verification failed',
              reason: geoResult.error,
              evaluation: geoResult.evaluation,
              canRequestCorrection: Boolean(geoResult.evaluation?.canRequestCorrection),
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
      const faceResult = await attendanceRepository.verifyFace(targetEmpId, facePhoto, preloadedEmployee);
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
      preloadedEmployee,
    });

    res.status(201).json({
      success: true,
      data: punch,
    });
  } catch (err) {
    next(err);
  }
};

export const verifyFace = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
    } else if (!targetEmpId && requestedEmpId && isHrOrAdmin) {
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
  } catch (err) {
    next(err);
  }
};

export const getTodaySummary = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const summary = await attendanceRepository.getTodaySummary();

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (err) {
    next(err);
  }
};

export const getShiftStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const employeeId = (req.query.employeeId as string) || req.user?.employeeId;
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
  } catch (err) {
    next(err);
  }
};

export const reportGpsDiagnostic = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = gpsDiagnosticSchema.parse(req.body);
    const entry = recordGpsDiagnostic({
      ...parsed,
      employeeCode: parsed.employeeCode || req.user?.employeeId || 'EMP',
    });
    res.status(201).json({
      success: true,
      data: entry,
    });
  } catch (err) {
    next(err);
  }
};

export const getGpsDiagnostics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user;
    const isAuthorized =
      user &&
      ['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin', 'HR', 'ERP Administrator'].includes(user.role);
    if (!isAuthorized) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only authorized HR administrators and developers can access GPS diagnostics.',
        },
      });
      return;
    }
    const limit = Number(req.query.limit || 50);
    res.status(200).json({
      success: true,
      data: getRecentGpsDiagnostics(limit),
    });
  } catch (err) {
    next(err);
  }
};
