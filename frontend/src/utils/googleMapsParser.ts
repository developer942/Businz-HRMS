// ==============================================================================
// VRM Enterprise HRMS — Google Maps Link & Coordinate Parser Utility (Frontend)
// Priority extraction ensures place pin is extracted before viewport center
// ==============================================================================

export interface ParsedMapLocation {
  success: boolean;
  lat: number | null;
  lng: number | null;
  source: 'pin' | 'query' | 'place_path' | 'coords_string' | 'dms' | 'viewport' | 'none';
  isViewportFallback: boolean;
  isAmbiguous: boolean;
  message?: string;
  cleanedUrl?: string;
}

/**
 * Parses Google Maps links or raw coordinate strings.
 *
 * Extraction Priority:
 * 1. Place pin data (!3d<lat>!4d<lng> or !8m2!3d...): exact building pin
 * 2. Query parameters (?q=<lat>,<lng>, query=, loc:, destination=)
 * 3. Place path (/place/<name>/<lat>,<lng>)
 * 4. Coordinate query parameter (&ll=<lat>,<lng>)
 * 5. DMS coordinates string (e.g. 13°09'07.1"N 80°12'31.0"E)
 * 6. Raw coordinate pair string (e.g. "13.151968, 80.208605")
 * 7. Map viewport camera center (@<lat>,<lng>): fallback ONLY, flagged as ambiguous
 */
export function parseGoogleMapsLink(input: string): ParsedMapLocation {
  if (!input || typeof input !== 'string') {
    return {
      success: false,
      lat: null,
      lng: null,
      source: 'none',
      isViewportFallback: false,
      isAmbiguous: false,
      message: 'Empty or invalid URL provided',
    };
  }

  let clean = input.trim();
  try {
    clean = decodeURIComponent(clean);
  } catch {
    // If decode fails, proceed with raw input
  }

  // 1. Place Pin Data: !3d<lat>!4d<lng> (Standard Google Maps Place pin)
  // e.g. !8m2!3d13.151968!4d80.2086053 or !3d13.151968!4d80.2086053
  const pinMatch = clean.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (pinMatch) {
    const lat = parseFloat(pinMatch[1]);
    const lng = parseFloat(pinMatch[2]);
    if (isValidCoord(lat, lng)) {
      return {
        success: true,
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        source: 'pin',
        isViewportFallback: false,
        isAmbiguous: false,
        cleanedUrl: input.trim(),
      };
    }
  }

  // 2. Query parameters with explicit lat/lng coordinates:
  // e.g. ?q=13.151968,80.208605 or ?q=loc:13.151968,80.208605 or &destination=13.151968,80.208605
  const qCoordMatch = clean.match(
    /[?&](?:q|query|loc|center|destination)=(?:loc:)?(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/i
  );
  if (qCoordMatch) {
    const lat = parseFloat(qCoordMatch[1]);
    const lng = parseFloat(qCoordMatch[2]);
    if (isValidCoord(lat, lng)) {
      return {
        success: true,
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        source: 'query',
        isViewportFallback: false,
        isAmbiguous: false,
        cleanedUrl: input.trim(),
      };
    }
  }

  // 3. /place/<name>/<lat>,<lng> path format
  const placePathMatch = clean.match(
    /\/maps\/place\/[^/]+\/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/i
  );
  if (placePathMatch) {
    const lat = parseFloat(placePathMatch[1]);
    const lng = parseFloat(placePathMatch[2]);
    if (isValidCoord(lat, lng)) {
      return {
        success: true,
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        source: 'place_path',
        isViewportFallback: false,
        isAmbiguous: false,
        cleanedUrl: input.trim(),
      };
    }
  }

  // 4. &ll=<lat>,<lng>
  const llMatch = clean.match(/[?&]ll=(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/i);
  if (llMatch) {
    const lat = parseFloat(llMatch[1]);
    const lng = parseFloat(llMatch[2]);
    if (isValidCoord(lat, lng)) {
      return {
        success: true,
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        source: 'query',
        isViewportFallback: false,
        isAmbiguous: false,
        cleanedUrl: input.trim(),
      };
    }
  }

  // 5. DMS (Degrees, Minutes, Seconds) coordinate format
  // e.g. 13°09'07.1"N 80°12'31.0"E or 13°09'07.1"N, 80°12'31.0"E
  const dmsMatch = clean.match(
    /(\d+)°(\d+)'([\d.]+)"([NS])[,\s]+(\d+)°(\d+)'([\d.]+)"([EW])/i
  );
  if (dmsMatch) {
    const latDeg =
      parseFloat(dmsMatch[1]) +
      parseFloat(dmsMatch[2]) / 60 +
      parseFloat(dmsMatch[3]) / 3600;
    const latSign = dmsMatch[4].toUpperCase() === 'S' ? -1 : 1;
    const lngDeg =
      parseFloat(dmsMatch[5]) +
      parseFloat(dmsMatch[6]) / 60 +
      parseFloat(dmsMatch[7]) / 3600;
    const lngSign = dmsMatch[8].toUpperCase() === 'W' ? -1 : 1;
    const lat = latDeg * latSign;
    const lng = lngDeg * lngSign;
    if (isValidCoord(lat, lng)) {
      return {
        success: true,
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        source: 'dms',
        isViewportFallback: false,
        isAmbiguous: false,
        cleanedUrl: input.trim(),
      };
    }
  }

  // 6. Raw coordinate pair string (e.g. "13.151968, 80.208605" or "13.151968 80.208605")
  const rawCoordsMatch = clean.match(/^[-+]?(\d{1,2}\.\d+)[,\s]+[-+]?(\d{1,3}\.\d+)$/);
  if (rawCoordsMatch) {
    const lat = parseFloat(rawCoordsMatch[1]);
    const lng = parseFloat(rawCoordsMatch[2]);
    if (isValidCoord(lat, lng)) {
      return {
        success: true,
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        source: 'coords_string',
        isViewportFallback: false,
        isAmbiguous: false,
        cleanedUrl: input.trim(),
      };
    }
  }

  // 7. Map viewport camera center (@<lat>,<lng>): FALLBACK ONLY!
  // Google Maps URLs contain @lat,lng,zoom to position the camera, which is often 50-150m away from the pin.
  const viewportMatch = clean.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (viewportMatch) {
    const lat = parseFloat(viewportMatch[1]);
    const lng = parseFloat(viewportMatch[2]);
    if (isValidCoord(lat, lng)) {
      return {
        success: true,
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        source: 'viewport',
        isViewportFallback: true,
        isAmbiguous: true,
        message:
          'Extracted map camera position (no specific place pin found in link). Please confirm or adjust the pin on the map to your exact building entrance.',
        cleanedUrl: input.trim(),
      };
    }
  }

  return {
    success: false,
    lat: null,
    lng: null,
    source: 'none',
    isViewportFallback: false,
    isAmbiguous: false,
    message: 'Could not extract valid geographic coordinates from link or text.',
  };
}

function isValidCoord(lat: number, lng: number): boolean {
  return (
    !isNaN(lat) &&
    !isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) // Not Null Island
  );
}
