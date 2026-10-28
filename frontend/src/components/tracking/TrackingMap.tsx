import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Play, Pause, RotateCcw, FastForward, Navigation2, MapPin, Gauge, ShieldCheck, AlertCircle } from 'lucide-react';
import { loadGoogleMaps, getStoredGoogleMapsApiKey } from '../../services/googleMapsLoader';
import { LocationPoint, FieldVisitDistanceSegment, FieldVisitStop } from '../../types/tracking';
import { formatKm } from '../../services/trackingEngine';

export interface MapMarkerItem {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  avatar?: string;
  badge?: string;
  badgeColor?: string;
  popupHtml?: string;
  iconType?: 'employee' | 'start' | 'end' | 'site' | 'pin';
  heading?: number;
  speed?: number;
  accuracy?: number;
  recordedAt?: string;
  pulse?: boolean;
}

export interface TrackingMapProps {
  center: [number, number];
  zoom?: number;
  height?: string | number;
  markers?: MapMarkerItem[];
  routePoints?: [number, number][];
  detailedPoints?: LocationPoint[];
  segments?: FieldVisitDistanceSegment[];
  stops?: FieldVisitStop[];
  circle?: {
    lat: number;
    lng: number;
    radiusMeters: number;
    color?: string;
    fillColor?: string;
  };
  clickable?: boolean;
  onMapClick?: (lat: number, lng: number) => void;
  interactive?: boolean;
  showPlaybackControls?: boolean;
  className?: string;
  onPlaybackProgress?: (currentPoint: LocationPoint, index: number) => void;
}

