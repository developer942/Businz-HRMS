import { Request, Response, NextFunction } from 'express';
import { attendanceRepository, AttendancePunchError } from '../repositories/attendanceRepository.js';
import { auditRepository } from '../repositories/auditRepository.js';
import { punchSchema, verifyFaceSchema, gpsDiagnosticSchema, attendanceCorrectionSchema } from '../validators/attendanceValidators.js';
import { settingsRepository } from '../repositories/settingsRepository.js';
import { employeeRepository } from '../repositories/employeeRepository.js';
import {
  verifyPunchGeofence,
  recordGpsDiagnostic,
  getRecentGpsDiagnostics,
} from '../services/geofenceService.js';
import { isCeoOrOwnerEmployee } from '../services/calculationEngine.js';
import {
  resolveOvernightAttendanceSession,
  parseTimeOrIsoInTimezone,
} from '../services/shiftAttendanceEngine.js';
import { query } from '../config/database.js';

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

export const recordPunch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const isHrOrAdmin = ['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin', 'HR'].includes(user.role);
    const rawRequestedEmpId = typeof req.body?.employeeId === 'string'
      ? req.body.employeeId.trim()
      : '';
    // Perform ownership enforcement before detailed payload validation so an
    // attacker cannot use validation errors to probe another employee's flow.
    if (
      rawRequestedEmpId &&
      user.employeeId &&
      rawRequestedEmpId.toLowerCase() !== user.employeeId.toLowerCase() &&
      !isHrOrAdmin
    ) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied: You are not authorized to record attendance on behalf of another employee.',
          details: [`Target employee: ${rawRequestedEmpId}`],
        },
      });
      return;
    }

    const validated = punchSchema.parse(req.body);
    const isCeo = user.role === 'CEO' || (user as any).designation?.toLowerCase?.().includes('ceo');
    const requestedEmpId = validated.employeeId?.trim();

    let targetEmpId = user.employeeId;

    // Attendance Impersonation Prevention: Employees cannot punch for other employees
    if (requestedEmpId && user.employeeId && requestedEmpId.toLowerCase() !== user.employeeId.toLowerCase()) {
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

    const isSelfPunch = !requestedEmpId || (user.employeeId && requestedEmpId.toLowerCase() === user.employeeId.toLowerCase());
    if (
      (isSelfPunch && isCeoOrOwnerEmployee(user as any)) ||
      isCeoOrOwnerEmployee({ employeeId: targetEmpId })
    ) {
      res.status(403).json({
        success: false,
        error: {
          code: 'CEO_ATTENDANCE_EXEMPT',
          message: 'CEO is the company owner and is exempt from attendance tracking, punch-in/punch-out, and face attendance.',
          details: [],
        },
      });
      return;
    }

    // Server-side Geofence & GPS Accuracy Verification
    let isInsideGeofence = validated.inGeofence ?? true;
    const isGpsOrFacePunch =
      !validated.method ||
      validated.method.toLowerCase().includes('gps') ||
      validated.method.toLowerCase().includes('face') ||
      validated.method.toLowerCase().includes('mobile') ||
      validated.method.toLowerCase().includes('geofence') ||
      validated.method.toLowerCase().includes('field');

    const normalizedType: 'IN' | 'OUT' =
      validated.type === 'OUT' || validated.type === 'Check-Out' ? 'OUT' : 'IN';

    const [geofence, preloadedEmployee, dbFieldDuty] = await Promise.all([
      isGpsOrFacePunch && !isCeo
        ? settingsRepository.getGeofenceSettings()
        : Promise.resolve(null),
      employeeRepository.getEmployeeById(targetEmpId),
      attendanceRepository.getTodayFieldDutyAssignment(targetEmpId),
    ]);

    if (preloadedEmployee && isCeoOrOwnerEmployee(preloadedEmployee as any)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'CEO_ATTENDANCE_EXEMPT',
          message: 'CEO is the company owner and is exempt from attendance tracking, punch-in/punch-out, and face attendance.',
          details: [],
        },
      });
      return;
    }

    const isTrackingFieldWorker =
      (preloadedEmployee as any)?.attendance_method === 'Tracking Field' ||
      (preloadedEmployee as any)?.attendanceMethod === 'Tracking Field' ||
      String(validated.method || '').toLowerCase().includes('tracking field');

    const isFlexibleWorker =
      (preloadedEmployee as any)?.attendance_method === 'Flexible' ||
      (preloadedEmployee as any)?.attendanceMethod === 'Flexible' ||
      String(validated.method || '').toLowerCase().includes('flexible');

    const isAuthorizedFieldDuty = Boolean(
      validated.fieldDutyAuthorized || dbFieldDuty.authorized || isFlexibleWorker || isTrackingFieldWorker
    );

    if (isGpsOrFacePunch && !isCeo) {
      const geofenceEnabled = Boolean(geofence && (geofence.isEnabled || (geofence as any).enabled));
      if (geofenceEnabled || isAuthorizedFieldDuty) {
        const configuredRadius = Number(
          (isAuthorizedFieldDuty && dbFieldDuty.radiusMeters) || geofence?.radiusMeters || 500
        );
        const maxAccuracyMeters =
          typeof (geofence as any)?.maxAccuracyMeters === 'number'
            ? Number((geofence as any).maxAccuracyMeters)
            : undefined;

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
            browserDeviceCategory:
              validated.browserDeviceCategory || String(req.headers['user-agent'] || 'Unknown').slice(0, 80),
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

        const deviceMeasuredAgeMs =
          typeof validated.gpsReadingAgeMs === 'number' && Number.isFinite(validated.gpsReadingAgeMs)
            ? validated.gpsReadingAgeMs
            : null;
        const freshnessTimestamp =
          deviceMeasuredAgeMs !== null
            ? new Date(Date.now() - deviceMeasuredAgeMs).toISOString()
            : validated.locationTimestamp;

        const readingAgeMs =
          deviceMeasuredAgeMs !== null
            ? deviceMeasuredAgeMs
            : validated.locationTimestamp
              ? Math.max(0, Date.now() - new Date(validated.locationTimestamp).getTime())
              : 0;

        // If Field Duty has specific site coordinates, evaluate against site or allow field duty with accuracy check
        const rawFieldLat =
          isAuthorizedFieldDuty && typeof dbFieldDuty.latitude === 'number' && dbFieldDuty.latitude !== 0
            ? dbFieldDuty.latitude
            : undefined;
        const rawFieldLng =
          isAuthorizedFieldDuty && typeof dbFieldDuty.longitude === 'number' && dbFieldDuty.longitude !== 0
            ? dbFieldDuty.longitude
            : undefined;
        const rawGeoLat = Number(geofence?.latitude ?? (geofence as any)?.centerLat ?? 0);
        const rawGeoLng = Number(geofence?.longitude ?? (geofence as any)?.centerLng ?? 0);

        const targetOfficeLat =
          rawFieldLat ?? (Number.isFinite(rawGeoLat) && rawGeoLat !== 0 ? rawGeoLat : 13.15166);
        const targetOfficeLng =
          rawFieldLng ?? (Number.isFinite(rawGeoLng) && rawGeoLng !== 0 ? rawGeoLng : 80.208618);
        const targetOfficeName =
          (isAuthorizedFieldDuty && dbFieldDuty.locationName) ||
          geofence?.officeName ||
          'VRM Structures India Pvt Ltd';

        const geoResult = verifyPunchGeofence({
          userLat: validated.locationLat,
          userLng: validated.locationLng,
          officeLat: targetOfficeLat,
          officeLng: targetOfficeLng,
          radiusMeters: configuredRadius,
          accuracyMeters: validated.accuracyMeters,
          maxAccuracyMeters,
          locationTimestamp: freshnessTimestamp,
          officeName: targetOfficeName,
          fieldDutyAuthorized: isAuthorizedFieldDuty && !dbFieldDuty.latitude,
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
          browserDeviceCategory:
            validated.browserDeviceCategory || String(req.headers['user-agent'] || 'Unknown').slice(0, 80),
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
              message:
                geoResult.evaluation?.userMessage ||
                geoResult.error ||
                'Geofence boundary verification failed',
              reason: geoResult.error,
              evaluation: geoResult.evaluation,
              canRequestCorrection: Boolean(geoResult.evaluation?.canRequestCorrection),
              details: geoResult.evaluation
                ? [
                    `Distance: ${geoResult.evaluation.distanceMeters}m`,
                    `Radius: ${geoResult.evaluation.radiusMeters}m`,
                    `Accuracy: ±${geoResult.evaluation.accuracyMeters}m`,
                    `Classification: ${geoResult.evaluation.classification}`,
                  ]
                : [],
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
          error: {
            code: 'FACE_CAPTURE_REQUIRED',
            message: 'A fresh face photograph is required for this punch.',
            details: [],
          },
        });
        return;
      }
      const faceResult = await attendanceRepository.verifyFace(targetEmpId, facePhoto, preloadedEmployee);
      if (!faceResult.verified) {
        res.status(422).json({
          success: false,
          error: {
            code: 'FACE_VERIFICATION_FAILED',
            message: faceResult.message || faceResult.reason || 'Face verification failed.',
            details: [],
          },
        });
        return;
      }
    }

    const punch = await attendanceRepository.recordPunch({
      ...validated,
      // Never allow a client-supplied clock to become the authoritative punch time.
      type: normalizedType,
      employeeId: targetEmpId,
      inGeofence: isInsideGeofence,
      photoBase64: facePhoto,
      bypassShiftWindow: isFlexibleWorker || isAuthorizedFieldDuty || isTrackingFieldWorker,
      notes: (validated as any).notes || (isTrackingFieldWorker ? 'Permanent Field Duty (Automatic GPS Tracking)' : (isFlexibleWorker ? 'Daily Field Work (Flexible Attendance)' : undefined)),
    } as any);

    res.status(201).json({
      success: true,
      data: punch,
    });
  } catch (err) {
    if (err instanceof AttendancePunchError) {
      res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: [],
        },
      });
      return;
    }
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

    const isSelfVerify = !requestedEmpId || (user.employeeId && requestedEmpId.toLowerCase() === user.employeeId.toLowerCase());
    if (
      (isSelfVerify && isCeoOrOwnerEmployee(user as any)) ||
      isCeoOrOwnerEmployee({ employeeId: targetEmpId })
    ) {
      res.status(403).json({
        success: false,
        error: {
          code: 'CEO_ATTENDANCE_EXEMPT',
          message: 'CEO is the company owner and is exempt from face attendance verification.',
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isBlankPunchValue = (val?: string | null): boolean => {
  if (!val) return true;
  const clean = String(val).trim();
  return (
    !clean ||
    clean === '-' ||
    clean === '--:--' ||
    clean === '—' ||
    clean.toLowerCase().includes('missed') ||
    clean.toLowerCase().includes('progress') ||
    clean.toLowerCase() === 'none'
  );
};

/**
 * Maps UI / API correction status labels to canonical PostgreSQL `hr_attendance_status` enum values:
 * ['Present', 'Absent', 'Late', 'Half Day', 'Work From Home', 'On Leave', 'Holiday', 'Week Off', 'Missing Punch']
 */
export const mapCorrectionStatusToDbEnum = (status: string): {
  dbStatus: string;
  dbMethod: string;
  lateStatus: string;
} => {
  const s = String(status || '').trim();
  switch (s) {
    case 'MU':
    case 'Missed Punch-Out':
    case 'Missing Punch':
      return { dbStatus: 'Missing Punch', dbMethod: 'Manual Punch', lateStatus: 'N/A' };
    case 'Absent':
      return { dbStatus: 'Absent', dbMethod: 'Manual Punch', lateStatus: 'N/A' };
    case 'Unpaid Leave':
      return { dbStatus: 'Absent', dbMethod: 'Unpaid Leave', lateStatus: 'N/A' };
    case 'Paid Leave':
    case 'On Leave':
      return { dbStatus: 'On Leave', dbMethod: 'Manual Punch', lateStatus: 'N/A' };
    case 'Holiday':
      return { dbStatus: 'Holiday', dbMethod: 'Holiday', lateStatus: 'N/A' };
    case 'Week Off':
      return { dbStatus: 'Week Off', dbMethod: 'Holiday', lateStatus: 'N/A' };
    case 'Half Day':
      return { dbStatus: 'Half Day', dbMethod: 'Manual Punch', lateStatus: 'N/A' };
    case 'Work From Home':
      return { dbStatus: 'Work From Home', dbMethod: 'Manual Punch', lateStatus: 'On Time' };
    case 'Field Visit':
      return { dbStatus: 'Present', dbMethod: 'Field Visit', lateStatus: 'On Time' };
    case 'Late':
      return { dbStatus: 'Late', dbMethod: 'Manual Punch', lateStatus: 'Late (<30m)' };
    case 'Present':
    default:
      return { dbStatus: 'Present', dbMethod: 'Manual Punch', lateStatus: 'On Time' };
  }
};

export const correctAttendance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const isHrOrAdmin = ['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin', 'HR'].includes(user.role);
    if (!isHrOrAdmin) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied: Only HR or CEO administrators can correct attendance records.',
        },
      });
      return;
    }

    const validated = attendanceCorrectionSchema.parse(req.body);

    const emp = await employeeRepository.getEmployeeById(validated.employeeId);
    if (!emp) {
      res.status(404).json({
        success: false,
        error: {
          code: 'EMPLOYEE_NOT_FOUND',
          message: `Employee with ID '${validated.employeeId}' not found.`,
        },
      });
      return;
    }

    const canonicalEmpId = emp.employeeId || emp.id;
    const employeeDbId = emp.id;

    let computedHours = validated.workingHours;
    let rawCheckIn = isBlankPunchValue(validated.checkIn) ? null : String(validated.checkIn).trim();
    let rawCheckOut = isBlankPunchValue(validated.checkOut) ? null : String(validated.checkOut).trim();
    let cleanCheckIn: string | null = null;
    let cleanCheckOut: string | null = null;
    let otHours = validated.otHours || 0;

    let effectiveRequestedStatus: string = validated.status;
    const isRequestedMu =
      effectiveRequestedStatus === 'MU' ||
      effectiveRequestedStatus === 'Missed Punch-Out' ||
      effectiveRequestedStatus === 'Missing Punch';

    // If HR/CEO entered a valid Check-Out time while status was still MU / Missing Punch,
    // automatically regularize to Present instead of discarding the entered Check-Out time!
    if (isRequestedMu && rawCheckIn && rawCheckOut) {
      effectiveRequestedStatus = 'Present';
    }

    const isNonWorking = ['Absent', 'Holiday', 'Week Off', 'Paid Leave', 'On Leave', 'Unpaid Leave'].includes(
      effectiveRequestedStatus
    );
    const isFinalMu =
      effectiveRequestedStatus === 'MU' ||
      effectiveRequestedStatus === 'Missed Punch-Out' ||
      effectiveRequestedStatus === 'Missing Punch';

    if (isNonWorking) {
      cleanCheckIn = null;
      cleanCheckOut = null;
      computedHours = 0;
      otHours = 0;
    } else if (isFinalMu) {
      // Missed punch-out: keep converted TIMESTAMPTZ check-in, clear check-out, zero hours & OT
      if (rawCheckIn) {
        const parsedIn = parseTimeOrIsoInTimezone(rawCheckIn, validated.date);
        if (!parsedIn) {
          res.status(422).json({
            success: false,
            error: {
              code: 'INVALID_TIMESTAMPS',
              message: `Invalid check-in time format: '${rawCheckIn}'.`,
            },
          });
          return;
        }
        cleanCheckIn = parsedIn.instant.toISOString();
      }
      cleanCheckOut = null;
      computedHours = 0;
      otHours = 0;
    } else if (rawCheckIn && rawCheckOut) {
      const session = resolveOvernightAttendanceSession({
        attendanceDate: validated.date,
        checkIn: rawCheckIn,
        checkOut: rawCheckOut,
        unpaidBreakMinutes: validated.breakDurationMinutes || 0,
        deductBreakAlways: (validated.breakDurationMinutes || 0) > 0,
        allowAutoRollSameDateIsoCheckOut: true,
      });

      if (!session.isValid) {
        res.status(422).json({
          success: false,
          error: {
            code: 'INVALID_TIMESTAMPS',
            message: session.errorMessage || 'Check-out time cannot be earlier than check-in time.',
          },
        });
        return;
      }

      cleanCheckIn = session.checkInIso;
      cleanCheckOut = session.checkOutIso;
      if (computedHours === undefined || computedHours <= 0) {
        computedHours = session.workingHours;
      }
      if (otHours <= 0 && session.otHours > 0) {
        otHours = session.otHours;
      }
    } else {
      // Single punch or Half Day without both punches — still convert any provided time to ISO TIMESTAMPTZ
      if (rawCheckIn) {
        const parsedIn = parseTimeOrIsoInTimezone(rawCheckIn, validated.date);
        if (!parsedIn) {
          res.status(422).json({
            success: false,
            error: {
              code: 'INVALID_TIMESTAMPS',
              message: `Invalid check-in time format: '${rawCheckIn}'.`,
            },
          });
          return;
        }
        cleanCheckIn = parsedIn.instant.toISOString();
      }
      if (rawCheckOut) {
        const parsedOut = parseTimeOrIsoInTimezone(rawCheckOut, validated.date);
        if (!parsedOut) {
          res.status(422).json({
            success: false,
            error: {
              code: 'INVALID_TIMESTAMPS',
              message: `Invalid check-out time format: '${rawCheckOut}'.`,
            },
          });
          return;
        }
        cleanCheckOut = parsedOut.instant.toISOString();
      }
      if (effectiveRequestedStatus === 'Half Day' && (!computedHours || computedHours <= 0)) {
        computedHours = 4.0;
      }
    }

    const { dbStatus, dbMethod, lateStatus } = mapCorrectionStatusToDbEnum(effectiveRequestedStatus);

    // Find existing record in PostgreSQL without passing non-UUID codes into UUID columns
    const existingRecResult = UUID_REGEX.test(String(employeeDbId || ''))
      ? await query<any>(
          `SELECT * FROM public.attendance_records
           WHERE employee_id = $1::uuid
             AND (date = $2::date OR shift_date = $2::date)
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
           LIMIT 1`,
          [employeeDbId, validated.date]
        )
      : await query<any>(
          `SELECT * FROM public.attendance_records
           WHERE employee_id::text = $1
             AND (date = $2::date OR shift_date = $2::date)
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
           LIMIT 1`,
          [String(employeeDbId || canonicalEmpId), validated.date]
        );
    const existingRec = existingRecResult.rows[0] || null;

    const oldValues = existingRec
      ? {
          status: existingRec.status,
          checkIn: existingRec.check_in,
          checkOut: existingRec.check_out,
          workingHours: existingRec.working_hours,
        }
      : null;

    const noteEntry = `Correction (${user.email}): ${validated.reason}`;
    let updatedRecord: any = null;

    if (existingRec) {
      const updateResult = await query<any>(
        `UPDATE public.attendance_records
         SET status = $1::hr_attendance_status,
             check_in = $2::timestamptz,
             check_out = $3::timestamptz,
             working_hours = $4,
             calculated_ot_hours = $5,
             late_status = $6,
             method = $7,
             notes = CASE
               WHEN notes IS NULL OR BTRIM(notes) = '' THEN $8
               ELSE notes || ' | ' || $8
             END,
             updated_at = NOW()
         WHERE id = $9::uuid
         RETURNING *`,
        [
          dbStatus,
          cleanCheckIn,
          cleanCheckOut,
          computedHours || 0,
          otHours,
          lateStatus,
          dbMethod,
          noteEntry,
          existingRec.id,
        ]
      );
      updatedRecord = updateResult.rows[0];
    } else {
      const insertResult = await query<any>(
        `INSERT INTO public.attendance_records (
           id, employee_id, date, shift_date, status, check_in, check_out, working_hours, calculated_ot_hours, late_status, method, notes, created_at, updated_at
         ) VALUES (
           gen_random_uuid(), $1::uuid, $2::date, $2::date, $3::hr_attendance_status, $4::timestamptz, $5::timestamptz, $6, $7, $8, $9, $10, NOW(), NOW()
         ) RETURNING *`,
        [
          employeeDbId,
          validated.date,
          dbStatus,
          cleanCheckIn,
          cleanCheckOut,
          computedHours || 0,
          otHours,
          lateStatus,
          dbMethod,
          noteEntry,
        ]
      );
      updatedRecord = insertResult.rows[0];
    }

    if (!updatedRecord) {
      res.status(500).json({
        success: false,
        error: {
          code: 'ATTENDANCE_PERSIST_FAILED',
          message: 'Attendance correction could not be persisted to the database.',
        },
      });
      return;
    }

    const newValues = {
      status: updatedRecord.status || dbStatus,
      checkIn: updatedRecord.check_in ?? cleanCheckIn,
      checkOut: updatedRecord.check_out ?? cleanCheckOut,
      workingHours: Number(updatedRecord.working_hours ?? computedHours ?? 0),
      otHours: Number(updatedRecord.calculated_ot_hours ?? otHours ?? 0),
    };

    // Record audit trail in auth_audit_logs
    try {
      await auditRepository.recordLog(
        'ATTENDANCE_CORRECTION' as any,
        canonicalEmpId,
        user.email,
        {
          targetEmployeeId: canonicalEmpId,
          date: validated.date,
          reason: validated.reason,
          editor: user.email,
          role: user.role,
          oldValues,
          newValues,
        }
      );
    } catch (auditErr: any) {
      console.warn('[correctAttendance] Error recording audit log:', auditErr?.message || auditErr);
    }

    res.status(200).json({
      success: true,
      message: `Attendance for employee ${canonicalEmpId} on ${validated.date} corrected successfully.`,
      data: {
        record: updatedRecord,
        audit: {
          fieldChanged: `Attendance Correction (${oldValues?.status || 'None'} -> ${newValues.status})`,
          oldValue: oldValues ? `Status: ${oldValues.status}, In: ${oldValues.checkIn || '-'}, Out: ${oldValues.checkOut || '-'}` : 'No Previous Record',
          newValue: `Status: ${newValues.status}, In: ${newValues.checkIn || '-'}, Out: ${newValues.checkOut || '-'}, Hours: ${newValues.workingHours}`,
          reason: validated.reason,
          changedBy: user.email,
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch (err) {
    next(err);
  }
};
