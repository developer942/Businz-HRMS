import React, { useState, useRef } from 'react';
import { useHRMS, calculateDistanceMeters } from '../../context/HRMSContext';
import { 
  MapPin, 
  Lock, 
  Unlock, 
  Navigation, 
  Check, 
  Info,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  ZoomIn,
  ZoomOut,
  Target,
  Globe,
  Key,
  Layers
} from 'lucide-react';

interface GeofenceControlCardProps {
  onLocationSimulated?: (simulatedLocation: { lat: number; lng: number; isInside: boolean; distanceMeters: number }) => void;
}

export const GeofenceControlCard: React.FC<GeofenceControlCardProps> = ({ onLocationSimulated }) => {
  const { geofenceConfig, updateGeofenceConfig, isGeofenceAdmin, currentUser } = useHRMS();

  // Local state for editing form
  const [radiusMeters, setRadiusMeters] = useState<number>(geofenceConfig.radiusMeters || 200);
  const [officeName, setOfficeName] = useState<string>(() => {
    return (geofenceConfig.officeName && geofenceConfig.officeName !== 'Businz HQ') ? geofenceConfig.officeName : '';
  });
  const [centerLat, setCenterLat] = useState<number>(() => {
    return (geofenceConfig.centerLat && geofenceConfig.centerLat !== 13.151968) ? geofenceConfig.centerLat : 0;
  });
  const [centerLng, setCenterLng] = useState<number>(() => {
    return (geofenceConfig.centerLng && geofenceConfig.centerLng !== 80.2086053) ? geofenceConfig.centerLng : 0;
  });
  const [enabled, setEnabled] = useState<boolean>(geofenceConfig.enabled);
  const [isGettingGPS, setIsGettingGPS] = useState<boolean>(false);
  const [saveToast, setSaveToast] = useState<boolean>(false);

  // Map state
  const [zoomLevel, setZoomLevel] = useState<number>(15);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mapType, setMapType] = useState<'roadmap' | 'satellite'>('roadmap');
  const [lastClickedPoint, setLastClickedPoint] = useState<{ x: number; y: number } | null>(null);

  // Google Maps API Integration State (in-memory only; never persisted to storage)
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );
  const [showApiKeyInput, setShowApiKeyInput] = useState<boolean>(false);
  const [isGmapsLoaded, setIsGmapsLoaded] = useState<boolean>(false);

  // Simulation testing state
  const [simulatedTestMode, setSimulatedTestMode] = useState<'inside' | 'edge' | 'outside'>('inside');

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const googleMapInstanceRef = useRef<any>(null);

  // Dynamically load Google Maps JS SDK when API Key is provided
  React.useEffect(() => {
    if (!googleMapsApiKey.trim()) {
      setIsGmapsLoaded(false);
      return;
    }

    const scriptId = 'google-maps-js-sdk';
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    const onScriptLoad = () => {
      setIsGmapsLoaded(true);
    };

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey.trim()}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = onScriptLoad;
      script.onerror = () => {
        setIsGmapsLoaded(false);
      };
      document.head.appendChild(script);
    } else if ((window as any).google?.maps) {
      setIsGmapsLoaded(true);
    }
  }, [googleMapsApiKey]);

  // Render Real Google Maps Instance when SDK is ready
  React.useEffect(() => {
    if (!isGmapsLoaded || !mapContainerRef.current || !(window as any).google?.maps) return;

    try {
      const gmaps = (window as any).google.maps;
      
      const mapOptions = {
        center: { lat: centerLat, lng: centerLng },
        zoom: zoomLevel,
        mapTypeId: mapType === 'satellite' ? gmaps.MapTypeId.SATELLITE : gmaps.MapTypeId.ROADMAP,
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false
      };

      const map = new gmaps.Map(mapContainerRef.current, mapOptions);
      googleMapInstanceRef.current = map;

      // Drop Red Marker
      const marker = new gmaps.Marker({
        position: { lat: centerLat, lng: centerLng },
        map: map,
        draggable: isGeofenceAdmin,
        title: officeName,
        animation: gmaps.Animation.DROP
      });

      // Draw Radius Circle
      new gmaps.Circle({
        map: map,
        center: { lat: centerLat, lng: centerLng },
        radius: radiusMeters,
        fillColor: enabled ? '#3b82f6' : '#64748b',
        fillOpacity: 0.22,
        strokeColor: enabled ? '#2563eb' : '#475569',
        strokeWeight: 2,
      });

      // Map Click Event
      map.addListener('click', (e: any) => {
        if (!isGeofenceAdmin) return;
        const clickLat = parseFloat(e.latLng.lat().toFixed(6));
        const clickLng = parseFloat(e.latLng.lng().toFixed(6));
        setCenterLat(clickLat);
        setCenterLng(clickLng);
      });

      // Marker Drag Event
      marker.addListener('dragend', (e: any) => {
        if (!isGeofenceAdmin) return;
        const dragLat = parseFloat(e.latLng.lat().toFixed(6));
        const dragLng = parseFloat(e.latLng.lng().toFixed(6));
        setCenterLat(dragLat);
        setCenterLng(dragLng);
      });
    } catch (err) {
      console.error('Google Maps initialization error:', err);
    }
  }, [isGmapsLoaded, centerLat, centerLng, radiusMeters, mapType, enabled, isGeofenceAdmin, zoomLevel]);

  // Location Presets (Empty by default for manual entry)
  const locationPresets: Array<{ name: string; lat: number; lng: number; badge: string }> = [];

  const handleSelectPreset = (preset: { name: string; lat: number; lng: number; badge: string }) => {
    if (!isGeofenceAdmin) return;
    setCenterLat(preset.lat);
    setCenterLng(preset.lng);
    setOfficeName(preset.name);
  };

  const handleSearchLocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !isGeofenceAdmin) return;

    const queryLower = searchQuery.toLowerCase();
    
    // Check built-in preset query match
    const match = locationPresets.find(p => p.name.toLowerCase().includes(queryLower));
    if (match) {
      handleSelectPreset(match);
      setSearchQuery('');
      return;
    }

    // Geocoding simulation lookup for popular Indian & Global tech hubs
    if (queryLower.includes('chennai')) {
      setCenterLat(13.0827); setCenterLng(80.2707); setOfficeName('Chennai Office');
    } else if (queryLower.includes('bangalore') || queryLower.includes('bengaluru')) {
      setCenterLat(12.9716); setCenterLng(77.5946); setOfficeName('Bangalore IT Hub');
    } else if (queryLower.includes('mumbai')) {
      setCenterLat(19.0760); setCenterLng(72.8777); setOfficeName('Mumbai Regional Hub');
    } else if (queryLower.includes('delhi') || queryLower.includes('gurgaon')) {
      setCenterLat(28.6139); setCenterLng(77.2090); setOfficeName('NCR Office');
    } else if (queryLower.includes('hyderabad')) {
      setCenterLat(17.3850); setCenterLng(78.4867); setOfficeName('Hyderabad HITEC City');
    } else if (queryLower.includes('london')) {
      setCenterLat(51.5074); setCenterLng(-0.1278); setOfficeName('London Office');
    } else if (queryLower.includes('york')) {
      setCenterLat(40.7128); setCenterLng(-74.0060); setOfficeName('New York Tower');
    } else {
      // Offset slightly to demonstrate custom pin placement
      setCenterLat(parseFloat((centerLat + 0.005).toFixed(6)));
      setCenterLng(parseFloat((centerLng + 0.005).toFixed(6)));
      setOfficeName(searchQuery.trim());
    }

    setSearchQuery('');
  };

  // Interactive Map Click Handler (Drop Pin anywhere on map tile canvas)
  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isGeofenceAdmin) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Convert pixel delta to geographical coordinates
    const scaleFactor = 0.00008 * (16 / zoomLevel);
    const deltaLat = (centerY - clickY) * scaleFactor;
    const deltaLng = (clickX - centerX) * scaleFactor;

    const newLat = parseFloat((centerLat + deltaLat).toFixed(6));
    const newLng = parseFloat((centerLng + deltaLng).toFixed(6));

    setCenterLat(newLat);
    setCenterLng(newLng);
    setLastClickedPoint({ x: clickX, y: clickY });
  };

  // Compute test coordinates based on selected test mode
  const getTestCoordinates = (mode: 'inside' | 'edge' | 'outside') => {
    if (mode === 'inside') {
      return { lat: centerLat + 0.0003, lng: centerLng + 0.0002, label: 'Inside Office (35m)' };
    } else if (mode === 'edge') {
      return { lat: centerLat + 0.0016, lng: centerLng + 0.0010, label: 'Near Edge (185m)' };
    } else {
      return { lat: centerLat + 0.0055, lng: centerLng + 0.0040, label: 'Outside Office (650m)' };
    }
  };

  const testCoords = getTestCoordinates(simulatedTestMode);
  const calculatedDistance = calculateDistanceMeters(testCoords.lat, testCoords.lng, centerLat, centerLng);
  const isInsideBoundary = calculatedDistance <= radiusMeters;

  const handleSaveGeofence = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isGeofenceAdmin) return;

    updateGeofenceConfig({
      enabled,
      officeName,
      centerLat,
      centerLng,
      radiusMeters,
      enforceStrictly: enabled
    });

    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2500);

    if (onLocationSimulated) {
      onLocationSimulated({
        lat: testCoords.lat,
        lng: testCoords.lng,
        isInside: isInsideBoundary,
        distanceMeters: calculatedDistance
      });
    }
  };

  const handleFetchCurrentDeviceGPS = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setIsGettingGPS(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = parseFloat(position.coords.latitude.toFixed(6));
        const lng = parseFloat(position.coords.longitude.toFixed(6));
        setCenterLat(lat);
        setCenterLng(lng);
        setIsGettingGPS(false);
      },
      (error) => {
        console.error('GPS error:', error);
        setIsGettingGPS(false);
        alert('Could not fetch GPS position. Ensure location services are enabled in browser.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="card" style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-lg)' }}>
      
      {/* Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #2563eb, #8b5cf6)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
          }}>
            <MapPin size={24} />
          </div>
          <div>
            <h3 className="card-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
              Interactive Google Map Geofence Location Picker
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Click anywhere on the map or search addresses to set the office Lat/Lng pin. Set the attendance range limit in meters.
            </p>
          </div>
        </div>

        {/* Role Permission & Google Maps API Key Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.75rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => setShowApiKeyInput(prev => !prev)}
          >
            <Key size={14} color="#f59e0b" />
            <span>{isGmapsLoaded ? '🟢 Live Google Maps Active' : '🔑 Connect Google Maps API'}</span>
          </button>

          <span className="status-pill present" style={{ fontSize: '0.75rem' }}>
            <Unlock size={12} /> Configurable by {currentUser.role}
          </span>
        </div>
      </div>

      {/* Google Maps API Key Configuration Panel */}
      {showApiKeyInput && (
        <div style={{
          marginBottom: '16px',
          padding: '14px 16px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: '#f0f9ff',
          border: '1px solid #bae6fd'
        }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0369a1', marginBottom: '4px' }}>
            🔑 Live Google Maps JavaScript API Key Config
          </div>
          <p style={{ fontSize: '0.78rem', color: '#0284c7', marginBottom: '10px' }}>
            Enter your Google Maps JavaScript API Key below (or set <code>VITE_GOOGLE_MAPS_API_KEY</code> in <code>.env</code>) to render live satellite tiles and Places autocomplete.
          </p>

          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="password"
              className="form-control"
              value={googleMapsApiKey}
              onChange={e => {
                setGoogleMapsApiKey(e.target.value);
              }}
              placeholder="Paste your Google Maps API Key (e.g. AIzaSy...)"
              style={{ fontSize: '0.82rem' }}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setShowApiKeyInput(false);
              }}
            >
              Save Key & Load Live Map
            </button>
          </div>
        </div>
      )}

      {saveToast && (
        <div style={{
          marginBottom: '16px',
          padding: '12px 16px',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: '#ecfdf5',
          border: '1px solid #10b981',
          color: '#065f46',
          fontSize: '0.88rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={18} /> Google Map Pin location & {radiusMeters}m Geofence boundary saved successfully!
        </div>
      )}

      {/* SEARCH BAR & PRESET LOCATION CHIPS */}
      <div style={{ marginBottom: '20px' }}>
        <form onSubmit={handleSearchLocation} style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="text"
              className="form-control"
              value={searchQuery}
              disabled={!isGeofenceAdmin}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search address, landmark, city (e.g. Chennai, Bangalore, San Francisco, London)..."
              style={{ paddingLeft: '38px', borderRadius: '10px' }}
            />
            <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          </div>

          <button
            type="submit"
            disabled={!isGeofenceAdmin}
            className="btn btn-primary btn-sm"
            style={{ padding: '0 20px', borderRadius: '10px' }}
          >
            <Search size={16} /> Search Map
          </button>
        </form>

        {/* Location Preset Chips */}
        {locationPresets.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>Quick Office Locations:</span>
            {locationPresets.map((preset) => (
              <button
                type="button"
                key={preset.name}
                disabled={!isGeofenceAdmin}
                onClick={() => handleSelectPreset(preset)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '99px',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  border: centerLat === preset.lat ? '2px solid #2563eb' : '1px solid var(--border-light)',
                  backgroundColor: centerLat === preset.lat ? '#eff6ff' : '#f8fafc',
                  color: centerLat === preset.lat ? '#1e40af' : 'var(--text-secondary)',
                  cursor: isGeofenceAdmin ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Globe size={12} /> {preset.name} ({preset.badge})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* MAIN GRID: Interactive Map Canvas (Left) vs Controls & Tester (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
        
        {/* LEFT COLUMN: Interactive Map Canvas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
              Interactive Location Pin Picker
            </span>

            {/* Map Mode & Zoom Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                onClick={() => setMapType(mapType === 'roadmap' ? 'satellite' : 'roadmap')}
              >
                <Layers size={12} /> {mapType === 'roadmap' ? 'Satellite View' : 'Roadmap View'}
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ padding: '2px 8px' }}
                onClick={() => setZoomLevel(prev => Math.min(18, prev + 1))}
                title="Zoom In"
              >
                <ZoomIn size={14} />
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ padding: '2px 8px' }}
                onClick={() => setZoomLevel(prev => Math.max(12, prev - 1))}
                title="Zoom Out"
              >
                <ZoomOut size={14} />
              </button>
            </div>
          </div>

          {/* Map Tile Visualizer Box */}
          <div 
            ref={mapContainerRef}
            onClick={handleMapClick}
            style={{
              height: '320px',
              borderRadius: 'var(--radius-md)',
              position: 'relative',
              overflow: 'hidden',
              cursor: isGeofenceAdmin ? 'crosshair' : 'default',
              boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)',
              border: '2px solid var(--border-medium)',
              backgroundColor: mapType === 'satellite' ? '#0f172a' : '#e2e8f0',
              backgroundImage: mapType === 'satellite' 
                ? 'radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px)' 
                : 'radial-gradient(#cbd5e1 1px, transparent 1px)',
              backgroundSize: '20px 20px'
            }}
          >
            {/* Click-to-Pin Instruction Overlay Badge */}
            <div style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              zIndex: 20,
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              padding: '6px 12px',
              borderRadius: '99px',
              fontSize: '0.72rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <Target size={14} color="#38bdf8" />
              <span>{isGeofenceAdmin ? 'Click anywhere on map to drop Office Pin' : 'Geofence Active'}</span>
            </div>

            {/* Scale indicator */}
            <div style={{
              position: 'absolute',
              bottom: '12px',
              left: '12px',
              zIndex: 20,
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              color: '#cbd5e1',
              padding: '3px 8px',
              borderRadius: '6px',
              fontSize: '0.68rem',
              fontWeight: 600
            }}>
              Zoom: {zoomLevel}x • Lat: {centerLat}, Lng: {centerLng}
            </div>

            {/* DYNAMIC GEOFENCE CIRCLE OVERLAY */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: `${Math.min(260, Math.max(90, radiusMeters * 0.55))}px`,
              height: `${Math.min(260, Math.max(90, radiusMeters * 0.55))}px`,
              borderRadius: '999px',
              border: `2px dashed ${enabled ? '#3b82f6' : '#64748b'}`,
              backgroundColor: enabled ? 'rgba(59, 130, 246, 0.2)' : 'rgba(100, 116, 139, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              transition: 'all 0.25s ease'
            }}>
              <div style={{
                fontSize: '0.7rem',
                fontWeight: 800,
                color: '#60a5fa',
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                padding: '3px 10px',
                borderRadius: '99px',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                textAlign: 'center'
              }}>
                {officeName} ({radiusMeters}m Zone)
              </div>
            </div>

            {/* CENTER GOOGLE MAP STYLE RED PIN MARKER */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -100%)',
              pointerEvents: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              zIndex: 30
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50% 50% 50% 0',
                background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                transform: 'rotate(-45deg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.6)'
              }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ffffff', transform: 'rotate(45deg)' }} />
              </div>
              <div style={{
                width: '12px',
                height: '4px',
                backgroundColor: 'rgba(0,0,0,0.4)',
                borderRadius: '50%',
                marginTop: '2px'
              }} />
            </div>

            {/* TEST SIMULATION PINS ON MAP */}
            {simulatedTestMode === 'inside' && (
              <div style={{
                position: 'absolute',
                top: '46%',
                left: '54%',
                backgroundColor: '#10b981',
                color: 'white',
                padding: '3px 8px',
                borderRadius: '99px',
                fontSize: '0.68rem',
                fontWeight: 700,
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                zIndex: 25
              }}>
                <CheckCircle2 size={12} /> Staff (Inside: 35m)
              </div>
            )}

            {simulatedTestMode === 'outside' && (
              <div style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                backgroundColor: '#f43f5e',
                color: 'white',
                padding: '3px 8px',
                borderRadius: '99px',
                fontSize: '0.68rem',
                fontWeight: 700,
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                zIndex: 25
              }}>
                <XCircle size={12} /> Staff (Outside: 650m)
              </div>
            )}
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            💡 Tip: Click anywhere on the map above to move the Office Pin marker to that exact location.
          </div>
        </div>

        {/* RIGHT COLUMN: Parameters Form & Range Tester */}
        <form onSubmit={handleSaveGeofence} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Master Enable/Disable Toggle */}
          <div style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: enabled ? '#eff6ff' : '#f8fafc',
            border: `1px solid ${enabled ? '#bfdbfe' : '#e2e8f0'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: enabled ? '#1e40af' : '#475569' }}>
                Enforce Map Geofence Attendance Limit
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Restrict attendance marking strictly within range radius
              </div>
            </div>

            <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', cursor: isGeofenceAdmin ? 'pointer' : 'not-allowed' }}>
              <input 
                type="checkbox" 
                checked={enabled} 
                disabled={!isGeofenceAdmin}
                onChange={e => setEnabled(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute', cursor: isGeofenceAdmin ? 'pointer' : 'not-allowed', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: enabled ? '#2563eb' : '#cbd5e1',
                borderRadius: '24px', transition: '0.3s'
              }}>
                <span style={{
                  position: 'absolute', content: '""', height: '18px', width: '18px', left: enabled ? '22px' : '3px', bottom: '3px',
                  backgroundColor: 'white', borderRadius: '50%', transition: '0.3s'
                }} />
              </span>
            </label>
          </div>

          {/* Office Location Name */}
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Designated Office Name</label>
            <input 
              className="form-control"
              type="text"
              value={officeName}
              disabled={!isGeofenceAdmin}
              onChange={e => setOfficeName(e.target.value)}
              placeholder="e.g. HQ Main Office"
            />
          </div>

          {/* Range Radius Slider in Meters */}
          <div className="form-group" style={{ 
            backgroundColor: isGeofenceAdmin ? '#f8fafc' : '#fffbeb', 
            padding: '14px', 
            borderRadius: 'var(--radius-md)', 
            border: `1px solid ${isGeofenceAdmin ? 'var(--border-light)' : '#fde68a'}` 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label className="form-label" style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700 }}>
                Attendance Range Limit (Super Admin & HR Only):
              </label>
              <span style={{
                fontSize: '0.88rem',
                fontWeight: 800,
                color: isGeofenceAdmin ? '#2563eb' : '#b45309',
                backgroundColor: isGeofenceAdmin ? '#dbeafe' : '#fef3c7',
                padding: '2px 10px',
                borderRadius: '99px'
              }}>
                {radiusMeters} Meters
              </span>
            </div>

            <input 
              type="range" 
              min={50} 
              max={1500} 
              step={25}
              value={radiusMeters}
              disabled={!isGeofenceAdmin}
              onChange={e => setRadiusMeters(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: '#2563eb', cursor: isGeofenceAdmin ? 'pointer' : 'not-allowed' }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px' }}>
              <span>50m (Building)</span>
              <span>200m (Campus)</span>
              <span>500m (Zone)</span>
              <span>1500m (City)</span>
            </div>
          </div>

          {/* Lat & Lng Coordinate Controls */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.78rem' }}>Pin Latitude</label>
              <input 
                className="form-control"
                type="number"
                step="any"
                value={centerLat}
                disabled={!isGeofenceAdmin}
                onChange={e => setCenterLat(parseFloat(e.target.value) || 0)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.78rem' }}>Pin Longitude</label>
              <input 
                className="form-control"
                type="number"
                step="any"
                value={centerLng}
                disabled={!isGeofenceAdmin}
                onChange={e => setCenterLng(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Action Buttons */}
          {isGeofenceAdmin ? (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                type="button" 
                className="btn btn-secondary btn-sm"
                onClick={handleFetchCurrentDeviceGPS}
                disabled={isGettingGPS}
                style={{ flex: 1 }}
              >
                {isGettingGPS ? <RefreshCw size={14} className="spin" /> : <Navigation size={14} />}
                <span>Set Current GPS</span>
              </button>

              <button 
                type="submit" 
                className="btn btn-primary btn-sm"
                style={{ flex: 1 }}
              >
                <Check size={16} />
                <span>Save Boundary</span>
              </button>
            </div>
          ) : (
            <div style={{
              padding: '10px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              color: '#92400e',
              fontSize: '0.78rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Info size={16} />
              <span>Only <strong>Super Admin</strong> or <strong>HR Admin</strong> can alter Map Geofence coordinates.</span>
            </div>
          )}

          {/* Test Range Tester Bar */}
          <div style={{
            padding: '12px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: '#f8fafc',
            border: '1px solid var(--border-light)',
            marginTop: 'auto'
          }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
              Test Attendance Range Validation:
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '10px' }}>
              <button
                type="button"
                onClick={() => setSimulatedTestMode('inside')}
                style={{
                  padding: '6px',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  border: simulatedTestMode === 'inside' ? '2px solid #10b981' : '1px solid var(--border-light)',
                  backgroundColor: simulatedTestMode === 'inside' ? '#ecfdf5' : '#ffffff',
                  color: simulatedTestMode === 'inside' ? '#065f46' : 'var(--text-secondary)'
                }}
              >
                🏢 Inside (35m)
              </button>

              <button
                type="button"
                onClick={() => setSimulatedTestMode('edge')}
                style={{
                  padding: '6px',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  border: simulatedTestMode === 'edge' ? '2px solid #3b82f6' : '1px solid var(--border-light)',
                  backgroundColor: simulatedTestMode === 'edge' ? '#eff6ff' : '#ffffff',
                  color: simulatedTestMode === 'edge' ? '#1e40af' : 'var(--text-secondary)'
                }}
              >
                🚶 Edge (185m)
              </button>

              <button
                type="button"
                onClick={() => setSimulatedTestMode('outside')}
                style={{
                  padding: '6px',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  border: simulatedTestMode === 'outside' ? '2px solid #f43f5e' : '1px solid var(--border-light)',
                  backgroundColor: simulatedTestMode === 'outside' ? '#fff1f2' : '#ffffff',
                  color: simulatedTestMode === 'outside' ? '#9f1239' : 'var(--text-secondary)'
                }}
              >
                🚗 Outside (650m)
              </button>
            </div>

            <div style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: isInsideBoundary ? '#ecfdf5' : '#fff1f2',
              border: `1px solid ${isInsideBoundary ? '#10b981' : '#f43f5e'}`,
              color: isInsideBoundary ? '#065f46' : '#9f1239',
              fontSize: '0.8rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isInsideBoundary ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                {isInsideBoundary ? 'Attendance PERMITTED' : 'Attendance BLOCKED'}
              </span>
              <span style={{ fontSize: '0.72rem' }}>
                {calculatedDistance}m / Limit {radiusMeters}m
              </span>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
};