export const TrackingMap: React.FC<TrackingMapProps> = ({
  center,
  zoom = 13,
  height = '420px',
  markers = [],
  routePoints = [],
  detailedPoints = [],
  segments = [],
  stops = [],
  circle,
  clickable = false,
  onMapClick,
  showPlaybackControls = false,
  className = '',
  onPlaybackProgress,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Engine state: 'google' | 'leaflet' (Leaflet with OpenStreetMap is 100% free default)
  const [engine, setEngine] = useState<'google' | 'leaflet'>('leaflet');
  const [googleMapsReady, setGoogleMapsReady] = useState<boolean>(false);
  const [tileStyle, setTileStyle] = useState<'osm_standard' | 'esri_streets'>('osm_standard');

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackIndex, setPlaybackIndex] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1); // 1x, 2x, 5x, 10x
  const currentPlaybackPoint = detailedPoints[playbackIndex];

  // Leaflet refs
  const leafletMapRef = useRef<L.Map | null>(null);
  const leafletLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const leafletTileLayerRef = useRef<L.TileLayer | null>(null);
  const leafletPlaybackMarkerRef = useRef<L.Marker | null>(null);

  // Google Maps refs
  const googleMapRef = useRef<any>(null);
  const googleOverlaysRef = useRef<any[]>([]);
  const googlePlaybackMarkerRef = useRef<any>(null);

  // Check Google Maps availability on mount (fallback to free Leaflet/OSM by default)
  useEffect(() => {
    const apiKey = getStoredGoogleMapsApiKey();
    if (apiKey) {
      loadGoogleMaps(apiKey)
        .then(() => {
          setEngine('google');
          setGoogleMapsReady(true);
        })
        .catch((err) => {
          console.warn('[TrackingMap] Falling back to Leaflet/OSM:', err.message);
          setEngine('leaflet');
        });
    } else {
      setEngine('leaflet');
    }
  }, []);

  // --------------------------------------------------------------------------
  // LEAFLET MAP INITIALIZATION & RENDERING (100% FREE OPEN-SOURCE)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (engine !== 'leaflet' || !containerRef.current) return;

    // Clean any prior map
    if (leafletMapRef.current) {
      leafletMapRef.current.remove();
      leafletMapRef.current = null;
    }

    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: true,
      attributionControl: true,
    });

    const isEsri = tileStyle === 'esri_streets';
    const tileUrl = isEsri
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    const tileAttr = isEsri
      ? 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, METI, TomTom'
      : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

    const tileLayer = L.tileLayer(tileUrl, {
      maxZoom: 19,
      subdomains: isEsri ? ['server', 'services'] : 'abc',
      attribution: tileAttr,
    }).addTo(map);

    leafletTileLayerRef.current = tileLayer;

    const layerGroup = L.layerGroup().addTo(map);
    leafletLayerGroupRef.current = layerGroup;
    leafletMapRef.current = map;

    if (clickable && onMapClick) {
      map.on('click', (e: L.LeafletMouseEvent) => {
        onMapClick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
      });
    }

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        leafletLayerGroupRef.current = null;
        leafletPlaybackMarkerRef.current = null;
      }
    };
  }, [engine, tileStyle]);

  // Leaflet update layers
  useEffect(() => {
    if (engine !== 'leaflet' || !leafletMapRef.current || !leafletLayerGroupRef.current) return;

    leafletLayerGroupRef.current.clearLayers();

    // 1. Draw Segments (distinguishing recorded vs gaps)
    if (segments.length > 0) {
      segments.forEach((seg) => {
        const isGap = seg.segmentType === 'unverified_gap';
        const polyline = L.polyline(
          [
            [seg.startLat, seg.startLng],
            [seg.endLat, seg.endLng],
          ],
          {
            color: isGap ? '#94A3B8' : '#0E7490',
            weight: isGap ? 3 : 5,
            dashArray: isGap ? '6, 8' : undefined,
            opacity: isGap ? 0.75 : 0.9,
            lineJoin: 'round',
            lineCap: 'round',
          }
        );
        leafletLayerGroupRef.current?.addLayer(polyline);
      });
    } else if (routePoints && routePoints.length > 1) {
      // Glow line behind
      const polylineGlow = L.polyline(routePoints, {
        color: '#38BDF8',
        weight: 8,
        opacity: 0.25,
      });
      leafletLayerGroupRef.current.addLayer(polylineGlow);

      const polyline = L.polyline(routePoints, {
        color: '#0E7490',
        weight: 5,
        opacity: 0.88,
        lineJoin: 'round',
        lineCap: 'round',
      });
      leafletLayerGroupRef.current.addLayer(polyline);
    }

    // 2. Geofence Circle
    if (circle && circle.lat && circle.lng && circle.radiusMeters > 0) {
      const circleLayer = L.circle([circle.lat, circle.lng], {
        radius: circle.radiusMeters,
        color: circle.color || '#0E7490',
        fillColor: circle.fillColor || '#CFFAFE',
        fillOpacity: 0.2,
        weight: 2,
        dashArray: '4, 4',
      });
      leafletLayerGroupRef.current.addLayer(circleLayer);
    }

    // 3. Markers
    markers.forEach((m) => {
      let iconHtml = '';
      let iconSize: [number, number] = [36, 44];
      let iconAnchor: [number, number] = [18, 44];

      if (m.iconType === 'start') {
        iconHtml = `
          <div style="position: relative; width: 30px; height: 38px; transform: translate(-15px, -38px);">
            <div style="background: #10B981; color: white; font-weight: 800; font-size: 12px; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(16, 185, 129, 0.4); border: 2.5px solid #FFFFFF;">
              A
            </div>
            <div style="position: absolute; bottom: 2px; left: 15px; width: 3px; height: 8px; background: #10B981; transform: translateX(-50%);"></div>
          </div>
        `;
        iconSize = [30, 38];
        iconAnchor = [15, 38];
      } else if (m.iconType === 'end') {
        iconHtml = `
          <div style="position: relative; width: 30px; height: 38px; transform: translate(-15px, -38px);">
            <div style="background: #EF4444; color: white; font-weight: 800; font-size: 12px; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(239, 68, 68, 0.4); border: 2.5px solid #FFFFFF;">
              B
            </div>
            <div style="position: absolute; bottom: 2px; left: 15px; width: 3px; height: 8px; background: #EF4444; transform: translateX(-50%);"></div>
          </div>
        `;
        iconSize = [30, 38];
        iconAnchor = [15, 38];
      } else if (m.iconType === 'site') {
        iconHtml = `
          <div style="position: relative; width: 34px; height: 44px; transform: translate(-17px, -44px);">
            <svg viewBox="0 0 384 512" width="34" height="44" style="filter: drop-shadow(0 4px 8px rgba(0,0,0,0.35));">
              <path fill="#F39C12" d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z"/>
              <circle cx="192" cy="192" r="74" fill="#FFFFFF" />
              <circle cx="192" cy="192" r="46" fill="#D97706" />
            </svg>
          </div>
        `;
      } else {
        // Employee Live Pin with Heading Arrow
        const pulseEffect = m.pulse !== false ? `
          <div style="position: absolute; inset: -6px; border-radius: 50%; background: rgba(14, 116, 144, 0.25); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        ` : '';

        const headingDegree = m.heading !== undefined ? m.heading : 0;
        const headingArrow = m.heading !== undefined ? `
          <div style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%) rotate(${headingDegree}deg); width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-bottom: 8px solid #0E7490;"></div>
        ` : '';

        const avatarImg = m.avatar
          ? `<img src="${m.avatar}" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover;" />`
          : `<div style="width: 34px; height: 34px; border-radius: 50%; background: #0E7490; color: #FFFFFF; font-weight: 800; font-size: 13px; display: flex; align-items: center; justify-content: center;">${(m.title || 'U').charAt(0)}</div>`;

        iconHtml = `
          <div style="position: relative; width: 42px; height: 50px; transform: translate(-21px, -50px); cursor: pointer;">
            ${pulseEffect}
            ${headingArrow}
            <div style="position: relative; width: 40px; height: 40px; border-radius: 50%; background: #FFFFFF; box-shadow: 0 4px 14px rgba(14, 116, 144, 0.45); border: 2.5px solid #0E7490; display: flex; align-items: center; justify-content: center; z-index: 2;">
              ${avatarImg}
            </div>
            <div style="position: absolute; bottom: 2px; left: 21px; width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 10px solid #0E7490; transform: translateX(-50%);"></div>
          </div>
        `;
        iconSize = [42, 50];
        iconAnchor = [21, 50];
      }

      const customIcon = L.divIcon({
        className: 'vrm-tracking-map-marker',
        html: iconHtml,
        iconSize,
        iconAnchor,
      });

      const marker = L.marker([m.lat, m.lng], { icon: customIcon });
      if (m.popupHtml) {
        marker.bindPopup(m.popupHtml, { closeButton: false, offset: [0, -32] });
      }
      leafletLayerGroupRef.current?.addLayer(marker);
    });

    // 4. Stops (Numbered circular pins with dwell time tooltips)
    stops.forEach((st, idx) => {
      const stopHtml = `
        <div style="position: relative; width: 28px; height: 36px; transform: translate(-14px, -36px); cursor: pointer;">
          <div style="background: #F59E0B; color: #FFFFFF; font-weight: 800; font-size: 11px; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2.5px solid #FFFFFF; box-shadow: 0 4px 10px rgba(245, 158, 11, 0.45);">
            ${idx + 1}
          </div>
          <div style="position: absolute; bottom: 0; left: 14px; width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 8px solid #F59E0B; transform: translateX(-50%);"></div>
        </div>
      `;
      const stopIcon = L.divIcon({
        className: 'vrm-stop-marker',
        html: stopHtml,
        iconSize: [28, 36],
        iconAnchor: [14, 36],
      });
      const stopMarker = L.marker([st.latitude, st.longitude], { icon: stopIcon });
      const durationMins = Math.round((st.durationSeconds || 0) / 60);
      stopMarker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; padding: 4px;">
          <strong style="color: #0E7490;">Stop #${idx + 1}: ${st.stopType}</strong><br/>
          <span style="color: #475569;">${st.address || 'En-Route Location'}</span><br/>
          <span style="color: #64748B; font-size: 11px;">Dwell Time: ${durationMins} mins</span>
        </div>
      `);
      leafletLayerGroupRef.current?.addLayer(stopMarker);
    });

    // Auto fit bounds
    if (routePoints.length > 1 && leafletMapRef.current) {
      leafletMapRef.current.fitBounds(L.latLngBounds(routePoints), { padding: [40, 40], maxZoom: 15 });
    }
  }, [engine, markers, routePoints, segments, stops, circle]);

  // Leaflet Playback vehicle marker update & auto-pan
  useEffect(() => {
    if (engine !== 'leaflet' || !leafletMapRef.current || !currentPlaybackPoint) return;

    const latlng: [number, number] = [currentPlaybackPoint.latitude, currentPlaybackPoint.longitude];
    const heading = currentPlaybackPoint.heading || 0;
    const speed = Math.round(currentPlaybackPoint.speed || 0);

    const playbackIconHtml = `
      <div style="position: relative; width: 44px; height: 44px; transform: translate(-22px, -22px);">
        <div style="position: absolute; inset: -6px; border-radius: 50%; background: rgba(14, 116, 144, 0.35); animation: ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        <div style="position: absolute; top: -12px; left: 50%; transform: translateX(-50%) rotate(${heading}deg); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 10px solid #0E7490;"></div>
        <div style="width: 40px; height: 40px; border-radius: 50%; background: #0E7490; color: #FFFFFF; border: 3px solid #FFFFFF; box-shadow: 0 4px 14px rgba(14, 116, 144, 0.6); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800;">
          ${speed}k
        </div>
      </div>
    `;

    const customIcon = L.divIcon({
      className: 'vrm-leaflet-playback-pin',
      html: playbackIconHtml,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });

    if (!leafletPlaybackMarkerRef.current) {
      leafletPlaybackMarkerRef.current = L.marker(latlng, { icon: customIcon, zIndexOffset: 1000 }).addTo(leafletMapRef.current);
    } else {
      leafletPlaybackMarkerRef.current.setLatLng(latlng);
      leafletPlaybackMarkerRef.current.setIcon(customIcon);
    }

    if (isPlaying) {
      leafletMapRef.current.panTo(latlng, { animate: true, duration: 0.4 });
    }
  }, [engine, currentPlaybackPoint, isPlaying]);

  // --------------------------------------------------------------------------
  // GOOGLE MAPS INITIALIZATION & RENDERING
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (engine !== 'google' || !googleMapsReady || !containerRef.current) return;

    const gMaps = window.google?.maps;
    if (!gMaps) return;

    if (!googleMapRef.current) {
      const map = new gMaps.Map(containerRef.current, {
        center: { lat: center[0], lng: center[1] },
        zoom,
        disableDefaultUI: false,
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        styles: [
          { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
        ],
      });

      googleMapRef.current = map;

      if (clickable && onMapClick) {
        map.addListener('click', (e: any) => {
          onMapClick(Number(e.latLng.lat().toFixed(6)), Number(e.latLng.lng().toFixed(6)));
        });
      }
    }
  }, [engine, googleMapsReady]);

  // Google Maps dynamic layers redraw
  useEffect(() => {
    if (engine !== 'google' || !googleMapRef.current || !window.google?.maps) return;
    const gMaps = window.google.maps;

    // Clear previous overlays
    googleOverlaysRef.current.forEach((o) => {
      if (typeof o.setMap === 'function') o.setMap(null);
    });
    googleOverlaysRef.current = [];

    const bounds = new gMaps.LatLngBounds();

    // 1. Draw Segments (recorded vs gap)
    if (segments.length > 0) {
      segments.forEach((seg) => {
        const isGap = seg.segmentType === 'unverified_gap';
        const path = [
          { lat: seg.startLat, lng: seg.startLng },
          { lat: seg.endLat, lng: seg.endLng },
        ];

        const line = new gMaps.Polyline({
          path,
          geodesic: true,
          strokeColor: isGap ? '#94A3B8' : '#0E7490',
          strokeOpacity: isGap ? 0.75 : 0.9,
          strokeWeight: isGap ? 3 : 5,
          map: googleMapRef.current,
        });
        googleOverlaysRef.current.push(line);
        bounds.extend(path[0]);
        bounds.extend(path[1]);
      });
    } else if (routePoints.length > 1) {
      const path = routePoints.map(([lat, lng]) => ({ lat, lng }));

      // Glow polyline
      const glow = new gMaps.Polyline({
        path,
        geodesic: true,
        strokeColor: '#38BDF8',
        strokeOpacity: 0.3,
        strokeWeight: 9,
        map: googleMapRef.current,
      });
      googleOverlaysRef.current.push(glow);

      // Main polyline
      const line = new gMaps.Polyline({
        path,
        geodesic: true,
        strokeColor: '#0E7490',
        strokeOpacity: 0.9,
        strokeWeight: 5,
        map: googleMapRef.current,
      });
      googleOverlaysRef.current.push(line);

      path.forEach((p) => bounds.extend(p));
    }

    // 2. Geofence Circle
    if (circle && circle.lat && circle.lng && circle.radiusMeters > 0) {
      const gCircle = new gMaps.Circle({
        strokeColor: circle.color || '#0E7490',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: circle.fillColor || '#CFFAFE',
        fillOpacity: 0.22,
        map: googleMapRef.current,
        center: { lat: circle.lat, lng: circle.lng },
        radius: circle.radiusMeters,
      });
      googleOverlaysRef.current.push(gCircle);
    }

    // 3. Markers
    markers.forEach((m) => {
      const pos = { lat: m.lat, lng: m.lng };
      bounds.extend(pos);

      let markerIcon: any = null;
      if (m.iconType === 'start') {
        markerIcon = {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 30 38">
              <circle cx="15" cy="15" r="13" fill="#10B981" stroke="#FFFFFF" stroke-width="2.5"/>
              <text x="15" y="19" font-size="12" font-family="Arial" font-weight="bold" fill="#FFFFFF" text-anchor="middle">A</text>
              <rect x="13.5" y="27" width="3" height="9" fill="#10B981"/>
            </svg>
          `),
          anchor: new gMaps.Point(15, 38),
        };
      } else if (m.iconType === 'end') {
        markerIcon = {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 30 38">
              <circle cx="15" cy="15" r="13" fill="#EF4444" stroke="#FFFFFF" stroke-width="2.5"/>
              <text x="15" y="19" font-size="12" font-family="Arial" font-weight="bold" fill="#FFFFFF" text-anchor="middle">B</text>
              <rect x="13.5" y="27" width="3" height="9" fill="#EF4444"/>
            </svg>
          `),
          anchor: new gMaps.Point(15, 38),
        };
      } else if (m.iconType === 'site') {
        markerIcon = {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42">
              <path fill="#F39C12" d="M17 0 C7.6 0 0 7.6 0 17 C0 27 17 42 17 42 C17 42 34 27 34 17 C34 7.6 26.4 0 17 0 Z"/>
              <circle cx="17" cy="17" r="7" fill="#FFFFFF"/>
            </svg>
          `),
          anchor: new gMaps.Point(17, 42),
        };
      } else {
        // Employee Live Pin
        markerIcon = {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
              <circle cx="18" cy="18" r="15" fill="#0E7490" stroke="#FFFFFF" stroke-width="2.5"/>
              <text x="18" y="22" font-size="13" font-family="Arial" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${(m.title || 'U').charAt(0)}</text>
              <polygon points="12,31 24,31 18,42" fill="#0E7490"/>
            </svg>
          `),
          anchor: new gMaps.Point(18, 44),
        };
      }

      const gMarker = new gMaps.Marker({
        position: pos,
        map: googleMapRef.current,
        title: m.title,
        icon: markerIcon,
      });

      if (m.popupHtml) {
        const infoWindow = new gMaps.InfoWindow({
          content: m.popupHtml,
          pixelOffset: new gMaps.Size(0, -36),
        });
        gMarker.addListener('click', () => {
          infoWindow.open(googleMapRef.current, gMarker);
        });
      }

      googleOverlaysRef.current.push(gMarker);
    });

    if (routePoints.length > 1) {
      googleMapRef.current.fitBounds(bounds, 40);
    }
  }, [engine, markers, routePoints, segments, circle]);

  // --------------------------------------------------------------------------
  // ROUTE PLAYBACK ENGINE
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!isPlaying || detailedPoints.length < 2) return;

    const timer = setInterval(() => {
      setPlaybackIndex((prev) => {
        const next = prev + 1;
        if (next >= detailedPoints.length) {
          setIsPlaying(false);
          return 0;
        }
        if (onPlaybackProgress) {
          onPlaybackProgress(detailedPoints[next], next);
        }
        return next;
      });
    }, Math.max(100, Math.round(1000 / playbackSpeed)));

    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, detailedPoints.length]);

  return (
    <div style={{ position: 'relative', width: '100%', height: typeof height === 'number' ? `${height}px` : height }}>
      {/* Map Element */}
      <div
        ref={containerRef}
        className={`tracking-map-container ${className}`}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid var(--color-border, #E7ECF3)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          position: 'relative',
          zIndex: 1,
        }}
      />

      {/* Map Engine Badge (Top Left) */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          zIndex: 10,
          backgroundColor: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(6px)',
          borderRadius: '9999px',
          padding: '5px 12px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          fontSize: '0.74rem',
          fontWeight: 700,
          color: '#0E7490',
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#10B981',
            boxShadow: '0 0 0 2px rgba(16, 185, 129, 0.25)',
          }}
        />
        <span>OpenStreetMap Engine (Zero Paid APIs)</span>
      </div>

      {/* Tile Switcher (Top Right) */}
      {engine === 'leaflet' && (
        <div
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            zIndex: 10,
            display: 'flex',
            backgroundColor: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(6px)',
            borderRadius: '10px',
            padding: '3px',
            border: '1px solid #CBD5E1',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            gap: '3px',
          }}
        >
          <button
            type="button"
            onClick={() => setTileStyle('osm_standard')}
            style={{
              padding: '4px 10px',
              borderRadius: '7px',
              border: 'none',
              fontSize: '0.7rem',
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor: tileStyle === 'osm_standard' ? '#0E7490' : 'transparent',
              color: tileStyle === 'osm_standard' ? '#FFFFFF' : '#64748B',
              transition: 'all 0.15s ease',
            }}
          >
            Standard OSM
          </button>
          <button
            type="button"
            onClick={() => setTileStyle('esri_streets')}
            style={{
              padding: '4px 10px',
              borderRadius: '7px',
              border: 'none',
              fontSize: '0.7rem',
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor: tileStyle === 'esri_streets' ? '#0E7490' : 'transparent',
              color: tileStyle === 'esri_streets' ? '#FFFFFF' : '#64748B',
              transition: 'all 0.15s ease',
            }}
          >
            Clean Streets (Esri)
          </button>
        </div>
      )}

      {/* Playback Controls Strip (Bottom Center) */}
      {showPlaybackControls && detailedPoints.length > 1 && (
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            backgroundColor: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(8px)',
            borderRadius: '16px',
            padding: '10px 18px',
            border: '1px solid #CBD5E1',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            maxWidth: '92%',
          }}
        >
          {/* Play/Pause */}
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: '#0E7490',
              color: '#FFFFFF',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(14, 116, 144, 0.35)',
            }}
            title={isPlaying ? 'Pause Playback' : 'Play Route'}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: '2px' }} />}
          </button>

          {/* Reset */}
          <button
            type="button"
            onClick={() => {
              setIsPlaying(false);
              setPlaybackIndex(0);
            }}
            style={{
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '8px',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#475569',
            }}
            title="Reset to Start"
          >
            <RotateCcw size={14} />
          </button>

          {/* Scrubber slider */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '180px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
              <span>Point {playbackIndex + 1} of {detailedPoints.length}</span>
              <span>
                {currentPlaybackPoint?.recordedAt
                  ? new Date(currentPlaybackPoint.recordedAt).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: true,
                    })
                  : ''}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={detailedPoints.length - 1}
              value={playbackIndex}
              onChange={(e) => {
                const idx = Number(e.target.value);
                setPlaybackIndex(idx);
                if (onPlaybackProgress) onPlaybackProgress(detailedPoints[idx], idx);
              }}
              style={{ width: '100%', accentColor: '#0E7490', cursor: 'pointer' }}
            />
          </div>

          {/* Speed Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {[1, 2, 5, 10].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setPlaybackSpeed(s)}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  border: playbackSpeed === s ? '1px solid #0E7490' : '1px solid #E2E8F0',
                  backgroundColor: playbackSpeed === s ? '#ECFEFF' : '#FFFFFF',
                  color: playbackSpeed === s ? '#0E7490' : '#64748B',
                  cursor: 'pointer',
                }}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Telemetry pill */}
          {currentPlaybackPoint && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                paddingLeft: '8px',
                borderLeft: '1px solid #E2E8F0',
                fontSize: '0.74rem',
                color: '#334155',
                fontWeight: 600,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Gauge size={13} color="#0E7490" />
                <span>{Math.round(currentPlaybackPoint.speed || 0)} km/h</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <ShieldCheck size={13} color="#10B981" />
                <span>±{Math.round(currentPlaybackPoint.accuracy || 10)}m</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
