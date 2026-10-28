// ==============================================================================
// VRM Enterprise HRMS — Google Maps Platform Dynamic Loader
// ==============================================================================

declare global {
  interface Window {
    google?: any;
    initGoogleMapsPromise?: Promise<any>;
  }
}

export function getStoredGoogleMapsApiKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    const directKey = localStorage.getItem('vrm_google_maps_api_key');
    if (directKey && directKey.trim()) return directKey.trim();

    const savedInts = localStorage.getItem('vrm_enterprise_integrations_v6');
    if (savedInts) {
      const parsed = JSON.parse(savedInts);
      if (parsed.google_maps?.apiKey && parsed.google_maps.apiKey.trim()) {
        return parsed.google_maps.apiKey.trim();
      }
    }
  } catch {}
  return (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';
}

export function setStoredGoogleMapsApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (key && key.trim()) {
      localStorage.setItem('vrm_google_maps_api_key', key.trim());
    } else {
      localStorage.removeItem('vrm_google_maps_api_key');
    }
  } catch {}
}

/**
 * Loads Google Maps JavaScript API with libraries (places, geometry, marker).
 */
export function loadGoogleMaps(apiKey?: string): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window not defined'));

  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }

  if (window.initGoogleMapsPromise) {
    return window.initGoogleMapsPromise;
  }

  const effectiveKey = apiKey || getStoredGoogleMapsApiKey();
  if (!effectiveKey) {
    return Promise.reject(new Error('NO_API_KEY'));
  }

  window.initGoogleMapsPromise = new Promise((resolve, reject) => {
    // Check if script tag is already in DOM
    const existingScript = document.getElementById('google-maps-js-sdk');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.google.maps));
      existingScript.addEventListener('error', (err) => reject(err));
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-js-sdk';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      effectiveKey
    )}&libraries=places,geometry,marker&loading=async`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      if (window.google?.maps) {
        resolve(window.google.maps);
      } else {
        reject(new Error('Google Maps SDK loaded but window.google.maps is undefined'));
      }
    };

    script.onerror = (err) => {
      window.initGoogleMapsPromise = undefined;
      reject(err);
    };

    document.head.appendChild(script);
  });

  return window.initGoogleMapsPromise;
}
