import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Play,
  Pause,
  RotateCcw,
  AlertTriangle,
  Maximize2,
  Minimize2,
  Crosshair,
  Locate,
  LocateFixed,
  Layers,
  MapPin,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronUp,
  Plus,
  Minus,
} from 'lucide-react';
import { LocationPoint, FieldVisitDistanceSegment, FieldVisitStop } from '../../types/tracking';
import {
  calculateHaversineMeters,
  matchTripSegmentsToRoads,
} from '../../services/trackingEngine';

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
  iconType?: 'employee' | 'start' | 'end' | 'site' | 'stale' | 'pin';
  heading?: number;
  speed?: number;
  accuracy?: number;
  recordedAt?: string;
  pulse?: boolean;
  isStale?: boolean;
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
  showControls?: boolean;
  essentialControlsOnly?: boolean;
  hideLegend?: boolean;
  className?: string;
  onPlaybackProgress?: (currentPoint: LocationPoint, index: number) => void;
  autoFitBounds?: boolean;
}

interface PlaybackFrame {
  lat: number;
  lng: number;
  timestampMs: number;
  recordedAt: string;
  speedKmh: number;
  accuracy: number;
  heading: number;
  pointIndex: number;
  cumulativeVerifiedMeters: number;
  segmentType: 'recorded' | 'road_matched' | 'estimated_road' | 'unverified_gap';
  gapNote?: string;
}

function computeBearingDegrees(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const dLon = (lng2 - lng1) * toRad;
  const y = Math.sin(dLon) * Math.cos(lat2 * toRad);
  const x =
    Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLon);
  return (Math.atan2(y, x) * toDeg + 360) % 360;
}

