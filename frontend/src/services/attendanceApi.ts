import { API_BASE_URL } from '../config/api';
import type { GpsDiagnosticSummary } from './gpsAcquisitionService';

export type AttendancePunchType = 'IN' | 'OUT';

export interface AttendancePunchResult {
  id: string;
  employeeId: string;
  date: string;
  shiftDate?: string;
  checkIn?: string;
  checkOut?: string;
  checkInPhoto?: string;
  checkOutPhoto?: string;
  workingHours: number;
  createdAt?: string;
  status?: string;
  lateStatus?: string;
  method?: string;
  inGeofence?: boolean;
  locationLat?: number;
  locationLng?: number;
  locationAddress?: string;
}

export const getStoredAuthToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return (
    sessionStorage.getItem('vrm_auth_token') ||
    localStorage.getItem('vrm_auth_token') ||
    localStorage.getItem('vrm_hrms_token') ||
    localStorage.getItem('hrms_auth_token') ||
    localStorage.getItem('token') ||
    localStorage.getItem('authToken')
  );
};

const apiRequest = async <T>(path: string, body: unknown, method: 'POST' | 'PUT' = 'POST'): Promise<T> => {
  const token = getStoredAuthToken();
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const err = new Error(payload?.error?.message || 'Attendance request failed. Please retry.') as Error & {
      code?: string;
      evaluation?: any;
      canRequestCorrection?: boolean;
    };
    err.code = payload?.error?.code;
    err.evaluation = payload?.error?.evaluation;
    err.canRequestCorrection = payload?.error?.canRequestCorrection;
    throw err;
  }
  return payload.data as T;
};

const newIdempotencyKey = (type: AttendancePunchType): string => {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `attendance-${type.toLowerCase()}-${random}`;
};

export const submitVerifiedFacePunch = async (params: {
  employeeId: string;
  type: AttendancePunchType;
  photoBase64: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  locationTimestamp: string;
  locationAddress: string;
  gpsDurationMs?: number;
  gpsReadingAgeMs?: number;
  gpsSampleCount?: number;
  gpsRetryCount?: number;
  browserDeviceCategory?: string;
  fieldDutyAuthorized?: boolean;
  fieldAssignmentId?: string;
  idempotencyKey?: string;
}): Promise<AttendancePunchResult> => {
  // Single authoritative server submission: /attendance/punch performs both
  // biometric face verification and geodesic geofence validation atomically.
  return apiRequest<AttendancePunchResult>('/attendance/punch', {
    employeeId: params.employeeId,
    type: params.type,
    method: 'Face Scan',
    photoBase64: params.photoBase64,
    locationLat: params.latitude,
    locationLng: params.longitude,
    accuracyMeters: params.accuracyMeters,
    locationTimestamp: params.locationTimestamp,
    locationAddress: params.locationAddress,
    gpsDurationMs: params.gpsDurationMs,
    gpsReadingAgeMs: params.gpsReadingAgeMs,
    gpsSampleCount: params.gpsSampleCount,
    gpsRetryCount: params.gpsRetryCount,
    browserDeviceCategory: params.browserDeviceCategory,
    fieldDutyAuthorized: params.fieldDutyAuthorized,
    fieldAssignmentId: params.fieldAssignmentId,
    idempotencyKey: params.idempotencyKey || newIdempotencyKey(params.type),
  });
};

export const fetchCanonicalGeofenceSettings = async (): Promise<any | null> => {
  try {
    const token = getStoredAuthToken();
    const response = await fetch(`${API_BASE_URL}/settings/geofence`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    if (payload?.success && payload.data) {
      return payload.data;
    }
    return null;
  } catch {
    return null;
  }
};

const DIAG_STATUSES = ['SUCCESS', 'PERMISSION_DENIED', 'TIMEOUT', 'POSITION_UNAVAILABLE', 'LOW_ACCURACY', 'STALE'] as const;
const DIAG_ERROR_CODES = [
  'NONE', 'PERMISSION_DENIED', 'POSITION_UNAVAILABLE', 'TIMEOUT', 'STALE_READING',
  'LOW_GPS_ACCURACY', 'OUTSIDE_GEOFENCE', 'GEOFENCE_UNCERTAIN', 'INVALID_COORDINATES',
] as const;
const finiteOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

/**
 * Maps the Face Attendance client diagnostic into the exact shape accepted by the backend
 * `gpsDiagnosticSchema`. Previously the client sent `acquisitionStatus`, `durationMs`,
 * `accuracyMeters`, ... while the server requires `gpsAcquisitionStatus`, `gpsRequestDurationMs`,
 * `reportedAccuracyMeters`, ... so every report was rejected with HTTP 422 and production had
 * no record of failed GPS punch attempts.
 */
export const buildGpsDiagnosticPayload = (d: Partial<GpsDiagnosticSummary> & Record<string, any>) => {
  const rawStatus = String(d.gpsAcquisitionStatus ?? d.acquisitionStatus ?? 'SUCCESS').toUpperCase();
  const status = rawStatus.startsWith('STALE')
    ? 'STALE'
    : (DIAG_STATUSES as readonly string[]).includes(rawStatus) ? rawStatus : 'POSITION_UNAVAILABLE';
  const rawCode = String(d.errorCode ?? 'NONE').toUpperCase();
  const punch = String(d.punchType ?? 'PRECHECK').toUpperCase();
  const radius = finiteOrNull(d.configuredRadiusMeters ?? d.radiusMeters);
  const toInt = (v: unknown, max: number) => {
    const n = finiteOrNull(v);
    return n === null ? undefined : Math.min(max, Math.round(n));
  };
  return {
    employeeCode: d.employeeCode ?? (d.employeeId ? String(d.employeeId).slice(0, 50) : undefined),
    punchType: punch === 'IN' || punch === 'OUT' ? punch : 'PRECHECK',
    gpsRequestDurationMs: Math.min(180_000, finiteOrNull(d.gpsRequestDurationMs ?? d.durationMs) ?? 0),
    gpsAcquisitionStatus: status,
    reportedAccuracyMeters: finiteOrNull(d.reportedAccuracyMeters ?? d.accuracyMeters),
    locationReadingAgeMs: (() => {
      const age = finiteOrNull(d.locationReadingAgeMs ?? d.readingAgeMs);
      return age === null ? null : Math.min(600_000, age);
    })(),
    calculatedDistanceMeters: finiteOrNull(d.calculatedDistanceMeters ?? d.distanceMeters),
    configuredRadiusMeters: radius && radius > 0 ? radius : 250,
    errorCode: (DIAG_ERROR_CODES as readonly string[]).includes(rawCode) ? rawCode : 'NONE',
    browserDeviceCategory: String(d.browserDeviceCategory || 'Browser').slice(0, 100),
    classification: ['INSIDE', 'OUTSIDE', 'UNCERTAIN'].includes(String(d.classification)) ? d.classification : 'N/A',
    sampleCount: toInt(d.sampleCount, 200),
    retryCount: toInt(d.retryCount, 20),
  };
};

export const reportClientGpsDiagnostic = async (
  diagnostic: Partial<GpsDiagnosticSummary> & Record<string, any>
): Promise<void> => {
  try {
    const token = getStoredAuthToken();
    if (!token) return;
    await fetch(`${API_BASE_URL}/attendance/gps-diagnostics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(buildGpsDiagnosticPayload(diagnostic)),
    });
  } catch {
    // Non-blocking diagnostic telemetry
  }
};
