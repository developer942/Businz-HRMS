import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Play,
  Pause,
  RotateCcw,
  AlertTriangle,
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
    Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLon);
  return (Math.atan2(y, x) * toDeg + 360) % 360;
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
  const [tileStyle, setTileStyle] = useState<'osm_standard' | 'esri_streets'>('osm_standard');
  const [matchedSegmentsState, setMatchedSegmentsState] = useState<FieldVisitDistanceSegment[] | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [frameIndex, setFrameIndex] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1); // 1x, 2x, 5x

  // Leaflet refs
  const leafletMapRef = useRef<L.Map | null>(null);
  const leafletLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const leafletTileLayerRef = useRef<L.TileLayer | null>(null);
  const leafletPlaybackMarkerRef = useRef<L.Marker | null>(null);

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

  // Build timestamp-aware road-following playback frames (never inventing fake movement across gaps!)
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

    // Initial start frame
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
        // Do NOT interpolate fake road movement across a missing GPS gap!
        // Jump directly to the next recorded fix and flag the missing interval.
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
  // LEAFLET + OPENSTREETMAP INITIALIZATION (100% FREE & OPEN-SOURCE)
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
      zoomControl: true,
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

  // Render Road-Matched Route Segments, Gap Indicators, Recorded GPS Dots, Geofences & Markers
  useEffect(() => {
    if (!leafletMapRef.current || !leafletLayerGroupRef.current) return;

    leafletLayerGroupRef.current.clearLayers();
    const allBoundsCoords: [number, number][] = [];

    // 1. Draw Segments (distinguishing road-matched/verified vs missing GPS gaps)
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
          // Missing GPS Gap: subtle dotted amber indicator (NEVER a solid road line through buildings!)
          const gapLine = L.polyline(coords, {
            color: '#D97706',
            weight: 2.5,
            dashArray: '4, 10',
            opacity: 0.65,
            lineJoin: 'round',
            lineCap: 'round',
          });
          const gapMins = Math.max(1, Math.round((seg.durationSeconds || 0) / 60));
          const gapKm = ((seg.distanceMeters || 0) / 1000).toFixed(2);
          gapLine.bindTooltip(
            `⚠ Missing GPS Interval: ${gapMins} min unrecorded (${gapKm} km straight-line gap — excluded from Verified KM)`,
            { sticky: true }
          );
          leafletLayerGroupRef.current?.addLayer(gapLine);

          // Midpoint gap badge
          const midLat = (seg.startLat + seg.endLat) / 2;
          const midLng = (seg.startLng + seg.endLng) / 2;
          const gapBadgeIcon = L.divIcon({
            className: 'vrm-gap-badge-marker',
            html: `
              <div style="transform: translate(-50%, -50%); background: #FFFBEB; color: #B45309; border: 1px solid #FCD34D; padding: 2px 7px; border-radius: 9999px; font-size: 10px; font-weight: 700; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.08);">
                ⚠ GPS Gap (${gapMins}m)
              </div>
            `,
            iconSize: [90, 20],
            iconAnchor: [45, 10],
          });
          const gapMarker = L.marker([midLat, midLng], { icon: gapBadgeIcon, interactive: true });
          gapMarker.bindPopup(`
            <div style="font-family: inherit; font-size: 12px; padding: 4px; max-width: 220px;">
              <strong style="color: #B45309;">⚠ Unrecorded GPS Interval</strong><br/>
              <span style="color: #475569;">No GPS fixes received for <strong>${gapMins} min</strong>.</span><br/>
              <span style="color: #64748B; font-size: 11px;">Straight-line gap (${gapKm} KM) is not drawn as road travel and is excluded from Verified KM.</span>
            </div>
          `);
          leafletLayerGroupRef.current?.addLayer(gapMarker);
        } else {
          // Verified Tracked Road Segment (OSRM Road Matched or Contiguous Recorded)
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
            `✓ Verified Road Segment (${seg.segmentType === 'road_matched' ? 'OSRM Road Matched' : 'GPS Tracked'}): ${distLabel}`,
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
      leafletLayerGroupRef.current.addLayer(polylineGlow);

      const polyline = L.polyline(routePoints, {
        color: '#1D4ED8',
        weight: 4.5,
        opacity: 0.92,
        lineJoin: 'round',
        lineCap: 'round',
      });
      leafletLayerGroupRef.current.addLayer(polyline);
    }

    // 2. Recorded GPS Breadcrumb Dots (shows exact recorded points along the route)
    if (detailedPoints && detailedPoints.length > 0) {
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
      leafletLayerGroupRef.current.addLayer(circleLayer);
    }

    // 4. Start, Destination & Live Employee Markers
    markers.forEach((m) => {
      allBoundsCoords.push([m.lat, m.lng]);
      let iconHtml = '';
      let iconSize: [number, number] = [36, 44];
      let iconAnchor: [number, number] = [18, 44];

      if (m.iconType === 'start') {
        iconHtml = `
          <div style="position: relative; width: 28px; height: 36px; transform: translate(-14px, -36px);">
            <div style="background: #16A34A; color: white; font-weight: 800; font-size: 11px; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 8px rgba(22, 163, 74, 0.35); border: 2px solid #FFFFFF;">
              A
            </div>
            <div style="position: absolute; bottom: 2px; left: 14px; width: 2.5px; height: 8px; background: #16A34A; transform: translateX(-50%);"></div>
          </div>
        `;
        iconSize = [28, 36];
        iconAnchor = [14, 36];
      } else if (m.iconType === 'end') {
        iconHtml = `
          <div style="position: relative; width: 28px; height: 36px; transform: translate(-14px, -36px);">
            <div style="background: #DC2626; color: white; font-weight: 800; font-size: 11px; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 8px rgba(220, 38, 38, 0.35); border: 2px solid #FFFFFF;">
              B
            </div>
            <div style="position: absolute; bottom: 2px; left: 14px; width: 2.5px; height: 8px; background: #DC2626; transform: translateX(-50%);"></div>
          </div>
        `;
        iconSize = [28, 36];
        iconAnchor = [14, 36];
      } else if (m.iconType === 'site') {
        iconHtml = `
          <div style="position: relative; width: 30px; height: 38px; transform: translate(-15px, -38px);">
            <svg viewBox="0 0 384 512" width="30" height="38" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.28));">
              <path fill="#D97706" d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z"/>
              <circle cx="192" cy="192" r="74" fill="#FFFFFF" />
              <circle cx="192" cy="192" r="42" fill="#B45309" />
            </svg>
          </div>
        `;
        iconSize = [30, 38];
        iconAnchor = [15, 38];
      } else {
        const pulseEffect =
          m.pulse !== false
            ? `<div style="position: absolute; inset: -5px; border-radius: 50%; background: rgba(29, 78, 216, 0.22); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>`
            : '';

        const headingDegree = m.heading !== undefined ? m.heading : 0;
        const headingArrow =
          m.heading !== undefined
            ? `<div style="position: absolute; top: -9px; left: 50%; transform: translateX(-50%) rotate(${headingDegree}deg); width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-bottom: 8px solid #1D4ED8;"></div>`
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
            <div style="position: relative; width: 36px; height: 36px; border-radius: 50%; background: #FFFFFF; box-shadow: 0 4px 12px rgba(29, 78, 216, 0.35); border: 2px solid #1D4ED8; display: flex; align-items: center; justify-content: center; z-index: 2;">
              ${avatarImg}
            </div>
            <div style="position: absolute; bottom: 2px; left: 19px; width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 8px solid #1D4ED8; transform: translateX(-50%);"></div>
          </div>
        `;
        iconSize = [38, 46];
        iconAnchor = [19, 46];
      }

      const customIcon = L.divIcon({
        className: 'vrm-tracking-map-marker',
        html: iconHtml,
        iconSize,
        iconAnchor,
      });

      const marker = L.marker([m.lat, m.lng], { icon: customIcon });
      if (m.popupHtml) {
        marker.bindPopup(m.popupHtml, { closeButton: false, offset: [0, -30] });
      } else if (m.title) {
        marker.bindTooltip(`${m.title}${m.subtitle ? ` • ${m.subtitle}` : ''}`, {
          direction: 'top',
          offset: [0, -28],
        });
      }
      leafletLayerGroupRef.current?.addLayer(marker);
    });

    // 5. Stops
    stops.forEach((st, idx) => {
      const stopHtml = `
        <div style="position: relative; width: 26px; height: 34px; transform: translate(-13px, -34px); cursor: pointer;">
          <div style="background: #F59E0B; color: #FFFFFF; font-weight: 800; font-size: 11px; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid #FFFFFF; box-shadow: 0 3px 8px rgba(245, 158, 11, 0.4);">
            ${idx + 1}
          </div>
          <div style="position: absolute; bottom: 0; left: 13px; width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 7px solid #F59E0B; transform: translateX(-50%);"></div>
        </div>
      `;
      const stopIcon = L.divIcon({
        className: 'vrm-stop-marker',
        html: stopHtml,
        iconSize: [26, 34],
        iconAnchor: [13, 34],
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

    // Fit map bounds to route points
    if (allBoundsCoords.length > 1 && leafletMapRef.current) {
      leafletMapRef.current.fitBounds(L.latLngBounds(allBoundsCoords), {
        padding: [42, 42],
        maxZoom: 16,
      });
    }
  }, [markers, routePoints, detailedPoints, activeSegments, stops, circle]);

  // Update Moving Employee Playback Marker along Road-Matched Frames
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
          ${isGap ? 'GAP' : `${currentFrame.speedKmh}k`}
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

  // Timestamp-Aware Route Playback Timer
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
    }, Math.max(80, Math.round(320 / playbackSpeed)));

    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, playbackFrames, detailedPoints]);

  return (
    <div style={{ position: 'relative', width: '100%', height: typeof height === 'number' ? `${height}px` : height }}>
      {/* Map Element */}
      <div
        ref={containerRef}
        className={`tracking-map-container ${className}`}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '14px',
          overflow: 'hidden',
          border: '1px solid var(--color-border, #E2E8F0)',
          position: 'relative',
          zIndex: 1,
        }}
      />

      {/* Legend & Engine Pill (Top Left) */}
      <div
        style={{
          position: 'absolute',
          top: '10px',
          left: '50px',
          zIndex: 10,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(6px)',
          borderRadius: '10px',
          padding: '5px 10px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
          fontSize: '0.72rem',
          fontWeight: 600,
          color: '#334155',
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '14px', height: '3.5px', backgroundColor: '#1D4ED8', borderRadius: '2px' }} />
          <span>Verified Road Route</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
          <span
            style={{
              width: '14px',
              height: '0px',
              borderTop: '2.5px dashed #D97706',
            }}
          />
          <span>Missing GPS Gap</span>
        </span>
      </div>

      {/* Tile Switcher (Top Right) */}
      <div
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          zIndex: 10,
          display: 'flex',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(6px)',
          borderRadius: '9px',
          padding: '2px',
          border: '1px solid #CBD5E1',
          boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
          gap: '2px',
        }}
      >
        <button
          type="button"
          onClick={() => setTileStyle('osm_standard')}
          style={{
            padding: '4px 9px',
            borderRadius: '6px',
            border: 'none',
            fontSize: '0.68rem',
            fontWeight: 700,
            cursor: 'pointer',
            backgroundColor: tileStyle === 'osm_standard' ? '#0F172A' : 'transparent',
            color: tileStyle === 'osm_standard' ? '#FFFFFF' : '#64748B',
          }}
        >
          OSM Map
        </button>
        <button
          type="button"
          onClick={() => setTileStyle('esri_streets')}
          style={{
            padding: '4px 9px',
            borderRadius: '6px',
            border: 'none',
            fontSize: '0.68rem',
            fontWeight: 700,
            cursor: 'pointer',
            backgroundColor: tileStyle === 'esri_streets' ? '#0F172A' : 'transparent',
            color: tileStyle === 'esri_streets' ? '#FFFFFF' : '#64748B',
          }}
        >
          Clean Streets
        </button>
      </div>

      {/* Route Playback Controls Strip (Bottom Center) */}
      {showPlaybackControls && playbackFrames.length > 1 && (
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            backgroundColor: 'rgba(255, 255, 255, 0.97)',
            backdropFilter: 'blur(8px)',
            borderRadius: '14px',
            padding: '8px 14px',
            border: '1px solid #CBD5E1',
            boxShadow: '0 8px 20px -4px rgba(0,0,0,0.12)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            width: 'min(94%, 640px)',
            flexWrap: 'wrap',
          }}
        >
          {/* Play / Pause */}
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              backgroundColor: '#1D4ED8',
              color: '#FFFFFF',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            title={isPlaying ? 'Pause Playback' : 'Play Route'}
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} style={{ marginLeft: '2px' }} />}
          </button>

          {/* Restart */}
          <button
            type="button"
            onClick={() => {
              setIsPlaying(false);
              setFrameIndex(0);
            }}
            style={{
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '8px',
              width: '30px',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#475569',
              flexShrink: 0,
            }}
            title="Restart Playback"
          >
            <RotateCcw size={14} />
          </button>

          {/* Timeline Slider & Timestamp */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: '160px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.7rem',
                color: '#334155',
                fontWeight: 700,
              }}
            >
              <span>
                {currentFrame?.gapNote ? (
                  <span style={{ color: '#B45309', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    <AlertTriangle size={11} /> {currentFrame.gapNote}
                  </span>
                ) : (
                  `Point ${(currentFrame?.pointIndex ?? 0) + 1}/${detailedPoints.length} • ${(
                    (currentFrame?.cumulativeVerifiedMeters || 0) / 1000
                  ).toFixed(2)} KM`
                )}
              </span>
              <span style={{ color: '#0F172A' }}>
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
              style={{ width: '100%', accentColor: '#1D4ED8', cursor: 'pointer', margin: 0 }}
            />
          </div>

          {/* Speed Selector: 1x, 2x, 5x */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            {[1, 2, 5].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setPlaybackSpeed(s)}
                style={{
                  padding: '3px 7px',
                  borderRadius: '6px',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  border: playbackSpeed === s ? '1px solid #1D4ED8' : '1px solid #E2E8F0',
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
