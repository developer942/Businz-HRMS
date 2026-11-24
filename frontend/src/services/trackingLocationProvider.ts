// ============================================================================
// VRM Enterprise HRM — Location Provider, Wake Lock & Offline Synchronization Service
// ============================================================================

import { LocationPoint } from '../types/tracking';

export interface PositionCoordinates {
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number; // km/h
  speedMps?: number; // m/s
  heading?: number;
  altitude?: number;
  batteryLevel?: number;
  timestamp: number;
}

export interface TrackingCollectionConfig {
  activePollIntervalMs?: number; // Default: 10000ms (~10s foreground polling)
  lowBatteryPollIntervalMs?: number; // Default: 20000ms when battery < 20%
  minMovementMeters?: number; // Default: 10m
}

export interface ILocationProvider {
  getCurrentPosition(): Promise<PositionCoordinates>;
  watchPosition(
    onSuccess: (coords: PositionCoordinates) => void,
    onError: (err: GeolocationPositionError | { message: string }) => void,
    config?: TrackingCollectionConfig
  ): number;
  clearWatch(watchId: number): void;
  requestWakeLock(): Promise<boolean>;
  releaseWakeLock(): void;
}

const OFFLINE_STORAGE_KEY = 'vrm_field_tracking_offline_points';

/**
 * Generates a RFC-4122 v4 UUID for trip sessions and location points
 * so both local state and PostgreSQL UUID columns accept the same ID seamlessly.
 */
export function generateTrackingUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function readDeviceBatteryPercentage(): Promise<number | undefined> {
  try {
    if (typeof navigator !== 'undefined' && typeof (navigator as any).getBattery === 'function') {
      const battery = await (navigator as any).getBattery();
      if (battery && typeof battery.level === 'number') {
        return Math.round(battery.level * 100);
      }
    }
  } catch {
    // Battery Status API not supported
  }
  return undefined;
}

/**
 * Mobile & Desktop Browser Geolocation Provider
 * - Uses navigator.geolocation.watchPosition + configurable ~10s foreground polling
 * - Automatically re-acquires Screen Wake Lock and triggers an immediate GPS fix on visibilitychange
 * - Adapts polling interval to battery condition
 * - Note: Standard mobile web browsers suspend Geolocation when the screen is locked or browser is backgrounded.
 */
export class BrowserLocationProvider implements ILocationProvider {
  private wakeLockSentinel: any = null;
  private backupTimer: any = null;
  private visibilityListener: (() => void) | null = null;
  private cachedBatteryLevel: number = 100;
  private activeWatchId: number | null = null;
  private lastReportedCoords: { lat: number; lng: number; time: number } | null = null;
  private currentMovementSpeedKmh: number = 0;

