// ============================================================================
// VRM Enterprise HRM — Location Provider, Wake Lock & Offline Synchronization Service
// ============================================================================

import { LocationPoint } from '../types/tracking';

export interface PositionCoordinates {
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  altitude?: number;
  timestamp: number;
}

export interface ILocationProvider {
  getCurrentPosition(): Promise<PositionCoordinates>;
  watchPosition(
    onSuccess: (coords: PositionCoordinates) => void,
    onError: (err: GeolocationPositionError | { message: string }) => void
  ): number;
  clearWatch(watchId: number): void;
  requestWakeLock(): Promise<boolean>;
  releaseWakeLock(): void;
}

const OFFLINE_STORAGE_KEY = 'vrm_field_tracking_offline_points';

/**
 * Mobile Geolocation Provider
 * Uses navigator.geolocation with high accuracy and zero cached age,
 * plus Screen Wake Lock to prevent mobile browser suspension.
 */
export class BrowserLocationProvider implements ILocationProvider {
  private wakeLockSentinel: any = null;
  private backupTimer: any = null;

  async requestWakeLock(): Promise<boolean> {
    try {
      if ('wakeLock' in navigator && (navigator as any).wakeLock) {
        this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        this.wakeLockSentinel.addEventListener('release', () => {
          this.wakeLockSentinel = null;
        });
        return true;
      }
    } catch (e) {
      console.warn('Wake Lock request error or not supported:', e);
    }
    return false;
  }

  releaseWakeLock(): void {
    if (this.wakeLockSentinel) {
      try {
        this.wakeLockSentinel.release();
      } catch (e) {}
      this.wakeLockSentinel = null;
    }
  }

  getCurrentPosition(): Promise<PositionCoordinates> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject({ message: 'Geolocation is not supported by your browser or device.' });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speed: pos.coords.speed !== null && pos.coords.speed !== undefined ? pos.coords.speed * 3.6 : undefined, // m/s to km/h
            heading: pos.coords.heading !== null && pos.coords.heading !== undefined ? pos.coords.heading : undefined,
            altitude: pos.coords.altitude !== null && pos.coords.altitude !== undefined ? pos.coords.altitude : undefined,
            timestamp: pos.timestamp || Date.now()
          });
        },
        (err) => reject(err),
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0 // Strictly fresh GPS fixes only!
        }
      );
    });
  }

  watchPosition(
    onSuccess: (coords: PositionCoordinates) => void,
    onError: (err: GeolocationPositionError | { message: string }) => void
  ): number {
    if (!navigator.geolocation) {
      onError({ message: 'Geolocation is not supported on this device.' });
      return -1;
    }

    // Try requesting wake lock to prevent screen sleep during travel
    this.requestWakeLock().catch(() => {});

    // Primary native watcher
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        onSuccess({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed !== null && pos.coords.speed !== undefined ? pos.coords.speed * 3.6 : undefined,
          heading: pos.coords.heading !== null && pos.coords.heading !== undefined ? pos.coords.heading : undefined,
          altitude: pos.coords.altitude !== null && pos.coords.altitude !== undefined ? pos.coords.altitude : undefined,
          timestamp: pos.timestamp || Date.now()
        });
      },
      onError,
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0 // Zero cache for true real-time GPS
      }
    );

    // Heartbeat polling backup every 25 seconds in case browser drops watchPosition in transit
    if (this.backupTimer) clearInterval(this.backupTimer);
    this.backupTimer = setInterval(async () => {
      try {
        const fresh = await this.getCurrentPosition();
        onSuccess(fresh);
      } catch (e) {
        // Silent backup failure
      }
    }, 25000);

    return watchId;
  }

  clearWatch(watchId: number): void {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }
    this.releaseWakeLock();
    if (watchId >= 0 && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
    }
  }
}

/**
 * Offline Route Point Store & Auto-Sync
 */
export const OfflineTrackingStorage = {
  saveOfflinePoint(point: LocationPoint): void {
    try {
      const existing = OfflineTrackingStorage.getOfflinePoints();
      if (!existing.some(p => p.id === point.id)) {
        existing.push({ ...point, syncedOffline: true });
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
      const existing = OfflineTrackingStorage.getOfflinePoints();
      const remaining = existing.filter(p => !syncedPointIds.includes(p.id));
      localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(remaining));
    } catch (e) {
      console.warn('Failed to clear synced offline points', e);
    }
  }
};

export const defaultLocationProvider = new BrowserLocationProvider();
