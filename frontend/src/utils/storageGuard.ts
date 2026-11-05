/**
 * Global Browser Storage Guard for BUSINZ HRMS
 *
 * Protects against two common mobile browser failure modes:
 * 1. SecurityError: "Failed to read the 'localStorage' property from 'Window': Access is denied for this document"
 *    (Occurs on Android Chrome / iOS Safari when "Site data / Cookies" is blocked or in restricted WebViews)
 * 2. QuotaExceededError: "Failed to execute 'setItem' on 'Storage': Setting the value of 'vrm_auth_token' exceeded the quota"
 *    (Occurs when cached attendance/face logs or task payloads fill the 5MB Web Storage limit)
 */

const CRITICAL_AUTH_KEYS = new Set([
  'vrm_auth_token',
  'vrm_hrms_token',
  'hrms_auth_token',
  'token',
  'authToken',
  'vrm_hrms_current_user',
  'vrm_active_role',
  'vrm_active_emp_id',
  'vrm_hrms_storage_mode',
]);

const HEAVY_CACHE_KEYS = [
  'vrm_hrms_face_logs',
  'vrm_hrms_attendance_records_persistent',
  'vrm_hrms_attendance_records',
  'vrm_hrms_enhanced_tasks',
  'vrm_hrms_leave_requests_persistent',
  'vrm_hrms_leave_requests',
  'vrm_hrms_shift_requests_persistent',
  'vrm_hrms_shift_requests',
  'vrm_outbound_emails',
  'vrm_integration_logs_v1',
  'vrm_hrms_employees',
  'vrm_hrms_expenses',
  'vrm_hrms_assets',
  'vrm_hrms_mom_meetings',
  'vrm_hrms_payroll_records',
  'vrm_hrms_field_assignments',
  'vrm_hrms_trip_sessions',
  'vrm_hrms_tracking_alerts',
  'vrm_hrms_overtime_records',
  'vrm_hrms_candidates',
  'hrms_candidates',
  'vrm_hrms_candidates_data',
  'vrm_hrms_loan_records',
  'hrms_loan_records',
  'vrm_hrms_loan_records_data',
  'vrm_hrms_shared_notifications',
  'shared_notifications_data',
  'vrm_shared_notifications',
  'vrm_offline_location_queue',
];

// Max size for any single non-critical cached entry (~150KB characters)
const MAX_NON_CRITICAL_VALUE_CHARS = 150_000;
// Max total localStorage characters before proactive cache eviction (~1MB)
const MAX_TOTAL_STORAGE_CHARS = 1_000_000;

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();

  const storageObj: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string): string | null {
      const k = String(key);
      return store.has(k) ? store.get(k)! : null;
    },
    key(index: number): string | null {
      if (index < 0 || index >= store.size) return null;
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      store.delete(String(key));
    },
    setItem(key: string, value: string): void {
      store.set(String(key), String(value));
    },
  };

  return storageObj;
}

function isStorageAccessible(type: 'localStorage' | 'sessionStorage'): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    const storage = window[type];
    if (!storage) return null;
    const testKey = '__vrm_storage_test__';
    storage.setItem(testKey, '1');
    storage.removeItem(testKey);
    return storage;
  } catch (err: any) {
    // Check if it failed only because of QuotaExceededError (meaning storage IS readable, just full!)
    const isQuota =
      err &&
      (err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22 ||
        err.code === 1014 ||
        /quota/i.test(String(err.message || '')));

    if (isQuota) {
      try {
        return window[type];
      } catch {
        return null;
      }
    }
    return null;
  }
}

function evictNonCriticalStorageKeys(
  storage: Storage,
  nativeRemoveItem: (key: string) => void,
  nativeKey: (index: number) => string | null,
  getLength: () => number,
  aggressive = false
): void {
  try {
    for (const k of HEAVY_CACHE_KEYS) {
      try {
        nativeRemoveItem.call(storage, k);
      } catch {}
    }

    const keysToDelete: string[] = [];
    const len = getLength.call(storage);
    for (let i = 0; i < len; i++) {
      const k = nativeKey.call(storage, i);
      if (!k) continue;
      if (CRITICAL_AUTH_KEYS.has(k)) continue;
      if (
        aggressive ||
        k.startsWith('vrm_task_unseen_reminders_') ||
        k.startsWith('vrm_punch_in_epoch_') ||
        k.startsWith('vrm_hrms_')
      ) {
        keysToDelete.push(k);
      }
    }

    for (const k of keysToDelete) {
      if (!CRITICAL_AUTH_KEYS.has(k)) {
        try {
          nativeRemoveItem.call(storage, k);
        } catch {}
      }
    }
  } catch {}
}

let isInitialized = false;