  async requestWakeLock(): Promise<boolean> {
    try {
      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && (navigator as any).wakeLock) {
        if (this.wakeLockSentinel) return true;
        this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        this.wakeLockSentinel.addEventListener('release', () => {
          this.wakeLockSentinel = null;
        });
        return true;
      }
    } catch {
      // Wake Lock can fail if page is not visible or battery saver is active
    }
    return false;
  }

  releaseWakeLock(): void {
    if (this.wakeLockSentinel) {
      try {
        this.wakeLockSentinel.release();
      } catch {}
      this.wakeLockSentinel = null;
    }
  }

  getCurrentPosition(): Promise<PositionCoordinates> {
    return new Promise((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        reject({ message: 'Geolocation is not supported by your browser or device.' });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const batt = await readDeviceBatteryPercentage();
          if (batt !== undefined) this.cachedBatteryLevel = batt;
          const speedMps =
            pos.coords.speed !== null && pos.coords.speed !== undefined && !isNaN(pos.coords.speed)
              ? Math.max(0, pos.coords.speed)
              : undefined;

          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speedMps,
            speed: speedMps !== undefined ? Math.round(speedMps * 3.6 * 10) / 10 : undefined,
            heading:
              pos.coords.heading !== null && pos.coords.heading !== undefined && !isNaN(pos.coords.heading)
                ? pos.coords.heading
                : undefined,
            altitude:
              pos.coords.altitude !== null && pos.coords.altitude !== undefined && !isNaN(pos.coords.altitude)
                ? pos.coords.altitude
                : undefined,
            batteryLevel: this.cachedBatteryLevel,
            timestamp: pos.timestamp || Date.now(),
          });
        },
        (err) => reject(err),
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0, // Fresh GPS fixes only
        }
      );
    });
  }

  watchPosition(
    onSuccess: (coords: PositionCoordinates) => void,
    onError: (err: GeolocationPositionError | { message: string }) => void,
    config?: TrackingCollectionConfig
  ): number {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      onError({ message: 'Geolocation is not supported on this device.' });
      return -1;
    }

    // Prevention of multiple GPS watchers: clear any existing watcher first
    if (this.activeWatchId !== null) {
      this.clearWatch(this.activeWatchId);
    }

    // Request Screen Wake Lock to keep screen awake while trip is active
    this.requestWakeLock().catch(() => {});

    // Read battery asynchronously
    readDeviceBatteryPercentage().then((b) => {
      if (b !== undefined) this.cachedBatteryLevel = b;
    });

    const emitSafely = (coords: PositionCoordinates) => {
      // In-flight deduplication: skip identical fixes within 3 seconds
      const now = Date.now();
      if (this.lastReportedCoords) {
        const timeDiff = (now - this.lastReportedCoords.time) / 1000;
        const latDiff = Math.abs(coords.lat - this.lastReportedCoords.lat);
        const lngDiff = Math.abs(coords.lng - this.lastReportedCoords.lng);
        if (timeDiff <= 3 && latDiff < 0.00001 && lngDiff < 0.00001) {
          return;
        }
      }
      this.lastReportedCoords = { lat: coords.lat, lng: coords.lng, time: now };
      this.currentMovementSpeedKmh = coords.speed ?? 0;
      onSuccess(coords);
    };

    // Primary native movement watcher
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const speedMps =
          pos.coords.speed !== null && pos.coords.speed !== undefined && !isNaN(pos.coords.speed)
            ? Math.max(0, pos.coords.speed)
            : undefined;
        emitSafely({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speedMps,
          speed: speedMps !== undefined ? Math.round(speedMps * 3.6 * 10) / 10 : undefined,
          heading:
            pos.coords.heading !== null && pos.coords.heading !== undefined && !isNaN(pos.coords.heading)
              ? pos.coords.heading
              : undefined,
          altitude:
            pos.coords.altitude !== null && pos.coords.altitude !== undefined && !isNaN(pos.coords.altitude)
              ? pos.coords.altitude
              : undefined,
          batteryLevel: this.cachedBatteryLevel,
          timestamp: pos.timestamp || Date.now(),
        });
      },
      onError,
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );

    this.activeWatchId = watchId;

    // Adaptive GPS Sampling Timer:
    // Moving employee: ~12-15s (12000ms)
    // Stationary employee: ~35-45s (35000ms)
    const scheduleNextPoll = () => {
      if (this.backupTimer) clearTimeout(this.backupTimer);
      const isMoving = this.currentMovementSpeedKmh > 3;
      const pollDelayMs = isMoving ? 12000 : 35000;

      this.backupTimer = setTimeout(async () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          scheduleNextPoll();
          return;
        }
        try {
          const fresh = await this.getCurrentPosition();
          emitSafely(fresh);
        } catch {
          // Silent backup retry
        }
        scheduleNextPoll();
      }, pollDelayMs);
    };

    scheduleNextPoll();

    // Re-acquire Wake Lock and capture immediate GPS fix whenever app returns to foreground
    if (typeof document !== 'undefined') {
      if (this.visibilityListener) {
        document.removeEventListener('visibilitychange', this.visibilityListener);
      }
      this.visibilityListener = () => {
        if (document.visibilityState === 'visible') {
          this.requestWakeLock().catch(() => {});
          this.getCurrentPosition()
            .then((fresh) => emitSafely(fresh))
            .catch(() => {});
        }
      };
      document.addEventListener('visibilitychange', this.visibilityListener);
    }

    return watchId;
  }

  clearWatch(watchId: number): void {
    if (this.backupTimer) {
      clearTimeout(this.backupTimer);
      this.backupTimer = null;
    }
    if (typeof document !== 'undefined' && this.visibilityListener) {
      document.removeEventListener('visibilitychange', this.visibilityListener);
      this.visibilityListener = null;
    }
    this.releaseWakeLock();
    if (watchId >= 0 && typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        navigator.geolocation.clearWatch(watchId);
      } catch {}
    }
    if (this.activeWatchId === watchId) {
      this.activeWatchId = null;
    }
  }
}

/**
 * Offline Route Point Queue & Idempotent Auto-Sync Store
 */
export const OfflineTrackingStorage = {
  saveOfflinePoint(point: LocationPoint): void {
    try {
      const existing = OfflineTrackingStorage.getOfflinePoints();
      const isDuplicate = existing.some(
        (p) =>
          p.id === point.id ||
          (p.tripId === point.tripId &&
            p.recordedAt === point.recordedAt &&
            Math.abs(p.latitude - point.latitude) < 0.000001 &&
            Math.abs(p.longitude - point.longitude) < 0.000001)
      );
      if (!isDuplicate) {
        existing.push({
          ...point,
          id: point.id || generateTrackingUuid(),
          syncedOffline: true,
          uploadStatus: 'pending',
        });
        localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(existing));
      }
    } catch (e) {
      console.warn('Unable to persist offline tracking point', e);
    }
  },

  getOfflinePoints(): LocationPoint[] {
    try {
      const data = localStorage.getItem(OFFLINE_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  clearOfflinePoints(syncedPointIds: string[]): void {
    try {
      const idSet = new Set(syncedPointIds);
      const existing = OfflineTrackingStorage.getOfflinePoints();
      const remaining = existing.filter((p) => !idSet.has(p.id));
      localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(remaining));
    } catch (e) {
      console.warn('Failed to clear synced offline points', e);
    }
  },
};

export const defaultLocationProvider = new BrowserLocationProvider();
