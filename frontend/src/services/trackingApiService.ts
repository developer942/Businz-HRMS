// ==============================================================================
// VRM Enterprise HRMS — Tracking API Client Service
// ==============================================================================

import { API_BASE_URL } from '../config/api';
import {
  FieldAssignment,
  FieldTripSession,
  LocationPoint,
  TrackingAlert,
  TrackingOverviewMetrics,
} from '../types/tracking';

const getApiBase = () => `${API_BASE_URL}`;

const getAuthToken = (): string | null => {
  let token =
    localStorage.getItem('vrm_auth_token') ||
    sessionStorage.getItem('vrm_auth_token') ||
    localStorage.getItem('token') ||
    null;

  if (!token) {
    const rawUser = localStorage.getItem('vrm_hrms_current_user');
    if (rawUser) {
      try {
        const u = JSON.parse(rawUser);
        const payload = btoa(unescape(encodeURIComponent(JSON.stringify(u))));
        token = 'vrm_session_' + payload;
      } catch {}
    }
  }
  return token;
};

const getHeaders = (extra: Record<string, string> = {}) => {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export const trackingApiService = {
  // Assignments
  async getAssignments(filters?: { date?: string; status?: string; employeeId?: string }): Promise<FieldAssignment[]> {
    try {
      const params = new URLSearchParams();
      if (filters?.date) params.append('date', filters.date);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.employeeId) params.append('employeeId', filters.employeeId);

      const res = await fetch(`${getApiBase()}/tracking/assignments?${params.toString()}`, {
        headers: getHeaders(),
      });
      const data = await res.json();
      return data?.success && Array.isArray(data.data) ? data.data : [];
    } catch (err) {
      console.warn('[trackingApiService] getAssignments failed:', err);
      return [];
    }
  },

  async createAssignment(assignment: Partial<FieldAssignment>): Promise<FieldAssignment | null> {
    try {
      const res = await fetch(`${getApiBase()}/tracking/assignments`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(assignment),
      });
      const data = await res.json();
      return data?.success ? data.data : null;
    } catch (err) {
      console.error('[trackingApiService] createAssignment error:', err);
      return null;
    }
  },

  async updateAssignment(id: string, updates: Partial<FieldAssignment>): Promise<FieldAssignment | null> {
    try {
      const res = await fetch(`${getApiBase()}/tracking/assignments/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      return data?.success ? data.data : null;
    } catch (err) {
      console.error('[trackingApiService] updateAssignment error:', err);
      return null;
    }
  },

  // Trips & Sessions
  async startTrip(params: {
    assignmentId: string;
    employeeId: string;
    startLat: number;
    startLng: number;
    startAddress?: string;
  }): Promise<FieldTripSession | null> {
    try {
      const res = await fetch(`${getApiBase()}/tracking/trips/start`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(params),
      });
      const data = await res.json();
      return data?.success ? data.data : null;
    } catch (err) {
      console.error('[trackingApiService] startTrip error:', err);
      return null;
    }
  },

  async recordLocationPoints(points: LocationPoint | LocationPoint[]): Promise<{
    added: number;
    accepted: number;
    totalKm: number;
    recordedKm: number;
    roadMatchedKm: number;
  } | null> {
    try {
      const res = await fetch(`${getApiBase()}/tracking/points`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(points),
      });
      const data = await res.json();
      return data?.success ? data.data : null;
    } catch (err) {
      console.warn('[trackingApiService] recordLocationPoints error:', err);
      return null;
    }
  },

  async endTrip(
    tripId: string,
    endLat: number,
    endLng: number,
    endAddress?: string,
    totalKm?: number
  ): Promise<FieldTripSession | null> {
    try {
      const res = await fetch(`${getApiBase()}/tracking/trips/${tripId}/end`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ endLat, endLng, endAddress, totalKm }),
      });
      const data = await res.json();
      return data?.success ? data.data : null;
    } catch (err) {
      console.error('[trackingApiService] endTrip error:', err);
      return null;
    }
  },

  async getTrips(filters?: { employeeId?: string; status?: string }): Promise<FieldTripSession[]> {
    try {
      const params = new URLSearchParams();
      if (filters?.employeeId) params.append('employeeId', filters.employeeId);
      if (filters?.status) params.append('status', filters.status);

      const res = await fetch(`${getApiBase()}/tracking/trips?${params.toString()}`, {
        headers: getHeaders(),
      });
      const data = await res.json();
      return data?.success && Array.isArray(data.data) ? data.data : [];
    } catch (err) {
      console.warn('[trackingApiService] getTrips error:', err);
      return [];
    }
  },

  async getTripLocationPoints(tripId: string): Promise<LocationPoint[]> {
    try {
      const res = await fetch(`${getApiBase()}/tracking/points/${tripId}`, {
        headers: getHeaders(),
      });
      const data = await res.json();
      return data?.success && Array.isArray(data.data) ? data.data : [];
    } catch (err) {
      console.warn('[trackingApiService] getTripLocationPoints error:', err);
      return [];
    }
  },

  async getOverview(): Promise<TrackingOverviewMetrics | null> {
    try {
      const res = await fetch(`${getApiBase()}/tracking/overview`, {
        headers: getHeaders(),
      });
      const data = await res.json();
      return data?.success ? data.data : null;
    } catch (err) {
      console.warn('[trackingApiService] getOverview error:', err);
      return null;
    }
  },

  async getAlerts(status?: string): Promise<TrackingAlert[]> {
    try {
      const params = new URLSearchParams();
      if (status) params.append('status', status);

      const res = await fetch(`${getApiBase()}/tracking/alerts?${params.toString()}`, {
        headers: getHeaders(),
      });
      const data = await res.json();
      return data?.success && Array.isArray(data.data) ? data.data : [];
    } catch (err) {
      console.warn('[trackingApiService] getAlerts error:', err);
      return [];
    }
  },

  async resolveAlert(alertId: string): Promise<TrackingAlert | null> {
    try {
      const res = await fetch(`${getApiBase()}/tracking/alerts/${alertId}/resolve`, {
        method: 'PUT',
        headers: getHeaders(),
      });
      const data = await res.json();
      return data?.success ? data.data : null;
    } catch (err) {
      console.error('[trackingApiService] resolveAlert error:', err);
      return null;
    }
  },

  /**
   * Subscribes to real-time Server-Sent Events (SSE) live telemetry stream.
   * Returns a cleanup function to close the EventSource.
   */
  subscribeToLiveStream(
    onEvent: (event: any) => void,
    onError?: (err: any) => void
  ): () => void {
    const token = getAuthToken();
    const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';
    const sseUrl = `${getApiBase()}/tracking/live-stream${tokenQuery}`;

    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        onEvent(parsed);
      } catch (parseErr) {
        console.warn('[trackingApiService] SSE parse error:', parseErr);
      }
    };

    eventSource.onerror = (err) => {
      if (onError) onError(err);
    };

    return () => {
      eventSource.close();
    };
  },
};
