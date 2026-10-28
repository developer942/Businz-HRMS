import { API_BASE_URL } from '../config/api';

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

const authToken = () =>
  sessionStorage.getItem('vrm_auth_token') ||
  localStorage.getItem('vrm_auth_token') ||
  localStorage.getItem('token') ||
  localStorage.getItem('hrms_auth_token');

const apiRequest = async <T>(path: string, body: unknown): Promise<T> => {
  const token = authToken();
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error?.message || 'Attendance request failed. Please retry.');
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
}): Promise<AttendancePunchResult> => {
  const verification = await apiRequest<{ verified: boolean; message?: string }>('/attendance/verify-face', {
    employeeId: params.employeeId,
    facePhotoBase64: params.photoBase64,
  });
  if (!verification.verified) throw new Error(verification.message || 'Face verification failed.');

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
    idempotencyKey: newIdempotencyKey(params.type),
  });
};