export function initGlobalStorageGuard(): void {
  if (isInitialized || typeof window === 'undefined') return;
  isInitialized = true;

  // 1. Ensure window.localStorage and window.sessionStorage never throw SecurityError on property access
  const localRef = isStorageAccessible('localStorage');
  if (!localRef) {
    const memLocal = createMemoryStorage();
    try {
      Object.defineProperty(window, 'localStorage', {
        value: memLocal,
        configurable: true,
        writable: true,
      });
    } catch {}
  }

  const sessionRef = isStorageAccessible('sessionStorage');
  if (!sessionRef) {
    const memSession = createMemoryStorage();
    try {
      Object.defineProperty(window, 'sessionStorage', {
        value: memSession,
        configurable: true,
        writable: true,
      });
    } catch {}
  }

  // 2. If native Storage.prototype is used, wrap getItem / setItem / removeItem / clear with Quota & Security recovery
  if (typeof Storage !== 'undefined' && Storage.prototype) {
    const nativeGetItem = Storage.prototype.getItem;
    const nativeSetItem = Storage.prototype.setItem;
    const nativeRemoveItem = Storage.prototype.removeItem;
    const nativeClear = Storage.prototype.clear;
    const nativeKey = Storage.prototype.key;
    const lengthDesc = Object.getOwnPropertyDescriptor(Storage.prototype, 'length');
    const getLength = lengthDesc?.get || function (this: Storage) { return 0; };

    const memoryFallback = new WeakMap<Storage, Map<string, string>>();
    const getFallbackMap = (s: Storage): Map<string, string> => {
      let map = memoryFallback.get(s);
      if (!map) {
        map = new Map<string, string>();
        memoryFallback.set(s, map);
      }
      return map;
    };

    // Proactively clean up bloated localStorage on startup so login never hits QuotaExceededError
    if (localRef) {
      try {
        let totalChars = 0;
        const oversizedKeys: string[] = [];
        const len = getLength.call(localRef);
        for (let i = 0; i < len; i++) {
          const k = nativeKey.call(localRef, i);
          if (!k) continue;
          const v = nativeGetItem.call(localRef, k) || '';
          totalChars += k.length + v.length;
          if (!CRITICAL_AUTH_KEYS.has(k) && v.length > MAX_NON_CRITICAL_VALUE_CHARS) {
            oversizedKeys.push(k);
          }
        }

        for (const k of oversizedKeys) {
          try {
            nativeRemoveItem.call(localRef, k);
          } catch {}
        }

        if (totalChars > MAX_TOTAL_STORAGE_CHARS) {
          evictNonCriticalStorageKeys(localRef, nativeRemoveItem, nativeKey, getLength, false);
        }
      } catch {}
    }

    Storage.prototype.getItem = function (key: string): string | null {
      const k = String(key);
      try {
        const fb = memoryFallback.get(this);
        if (fb && fb.has(k)) {
          return fb.get(k)!;
        }
        return nativeGetItem.call(this, k);
      } catch {
        const fb = memoryFallback.get(this);
        return fb?.get(k) ?? null;
      }
    };

    Storage.prototype.setItem = function (key: string, value: string): void {
      const k = String(key);
      const v = String(value);

      // Prevent non-critical cache keys from writing huge base64/JSON payloads into localStorage
      if (!CRITICAL_AUTH_KEYS.has(k) && v.length > MAX_NON_CRITICAL_VALUE_CHARS) {
        try {
          nativeRemoveItem.call(this, k);
        } catch {}
        return;
      }

      try {
        nativeSetItem.call(this, k, v);
        const fb = memoryFallback.get(this);
        if (fb) fb.delete(k);
      } catch {
        // QuotaExceededError or SecurityError: evict non-critical cache keys and retry
        evictNonCriticalStorageKeys(this, nativeRemoveItem, nativeKey, getLength, false);
        try {
          nativeSetItem.call(this, k, v);
          const fb = memoryFallback.get(this);
          if (fb) fb.delete(k);
          return;
        } catch {
          // Aggressive eviction for critical auth keys
          if (CRITICAL_AUTH_KEYS.has(k)) {
            evictNonCriticalStorageKeys(this, nativeRemoveItem, nativeKey, getLength, true);
            try {
              nativeSetItem.call(this, k, v);
              const fb = memoryFallback.get(this);
              if (fb) fb.delete(k);
              return;
            } catch {}
          }
          // Final fallback: keep in memory so getItem(key) succeeds without throwing
          getFallbackMap(this).set(k, v);
        }
      }
    };

    Storage.prototype.removeItem = function (key: string): void {
      const k = String(key);
      try {
        const fb = memoryFallback.get(this);
        if (fb) fb.delete(k);
        nativeRemoveItem.call(this, k);
      } catch {}
    };

    Storage.prototype.clear = function (): void {
      try {
        const fb = memoryFallback.get(this);
        if (fb) fb.clear();
        nativeClear.call(this);
      } catch {}
    };
  }
}

// Auto-initialize immediately when imported
initGlobalStorageGuard();