export const TrackingMap: React.FC<TrackingMapProps> = ({
  center,
  zoom = 13,
  height = '460px',
  markers = [],
  routePoints = [],
  detailedPoints = [],
  segments = [],
  stops = [],
  circle,
  clickable = false,
  onMapClick,
  showPlaybackControls = false,
  showControls = true,
  essentialControlsOnly = false,
  hideLegend = false,
  className = '',
  onPlaybackProgress,
  autoFitBounds = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tileStyle, setTileStyle] = useState<'osm_standard' | 'esri_streets'>('osm_standard');
  const [matchedSegmentsState, setMatchedSegmentsState] = useState<FieldVisitDistanceSegment[] | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [frameIndex, setFrameIndex] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1); // 1x, 2x, 5x, 10x

  // Interactive Map Controls State
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [followLive, setFollowLive] = useState<boolean>(false);
  const [showBreadcrumbs, setShowBreadcrumbs] = useState<boolean>(true);
  const [showGaps, setShowGaps] = useState<boolean>(true);
  const [showStops, setShowStops] = useState<boolean>(true);
  const [showLegend, setShowLegend] = useState<boolean>(true);

  // Leaflet refs
  const leafletMapRef = useRef<L.Map | null>(null);
  const leafletLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const leafletTileLayerRef = useRef<L.TileLayer | null>(null);
  const leafletPlaybackMarkerRef = useRef<L.Marker | null>(null);
  const allBoundsRef = useRef<[number, number][]>([]);

  // Automatically road-match contiguous recorded segments via OSRM if not yet road-matched
  useEffect(() => {
    let cancelled = false;
    const hasRoadCoords =
      Array.isArray(segments) &&
      segments.some((s) => s.segmentType === 'road_matched' && Array.isArray(s.coordinates) && s.coordinates.length > 2);

    if (hasRoadCoords) {
      setMatchedSegmentsState(segments);
      return;
    }

    if (detailedPoints && detailedPoints.length >= 2) {
      matchTripSegmentsToRoads(detailedPoints)
        .then((res) => {
          if (!cancelled && res.segments.length > 0) {
            setMatchedSegmentsState(res.segments);
          }
        })
        .catch(() => {});
    } else {
      setMatchedSegmentsState(null);
    }

    return () => {
      cancelled = true;
    };
  }, [detailedPoints, segments]);

  const activeSegments = useMemo(() => {
    if (matchedSegmentsState && matchedSegmentsState.length > 0) {
      return matchedSegmentsState;
    }
    return segments;
  }, [matchedSegmentsState, segments]);

  // Build timestamp-aware road-following playback frames
  const playbackFrames: PlaybackFrame[] = useMemo(() => {
    const validPts = (detailedPoints || [])
      .filter((p) => p && !p.isRejected)
      .slice()
      .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());

    if (validPts.length === 0) return [];
    if (validPts.length === 1 || activeSegments.length === 0) {
      let cum = 0;
      return validPts.map((pt, idx) => {
        if (idx > 0) {
          cum += calculateHaversineMeters(
            validPts[idx - 1].latitude,
            validPts[idx - 1].longitude,
            pt.latitude,
            pt.longitude
          );
        }
        return {
          lat: pt.latitude,
          lng: pt.longitude,
          timestampMs: new Date(pt.recordedAt).getTime(),
          recordedAt: pt.recordedAt,
          speedKmh: Math.round(pt.speed || 0),
          accuracy: Math.round(pt.accuracy || 10),
          heading: pt.heading || 0,
          pointIndex: idx,
          cumulativeVerifiedMeters: Math.round(cum),
          segmentType: 'recorded',
        };
      });
    }

    const frames: PlaybackFrame[] = [];
    let cumulativeVerified = 0;

    const firstPt = validPts[0];
    frames.push({
      lat: firstPt.latitude,
      lng: firstPt.longitude,
      timestampMs: new Date(firstPt.recordedAt).getTime(),
      recordedAt: firstPt.recordedAt,
      speedKmh: Math.round(firstPt.speed || 0),
      accuracy: Math.round(firstPt.accuracy || 10),
      heading: firstPt.heading || 0,
      pointIndex: 0,
      cumulativeVerifiedMeters: 0,
      segmentType: 'recorded',
    });

    activeSegments.forEach((seg, segIdx) => {
      const startMs = seg.startTime ? new Date(seg.startTime).getTime() : frames[frames.length - 1].timestampMs;
      const endMs = seg.endTime
        ? new Date(seg.endTime).getTime()
        : startMs + (seg.durationSeconds || 10) * 1000;

      if (seg.segmentType === 'unverified_gap') {
        const gapMins = Math.max(1, Math.round((seg.durationSeconds || 0) / 60));
        frames.push({
          lat: seg.endLat,
          lng: seg.endLng,
          timestampMs: endMs,
          recordedAt: new Date(endMs).toISOString(),
          speedKmh: 0,
          accuracy: 10,
          heading: 0,
          pointIndex: Math.min(validPts.length - 1, segIdx + 1),
          cumulativeVerifiedMeters: Math.round(cumulativeVerified),
          segmentType: 'unverified_gap',
          gapNote: `GPS Gap (${gapMins} min unrecorded)`,
        });
      } else {
        const coords =
          Array.isArray(seg.coordinates) && seg.coordinates.length >= 2
            ? seg.coordinates
            : ([
                [seg.startLat, seg.startLng],
                [seg.endLat, seg.endLng],
              ] as [number, number][]);

        const stepCount = Math.min(coords.length - 1, 24);
        const stride = Math.max(1, Math.floor((coords.length - 1) / stepCount));
        const sampledCoords: [number, number][] = [coords[0]];
        for (let k = stride; k < coords.length - 1; k += stride) {
          sampledCoords.push(coords[k]);
        }
        sampledCoords.push(coords[coords.length - 1]);

        const segDist = seg.distanceMeters || 0;
        const durSec = Math.max(1, seg.durationSeconds || (endMs - startMs) / 1000);
        const avgSpeedKmh = Math.min(95, Math.round((segDist / durSec) * 3.6));

        for (let j = 1; j < sampledCoords.length; j++) {
          const frac = j / (sampledCoords.length - 1);
          const interpMs = Math.round(startMs + (endMs - startMs) * frac);
          const prevC = sampledCoords[j - 1];
          const currC = sampledCoords[j];
          const bearing = computeBearingDegrees(prevC[0], prevC[1], currC[0], currC[1]);

          frames.push({
            lat: currC[0],
            lng: currC[1],
            timestampMs: interpMs,
            recordedAt: new Date(interpMs).toISOString(),
            speedKmh: avgSpeedKmh,
            accuracy: 10,
            heading: Math.round(bearing),
            pointIndex: Math.min(validPts.length - 1, segIdx + 1),
            cumulativeVerifiedMeters: Math.round(cumulativeVerified + segDist * frac),
            segmentType: seg.segmentType,
          });
        }
        cumulativeVerified += segDist;
      }
    });

    return frames;
  }, [detailedPoints, activeSegments]);

  const currentFrame = playbackFrames[Math.min(frameIndex, Math.max(0, playbackFrames.length - 1))];

  // Reset frame index when trip changes
  useEffect(() => {
    setIsPlaying(false);
    setFrameIndex(0);
  }, [detailedPoints.length]);

  // --------------------------------------------------------------------------
  // LEAFLET INITIALIZATION (100% Free OpenStreetMap & Esri)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;

    if (leafletMapRef.current) {
      leafletMapRef.current.remove();
      leafletMapRef.current = null;
    }

    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: false, // We render clean unified controls
      attributionControl: true,
    });

    const isEsri = tileStyle === 'esri_streets';
    const tileUrl = isEsri
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    const tileAttr = isEsri
      ? 'Tiles &copy; Esri &mdash; Source: OpenStreetMap, Esri'
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
  }, [tileStyle]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      setTimeout(() => {
        leafletMapRef.current?.invalidateSize();
      }, 150);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Follow live location when enabled
  useEffect(() => {
    if (followLive && leafletMapRef.current) {
      const liveMarker = markers.find((m) => m.iconType === 'employee');
      if (liveMarker) {
        leafletMapRef.current.panTo([liveMarker.lat, liveMarker.lng], { animate: true, duration: 0.5 });
      } else if (center) {
        leafletMapRef.current.panTo(center, { animate: true, duration: 0.5 });
      }
    }
  }, [followLive, center, markers]);

  // Fit Bounds Action
  const handleFitBounds = useCallback(() => {
    if (!leafletMapRef.current || allBoundsRef.current.length < 2) {
      if (leafletMapRef.current && center) {
        leafletMapRef.current.setView(center, 14);
      }
      return;
    }
    leafletMapRef.current.fitBounds(L.latLngBounds(allBoundsRef.current), {
      padding: [42, 42],
      maxZoom: 16,
    });
  }, [center]);

  // Recenter Action
  const handleRecenter = useCallback(() => {
    if (!leafletMapRef.current) return;
    const liveMarker = markers.find((m) => m.iconType === 'employee');
    const target = liveMarker ? [liveMarker.lat, liveMarker.lng] : center;
    leafletMapRef.current.setView(target as [number, number], 15, { animate: true });
  }, [center, markers]);

  // Toggle Fullscreen
  const handleToggleFullscreen = useCallback(() => {
    if (!containerRef.current?.parentElement) return;
    if (!document.fullscreenElement) {
      containerRef.current.parentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // --------------------------------------------------------------------------
  // RENDER ROAD SEGMENTS, GAPS, GPS DOTS, ACCURACY CIRCLES & MARKERS
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!leafletMapRef.current || !leafletLayerGroupRef.current) return;

    leafletLayerGroupRef.current.clearLayers();
    const allBoundsCoords: [number, number][] = [];

    // 1. Draw Road-Matched Segments & Gap Indicators
    if (activeSegments && activeSegments.length > 0) {
      activeSegments.forEach((seg) => {
        const isGap = seg.segmentType === 'unverified_gap';
        const isEstimated = seg.segmentType === 'estimated_road';
        const coords: [number, number][] =
          !isGap && Array.isArray(seg.coordinates) && seg.coordinates.length >= 2
            ? seg.coordinates
            : [
                [seg.startLat, seg.startLng],
                [seg.endLat, seg.endLng],
              ];

        coords.forEach((c) => allBoundsCoords.push(c));

        if (isGap) {
          if (!showGaps) return;
          // Unrecorded GPS Gap (dashed amber line)
          const gapLine = L.polyline(coords, {
            color: '#D97706',
            weight: 2.5,
            dashArray: '4, 10',
            opacity: 0.7,
            lineJoin: 'round',
            lineCap: 'round',
          });
          const gapMins = Math.max(1, Math.round((seg.durationSeconds || 0) / 60));
          const gapKm = ((seg.distanceMeters || 0) / 1000).toFixed(2);
          gapLine.bindTooltip(
            `⚠ Unrecorded GPS Gap: ${gapMins} min (${gapKm} KM straight-line — excluded from Verified KM)`,
            { sticky: true }
          );
          leafletLayerGroupRef.current?.addLayer(gapLine);

          // Midpoint Gap Duration Badge
          const midLat = (seg.startLat + seg.endLat) / 2;
          const midLng = (seg.startLng + seg.endLng) / 2;
          const gapBadgeIcon = L.divIcon({
            className: 'vrm-gap-badge-marker',
            html: `
              <div style="transform: translate(-50%, -50%); background: #FFFBEB; color: #B45309; border: 1.5px solid #FCD34D; padding: 2px 7px; border-radius: 9999px; font-size: 10px; font-weight: 700; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.08);">
                ⚠ Gap ${gapMins}m
              </div>
            `,
            iconSize: [80, 20],
            iconAnchor: [40, 10],
          });
          const gapMarker = L.marker([midLat, midLng], { icon: gapBadgeIcon, interactive: true });
          gapMarker.bindPopup(`
            <div style="font-family: inherit; font-size: 12px; padding: 4px; max-width: 220px;">
              <strong style="color: #B45309;">⚠ Unrecorded GPS Gap</strong><br/>
              <span style="color: #475569;">No GPS coordinates recorded for <strong>${gapMins} minutes</strong>.</span><br/>
              <span style="color: #64748B; font-size: 11px;">Straight-line gap (${gapKm} KM) is excluded from Verified KM.</span>
            </div>
          `);
          leafletLayerGroupRef.current?.addLayer(gapMarker);
        } else {
          // Verified Tracked Road Segment (Halo + Solid Blue Line)
          const halo = L.polyline(coords, {
            color: '#93C5FD',
            weight: 8,
            opacity: 0.35,
            lineJoin: 'round',
            lineCap: 'round',
          });
          leafletLayerGroupRef.current?.addLayer(halo);

          const roadLine = L.polyline(coords, {
            color: '#1D4ED8',
            weight: 4.5,
            dashArray: isEstimated ? '8, 6' : undefined,
            opacity: 0.95,
            lineJoin: 'round',
            lineCap: 'round',
          });
          const distLabel =
            seg.distanceMeters >= 1000
              ? `${(seg.distanceMeters / 1000).toFixed(2)} KM`
              : `${Math.round(seg.distanceMeters)} m`;
          roadLine.bindTooltip(
            `✓ Verified Road Segment (${seg.segmentType === 'road_matched' ? 'Road-Matched' : 'GPS Tracked'}): ${distLabel}`,
            { sticky: true }
          );
          leafletLayerGroupRef.current?.addLayer(roadLine);
        }
      });
    } else if (routePoints && routePoints.length > 1) {
      routePoints.forEach((c) => allBoundsCoords.push(c));
      const polylineGlow = L.polyline(routePoints, {
        color: '#93C5FD',
        weight: 8,
        opacity: 0.3,
      });
      leafletLayerGroupRef.current?.addLayer(polylineGlow);

      const polyline = L.polyline(routePoints, {
        color: '#1D4ED8',
        weight: 4.5,
        opacity: 0.92,
        lineJoin: 'round',
        lineCap: 'round',
      });
      leafletLayerGroupRef.current?.addLayer(polyline);
    }

    // 2. Recorded GPS Breadcrumb Dots
    if (showBreadcrumbs && detailedPoints && detailedPoints.length > 0) {
      detailedPoints.forEach((pt, idx) => {
        if (pt.isRejected) return;
        allBoundsCoords.push([pt.latitude, pt.longitude]);
        const dot = L.circleMarker([pt.latitude, pt.longitude], {
          radius: idx === 0 || idx === detailedPoints.length - 1 ? 5 : 4,
          color: '#FFFFFF',
          weight: 1.5,
          fillColor: '#1D4ED8',
          fillOpacity: 0.95,
        });
        const timeStr = pt.recordedAt
          ? new Date(pt.recordedAt).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true,
            })
          : '—';
        dot.bindTooltip(
          `GPS Fix #${idx + 1} • ${timeStr} • ±${Math.round(pt.accuracy || 10)}m${
            pt.speed ? ` • ${Math.round(pt.speed)} km/h` : ''
          }`,
          { direction: 'top', offset: [0, -4] }
        );
        leafletLayerGroupRef.current?.addLayer(dot);
      });
    }

    // 3. Geofence Circle
    if (circle && circle.lat && circle.lng && circle.radiusMeters > 0) {
      const circleLayer = L.circle([circle.lat, circle.lng], {
        radius: circle.radiusMeters,
        color: circle.color || '#0E7490',
        fillColor: circle.fillColor || '#CFFAFE',
        fillOpacity: 0.18,
        weight: 1.5,
        dashArray: '4, 4',
      });
      leafletLayerGroupRef.current?.addLayer(circleLayer);
    }

    // 4. Markers (Green Punch In, Blue Live Navigation with Accuracy Circle, Orange Stops, Red Punch Out, Grey Stale)
    markers.forEach((m) => {
      allBoundsCoords.push([m.lat, m.lng]);
      let iconHtml = '';
      let iconSize: [number, number] = [36, 44];
      let iconAnchor: [number, number] = [18, 44];

      if (m.iconType === 'start') {
        // Green Marker: Punch In / Tracking Start
        iconHtml = `
          <div style="position: relative; width: 30px; height: 38px; transform: translate(-15px, -38px);">
            <div style="background: #16A34A; color: white; font-weight: 800; font-size: 11px; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(22, 163, 74, 0.4); border: 2.5px solid #FFFFFF;">
              A
            </div>
            <div style="position: absolute; bottom: 1px; left: 15px; width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 8px solid #16A34A; transform: translateX(-50%);"></div>
          </div>
        `;
        iconSize = [30, 38];
        iconAnchor = [15, 38];
      } else if (m.iconType === 'end') {
        // Red Marker: Punch Out / Tracking End
        iconHtml = `
          <div style="position: relative; width: 30px; height: 38px; transform: translate(-15px, -38px);">
            <div style="background: #DC2626; color: white; font-weight: 800; font-size: 11px; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(220, 38, 38, 0.4); border: 2.5px solid #FFFFFF;">
              B
            </div>
            <div style="position: absolute; bottom: 1px; left: 15px; width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 8px solid #DC2626; transform: translateX(-50%);"></div>
          </div>
        `;
        iconSize = [30, 38];
        iconAnchor = [15, 38];
      } else if (m.iconType === 'site') {
        // Orange Marker: Customer / Site / Vendor Visit
        iconHtml = `
          <div style="position: relative; width: 32px; height: 40px; transform: translate(-16px, -40px);">
            <svg viewBox="0 0 384 512" width="32" height="40" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.25));">
              <path fill="#D97706" d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z"/>
              <circle cx="192" cy="192" r="74" fill="#FFFFFF" />
              <circle cx="192" cy="192" r="42" fill="#B45309" />
            </svg>
          </div>
        `;
        iconSize = [32, 40];
        iconAnchor = [16, 40];
      } else if (m.iconType === 'stale' || m.isStale) {
        // Grey Marker: Stale Location / Offline
        iconHtml = `
          <div style="position: relative; width: 36px; height: 44px; transform: translate(-18px, -44px);">
            <div style="width: 34px; height: 34px; border-radius: 50%; background: #64748B; color: #FFFFFF; font-weight: 800; font-size: 11px; display: flex; align-items: center; justify-content: center; border: 2px solid #FFFFFF; box-shadow: 0 3px 8px rgba(100, 116, 139, 0.35);">
              OFF
            </div>
            <div style="position: absolute; bottom: 2px; left: 18px; width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 8px solid #64748B; transform: translateX(-50%);"></div>
          </div>
        `;
        iconSize = [36, 44];
        iconAnchor = [18, 44];
      } else {
        // Blue Navigation Marker: Latest Valid Employee Location
        const pulseEffect =
          m.pulse !== false
            ? `<div style="position: absolute; inset: -6px; border-radius: 50%; background: rgba(29, 78, 216, 0.25); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>`
            : '';

        const headingDegree = m.heading !== undefined ? m.heading : 0;
        const headingArrow =
          m.heading !== undefined
            ? `<div style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%) rotate(${headingDegree}deg); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 9px solid #1D4ED8;"></div>`
            : '';

        const avatarImg = m.avatar
          ? `<img src="${m.avatar}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;" />`
          : `<div style="width: 32px; height: 32px; border-radius: 50%; background: #1D4ED8; color: #FFFFFF; font-weight: 800; font-size: 12px; display: flex; align-items: center; justify-content: center;">${(
              m.title || 'U'
            ).charAt(0)}</div>`;

        iconHtml = `
          <div style="position: relative; width: 38px; height: 46px; transform: translate(-19px, -46px); cursor: pointer;">
            ${pulseEffect}
            ${headingArrow}
            <div style="position: relative; width: 36px; height: 36px; border-radius: 50%; background: #FFFFFF; box-shadow: 0 4px 12px rgba(29, 78, 216, 0.35); border: 2.5px solid #1D4ED8; display: flex; align-items: center; justify-content: center; z-index: 2;">
              ${avatarImg}
            </div>
            <div style="position: absolute; bottom: 2px; left: 19px; width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 8px solid #1D4ED8; transform: translateX(-50%);"></div>
          </div>
        `;
        iconSize = [38, 46];
        iconAnchor = [19, 46];

        // Draw GPS Accuracy Circle around the live blue marker
        const accuracyRadius = Math.max(10, Math.min(100, Math.round(m.accuracy || 15)));
        const accCircle = L.circle([m.lat, m.lng], {
          radius: accuracyRadius,
          color: '#1D4ED8',
          fillColor: '#93C5FD',
          fillOpacity: 0.14,
          weight: 1,
          dashArray: '3, 4',
        });
        leafletLayerGroupRef.current?.addLayer(accCircle);
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
      } else if (m.title) {
        marker.bindTooltip(`${m.title}${m.subtitle ? ` • ${m.subtitle}` : ''}`, {
          direction: 'top',
          offset: [0, -30],
        });
      }
      leafletLayerGroupRef.current?.addLayer(marker);
    });

    // 5. Customer & Site Visit Stops
    if (showStops && stops && stops.length > 0) {
      stops.forEach((st, idx) => {
        const stopHtml = `
          <div style="position: relative; width: 28px; height: 36px; transform: translate(-14px, -36px); cursor: pointer;">
            <div style="background: #D97706; color: #FFFFFF; font-weight: 800; font-size: 11px; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid #FFFFFF; box-shadow: 0 3px 8px rgba(217, 119, 6, 0.45);">
              ${idx + 1}
            </div>
            <div style="position: absolute; bottom: 0; left: 14px; width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 8px solid #D97706; transform: translateX(-50%);"></div>
          </div>
        `;
        const stopIcon = L.divIcon({
          className: 'vrm-stop-marker',
          html: stopHtml,
          iconSize: [28, 36],
          iconAnchor: [14, 36],
        });
        const stopMarker = L.marker([st.latitude, st.longitude], { icon: stopIcon });
        const durationMins = Math.max(1, Math.round((st.durationSeconds || 0) / 60));
        stopMarker.bindPopup(`
          <div style="font-family: inherit; font-size: 12px; padding: 4px; min-width: 180px;">
            <strong style="color: #D97706;">Stop #${idx + 1}: ${st.stopType || 'Site Visit'}</strong><br/>
            <span style="color: #334155;">${st.address || 'Customer Location'}</span><br/>
            <span style="color: #64748B; font-size: 11px;">Dwell Duration: <strong>${durationMins} mins</strong></span>
          </div>
        `);
        leafletLayerGroupRef.current?.addLayer(stopMarker);
      });
    }

    allBoundsRef.current = allBoundsCoords;

    // Auto-fit bounds if requested
    if (autoFitBounds && allBoundsCoords.length > 1 && leafletMapRef.current && !followLive) {
      leafletMapRef.current.fitBounds(L.latLngBounds(allBoundsCoords), {
        padding: [42, 42],
        maxZoom: 16,
      });
    }
  }, [markers, routePoints, detailedPoints, activeSegments, stops, circle, showBreadcrumbs, showGaps, showStops, autoFitBounds, followLive]);

  // Update Moving Playback Marker
  useEffect(() => {
    if (!leafletMapRef.current || !currentFrame) return;

    const latlng: [number, number] = [currentFrame.lat, currentFrame.lng];
    const heading = currentFrame.heading || 0;
    const isGap = currentFrame.segmentType === 'unverified_gap';

    const playbackIconHtml = `
      <div style="position: relative; width: 38px; height: 38px; transform: translate(-19px, -19px);">
        <div style="position: absolute; inset: -5px; border-radius: 50%; background: ${
          isGap ? 'rgba(217, 119, 6, 0.28)' : 'rgba(29, 78, 216, 0.28)'
        }; animation: ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        <div style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%) rotate(${heading}deg); width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-bottom: 9px solid ${
          isGap ? '#D97706' : '#1D4ED8'
        };"></div>
        <div style="width: 34px; height: 34px; border-radius: 50%; background: ${
          isGap ? '#D97706' : '#1D4ED8'
        }; color: #FFFFFF; border: 2.5px solid #FFFFFF; box-shadow: 0 3px 10px rgba(15, 23, 42, 0.35); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800;">
          ${isGap ? 'GAP' : (currentFrame.speedKmh > 0 ? `${currentFrame.speedKmh}k` : '•')}
        </div>
      </div>
    `;

    const customIcon = L.divIcon({
      className: 'vrm-leaflet-playback-pin',
      html: playbackIconHtml,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
    });

    if (!leafletPlaybackMarkerRef.current) {
      leafletPlaybackMarkerRef.current = L.marker(latlng, {
        icon: customIcon,
        zIndexOffset: 1000,
      }).addTo(leafletMapRef.current);
    } else {
      leafletPlaybackMarkerRef.current.setLatLng(latlng);
      leafletPlaybackMarkerRef.current.setIcon(customIcon);
    }

    if (isPlaying) {
      leafletMapRef.current.panTo(latlng, { animate: true, duration: 0.25 });
    }
  }, [currentFrame, isPlaying]);

  // Route Playback Timer
  useEffect(() => {
    if (!isPlaying || playbackFrames.length < 2) return;

    const timer = setInterval(() => {
      setFrameIndex((prev) => {
        const next = prev + 1;
        if (next >= playbackFrames.length) {
          setIsPlaying(false);
          return 0;
        }
        const f = playbackFrames[next];
        if (onPlaybackProgress && detailedPoints[f.pointIndex]) {
          onPlaybackProgress(detailedPoints[f.pointIndex], f.pointIndex);
        }
        return next;
      });
    }, Math.max(70, Math.round(300 / playbackSpeed)));

    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, playbackFrames, detailedPoints]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    >
      {/* Map Container */}
      <div
        ref={containerRef}
        className={`tracking-map-container ${className}`}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid #E2E8F0',
          position: 'relative',
          zIndex: 1,
        }}
      />

      {/* Unified Map Controls (Top Right Overlay) */}
      {showControls && (
        <div
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            alignItems: 'flex-end',
          }}
        >
          {/* Layer Selector (Only in full/advanced mode) */}
          {!essentialControlsOnly && (
            <div
              style={{
                display: 'flex',
                backgroundColor: 'rgba(255, 255, 255, 0.96)',
                backdropFilter: 'blur(8px)',
                borderRadius: '10px',
                padding: '3px',
                border: '1px solid #CBD5E1',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                gap: '2px',
              }}
            >
              <button
                type="button"
                onClick={() => setTileStyle('osm_standard')}
                style={{
                  padding: '4px 8px',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  backgroundColor: tileStyle === 'osm_standard' ? '#0E7490' : 'transparent',
                  color: tileStyle === 'osm_standard' ? '#FFFFFF' : '#64748B',
                  transition: 'all 0.15s',
                }}
              >
                OSM Standard
              </button>
              <button
                type="button"
                onClick={() => setTileStyle('esri_streets')}
                style={{
                  padding: '4px 8px',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  backgroundColor: tileStyle === 'esri_streets' ? '#0E7490' : 'transparent',
                  color: tileStyle === 'esri_streets' ? '#FFFFFF' : '#64748B',
                  transition: 'all 0.15s',
                }}
              >
                Esri Streets
              </button>
            </div>
          )}

          {/* Action Toolbar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.96)',
              backdropFilter: 'blur(8px)',
              borderRadius: '10px',
              padding: '3px 4px',
              border: '1px solid #CBD5E1',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              gap: '4px',
            }}
          >
            {/* Zoom In */}
            <button
              type="button"
              onClick={() => leafletMapRef.current?.zoomIn()}
              style={{
                padding: '6px',
                borderRadius: '7px',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#334155',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Zoom In"
            >
              <Plus size={15} />
            </button>

            {/* Zoom Out */}
            <button
              type="button"
              onClick={() => leafletMapRef.current?.zoomOut()}
              style={{
                padding: '6px',
                borderRadius: '7px',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#334155',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Zoom Out"
            >
              <Minus size={15} />
            </button>

            {/* Fit Entire Route */}
            <button
              type="button"
              onClick={handleFitBounds}
              style={{
                padding: '6px',
                borderRadius: '7px',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#334155',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Fit Entire Route"
            >
              <Locate size={15} />
            </button>

            {!essentialControlsOnly && (
              <>
                {/* Recenter */}
                <button
                  type="button"
                  onClick={handleRecenter}
                  style={{
                    padding: '6px',
                    borderRadius: '7px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: '#334155',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Recenter Live Location"
                >
                  <Crosshair size={15} />
                </button>

                {/* Follow Live Location Toggle */}
                <button
                  type="button"
                  onClick={() => setFollowLive(!followLive)}
                  style={{
                    padding: '5px 8px',
                    borderRadius: '7px',
                    border: 'none',
                    backgroundColor: followLive ? '#ECFEFF' : 'transparent',
                    color: followLive ? '#0E7490' : '#64748B',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                  }}
                  title={followLive ? 'Disable Auto-Follow' : 'Enable Auto-Follow Live Employee'}
                >
                  <LocateFixed size={14} color={followLive ? '#0E7490' : '#64748B'} />
                  <span>Follow</span>
                </button>

                {/* Toggle Breadcrumbs */}
                <button
                  type="button"
                  onClick={() => setShowBreadcrumbs(!showBreadcrumbs)}
                  style={{
                    padding: '4px 6px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: showBreadcrumbs ? '#F1F5F9' : 'transparent',
                    color: showBreadcrumbs ? '#0E7490' : '#94A3B8',
                    cursor: 'pointer',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                  }}
                  title="Show / Hide Recorded GPS Fix Dots"
                >
                  Fixes
                </button>

                {/* Toggle Gaps */}
                <button
                  type="button"
                  onClick={() => setShowGaps(!showGaps)}
                  style={{
                    padding: '4px 6px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: showGaps ? '#FEF3C7' : 'transparent',
                    color: showGaps ? '#B45309' : '#94A3B8',
                    cursor: 'pointer',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                  }}
                  title="Show / Hide Missing GPS Gaps"
                >
                  Gaps
                </button>
              </>
            )}

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={handleToggleFullscreen}
              style={{
                padding: '6px',
                borderRadius: '7px',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#334155',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title={isFullscreen ? 'Exit Full Screen' : 'Full Screen Map'}
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>
        </div>
      )}

      {/* Standardized Bottom-Left Map Legend */}
      {!hideLegend && (
        <div
          style={{
            position: 'absolute',
            bottom: showPlaybackControls && playbackFrames.length > 1 ? '70px' : '12px',
            left: '12px',
            zIndex: 1000,
            backgroundColor: 'rgba(255, 255, 255, 0.94)',
            backdropFilter: 'blur(8px)',
            borderRadius: '10px',
            padding: '6px 12px',
            border: '1px solid #CBD5E1',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            fontSize: '0.72rem',
            fontWeight: 700,
            color: '#334155',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#16A34A', display: 'inline-block' }} />
            Punch In (A)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '14px', height: '3px', backgroundColor: '#1D4ED8', display: 'inline-block', borderRadius: '2px' }} />
            Travel Route
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#D97706', display: 'inline-block' }} />
            Site Visit
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#DC2626', display: 'inline-block' }} />
            Punch Out (B)
          </span>
        </div>
      )}


      {/* Advanced Route Playback Controller (Bottom Center) */}
      {showPlaybackControls && playbackFrames.length > 1 && (
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            backgroundColor: 'rgba(255, 255, 255, 0.98)',
            backdropFilter: 'blur(10px)',
            borderRadius: '16px',
            padding: '10px 16px',
            border: '1px solid #CBD5E1',
            boxShadow: '0 10px 25px -4px rgba(15, 23, 42, 0.18)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            width: 'min(94%, 680px)',
            flexWrap: 'wrap',
          }}
        >
          {/* Play / Pause Toggle */}
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: '#1D4ED8',
              color: '#FFFFFF',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              boxShadow: '0 3px 8px rgba(29, 78, 216, 0.35)',
              transition: 'transform 0.1s',
            }}
            title={isPlaying ? 'Pause Playback' : 'Play Travelled Route'}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: '2px' }} />}
          </button>

          {/* Restart Button */}
          <button
            type="button"
            onClick={() => {
              setIsPlaying(false);
              setFrameIndex(0);
            }}
            style={{
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '9px',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#475569',
              flexShrink: 0,
            }}
            title="Restart from Start"
          >
            <RotateCcw size={15} />
          </button>

          {/* Interactive Timeline Scrubber & Live Telemetry Readout */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: '180px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.72rem',
                color: '#334155',
                fontWeight: 700,
              }}
            >
              <span>
                {currentFrame?.gapNote ? (
                  <span style={{ color: '#B45309', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <AlertTriangle size={12} /> {currentFrame.gapNote}
                  </span>
                ) : (
                  <span>
                    Point <strong>{(currentFrame?.pointIndex ?? 0) + 1}</strong> of {detailedPoints.length} ·{' '}
                    <strong style={{ color: '#0E7490' }}>
                      {((currentFrame?.cumulativeVerifiedMeters || 0) / 1000).toFixed(2)} KM
                    </strong>{' '}
                    {currentFrame && currentFrame.speedKmh > 0 ? `· ${currentFrame.speedKmh} km/h` : ''}
                  </span>
                )}
              </span>
              <span style={{ color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                {currentFrame?.recordedAt
                  ? new Date(currentFrame.recordedAt).toLocaleTimeString('en-US', {
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
              max={playbackFrames.length - 1}
              value={frameIndex}
              onChange={(e) => {
                const idx = Number(e.target.value);
                setFrameIndex(idx);
                const f = playbackFrames[idx];
                if (onPlaybackProgress && f && detailedPoints[f.pointIndex]) {
                  onPlaybackProgress(detailedPoints[f.pointIndex], f.pointIndex);
                }
              }}
              style={{
                width: '100%',
                accentColor: '#1D4ED8',
                cursor: 'pointer',
                margin: 0,
                height: '6px',
              }}
            />
          </div>

          {/* Speeds: 1x, 2x, 5x, 10x */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
            {[1, 2, 5, 10].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setPlaybackSpeed(s)}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  border: playbackSpeed === s ? '1.5px solid #1D4ED8' : '1px solid #E2E8F0',
                  backgroundColor: playbackSpeed === s ? '#EFF6FF' : '#FFFFFF',
                  color: playbackSpeed === s ? '#1D4ED8' : '#64748B',
                  cursor: 'pointer',
                }}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
