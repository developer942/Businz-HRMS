import React, { useState, useEffect, useRef } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  Navigation, 
  ArrowRight, 
  Maximize2, 
  Minimize2, 
  Compass, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck,
  ExternalLink
} from 'lucide-react';

export const GPSGeofenceSettings: React.FC = () => {
  const { geofenceConfig, updateGeofenceConfig, currentUser } = useHRMS();
  const isPrivileged = currentUser.role !== 'Employee';

  // Active Editing Fields (Clean slate for manual input)
  const [name, setName] = useState<string>(() => {
    const val = geofenceConfig.officeName;
    return (val && val !== 'Businz HQ' && val !== 'Corporate Headquarters') ? val : '';
  });

  const [googleMapsLink, setGoogleMapsLink] = useState<string>(() => {
    if (geofenceConfig.googleMapsLink) return geofenceConfig.googleMapsLink;
    const numLat = Number(geofenceConfig.centerLat);
    const numLng = Number(geofenceConfig.centerLng);
    if (numLat && numLng) {
      return `https://www.google.com/maps?q=${numLat},${numLng}`;
    }
    return '';
  });

  const [lat, setLat] = useState<number | ''>(() => {
    const val = Number(geofenceConfig.centerLat);
    return (val && val !== 13.151968 && val !== 28.703197 && val !== 0) ? val : '';
  });
  const [lng, setLng] = useState<number | ''>(() => {
    const val = Number(geofenceConfig.centerLng);
    return (val && val !== 80.2086053 && val !== 77.098123 && val !== 0) ? val : '';
  });
  const [radius, setRadius] = useState<number>(() => Number(geofenceConfig.radiusMeters) || 250);
  const [address, setAddress] = useState<string>(() => {
    const val = geofenceConfig.address || geofenceConfig.officeName;
    return (val && val !== 'Businz HQ' && val !== 'Corporate Headquarters' && val !== 'Corporate Office Address') ? val : '';
  });

  // Sync state when geofenceConfig loads or changes from VPS
  useEffect(() => {
    if (geofenceConfig.centerLat && geofenceConfig.centerLng) {
      const numLat = Number(geofenceConfig.centerLat);
      const numLng = Number(geofenceConfig.centerLng);
      if (lat === '' || lat === 0) setLat(numLat);
      if (lng === '' || lng === 0) setLng(numLng);
      if (!name && geofenceConfig.officeName && geofenceConfig.officeName !== 'Businz HQ') {
        setName(geofenceConfig.officeName);
      }
      if (!address && (geofenceConfig.address || geofenceConfig.officeName)) {
        setAddress(geofenceConfig.address || geofenceConfig.officeName || '');
      }
      if (geofenceConfig.radiusMeters) {
        setRadius(Number(geofenceConfig.radiusMeters));
      }
      if (!googleMapsLink) {
        setGoogleMapsLink(
          geofenceConfig.googleMapsLink || `https://www.google.com/maps?q=${numLat},${numLng}`
        );
      }
    }
  }, [geofenceConfig]);

  const [mapType, setMapType] = useState<'map' | 'satellite'>('map');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [linkExtractMsg, setLinkExtractMsg] = useState<string | null>(null);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);

  // Leaflet Map Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // SVG Red Pin Icon matching Google Maps Pin exactly
  const getPinIcon = () => {
    return L.divIcon({
      className: 'google-style-pin',
      html: `
        <div style="position: relative; width: 34px; height: 44px; transform: translate(-17px, -44px); cursor: pointer;">
          <svg viewBox="0 0 384 512" width="34" height="44" style="filter: drop-shadow(0 4px 8px rgba(0,0,0,0.38));">
            <path fill="#EA4335" d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z"/>
            <circle cx="192" cy="192" r="74" fill="#FFFFFF" />
            <circle cx="192" cy="192" r="46" fill="#C5221F" />
          </svg>
        </div>
      `,
      iconSize: [34, 44],
      iconAnchor: [17, 44]
    });
  };

  // Tile layers
  const getTileUrl = (type: 'map' | 'satellite') => {
    if (type === 'satellite') {
      return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    }
    return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  };

  const getTileAttribution = (type: 'map' | 'satellite') => {
    if (type === 'satellite') {
      return '&copy; Esri &mdash; World Imagery';
    }
    return '&copy; OpenStreetMap contributors';
  };

  // Helper to setup marker drag events
  const attachMarkerDrag = (marker: L.Marker) => {
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      const newLat = Number(pos.lat.toFixed(6));
      const newLng = Number(pos.lng.toFixed(6));
      setLat(newLat);
      setLng(newLng);
      if (circleRef.current) {
        circleRef.current.setLatLng([newLat, newLng]);
      }
      fetchAddress(newLat, newLng);
    });
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const hasCoords = typeof lat === 'number' && typeof lng === 'number' && lat !== 0 && lng !== 0;
      const initialCenter: [number, number] = hasCoords ? [lat as number, lng as number] : [13.0827, 80.2707];
      const initialZoom = hasCoords ? 16 : 11;

      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: initialZoom,
        zoomControl: true
      });

      const tileLayer = L.tileLayer(getTileUrl(mapType), {
        attribution: getTileAttribution(mapType),
        maxZoom: 19
      }).addTo(map);
      tileLayerRef.current = tileLayer;

      // Only drop Circle & Marker if coordinates exist
      if (hasCoords) {
        const circle = L.circle([lat as number, lng as number], {
          radius: radius,
          color: '#1D64F2',
          fillColor: '#1D64F2',
          fillOpacity: 0.18,
          weight: 2
        }).addTo(map);
        circleRef.current = circle;

        const marker = L.marker([lat as number, lng as number], {
          icon: getPinIcon(),
          draggable: true
        }).addTo(map);
        attachMarkerDrag(marker);
        markerRef.current = marker;
      }

      // On map click: set pin & circle, update lat/lng
      map.on('click', (e: L.LeafletMouseEvent) => {
        const newLat = Number(e.latlng.lat.toFixed(6));
        const newLng = Number(e.latlng.lng.toFixed(6));
        setLat(newLat);
        setLng(newLng);

        if (!markerRef.current) {
          const marker = L.marker([newLat, newLng], {
            icon: getPinIcon(),
            draggable: true
          }).addTo(map);
          attachMarkerDrag(marker);
          markerRef.current = marker;
        } else {
          markerRef.current.setLatLng([newLat, newLng]);
        }

        if (!circleRef.current) {
          const circle = L.circle([newLat, newLng], {
            radius: radius,
            color: '#1D64F2',
            fillColor: '#1D64F2',
            fillOpacity: 0.18,
            weight: 2
          }).addTo(map);
          circleRef.current = circle;
        } else {
          circleRef.current.setLatLng([newLat, newLng]);
          circleRef.current.setRadius(radius);
        }

        fetchAddress(newLat, newLng);
      });

      mapInstanceRef.current = map;
    }
  }, []);

  // Update map layer when mapType toggles
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;
    mapInstanceRef.current.removeLayer(tileLayerRef.current);
    const newTile = L.tileLayer(getTileUrl(mapType), {
      attribution: getTileAttribution(mapType),
      maxZoom: 19
    }).addTo(mapInstanceRef.current);
    tileLayerRef.current = newTile;
  }, [mapType]);

  // Update marker and circle position when lat/lng change
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const hasCoords = typeof lat === 'number' && typeof lng === 'number' && lat !== 0 && lng !== 0;

    if (hasCoords) {
      const coordPair: [number, number] = [lat as number, lng as number];

      if (!markerRef.current) {
        const marker = L.marker(coordPair, {
          icon: getPinIcon(),
          draggable: true
        }).addTo(mapInstanceRef.current);
        attachMarkerDrag(marker);
        markerRef.current = marker;
      } else {
        markerRef.current.setLatLng(coordPair);
      }

      if (!circleRef.current) {
        const circle = L.circle(coordPair, {
          radius: radius,
          color: '#1D64F2',
          fillColor: '#1D64F2',
          fillOpacity: 0.18,
          weight: 2
        }).addTo(mapInstanceRef.current);
        circleRef.current = circle;
      } else {
        circleRef.current.setLatLng(coordPair);
        circleRef.current.setRadius(radius);
      }

      mapInstanceRef.current.panTo(coordPair, { animate: true });
    } else {
      if (markerRef.current) {
        mapInstanceRef.current.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      if (circleRef.current) {
        mapInstanceRef.current.removeLayer(circleRef.current);
        circleRef.current = null;
      }
    }
  }, [lat, lng, radius]);

  // Invalidate map size when fullscreen toggles
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [isFullScreen]);

  // Reverse Geocoding helper
  const fetchAddress = async (latitude: number, longitude: number) => {
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`, {
        headers: { 'Accept-Language': 'en' }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.display_name) {
          setAddress(data.display_name);
        }
      }
    } catch {
      // Non-blocking fallback
    }
  };

  // Google Maps Link & Address Parser (Handles short links, DMS, queries, !3d!4d, @coords, and geocoding)
  const handleExtractFromGoogleMapsLink = async () => {
    const raw = googleMapsLink.trim();
    if (!raw) return;

    setLinkExtractMsg('Detecting location coordinates...');

    let foundLat: number | null = null;
    let foundLng: number | null = null;
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {}

    // Pattern 1: @lat,lng,zoom e.g. @13.0827,80.2707,17z
    const atMatch = decoded.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      foundLat = parseFloat(atMatch[1]);
      foundLng = parseFloat(atMatch[2]);
    }

    // Pattern 2: !3d<lat>!4d<lng> (Standard Google Maps Place URLs)
    if (!foundLat) {
      const dataMatch = decoded.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
      if (dataMatch) {
        foundLat = parseFloat(dataMatch[1]);
        foundLng = parseFloat(dataMatch[2]);
      }
    }

    // Pattern 3: ?q=lat,lng or query=lat,lng or loc=lat,lng or center=lat,lng
    if (!foundLat) {
      const qMatch = decoded.match(/[?&](?:q|query|loc|center|destination)=(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/i);
      if (qMatch) {
        foundLat = parseFloat(qMatch[1]);
        foundLng = parseFloat(qMatch[2]);
      }
    }

    // Pattern 4: ll=lat,lng
    if (!foundLat) {
      const llMatch = decoded.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (llMatch) {
        foundLat = parseFloat(llMatch[1]);
        foundLng = parseFloat(llMatch[2]);
      }
    }

    // Pattern 5: Raw coordinates string "13.0827, 80.2707"
    if (!foundLat) {
      const rawMatch = decoded.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (rawMatch) {
        foundLat = parseFloat(rawMatch[1]);
        foundLng = parseFloat(rawMatch[2]);
      }
    }

    // Pattern 6: DMS coordinates (e.g. 13°04'57.7"N 80°16'14.5"E)
    if (!foundLat) {
      const dmsMatch = decoded.match(/(\d+)°(\d+)'([\d.]+)"([NS])[,\s]+(\d+)°(\d+)'([\d.]+)"([EW])/i);
      if (dmsMatch) {
        const latDeg = parseFloat(dmsMatch[1]) + parseFloat(dmsMatch[2]) / 60 + parseFloat(dmsMatch[3]) / 3600;
        const latSign = dmsMatch[4].toUpperCase() === 'S' ? -1 : 1;
        const lngDeg = parseFloat(dmsMatch[5]) + parseFloat(dmsMatch[6]) / 60 + parseFloat(dmsMatch[7]) / 3600;
        const lngSign = dmsMatch[8].toUpperCase() === 'W' ? -1 : 1;
        foundLat = latDeg * latSign;
        foundLng = lngDeg * lngSign;
      }
    }

    // Pattern 7: Short links (e.g. maps.app.goo.gl or goo.gl/maps) -> Backend resolver
    if (!foundLat && (raw.includes('goo.gl') || raw.includes('maps.app'))) {
      try {
        const resp = await fetch('https://hrms.businz.com/api/v1/settings/resolve-map-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: raw })
        });
        if (resp.ok) {
          const resData = await resp.json();
          if (resData.success && resData.lat && resData.lng) {
            foundLat = parseFloat(resData.lat);
            foundLng = parseFloat(resData.lng);
          }
        }
      } catch (err) {
        console.warn('Backend link resolver fallback:', err);
      }
    }

    // Pattern 8: If it's a place name or address query (e.g. user entered "Kathirvedu, Chennai")
    if (!foundLat && !raw.startsWith('http://') && !raw.startsWith('https://')) {
      try {
        const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(raw)}&limit=1`, {
          headers: { 'Accept-Language': 'en' }
        });
        if (resp.ok) {
          const results = await resp.json();
          if (Array.isArray(results) && results.length > 0) {
            foundLat = parseFloat(results[0].lat);
            foundLng = parseFloat(results[0].lon);
            if (results[0].display_name) {
              setAddress(results[0].display_name);
              if (!name) setName(results[0].display_name);
            }
          }
        }
      } catch {}
    }

    if (foundLat && foundLng && !isNaN(foundLat) && !isNaN(foundLng)) {
      const fixedLat = Number(foundLat.toFixed(6));
      const fixedLng = Number(foundLng.toFixed(6));
      setLat(fixedLat);
      setLng(fixedLng);
      setLinkExtractMsg(`✓ Location detected: ${fixedLat}, ${fixedLng}`);
      fetchAddress(fixedLat, fixedLng);
      setTimeout(() => setLinkExtractMsg(null), 4000);
    } else {
      setLinkExtractMsg('Could not detect coordinates from this link. You can click directly on the map or enter Latitude and Longitude.');
      setTimeout(() => setLinkExtractMsg(null), 6000);
    }
  };

  // Browser Geolocation (Current Device Location)
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setIsDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const curLat = Number(pos.coords.latitude.toFixed(6));
        const curLng = Number(pos.coords.longitude.toFixed(6));
        setLat(curLat);
        setLng(curLng);
        fetchAddress(curLat, curLng);
        setGoogleMapsLink(`https://www.google.com/maps?q=${curLat},${curLng}`);
        setIsDetectingLocation(false);
      },
      (err) => {
        setIsDetectingLocation(false);
        alert(`Failed to retrieve location: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Save / Confirm Action
  const handleConfirmSave = () => {
    const numLat = typeof lat === 'number' ? lat : parseFloat(String(lat)) || 0;
    const numLng = typeof lng === 'number' ? lng : parseFloat(String(lng)) || 0;
    const finalName = name.trim() || address.trim() || 'Office Geofence';
    const finalLink = googleMapsLink.trim() || (numLat !== 0 && numLng !== 0 ? `https://www.google.com/maps?q=${numLat},${numLng}` : '');

    updateGeofenceConfig({
      officeName: finalName,
      centerLat: numLat,
      centerLng: numLng,
      radiusMeters: radius,
      googleMapsLink: finalLink,
      address: address.trim() || finalName,
      enabled: Boolean(numLat !== 0 && numLng !== 0),
      enforceStrictly: Boolean(numLat !== 0 && numLng !== 0)
    });

    setSaveSuccessMsg(`Geofence "${finalName}" saved with ${radius}M perimeter boundary!`);
    setTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  // Reset to clean slate or current non-mock values
  const handleReset = () => {
    const savedName = geofenceConfig.officeName;
    const cleanName = (savedName && savedName !== 'Businz HQ' && savedName !== 'Corporate Headquarters') ? savedName : '';
    const cleanLat = (geofenceConfig.centerLat && geofenceConfig.centerLat !== 13.151968 && geofenceConfig.centerLat !== 28.703197) ? geofenceConfig.centerLat : '';
    const cleanLng = (geofenceConfig.centerLng && geofenceConfig.centerLng !== 80.2086053 && geofenceConfig.centerLng !== 77.098123) ? geofenceConfig.centerLng : '';

    setName(cleanName);
    setGoogleMapsLink(geofenceConfig.googleMapsLink || (cleanLat && cleanLng ? `https://www.google.com/maps?q=${cleanLat},${cleanLng}` : ''));
    setLat(cleanLat);
    setLng(cleanLng);
    setRadius(Number(geofenceConfig.radiusMeters) || 250);
    setAddress(geofenceConfig.address || cleanName);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        padding: '20px 24px',
        borderRadius: '16px',
        border: '1px solid #E7ECF3',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: '#ECFEFF',
            color: '#0E7490',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Navigation size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
              GPS Geofence & Location Settings
            </h2>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B' }}>
              Configure office perimeter fences, interactive map coordinates, meter radius, and mobile/web punch validation
            </p>
          </div>
        </div>

        {/* Global Enforcement Switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1E293B' }}>
              Geofence Enforcement
            </div>
            <div style={{ fontSize: '0.74rem', color: geofenceConfig.enabled ? '#16A34A' : '#DC2626', fontWeight: 600 }}>
              {geofenceConfig.enabled ? '● Active & Enforced' : '○ Permissive (Off)'}
            </div>
          </div>
          {isPrivileged && (
            <button
              type="button"
              onClick={() => updateGeofenceConfig({ enabled: !geofenceConfig.enabled })}
              style={{
                width: '48px',
                height: '26px',
                borderRadius: '13px',
                backgroundColor: geofenceConfig.enabled ? '#0E7490' : '#CBD5E1',
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background-color 0.2s ease'
              }}
            >
              <div style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                backgroundColor: '#FFFFFF',
                position: 'absolute',
                top: '3px',
                left: geofenceConfig.enabled ? '25px' : '3px',
                transition: 'left 0.2s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
              }} />
            </button>
          )}
        </div>
      </div>

      {saveSuccessMsg && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 18px',
          backgroundColor: '#DCFCE7',
          color: '#166534',
          borderRadius: '12px',
          fontSize: '0.86rem',
          fontWeight: 700
        }}>
          <CheckCircle2 size={18} /> {saveSuccessMsg}
        </div>
      )}

      {linkExtractMsg && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          backgroundColor: '#EFF6FF',
          color: '#1D4ED8',
          borderRadius: '10px',
          fontSize: '0.82rem',
          fontWeight: 600
        }}>
          <AlertCircle size={16} /> {linkExtractMsg}
        </div>
      )}

      {/* Main Geofence Configuration Card (Matching User Screenshot Layout Directly) */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E7ECF3',
        padding: '24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        {/* ROW 1: Geofence Name | Google Maps Link | Latitude */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px'
        }}>
          {/* Geofence Name */}
          <div>
            <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: '#1E293B', marginBottom: '8px' }}>
              Geofence Name
            </label>
            <input
              type="text"
              placeholder="Enter geofence name"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#F8FAFC',
                fontSize: '0.88rem',
                color: '#1E293B',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Google Maps link with Blue Arrow Button */}
          <div>
            <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: '#1E293B', marginBottom: '8px' }}>
              Google Maps link
            </label>
            <div style={{ display: 'flex', alignItems: 'stretch' }}>
              <input
                type="text"
                placeholder="Enter google maps link"
                value={googleMapsLink}
                onChange={e => setGoogleMapsLink(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleExtractFromGoogleMapsLink();
                  }
                }}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px 0 0 8px',
                  border: '1px solid #CBD5E1',
                  borderRight: 'none',
                  backgroundColor: '#F8FAFC',
                  fontSize: '0.88rem',
                  color: '#1E293B',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={handleExtractFromGoogleMapsLink}
                title="Extract Coordinates from Google Maps Link"
                style={{
                  width: '46px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '0 8px 8px 0',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#0891B2'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0E7490'}
              >
                <ArrowRight size={18} />
              </button>
            </div>
          </div>

          {/* Latitude */}
          <div>
            <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: '#1E293B', marginBottom: '8px' }}>
              Latitude
            </label>
            <input
              type="number"
              step="any"
              placeholder="Enter latitude"
              value={lat}
              onChange={e => {
                const val = e.target.value;
                setLat(val === '' ? '' : parseFloat(val));
              }}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#F8FAFC',
                fontSize: '0.88rem',
                color: '#1E293B',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        {/* ROW 2: Longitude | Geofence Radius | Address */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px'
        }}>
          {/* Longitude */}
          <div>
            <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: '#1E293B', marginBottom: '8px' }}>
              Longitude
            </label>
            <input
              type="number"
              step="any"
              placeholder="Enter longitude"
              value={lng}
              onChange={e => {
                const val = e.target.value;
                setLng(val === '' ? '' : parseFloat(val));
              }}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#F8FAFC',
                fontSize: '0.88rem',
                color: '#1E293B',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Geofence Radius Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: '#1E293B', marginBottom: '8px' }}>
              Geofence Radius
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select
                value={radius}
                onChange={e => setRadius(Number(e.target.value))}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#F8FAFC',
                  fontSize: '0.88rem',
                  color: '#1E293B',
                  outline: 'none',
                  cursor: 'pointer',
                  boxSizing: 'border-box'
                }}
              >
                <option value={30}>30 M (Strict Single Building)</option>
                <option value={50}>50 M (Small Office)</option>
                <option value={100}>100 M</option>
                <option value={150}>150 M</option>
                <option value={200}>200 M</option>
                <option value={250}>250 M (Campus Zone)</option>
                <option value={300}>300 M</option>
                <option value={500}>500 M</option>
                <option value={1000}>1000 M (1 KM)</option>
                <option value={2000}>2000 M (2 KM)</option>
                {![30, 50, 100, 150, 200, 250, 300, 500, 1000, 2000].includes(radius) && (
                  <option value={radius}>{radius} M (Configured)</option>
                )}
              </select>

              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={isDetectingLocation}
                title="Use Current GPS Coordinates"
                style={{
                  padding: '10px 14px',
                  backgroundColor: '#ECFEFF',
                  color: '#0E7490',
                  border: '1px solid #A5F3FC',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap'
                }}
              >
                <Compass size={15} />
                {isDetectingLocation ? 'Locating...' : 'My Location'}
              </button>
            </div>
          </div>

          {/* Address */}
          <div>
            <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: '#1E293B', marginBottom: '8px' }}>
              Address
            </label>
            <input
              type="text"
              placeholder="Enter address"
              value={address}
              onChange={e => setAddress(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#F8FAFC',
                fontSize: '0.88rem',
                color: '#1E293B',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        {/* INTERACTIVE MAP CONTAINER */}
        <div style={{ position: 'relative' }}>
          {/* Map Controls Header Overlay (Map / Satellite toggle) */}
          <div style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            zIndex: 1000,
            display: 'flex',
            backgroundColor: '#FFFFFF',
            borderRadius: '6px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            overflow: 'hidden',
            border: '1px solid #D1D5DB'
          }}>
            <button
              type="button"
              onClick={() => setMapType('map')}
              style={{
                padding: '7px 14px',
                backgroundColor: mapType === 'map' ? '#FFFFFF' : '#F9FAFB',
                color: mapType === 'map' ? '#0F172A' : '#6B7280',
                fontWeight: mapType === 'map' ? 700 : 500,
                border: 'none',
                borderRight: '1px solid #E5E7EB',
                cursor: 'pointer',
                fontSize: '0.84rem'
              }}
            >
              Map
            </button>
            <button
              type="button"
              onClick={() => setMapType('satellite')}
              style={{
                padding: '7px 14px',
                backgroundColor: mapType === 'satellite' ? '#FFFFFF' : '#F9FAFB',
                color: mapType === 'satellite' ? '#0F172A' : '#6B7280',
                fontWeight: mapType === 'satellite' ? 700 : 500,
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.84rem'
              }}
            >
              Satellite
            </button>
          </div>

          {/* Fullscreen Button in Map */}
          <button
            type="button"
            onClick={() => setIsFullScreen(!isFullScreen)}
            title={isFullScreen ? 'Exit Fullscreen' : 'View Fullscreen'}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              zIndex: 1000,
              padding: '7px',
              backgroundColor: '#FFFFFF',
              borderRadius: '6px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              border: '1px solid #D1D5DB',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#374151'
            }}
          >
            {isFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>

          {/* Live Radius Badge Overlay in Map */}
          <div style={{
            position: 'absolute',
            bottom: '14px',
            right: '14px',
            zIndex: 1000,
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            color: '#FFFFFF',
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '0.76rem',
            fontWeight: 700,
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#38BDF8' }} />
            Fence Radius: {radius} Meters
          </div>

          {/* Map Element */}
          <div
            ref={mapContainerRef}
            style={{
              width: '100%',
              height: isFullScreen ? '78vh' : '360px',
              borderRadius: '12px',
              overflow: 'hidden',
              border: '1px solid #E2E8F0',
              zIndex: 1
            }}
          />
        </div>

        {/* Caption Below Map (Matching Screenshot) */}
        <div style={{
          fontSize: '0.82rem',
          fontStyle: 'italic',
          color: '#64748B',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <span>Click on the desired location on the map to select a geofence</span>
        </div>

        {/* ACTION BUTTONS (Confirm and Cancel/Reset - Matching Screenshot) */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '12px',
          paddingTop: '8px'
        }}>
          {/* Confirm Button */}
          <button
            type="button"
            onClick={handleConfirmSave}
            style={{
              padding: '10px 42px',
              backgroundColor: '#0E7490',
              color: '#FFFFFF',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.94rem',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(14, 116, 144, 0.25)',
              transition: 'background-color 0.15s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#0891B2'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0E7490'}
          >
            Confirm
          </button>

          {/* Cancel Button */}
          <button
            type="button"
            onClick={handleReset}
            title="Reset to saved values"
            style={{
              width: '42px',
              height: '42px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#FFFFFF',
              color: '#334155',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FFFFFF'}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Geofence Perimeter Verification Preview Card */}
      <div style={{
        backgroundColor: '#F8FAFC',
        borderRadius: '14px',
        border: '1px solid #E2E8F0',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            backgroundColor: '#DCFCE7',
            color: '#166534',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <ShieldCheck size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0F172A' }}>
              Active Office Geofence: {name.trim() || 'Not Configured (Click map or enter coordinates)'}
            </div>
            <div style={{ fontSize: '0.76rem', color: '#64748B' }}>
              Coordinates: <strong>{lat !== '' && lng !== '' ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}` : 'Not set'}</strong> | Radius: <strong>{radius} Meters</strong>
            </div>
          </div>
        </div>

        {lat !== '' && lng !== '' && (
          <a
            href={googleMapsLink || `https://www.google.com/maps?q=${lat},${lng}`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8rem',
              color: '#0E7490',
              fontWeight: 700,
              textDecoration: 'none'
            }}
          >
            Open in Google Maps <ExternalLink size={13} />
          </a>
        )}
      </div>
    </div>
  );
};

export default GPSGeofenceSettings;
