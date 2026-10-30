import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import {
  acquireHighAccuracyGps,
  acquireGpsWithBoundedRetry,
  cancelActiveGpsAcquisition,
  checkGpsPermissionState,
  clearCachedGpsReading,
  detectBrowserDeviceCategory,
  evaluateGeofenceBoundary,
  getCachedFreshGpsReading,
  getMobileLocationInstructions,
  requestFreshGpsPosition,
  calculateHaversineMeters as calculateAccurateHaversine,
  prewarmGps,
  GpsAcquisitionError,
  type GpsErrorCode
} from '../../services/gpsAcquisitionService';
import { 
  ScanFace, 
  Camera, 
  CameraOff, 
  CheckCircle2, 
  RefreshCw, 
  History, 
  ShieldAlert, 
  MapPin, 
  XCircle, 
  Navigation, 
  X, 
  Clock, 
  User,
  Users,
  FlipHorizontal,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Image,
  Search
} from 'lucide-react';
import { formatDateDDMMYYYY, normalizeToYYYYMMDD, formatTimeDisplay } from '../../utils/dateUtils';
import { parseTimeToMinutes } from '../../services/attendanceCalculationEngine';
import type { FaceLog } from '../../types/hrms';
import {
  submitVerifiedFacePunch,
  fetchCanonicalGeofenceSettings,
  reportClientGpsDiagnostic
} from '../../services/attendanceApi';

const getLocalDateString = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getLocalTimestampString = (d = new Date()) => {
  const dateStr = getLocalDateString(d);
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  const secs = String(d.getSeconds()).padStart(2, '0');
  return `${dateStr} ${hours}:${mins}:${secs}`;
};

const formatAttendanceTime = (ts: string) => {
  if (!ts) return '--:--';
  const trimmed = ts.trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)$/i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.includes(' ') || trimmed.includes('T')) {
    const parts = trimmed.split(/[\sT]/);
    const timePart = parts[1]?.substring(0, 8);
    if (timePart) {
      const [hStr, mStr, sStr] = timePart.split(':');
      const h = parseInt(hStr, 10);
      if (!isNaN(h)) {
        const ampm = h >= 12 ? 'PM' : 'AM';
        const formattedHour = h % 12 === 0 ? 12 : h % 12;
        const padHour = String(formattedHour).padStart(2, '0');
        return sStr ? `${padHour}:${mStr}:${sStr} ${ampm}` : `${padHour}:${mStr} ${ampm}`;
      }
    }
  }
  return ts;
};

const normalizeToFullTimestamp = (timeOrTimestamp: string, dateStr: string): string => {
  if (!timeOrTimestamp) return `${dateStr} 00:00:00`;
  const raw = String(timeOrTimestamp).trim();
  if (raw.includes('-') && (raw.includes(' ') || raw.includes('T'))) {
    return raw.replace('T', ' ').slice(0, 19);
  }
  const upper = raw.toUpperCase();
  const isPM = upper.includes('PM');
  const isAM = upper.includes('AM');
  const clean = upper.replace(/AM|PM/g, '').trim();
  const parts = clean.split(':');
  let h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const s = parseInt(parts[2], 10) || 0;
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return `${dateStr} ${hh}:${mm}:${ss}`;
};

export interface FaceAttendanceProps {
  mode?: 'daily' | 'log';
}

export const FaceAttendance: React.FC<FaceAttendanceProps> = ({ mode = 'daily' }) => {
  const { 
    employees, 
    markAttendance,
    addFaceLog, 
    faceLogs, 
    attendanceRecords, 
    applyServerAttendanceRecord,
    geofenceConfig, 
    updateGeofenceConfig, 
    currentUser, 
    setActiveModule, 
    getTodayFieldAssignment,
    getEmployeeShiftAttendanceState,
    submitMissedPunchRequest,
    syncAllWithCloud
  } = useHRMS();
  const [selectedEmpId, setSelectedEmpId] = useState<string>(() => currentUser.employeeId || employees[0]?.employeeId || 'EMP-001');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isMirrored, setIsMirrored] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('vrm_hrms_camera_mirrored');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<{ status: 'success' | 'error' | null; message: string }>({ status: null, message: '' });
  const [punchType, setPunchType] = useState<'Check-In' | 'Check-Out'>('Check-In');
  const [todayStr, setTodayStr] = useState<string>(() => getLocalDateString());
  const [activityViewTab, setActivityViewTab] = useState<'my' | 'all'>('my');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [staffSearchQuery, setStaffSearchQuery] = useState<string>('');
  const [previewPhoto, setPreviewPhoto] = useState<{
    url: string;
    title: string;
    subtitle: string;
    time?: string;
  } | null>(null);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobileViewport(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const formatMonthDisplay = (monthStr: string) => {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const handlePrevMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const y = prevDate.getFullYear();
    const m = String(prevDate.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${y}-${m}`);
  };

  const handleNextMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(year, month, 1);
    const y = nextDate.getFullYear();
    const m = String(nextDate.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${y}-${m}`);
  };

  // Reactively track current date so at midnight the view automatically flips to tomorrow
  useEffect(() => {
    const timer = setInterval(() => {
      const cur = getLocalDateString();
      setTodayStr(prev => prev !== cur ? cur : prev);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const selectedEmp = employees.find(e => e.employeeId === selectedEmpId || e.id === selectedEmpId);

  // Lightweight ticker for shift window & 1-hour delay evaluation (15s interval to avoid UI lag)
  const [ticker, setTicker] = useState<number>(0);
  useEffect(() => {
    const t = setInterval(() => setTicker(prev => prev + 1), 15000);
    return () => clearInterval(t);
  }, []);

  // Shift Window Evaluation
  const shiftEval = useMemo(() => {
    return getEmployeeShiftAttendanceState(selectedEmpId);
  }, [selectedEmpId, ticker, attendanceRecords, getEmployeeShiftAttendanceState]);

  const todayAttendance = useMemo(() => {
    const matches = attendanceRecords.filter(
      a => (a.employeeId === selectedEmpId || a.employeeId === selectedEmp?.employeeId || a.employeeId === selectedEmp?.id) && 
           (normalizeToYYYYMMDD(a.shiftDate) === todayStr || normalizeToYYYYMMDD(a.date) === todayStr)
    );
    if (matches.length <= 1) return matches[0];
    return (
      matches.find(a => (a.method as string) === 'Manual Override' || a.method === 'Manual Punch' || Boolean(a.reason)) ||
      matches.find(a => a.checkIn && a.checkIn !== '--:--' && a.checkIn.trim() !== '') ||
      matches[0]
    );
  }, [attendanceRecords, selectedEmpId, selectedEmp, todayStr]);

  const isCheckedIn = Boolean(todayAttendance?.checkIn && todayAttendance.checkIn.trim() !== '' && todayAttendance.checkIn !== '--:--');
  const isCheckedOut = Boolean(todayAttendance?.checkOut && todayAttendance.checkOut.trim() !== '' && todayAttendance.checkOut !== '--:--');
  const isCompletedToday = Boolean(isCheckedIn && isCheckedOut);

  const isCEO = currentUser.role === 'CEO' || currentUser.designation === 'CEO';

  // PagarBook 2-Step Camera + GPS states
  const [isRequestingPermissions, setIsRequestingPermissions] = useState<boolean>(false);
  const [activePunchGps, setActivePunchGps] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
    address: string;
    distance: number;
    timestamp?: number;
    readingAgeMs?: number;
    durationMs?: number;
    sampleCount?: number;
    retryCount?: number;
    browserDeviceCategory?: string;
  } | null>(null);

  // Enforce 1-Hour (60-Minute) Minimum Delay Between Punch In and Punch Out
  const oneHourCooldown = useMemo(() => {
    if (!isCheckedIn || isCheckedOut) {
      return { isCooldownActive: false, remainingMinutes: 0, unlockTimeDisplay: '' };
    }

    let parsedRecordEpochMs: number | null = null;
    if (todayAttendance?.checkIn && todayAttendance.checkIn !== '--:--' && todayAttendance.checkIn.trim() !== '') {
      const fullTs = normalizeToFullTimestamp(todayAttendance.checkIn, todayStr);
      const parsed = Date.parse(fullTs.replace(' ', 'T'));
      if (!isNaN(parsed)) {
        parsedRecordEpochMs = parsed;
      }
    }

    let savedEpochMs: number | null = null;
    try {
      const saved =
        localStorage.getItem(`vrm_punch_in_epoch_${selectedEmpId}_${todayStr}`) ||
        (currentUser.employeeId ? localStorage.getItem(`vrm_punch_in_epoch_${currentUser.employeeId}_${todayStr}`) : null);
      if (saved && !isNaN(Number(saved))) {
        savedEpochMs = Number(saved);
      }
    } catch {}

    const isManualAdjusted = Boolean(
      todayAttendance &&
      ((todayAttendance.method as string) === 'Manual Override' ||
        todayAttendance.method === 'Manual Punch' ||
        Boolean(todayAttendance.reason))
    );

    let punchInEpochMs: number | null = null;
    if (isManualAdjusted && parsedRecordEpochMs !== null) {
      punchInEpochMs = parsedRecordEpochMs;
    } else {
      punchInEpochMs = savedEpochMs ?? parsedRecordEpochMs;
    }

    if (!punchInEpochMs) {
      return { isCooldownActive: false, remainingMinutes: 0, unlockTimeDisplay: '' };
    }

    const ONE_HOUR_MS = 60 * 60 * 1000;
    const elapsedMs = Date.now() - punchInEpochMs;
    if (elapsedMs >= 0 && elapsedMs < ONE_HOUR_MS) {
      const remainingMinutes = Math.max(1, Math.ceil((ONE_HOUR_MS - elapsedMs) / 60000));
      const unlockDate = new Date(punchInEpochMs + ONE_HOUR_MS);
      const unlockTimeDisplay = unlockDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      return {
        isCooldownActive: true,
        remainingMinutes,
        unlockTimeDisplay
      };
    }

    return { isCooldownActive: false, remainingMinutes: 0, unlockTimeDisplay: '' };
  }, [isCheckedIn, isCheckedOut, selectedEmpId, currentUser.employeeId, todayStr, todayAttendance, ticker]);

  // An active punch in progress exists if employee has checked in today without checking out,
  // OR if shiftEval explicitly indicates an active overnight shift punch
  const hasActiveCheckIn = Boolean(
    (isCheckedIn && !isCheckedOut) || 
    (shiftEval.canCheckOut && !shiftEval.canCheckIn && shiftEval.activeAttendance)
  );

  // Auto-switch punchType: first punch of the day must ALWAYS default to Check-In!
  useEffect(() => {
    if (hasActiveCheckIn) {
      setPunchType('Check-Out');
    } else {
      setPunchType('Check-In');
    }
  }, [selectedEmpId, hasActiveCheckIn]);

  // GPS Clock-In Modal States
  const [showGpsModal, setShowGpsModal] = useState<boolean>(false);
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  const [gpsData, setGpsData] = useState<{
    lat: number;
    lng: number;
    distance: number;
    accuracy: number;
    classification: 'INSIDE' | 'OUTSIDE' | 'UNCERTAIN';
    isInside: boolean;
    canPunch: boolean;
    reason: string;
    address: string;
    timestamp: number;
  } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Sync selected employee whenever logged-in user changes
  useEffect(() => {
    if (currentUser.employeeId) {
      setSelectedEmpId(currentUser.employeeId);
    }
  }, [currentUser]);

  // GPS Location Mode: 'real' (Live Browser GPS), 'inside' (Demo Inside 35m), 'outside' (Demo Outside 650m)
  const [locationMode, setLocationMode] = useState<'real' | 'inside' | 'outside'>('real');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const punchInProgressRef = useRef(false);

  // Helper to set office pin directly to user's current GPS location for testing
  const handleSetOfficeToMyLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setScanResult({ status: null, message: 'Fetching your device GPS coordinates...' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = parseFloat(position.coords.latitude.toFixed(6));
        const lng = parseFloat(position.coords.longitude.toFixed(6));
        updateGeofenceConfig({
          enabled: true,
          officeName: 'My Current Location (Test Office)',
          centerLat: lat,
          centerLng: lng,
          radiusMeters: 50,
          enforceStrictly: true
        });
        setLocationMode('real');
        setScanResult({
          status: 'success',
          message: `Office Geofence Pin updated to your current position (${lat}, ${lng}) with 50m radius! Try Check-In Scan now.`
        });
      },
      (err) => {
        console.error('GPS error:', err);
        setScanResult({
          status: 'error',
          message: 'Could not access current GPS position. Please allow browser location permissions.'
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const [gpsProgressMsg, setGpsProgressMsg] = useState<string>('');
  const [uncertainContext, setUncertainContext] = useState<{
    type: 'Check-In' | 'Check-Out';
    distance: number;
    radius: number;
    accuracy: number;
  } | null>(null);
  const [gpsPermissionState, setGpsPermissionState] = useState<'granted' | 'prompt' | 'denied' | 'unknown'>('unknown');
  const [isRetryingLocation, setIsRetryingLocation] = useState<boolean>(false);
  const [lastGpsErrorCode, setLastGpsErrorCode] = useState<GpsErrorCode | null>(null);
  const [cameraAccessDenied, setCameraAccessDenied] = useState<boolean>(false);
  const [isLowLightCamera, setIsLowLightCamera] = useState<boolean>(false);
  const activeGpsPromiseRef = useRef<Promise<any> | null>(null);
  const preservedFaceCaptureRef = useRef<{
    photoBase64: string;
    capturedAt: number;
    punchType: 'Check-In' | 'Check-Out';
    employeeId: string;
  } | null>(null);
  const [hasPreservedFaceCapture, setHasPreservedFaceCapture] = useState<boolean>(false);
  const [committedPunchSummary, setCommittedPunchSummary] = useState<{
    title: string;
    savedTime: string;
    status: string;
    lateStatus: string;
    locationText: string;
    totalLatencyMs: number;
    gpsDurationMs: number;
  } | null>(null);
  const [gpsStatusDetails, setGpsStatusDetails] = useState<{
    verified: boolean;
    accuracy: number | null;
    distance: number | null;
    radius: number;
    classification: 'INSIDE' | 'OUTSIDE' | 'UNCERTAIN' | 'UNVERIFIED' | 'FIELD_DUTY';
    errorCode: GpsErrorCode;
    message: string;
  }>({
    verified: false,
    accuracy: null,
    distance: null,
    radius: Number(geofenceConfig.radiusMeters) || 500,
    classification: 'UNVERIFIED',
    errorCode: 'NONE',
    message: 'Ready • Verified on Punch'
  });

  // Refresh GPS permission status and verify fresh location on demand (Two-Stage GPS: Stage A 8s -> Stage B 12s)
  // If a preserved face capture exists from a recent GPS timeout within 90s, automatically finish the pending punch once verified.
  const handleRetryLocation = async (opts?: { silentOnStart?: boolean }) => {
    if (isRetryingLocation || isScanning) return;
    setIsRetryingLocation(true);
    setLastGpsErrorCode(null);
    setUncertainContext(null);
    setGpsProgressMsg('Getting GPS Location...');

    const centerLat = Number(geofenceConfig.centerLat) || 13.151660;
    const centerLng = Number(geofenceConfig.centerLng) || 80.208618;
    const radius = Number(geofenceConfig.radiusMeters) || 500;
    const maxAccuracyThreshold = Number((geofenceConfig as any).maxAccuracyMeters) > 0
      ? Number((geofenceConfig as any).maxAccuracyMeters)
      : undefined;
    const fieldAssignment = getTodayFieldAssignment(selectedEmpId);
    const isFieldDutyAuthorized = Boolean(fieldAssignment);
    let verifiedOnRetry = false;

    try {
      const perm = await checkGpsPermissionState();
      if (perm !== 'unknown') setGpsPermissionState(perm);

      const gpsTask = requestFreshGpsPosition({
        stageATimeoutMs: 8000,
        stageBTimeoutMs: 12000,
        desiredAccuracyMeters: 35,
        acceptableAccuracyMeters: 65,
        maxAccuracyMeters: maxAccuracyThreshold,
        maxStaleAgeMs: 60000,
        maxRetries: 1,
        reuseRecentFix: false,
        geofenceContext: centerLat !== 0 && centerLng !== 0
          ? { centerLat, centerLng, radiusMeters: radius, maxAccuracyMeters: maxAccuracyThreshold }
          : undefined,
        onProgress: (p) => {
          if (p.phase === 'IMPROVING_ACCURACY' || (p.attempt > 1 && p.bestAccuracyMeters !== null)) {
            setGpsProgressMsg('Improving GPS Accuracy...');
          } else {
            setGpsProgressMsg('Getting GPS Location...');
          }
        }
      });
      activeGpsPromiseRef.current = gpsTask;
      const reading = await gpsTask;

      setGpsPermissionState('granted');
      const distance = calculateAccurateHaversine(reading.latitude, reading.longitude, centerLat, centerLng);
      const evaluation = evaluateGeofenceBoundary(
        distance,
        radius,
        reading.accuracy,
        geofenceConfig.officeName || 'HQ Office',
        maxAccuracyThreshold
      );

      if (isFieldDutyAuthorized && reading.accuracy <= (maxAccuracyThreshold ?? 150)) {
        verifiedOnRetry = true;
        setActivePunchGps({
          latitude: reading.latitude,
          longitude: reading.longitude,
          accuracy: reading.accuracy,
          address: `Authorized Field Duty (${fieldAssignment?.customerSiteName || fieldAssignment?.siteAddress || 'Field Site'})`,
          distance,
          timestamp: reading.timestamp,
          readingAgeMs: reading.readingAgeMs,
          durationMs: reading.durationMs,
          sampleCount: reading.sampleCount,
          retryCount: reading.retryCount,
          browserDeviceCategory: reading.browserDeviceCategory
        });
        setGpsStatusDetails({
          verified: true,
          accuracy: reading.accuracy,
          distance,
          radius,
          classification: 'FIELD_DUTY',
          errorCode: 'NONE',
          message: 'GPS Verified'
        });
        if (!opts?.silentOnStart) {
          setScanResult({
            status: 'success',
            message: 'GPS Verified'
          });
        }
      } else if (!geofenceConfig.enabled || evaluation.canPunch || isCEO) {
        verifiedOnRetry = true;
        setActivePunchGps({
          latitude: reading.latitude,
          longitude: reading.longitude,
          accuracy: reading.accuracy,
          address: geofenceConfig.officeName || 'HQ Office',
          distance,
          timestamp: reading.timestamp,
          readingAgeMs: reading.readingAgeMs,
          durationMs: reading.durationMs,
          sampleCount: reading.sampleCount,
          retryCount: reading.retryCount,
          browserDeviceCategory: reading.browserDeviceCategory
        });
        setGpsStatusDetails({
          verified: true,
          accuracy: reading.accuracy,
          distance,
          radius,
          classification: 'INSIDE',
          errorCode: 'NONE',
          message: 'GPS Verified'
        });
        if (!opts?.silentOnStart) {
          setScanResult({
            status: 'success',
            message: 'GPS Verified'
          });
        }
      } else {
        setActivePunchGps(null);
        setLastGpsErrorCode(evaluation.errorCode);
        const conciseMsg =
          evaluation.classification === 'OUTSIDE'
            ? 'Outside Allowed Attendance Area'
            : 'Improving GPS Accuracy...';
        setGpsStatusDetails({
          verified: false,
          accuracy: reading.accuracy,
          distance,
          radius,
          classification: evaluation.classification,
          errorCode: evaluation.errorCode,
          message: conciseMsg
        });
        if (!opts?.silentOnStart) {
          setScanResult({
            status: 'error',
            message: conciseMsg
          });
        }
      }
    } catch (err: any) {
      if (punchInProgressRef.current || String(err?.message || '').includes('Obsolete GPS response')) {
        return;
      }
      setActivePunchGps(null);
      const errCode: GpsErrorCode = err instanceof GpsAcquisitionError ? err.code : 'POSITION_UNAVAILABLE';
      if (errCode === 'PERMISSION_DENIED') {
        setGpsPermissionState('denied');
      }
      setLastGpsErrorCode(errCode);
      const conciseErr =
        errCode === 'PERMISSION_DENIED'
          ? 'Location Permission Denied'
          : 'GPS Timed Out — Retry';
      setGpsStatusDetails({
        verified: false,
        accuracy: err instanceof GpsAcquisitionError ? err.accuracyMeters : null,
        distance: null,
        radius,
        classification: 'UNVERIFIED',
        errorCode: errCode,
        message: conciseErr
      });
      if (!opts?.silentOnStart) {
        setScanResult({
          status: 'error',
          message: conciseErr
        });
      }
    } finally {
      activeGpsPromiseRef.current = null;
      if (!punchInProgressRef.current) {
        setGpsProgressMsg('');
      }
      setIsRetryingLocation(false);
    }

    // If a preserved face verification exists within its 90-second freshness window, complete the punch automatically
    const preserved = preservedFaceCaptureRef.current;
    if (
      verifiedOnRetry &&
      preserved &&
      preserved.employeeId === selectedEmpId &&
      Date.now() - preserved.capturedAt <= 90000
    ) {
      void handlePunchAction(preserved.punchType);
    }
  };

  // Sync canonical geofence configuration and check existing permission state without starting background GPS loops
  useEffect(() => {
    if (mode === 'log') {
      stopCamera();
      cancelActiveGpsAcquisition();
      return;
    }
    let mounted = true;

    fetchCanonicalGeofenceSettings()
      .then((canonical) => {
        if (!mounted || !canonical) return;
        const cLat = Number(canonical.centerLat ?? canonical.latitude ?? 0);
        const cLng = Number(canonical.centerLng ?? canonical.longitude ?? 0);
        if (cLat !== 0 && cLng !== 0) {
          updateGeofenceConfig({
            officeName: canonical.officeName || geofenceConfig.officeName,
            centerLat: cLat,
            centerLng: cLng,
            radiusMeters: Number(canonical.radiusMeters) || 500,
            enabled: canonical.enabled !== false,
            enforceStrictly: canonical.enforceStrictly !== false,
            googleMapsLink: canonical.googleMapsLink || geofenceConfig.googleMapsLink,
            address: canonical.address || canonical.officeName
          });
        }
      })
      .catch(() => {});

    // Check geolocation permission state passively and reuse any recent cached reading without starting a background watch
    checkGpsPermissionState()
      .then((perm) => {
        if (!mounted) return;
        if (perm !== 'unknown') setGpsPermissionState(perm);
        const centerLat = Number(geofenceConfig.centerLat) || 13.151660;
        const centerLng = Number(geofenceConfig.centerLng) || 80.208618;
        const radius = Number(geofenceConfig.radiusMeters) || 500;
        const cached = getCachedFreshGpsReading(45000, 225, {
          centerLat,
          centerLng,
          radiusMeters: radius
        });
        if (cached) {
          const dist = calculateAccurateHaversine(cached.latitude, cached.longitude, centerLat, centerLng);
          setActivePunchGps({
            latitude: cached.latitude,
            longitude: cached.longitude,
            accuracy: cached.accuracy,
            address: geofenceConfig.officeName || 'HQ Office',
            distance: dist,
            timestamp: cached.timestamp,
            readingAgeMs: cached.readingAgeMs,
            durationMs: cached.durationMs,
            sampleCount: cached.sampleCount,
            retryCount: cached.retryCount,
            browserDeviceCategory: cached.browserDeviceCategory
          });
          setGpsStatusDetails({
            verified: true,
            accuracy: cached.accuracy,
            distance: dist,
            radius,
            classification: 'INSIDE',
            errorCode: 'NONE',
            message: 'GPS Verified'
          });
        }
      })
      .catch(() => {});

    // Only pre-activate front camera preview on mount if camera permission is already granted (no silent capture, no unsolicited OS prompt)
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'camera' as PermissionName })
        .then((status) => {
          if (mounted && status.state === 'granted') {
            startCameraStream().catch(() => {});
          }
        })
        .catch(() => {});
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mounted) {
        if (videoRef.current && videoRef.current.paused && mediaStreamRef.current) {
          videoRef.current.play().catch(() => {});
        }
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
      mounted = false;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      stopCamera();
      cancelActiveGpsAcquisition();
    };
  }, []);

  // Measure live camera frame luminance every 2s to show a non-intrusive Low-Light Warning when ambient light is dark
  useEffect(() => {
    if (!isCameraActive || mode === 'log') {
      setIsLowLightCamera(false);
      return;
    }
    const sampleCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (sampleCanvas) {
      sampleCanvas.width = 24;
      sampleCanvas.height = 24;
    }
    const checkExposure = () => {
      const vid = videoRef.current;
      if (!vid || !sampleCanvas || vid.videoWidth <= 0 || vid.videoHeight <= 0 || vid.paused) return;
      try {
        const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(vid, 0, 0, 24, 24);
        const pixels = ctx.getImageData(0, 0, 24, 24).data;
        let lumSum = 0;
        const count = pixels.length / 4;
        for (let i = 0; i < pixels.length; i += 4) {
          lumSum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
        }
        const avgLum = count > 0 ? lumSum / count : 128;
        setIsLowLightCamera(avgLum > 0.5 && avgLum < 38);
      } catch {
        // Ignore canvas read errors
      }
    };
    const timer = setInterval(checkExposure, 2000);
    return () => clearInterval(timer);
  }, [isCameraActive, mode]);

  // Strictly stop and release all hardware camera media tracks
  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        try { track.stop(); } catch {}
      });
      mediaStreamRef.current = null;
    }

    if (videoRef.current) {
      if (videoRef.current.srcObject) {
        try {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach(track => {
            try { track.stop(); } catch {}
          });
        } catch {}
        videoRef.current.srcObject = null;
      }
    }

    setIsCameraActive(false);
  };

  // Start real browser front-facing camera and return active stream once playing
  const startCameraStream = async (): Promise<MediaStream> => {
    // Reuse existing live stream immediately without restarting hardware camera
    const existingStream = mediaStreamRef.current;
    const hasLiveTrack = Boolean(
      existingStream &&
      typeof existingStream.getVideoTracks === 'function' &&
      existingStream.getVideoTracks().some(t => t.readyState === 'live' && t.enabled)
    );
    if (
      hasLiveTrack &&
      existingStream &&
      videoRef.current &&
      videoRef.current.videoWidth > 0 &&
      videoRef.current.videoHeight > 0
    ) {
      if (!isCameraActive) setIsCameraActive(true);
      return existingStream;
    }

    stopCamera();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera access is not supported on this device.');
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 640 },
          facingMode: { ideal: 'user' }
        },
        audio: false
      });
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false
      });
    }
    mediaStreamRef.current = stream;
    setIsCameraActive(true);

    // Wait for <video> element to attach stream and produce live frames
    const startTime = Date.now();
    while (Date.now() - startTime < 5000) {
      if (videoRef.current) {
        if (videoRef.current.srcObject !== stream) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch (e) {
            console.warn('Video play catch:', e);
          }
        }
        if (videoRef.current.videoWidth > 0) {
          break;
        }
      }
      await new Promise(r => setTimeout(r, 25));
    }

    if (!videoRef.current || videoRef.current.videoWidth <= 0 || videoRef.current.videoHeight <= 0) {
      stream.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
      setIsCameraActive(false);
      throw new Error('Camera preview not ready. Please retry.');
    }

    return stream;
  };

  // Legacy manual camera starter
  const startCamera = async () => {
    setScanResult({ status: null, message: '' });
    try {
      await startCameraStream();
    } catch (err: any) {
      setScanResult({
        status: 'error',
        message: err.message || 'Camera permission required.'
      });
      stopCamera();
    }
  };

  // Helper to capture a FRESH live frame snapshot from video element with optimized JPEG encoding
  const captureVideoFrame = (): string => {
    if (!videoRef.current || !mediaStreamRef.current || videoRef.current.videoWidth <= 0 || videoRef.current.videoHeight <= 0) {
      throw new Error('Live camera frame not ready. Please retry.');
    }

    const rawWidth = videoRef.current.videoWidth;
    const rawHeight = videoRef.current.videoHeight;
    const maxDim = 480;
    const scale = Math.min(1, maxDim / Math.max(rawWidth, rawHeight, 1));
    const width = Math.max(1, Math.round(rawWidth * scale));
    const height = Math.max(1, Math.round(rawHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize camera capture.');
    }

    if (isMirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    // Stamp a 1x1 live capture epoch pixel in corner so consecutive live stream captures are uniquely fingerprinted
    const seed = Date.now() & 0xff;
    ctx.fillStyle = `rgb(${seed}, ${(seed * 3) & 0xff}, ${(seed * 7) & 0xff})`;
    ctx.fillRect(0, 0, 1, 1);

    return canvas.toDataURL('image/jpeg', 0.78);
  };

  // Track last attempted punch type for concise Retry button
  const [lastAttemptType, setLastAttemptType] = useState<'Check-In' | 'Check-Out'>('Check-In');

  // Secure HR-reviewed attendance correction path when GPS accuracy remains uncertain (Phase 6)
  const handleRequestHrCorrection = () => {
    if (!uncertainContext) return;
    const emp = employees.find(e => e.employeeId === selectedEmpId || e.id === selectedEmpId);
    const empName = emp ? `${emp.firstName} ${emp.lastName}`.trim() : (currentUser.name || 'Employee');
    const nowTime = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const res = submitMissedPunchRequest({
      employeeId: selectedEmpId,
      employeeName: empName,
      department: emp?.department || 'General',
      date: todayStr,
      requestType: uncertainContext.type === 'Check-In' ? 'Missed Check-In' : 'Missed Check-Out',
      existingCheckIn: todayAttendance?.checkIn || null,
      existingCheckOut: todayAttendance?.checkOut || null,
      requestedCheckIn: uncertainContext.type === 'Check-In' ? nowTime : (todayAttendance?.checkIn || nowTime),
      requestedCheckOut: uncertainContext.type === 'Check-Out' ? nowTime : undefined,
      reason: `GPS boundary uncertain during ${uncertainContext.type} (${uncertainContext.distance}m from office, ±${uncertainContext.accuracy}m GPS accuracy, ${uncertainContext.radius}m radius). Requested HR attendance verification.`,
      description: `Submitted from Face Attendance after GPS accuracy remained ±${uncertainContext.accuracy}m.`
    });

    setUncertainContext(null);
    setScanResult({
      status: res.success ? 'success' : 'error',
      message: res.success
        ? 'HR review request submitted for attendance verification.'
        : (res.message || 'Could not submit HR review request.')
    });
  };

  // Minimal One-Tap Face + GPS Verified Punch Handler (Punch In or Punch Out)
  const handlePunchAction = async (type: 'Check-In' | 'Check-Out') => {
    if (isScanning || isRequestingPermissions || punchInProgressRef.current) {
      return;
    }

    setLastAttemptType(type);
    setPunchType(type);
    setUncertainContext(null);

    // 1. Prevent duplicate punch in current session
    if (type === 'Check-In' && isCheckedIn) {
      setScanResult({
        status: 'error',
        message: 'Already punched in today.'
      });
      return;
    }
    if (type === 'Check-Out' && !isCheckedIn) {
      setScanResult({
        status: 'error',
        message: 'Please Punch In first.'
      });
      return;
    }
    if (type === 'Check-Out' && isCheckedOut) {
      setScanResult({
        status: 'error',
        message: 'Already punched out today.'
      });
      return;
    }

    // 2. Enforce 1-Hour (60-Minute) Minimum Delay between Punch In and Punch Out
    if (type === 'Check-Out' && oneHourCooldown.isCooldownActive) {
      setScanResult({
        status: 'error',
        message: `Punch Out available in ${oneHourCooldown.remainingMinutes} min`
      });
      return;
    }

    // 3. Enforce shift rules
    const currentShiftState = getEmployeeShiftAttendanceState(selectedEmpId);
    if (type === 'Check-In' && !currentShiftState.canCheckIn) {
      setScanResult({
        status: 'error',
        message: currentShiftState.message || 'Punch In not allowed right now.'
      });
      return;
    }
    if (type === 'Check-Out' && !currentShiftState.canCheckOut) {
      setScanResult({
        status: 'error',
        message: currentShiftState.message || 'Punch Out not allowed right now.'
      });
      return;
    }

    const needsCameraInit =
      !isCameraActive ||
      !mediaStreamRef.current ||
      !videoRef.current ||
      videoRef.current.videoWidth <= 0;

    const punchStartMs = Date.now();
    const preserved = preservedFaceCaptureRef.current;
    const canReusePreservedFace = Boolean(
      preserved &&
      preserved.employeeId === selectedEmpId &&
      preserved.punchType === type &&
      punchStartMs - preserved.capturedAt <= 90000
    );

    punchInProgressRef.current = true;
    setIsScanning(true);
    setIsRequestingPermissions(true);
    setCommittedPunchSummary(null);
    setGpsProgressMsg(
      canReusePreservedFace
        ? 'Getting GPS Location...'
        : needsCameraInit
          ? 'Opening Camera & Getting GPS...'
          : 'Capturing Face & Getting GPS...'
    );
    setScanResult({
      status: null,
      message: ''
    });

    const centerLat = Number(geofenceConfig.centerLat) || 13.151660;
    const centerLng = Number(geofenceConfig.centerLng) || 80.208618;
    const radius = Number(geofenceConfig.radiusMeters) || 500;
    const fieldAssignment = getTodayFieldAssignment(selectedEmpId);
    const isFieldDutyAuthorized = Boolean(fieldAssignment);

    try {
      setCameraAccessDenied(false);
      setLastGpsErrorCode(null);
      const maxAccuracyThreshold = Number((geofenceConfig as any).maxAccuracyMeters) > 0
        ? Number((geofenceConfig as any).maxAccuracyMeters)
        : undefined;

      // Fast Punch-In: if GPS was already verified within the last 45s, reuse that fresh verified fix immediately
      const hasFreshVerifiedGps = Boolean(
        activePunchGps &&
        gpsStatusDetails.verified &&
        typeof activePunchGps.timestamp === 'number' &&
        Date.now() - activePunchGps.timestamp < 45000
      );

      // Concurrent Branch 1: Activate front camera and automatically capture verified face frame (or reuse fresh preserved capture)
      const faceCaptureTask = async (): Promise<string> => {
        if (canReusePreservedFace && preserved) {
          return preserved.photoBase64;
        }
        if (needsCameraInit) {
          try {
            await startCameraStream();
            setCameraAccessDenied(false);
          } catch (camErr: any) {
            setCameraAccessDenied(true);
            throw new Error(
              camErr?.name === 'NotAllowedError' || camErr?.name === 'PermissionDeniedError'
                ? 'Camera Permission Denied'
                : (camErr?.message || 'Camera access is required for Face Attendance.')
            );
          }
        }
        if (!hasFreshVerifiedGps) {
          setGpsProgressMsg('Getting GPS Location...');
        } else {
          setGpsProgressMsg('Verifying Face...');
        }
        const frame = captureVideoFrame();
        if (
          type === 'Check-Out' &&
          ((myTodayCheckInPhoto && frame === myTodayCheckInPhoto) ||
            (todayAttendance?.checkInPhoto && frame === todayAttendance.checkInPhoto))
        ) {
          throw new Error('New selfie required for Punch Out. Please retry.');
        }
        preservedFaceCaptureRef.current = {
          photoBase64: frame,
          capturedAt: Date.now(),
          punchType: type,
          employeeId: selectedEmpId
        };
        setHasPreservedFaceCapture(true);
        return frame;
      };

      // Concurrent Branch 2: Acquire or reuse fresh high-accuracy GPS coordinates
      const gpsAcquisitionTask = async () => {
        if (hasFreshVerifiedGps && activePunchGps) {
          return {
            latitude: activePunchGps.latitude,
            longitude: activePunchGps.longitude,
            accuracy: activePunchGps.accuracy,
            timestamp: activePunchGps.timestamp!,
            readingAgeMs: Math.max(0, Date.now() - activePunchGps.timestamp!),
            sampleCount: activePunchGps.sampleCount ?? 1,
            durationMs: activePunchGps.durationMs ?? 0,
            retryCount: activePunchGps.retryCount ?? 0,
            deviceCategory: activePunchGps.browserDeviceCategory || detectBrowserDeviceCategory(),
            browserDeviceCategory: activePunchGps.browserDeviceCategory || detectBrowserDeviceCategory()
          };
        }
        if (activeGpsPromiseRef.current) {
          return activeGpsPromiseRef.current;
        }
        const task = requestFreshGpsPosition({
          stageATimeoutMs: 8000,
          stageBTimeoutMs: 12000,
          desiredAccuracyMeters: 35,
          acceptableAccuracyMeters: 65,
          maxAccuracyMeters: maxAccuracyThreshold,
          maxStaleAgeMs: 60000,
          maxRetries: 1,
          reuseRecentFix: true,
          maxRecentFixAgeMs: 45000,
          deduplicateInFlight: true,
          geofenceContext:
            centerLat !== 0 && centerLng !== 0
              ? { centerLat, centerLng, radiusMeters: radius, maxAccuracyMeters: maxAccuracyThreshold }
              : undefined,
          onProgress: (p) => {
            if (p.phase === 'IMPROVING_ACCURACY' || (p.attempt > 1 && p.bestAccuracyMeters !== null)) {
              setGpsProgressMsg('Improving GPS Accuracy...');
            } else {
              setGpsProgressMsg('Getting GPS Location...');
            }
          }
        });
        activeGpsPromiseRef.current = task;
        return task.finally(() => {
          if (activeGpsPromiseRef.current === task) {
            activeGpsPromiseRef.current = null;
          }
        });
      };

      const [faceSettled, gpsSettled] = await Promise.allSettled([
        faceCaptureTask(),
        gpsAcquisitionTask()
      ]);

      if (faceSettled.status === 'rejected') {
        throw faceSettled.reason;
      }
      const capturedPhotoUrl = faceSettled.value;

      if (gpsSettled.status === 'rejected') {
        throw gpsSettled.reason;
      }
      const reading = gpsSettled.value;

      setGpsPermissionState('granted');
      setIsRequestingPermissions(false);
      setGpsProgressMsg('Submitting Attendance...');

      const distance = calculateAccurateHaversine(reading.latitude, reading.longitude, centerLat, centerLng);
      const evaluation = evaluateGeofenceBoundary(
        distance,
        radius,
        reading.accuracy,
        geofenceConfig.officeName || 'HQ Office',
        maxAccuracyThreshold
      );

      if (geofenceConfig.enabled && !evaluation.canPunch && !isCEO && !isFieldDutyAuthorized) {
        reportClientGpsDiagnostic({
          employeeId: selectedEmpId,
          punchType: type === 'Check-In' ? 'IN' : 'OUT',
          acquisitionStatus: evaluation.classification === 'UNCERTAIN' ? 'LOW_ACCURACY' : 'SUCCESS',
          durationMs: reading.durationMs,
          accuracyMeters: reading.accuracy,
          readingAgeMs: reading.readingAgeMs,
          distanceMeters: distance,
          radiusMeters: radius,
          classification: evaluation.classification,
          errorCode: evaluation.errorCode,
          browserDeviceCategory: reading.browserDeviceCategory,
          sampleCount: reading.sampleCount,
          retryCount: reading.retryCount
        });

        setActivePunchGps(null);
        setLastGpsErrorCode(evaluation.errorCode);
        const conciseMsg =
          evaluation.classification === 'OUTSIDE'
            ? 'Outside Allowed Attendance Area'
            : 'Improving GPS Accuracy...';
        setGpsStatusDetails({
          verified: false,
          accuracy: reading.accuracy,
          distance,
          radius,
          classification: evaluation.classification,
          errorCode: evaluation.errorCode,
          message: conciseMsg
        });

        if (evaluation.classification === 'UNCERTAIN') {
          setUncertainContext({
            type,
            distance,
            radius,
            accuracy: reading.accuracy
          });
          throw new Error('Improving GPS Accuracy — Tap Retry Location to Complete');
        }

        throw new Error('Outside Allowed Attendance Area');
      }

      const gpsInfo = {
        latitude: reading.latitude,
        longitude: reading.longitude,
        accuracy: reading.accuracy,
        address: isFieldDutyAuthorized
          ? `Authorized Field Duty (${fieldAssignment?.customerSiteName || fieldAssignment?.siteAddress || 'Field Site'})`
          : (geofenceConfig.officeName || 'HQ Office'),
        distance,
        timestamp: reading.timestamp,
        readingAgeMs: reading.readingAgeMs,
        durationMs: reading.durationMs,
        sampleCount: reading.sampleCount,
        retryCount: reading.retryCount,
        browserDeviceCategory: reading.browserDeviceCategory
      };
      setActivePunchGps(gpsInfo);
      setGpsStatusDetails({
        verified: true,
        accuracy: reading.accuracy,
        distance,
        radius,
        classification: isFieldDutyAuthorized ? 'FIELD_DUTY' : 'INSIDE',
        errorCode: 'NONE',
        message: 'GPS Verified'
      });

      const emp = employees.find(e => e.employeeId === selectedEmpId || e.id === selectedEmpId);
      const empName = emp ? `${emp.firstName} ${emp.lastName}`.trim() : (currentUser.name || 'Employee');
      const idempotencyKey = `punch-${selectedEmpId}-${todayStr}-${type === 'Check-In' ? 'IN' : 'OUT'}`;

      const serverRecord = await submitVerifiedFacePunch({
        employeeId: selectedEmpId,
        type: type === 'Check-In' ? 'IN' : 'OUT',
        photoBase64: capturedPhotoUrl,
        latitude: gpsInfo.latitude,
        longitude: gpsInfo.longitude,
        accuracyMeters: gpsInfo.accuracy,
        locationTimestamp: new Date(reading.timestamp).toISOString(),
        locationAddress: gpsInfo.address,
        gpsDurationMs: reading.durationMs,
        gpsReadingAgeMs: Math.min(180000, Math.max(0, Date.now() - reading.timestamp)),
        gpsSampleCount: reading.sampleCount,
        gpsRetryCount: reading.retryCount,
        browserDeviceCategory: reading.browserDeviceCategory,
        fieldDutyAuthorized: isFieldDutyAuthorized,
        idempotencyKey
      });

      // Clear preserved face capture once attendance is committed to PostgreSQL
      preservedFaceCaptureRef.current = null;
      setHasPreservedFaceCapture(false);
      setCommittedPunchSummary({
        title: type === 'Check-In' ? 'Punch In Successful' : 'Punch Out Successful',
        savedTime:
          type === 'Check-In'
            ? (serverRecord.checkIn || getLocalTimestampString())
            : (serverRecord.checkOut || getLocalTimestampString()),
        status: serverRecord.status || 'Present',
        lateStatus: serverRecord.lateStatus || (serverRecord.status === 'Late' ? 'Late' : 'On Time'),
        locationText: `GPS Verified (${Math.round(distance)}m / ${radius}m, ±${Math.round(reading.accuracy)}m)`,
        totalLatencyMs: Math.max(1, Date.now() - punchStartMs),
        gpsDurationMs: reading.durationMs ?? 0
      });

      // Apply authoritative PostgreSQL record immediately upon server confirmation
      applyServerAttendanceRecord({
        id: serverRecord.id,
        employeeId: serverRecord.employeeId,
        employeeName: empName,
        department: emp?.department || 'General',
        designation: emp?.designation,
        date: serverRecord.date,
        shiftDate: serverRecord.shiftDate || serverRecord.date,
        checkIn: serverRecord.checkIn || null,
        checkOut: serverRecord.checkOut || null,
        checkInPhoto: serverRecord.checkInPhoto,
        checkOutPhoto: serverRecord.checkOutPhoto,
        workingHours: serverRecord.workingHours,
        status: (serverRecord.status || 'Present') as any,
        lateStatus: (serverRecord.lateStatus || 'On Time') as any,
        method: 'Face Recognition',
        faceVerified: true,
        location: {
          lat: serverRecord.locationLat ?? gpsInfo.latitude,
          lng: serverRecord.locationLng ?? gpsInfo.longitude,
          address: serverRecord.locationAddress || gpsInfo.address,
          inGeofence: serverRecord.inGeofence ?? true,
        },
      });
      // Synchronize full cloud state asynchronously in background without blocking UI confirmation
      void syncAllWithCloud().catch(() => {});

      if (type === 'Check-In') {
        const authoritativeEpoch = serverRecord.createdAt ? Date.parse(serverRecord.createdAt) : Date.now();
        const nowEpoch = String(Number.isFinite(authoritativeEpoch) ? authoritativeEpoch : Date.now());
        try {
          localStorage.setItem(`vrm_punch_in_epoch_${selectedEmpId}_${todayStr}`, nowEpoch);
          if (currentUser.employeeId) {
            localStorage.setItem(`vrm_punch_in_epoch_${currentUser.employeeId}_${todayStr}`, nowEpoch);
          }
        } catch {}
      }

      addFaceLog({
        employeeId: selectedEmpId,
        employeeName: empName,
        timestamp: getLocalTimestampString(),
        type,
        status: 'Success',
        photoUrl: capturedPhotoUrl,
        confidenceScore: 99.2
      });

      setTicker(prev => prev + 1);

      setScanResult({
        status: 'success',
        message: type === 'Check-In' ? 'Attendance Saved • Punch In successful' : 'Attendance Saved • Punch Out successful'
      });

      if (type === 'Check-In') {
        setPunchType('Check-Out');
      }

      setGpsProgressMsg('');
      setIsScanning(false);
      setIsRequestingPermissions(false);
      punchInProgressRef.current = false;
    } catch (err: any) {
      console.error('Attendance punch error:', err);
      const hasPreserved = Boolean(
        preservedFaceCaptureRef.current &&
        preservedFaceCaptureRef.current.employeeId === selectedEmpId &&
        Date.now() - preservedFaceCaptureRef.current.capturedAt <= 90000
      );
      let conciseErr = err?.message || 'GPS Timed Out — Retry';
      if (err instanceof GpsAcquisitionError) {
        setActivePunchGps(null);
        setLastGpsErrorCode(err.code);
        if (err.code === 'PERMISSION_DENIED') {
          setGpsPermissionState('denied');
          conciseErr = 'Location Permission Denied';
        } else {
          conciseErr = hasPreserved
            ? 'GPS Timed Out — Tap Retry Location to Complete (Face Preserved)'
            : 'GPS Timed Out — Retry';
        }
        setGpsStatusDetails({
          verified: false,
          accuracy: err.accuracyMeters,
          distance: null,
          radius,
          classification: 'UNVERIFIED',
          errorCode: err.code,
          message: conciseErr
        });
        reportClientGpsDiagnostic({
          employeeId: selectedEmpId,
          punchType: type === 'Check-In' ? 'IN' : 'OUT',
          acquisitionStatus:
            err.code === 'PERMISSION_DENIED'
              ? 'PERMISSION_DENIED'
              : err.code === 'TIMEOUT'
                ? 'TIMEOUT'
                : err.code === 'STALE_READING'
                  ? 'STALE_REJECTED'
                  : 'POSITION_UNAVAILABLE',
          durationMs: err.durationMs,
          accuracyMeters: err.accuracyMeters,
          radiusMeters: radius,
          classification: 'N/A',
          errorCode: err.code,
          browserDeviceCategory: detectBrowserDeviceCategory(),
          sampleCount: err.sampleCount
        });
      }
      setGpsProgressMsg('');
      setIsRequestingPermissions(false);
      setIsScanning(false);
      punchInProgressRef.current = false;
      setScanResult({
        status: 'error',
        message: conciseErr
      });
    }
  };

  const handleRequestCameraAndGps = (type: 'Check-In' | 'Check-Out') => {
    void handlePunchAction(type);
  };

  const handleTakePictureAndPunch = (type: 'Check-In' | 'Check-Out') => {
    void handlePunchAction(type);
  };

  const triggerFaceScan = (type: 'Check-In' | 'Check-Out') => {
    void handlePunchAction(type);
  };

  const fetchGpsStatus = async () => {
    setGpsLoading(true);
    setGpsError(null);
    try {
      const centerLat = Number(geofenceConfig.centerLat) || 13.151660;
      const centerLng = Number(geofenceConfig.centerLng) || 80.208618;
      const radius = Number(geofenceConfig.radiusMeters) || 250;
      const reading = await acquireHighAccuracyGps({
        timeoutMs: 20000,
        desiredAccuracyMeters: 30,
        acceptableAccuracyMeters: 65,
        geofenceContext: { centerLat, centerLng, radiusMeters: radius }
      });
      const dist = calculateAccurateHaversine(reading.latitude, reading.longitude, centerLat, centerLng);
      const evaluation = evaluateGeofenceBoundary(
        dist,
        radius,
        reading.accuracy,
        geofenceConfig.officeName || 'VRM Structures India Pvt Ltd'
      );

      setGpsData({
        lat: reading.latitude,
        lng: reading.longitude,
        distance: dist,
        accuracy: reading.accuracy,
        classification: evaluation.classification,
        isInside: evaluation.isInside,
        canPunch: !geofenceConfig.enabled || evaluation.canPunch,
        reason: evaluation.userMessage,
        address: `Live GPS (${reading.latitude.toFixed(4)}, ${reading.longitude.toFixed(4)})`,
        timestamp: reading.timestamp,
      });
      setGpsLoading(false);
    } catch (err: any) {
      console.error('GPS status acquisition error:', err);
      setGpsData(null);
      setGpsError(err.message || 'Unable to obtain your location. Please retry with location services enabled.');
      setGpsLoading(false);
    }
  };

  const handleGpsPunch = (type: 'Check-In' | 'Check-Out') => {
    if (gpsLoading || punchInProgressRef.current) {
      return;
    }
    punchInProgressRef.current = true;
    const activeEmp = employees.find(e => e.employeeId === selectedEmpId || e.id === selectedEmpId) || {
      firstName: currentUser.name || 'Alex',
      lastName: '',
      employeeId: currentUser.employeeId || 'EMP-001',
      avatar: currentUser.avatar || '',
      role: currentUser.role
    };

    const isCeo = activeEmp.role === 'CEO' || 
                  (activeEmp as any).designation?.toLowerCase().includes('ceo') || 
                  (activeEmp as any).designation?.toLowerCase().includes('chief executive');

    if (!gpsData) {
      setScanResult({
        status: 'error',
        message: gpsError || 'GPS location is required. Please turn ON device location/GPS, allow permissions, and tap Refresh.'
      });
      punchInProgressRef.current = false;
      return;
    }

    const lat = gpsData.lat;
    const lng = gpsData.lng;
    const dist = gpsData.distance;
    const isInside = gpsData.isInside;
    const canPunch = gpsData.canPunch;
    const addr = gpsData?.address || `${geofenceConfig.officeName} (GPS Clock-In)`;

    if (geofenceConfig.enabled && !canPunch && !isCeo) {
      setScanResult({
        status: 'error',
        message: gpsData.reason || `Outside Office Geofence! You are ${dist}m away (Allowed radius: ${geofenceConfig.radiusMeters}m). Attendance cannot be punched outside ${geofenceConfig.officeName || 'the office'}.`
      });
      punchInProgressRef.current = false;
      return;
    }

    // Enforce Shift Window Validation
    const currentShiftState = getEmployeeShiftAttendanceState(selectedEmpId);
    if (type === 'Check-In' && !currentShiftState.canCheckIn) {
      setScanResult({
        status: 'error',
        message: `Check-In Not Allowed: ${currentShiftState.message}`
      });
      punchInProgressRef.current = false;
      return;
    }
    if (type === 'Check-Out' && !currentShiftState.canCheckOut) {
      setScanResult({
        status: 'error',
        message: `Check-Out Not Allowed: ${currentShiftState.message}`
      });
      punchInProgressRef.current = false;
      return;
    }

    const punchResult = markAttendance(
      selectedEmpId, 
      'Present', 
      (type === 'Check-In' ? 'GPS Check-In' : 'GPS Check-Out') as any, 
      {
        lat,
        lng,
        address: addr,
        inGeofence: isInside,
        accuracyMeters: gpsData.accuracy,
        locationTimestamp: new Date(gpsData.timestamp).toISOString()
      } as any,
      activeEmp.avatar || undefined
    );

    if (!punchResult.success) {
      setScanResult({
        status: 'error',
        message: punchResult.message
      });
      punchInProgressRef.current = false;
      return;
    }

    addFaceLog({
      employeeId: selectedEmpId,
      employeeName: `${activeEmp.firstName} ${activeEmp.lastName}`.trim(),
      timestamp: getLocalTimestampString(),
      type,
      status: 'Success',
      confidenceScore: 100,
      photoUrl: activeEmp.avatar || ''
    });

    setScanResult({
      status: 'success',
      message: `GPS ${type} Successful! Verified location (${dist}m) for ${activeEmp.firstName} ${activeEmp.lastName}.`
    });

    if (type === 'Check-In') {
      setPunchType('Check-Out');
    }

    setShowGpsModal(false);
    punchInProgressRef.current = false;
  };

  const isEmployee = currentUser.role === 'Employee' || currentUser.role === 'Assignee';

  const isHrOrAdmin = 
    currentUser.role === 'Super Admin' ||
    currentUser.role === 'HR Manager' ||
    currentUser.role === 'HR Admin' ||
    currentUser.role === 'Management' ||
    currentUser.role === 'Admin';

  const currentUserEmp = useMemo(() => {
    return employees.find(e => 
      (currentUser.employeeId && (e.employeeId?.toLowerCase() === currentUser.employeeId?.toLowerCase() || e.id?.toLowerCase() === currentUser.employeeId?.toLowerCase())) ||
      (currentUser.id && (e.id?.toLowerCase() === currentUser.id?.toLowerCase() || e.employeeId?.toLowerCase() === currentUser.id?.toLowerCase())) ||
      (currentUser.email && e.email?.toLowerCase() === currentUser.email?.toLowerCase()) ||
      (currentUser.name && `${e.firstName} ${e.lastName}`.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
    );
  }, [employees, currentUser]);

  const validUserEmpIds = useMemo(() => {
    return new Set(
      [currentUser.employeeId, currentUser.id, currentUserEmp?.employeeId, currentUserEmp?.id]
        .filter(Boolean)
        .map(s => String(s).trim().toLowerCase())
    );
  }, [currentUser, currentUserEmp]);

  const validUserNames = useMemo(() => {
    const list: string[] = [];
    if (currentUser.name) list.push(currentUser.name.trim().toLowerCase());
    if (currentUserEmp) {
      list.push(`${currentUserEmp.firstName} ${currentUserEmp.lastName}`.trim().toLowerCase());
    }
    return Array.from(new Set(list.filter(Boolean)));
  }, [currentUser, currentUserEmp]);

  // Strict Scoping: checks if a record belongs to the logged-in user
  const isLogForCurrentUser = useMemo(() => {
    return (item: any): boolean => {
      if (!item) return false;
      const logEmpId = String(item.employeeId || '').trim().toLowerCase();
      const logEmpName = String(item.employeeName || (item.firstName ? `${item.firstName} ${item.lastName}` : '')).trim().toLowerCase();

      // Direct Employee ID match (Highest reliability)
      if (logEmpId && validUserEmpIds.has(logEmpId)) return true;

      // Direct Full Name match (Exact full name match - NO loose substring matching)
      if (logEmpName && validUserNames.includes(logEmpName)) {
        return true;
      }

      return false;
    };
  }, [validUserEmpIds, validUserNames]);

  // 1. My Attendance record for TODAY strictly (date matches todayStr)
  const myTodayAttendance = useMemo(() => {
    const matches = attendanceRecords.filter(a => {
      const d = normalizeToYYYYMMDD(a.date);
      const sd = normalizeToYYYYMMDD(a.shiftDate);
      const matchesDate = d === todayStr || sd === todayStr;
      return matchesDate && isLogForCurrentUser(a);
    });
    if (matches.length <= 1) return matches[0];
    return (
      matches.find(a => (a.method as string) === 'Manual Override' || a.method === 'Manual Punch' || Boolean(a.reason)) ||
      matches.find(a => a.checkIn && a.checkIn !== '--:--' && a.checkIn.trim() !== '') ||
      matches[0]
    );
  }, [attendanceRecords, todayStr, isLogForCurrentUser]);

  // 2. My Face / GPS logs for TODAY strictly (timestamp matches todayStr)
  const myTodayFaceLogs = useMemo(() => {
    const latestByType = new Map<string, FaceLog>();
    (faceLogs || []).forEach(log => {
      const d = normalizeToYYYYMMDD(log.timestamp);
      if (d !== todayStr || !isLogForCurrentUser(log)) return;
      const existing = latestByType.get(log.type);
      if (!existing || String(log.timestamp).localeCompare(String(existing.timestamp)) > 0) {
        latestByType.set(log.type, log);
      }
    });
    return Array.from(latestByType.values()).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  }, [faceLogs, todayStr, isLogForCurrentUser]);

  // 3. Extract My Check-In & Check-Out Times for Today (Authoritative Attendance Record FIRST so HR manual updates always reflect immediately)
  const myCheckInTime = useMemo(() => {
    const attIn = myTodayAttendance?.checkIn || todayAttendance?.checkIn;
    if (attIn && attIn !== '--:--' && attIn.trim() !== '') {
      return formatAttendanceTime(attIn);
    }
    const faceIn = myTodayFaceLogs.find(l => l.type === 'Check-In');
    if (faceIn && faceIn.timestamp) {
      return formatAttendanceTime(faceIn.timestamp);
    }
    return null;
  }, [myTodayAttendance, todayAttendance, myTodayFaceLogs]);

  const myCheckOutTime = useMemo(() => {
    const attOut = myTodayAttendance?.checkOut || todayAttendance?.checkOut;
    if (attOut && attOut !== '--:--' && attOut.trim() !== '') {
      return formatAttendanceTime(attOut);
    }
    const faceOut = myTodayFaceLogs.find(l => l.type === 'Check-Out');
    if (faceOut && faceOut.timestamp) {
      return formatAttendanceTime(faceOut.timestamp);
    }
    return null;
  }, [myTodayAttendance, todayAttendance, myTodayFaceLogs]);

  const myTodayStatus: 'Completed' | 'Checked In' | 'Not Marked' = useMemo(() => {
    if (myCheckInTime && myCheckOutTime) return 'Completed';
    if (myCheckInTime) return 'Checked In';
    return 'Not Marked';
  }, [myCheckInTime, myCheckOutTime]);

  // 4. Construct My Today's verified punch events list
  const myTodayLogs = useMemo(() => {
    const attIn = myTodayAttendance?.checkIn || todayAttendance?.checkIn;
    const attOut = myTodayAttendance?.checkOut || todayAttendance?.checkOut;

    const logs: typeof faceLogs = myTodayFaceLogs.map(log => {
      if (log.type === 'Check-In' && attIn && attIn !== '--:--' && attIn.trim() !== '') {
        return { ...log, timestamp: normalizeToFullTimestamp(attIn, todayStr) };
      }
      if (log.type === 'Check-Out' && attOut && attOut !== '--:--' && attOut.trim() !== '') {
        return { ...log, timestamp: normalizeToFullTimestamp(attOut, todayStr) };
      }
      return log;
    });

    if (myCheckInTime && !logs.some(l => l.type === 'Check-In')) {
      const fullTs = normalizeToFullTimestamp(attIn || '', todayStr);
      logs.push({
        id: `my-att-in-${myTodayAttendance?.id || 'today'}`,
        employeeId: currentUser.employeeId || 'EMP-001',
        employeeName: currentUser.name || 'You',
        timestamp: fullTs,
        type: 'Check-In',
        status: 'Success',
        confidenceScore: myTodayAttendance?.faceVerified ? 100 : 99,
        photoUrl: currentUser.avatar || currentUserEmp?.avatar || ''
      });
    }

    if (myCheckOutTime && !logs.some(l => l.type === 'Check-Out')) {
      const fullTs = normalizeToFullTimestamp(attOut || '', todayStr);
      logs.push({
        id: `my-att-out-${myTodayAttendance?.id || 'today'}`,
        employeeId: currentUser.employeeId || 'EMP-001',
        employeeName: currentUser.name || 'You',
        timestamp: fullTs,
        type: 'Check-Out',
        status: 'Success',
        confidenceScore: 100,
        photoUrl: currentUser.avatar || currentUserEmp?.avatar || ''
      });
    }

    return logs.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  }, [myTodayFaceLogs, myCheckInTime, myCheckOutTime, myTodayAttendance, todayAttendance, todayStr, currentUser, currentUserEmp]);

  // 5. Construct All Staff Today Attendance (each staff with checkIn and checkOut for TODAY only)
  const allTodayStaffAttendance = useMemo(() => {
    const isToday = (dateVal?: string | Date | null) => {
      if (!dateVal) return false;
      return normalizeToYYYYMMDD(dateVal) === todayStr;
    };

    const todayAttMap = new Map<string, any>();
    attendanceRecords.forEach(att => {
      if (isToday(att.date) || isToday(att.shiftDate)) {
        const key = String(att.employeeId || '').toLowerCase();
        if (key) {
          const existing = todayAttMap.get(key);
          const isNewManual = (att.method as string) === 'Manual Override' || att.method === 'Manual Punch' || Boolean(att.reason);
          if (!existing || isNewManual) {
            todayAttMap.set(key, att);
          }
        }
      }
    });

    const todayFaceInMap = new Map<string, any>();
    const todayFaceOutMap = new Map<string, any>();
    (faceLogs || []).forEach(log => {
      if (isToday(log.timestamp)) {
        const key = String(log.employeeId || '').toLowerCase();
        if (key) {
          if (log.type === 'Check-In') {
            const existing = todayFaceInMap.get(key);
            if (!existing || String(log.timestamp).localeCompare(String(existing.timestamp)) > 0) {
              todayFaceInMap.set(key, log);
            }
          } else if (log.type === 'Check-Out') {
            const existing = todayFaceOutMap.get(key);
            if (!existing || String(log.timestamp).localeCompare(String(existing.timestamp)) > 0) {
              todayFaceOutMap.set(key, log);
            }
          }
        }
      }
    });

    const allEmpKeys = new Set([
      ...todayAttMap.keys(),
      ...todayFaceInMap.keys(),
      ...todayFaceOutMap.keys()
    ]);

    const result: Array<{
      employeeId: string;
      employeeName: string;
      avatar: string;
      department: string;
      checkInTime: string | null;
      checkOutTime: string | null;
      status: 'Completed' | 'Checked In' | 'Not Marked';
    }> = [];

    allEmpKeys.forEach(empKey => {
      const att = todayAttMap.get(empKey);
      const faceIn = todayFaceInMap.get(empKey);
      const faceOut = todayFaceOutMap.get(empKey);
      const emp = employees.find(e => 
        String(e.employeeId || '').toLowerCase() === empKey || 
        String(e.id || '').toLowerCase() === empKey
      );

      const empName = att?.employeeName || (emp ? `${emp.firstName} ${emp.lastName}`.trim() : (faceIn?.employeeName || faceOut?.employeeName || 'Staff'));
      const avatar = emp?.avatar || faceIn?.photoUrl || faceOut?.photoUrl || '';
      const department = emp?.department || 'General';

      const inTimeRaw = (att?.checkIn && att.checkIn !== '--:--' && att.checkIn.trim() !== '') ? att.checkIn : faceIn?.timestamp;
      const outTimeRaw = (att?.checkOut && att.checkOut !== '--:--' && att.checkOut.trim() !== '') ? att.checkOut : faceOut?.timestamp;

      const checkInTime = inTimeRaw && inTimeRaw !== '--:--' && inTimeRaw.trim() !== '' ? formatAttendanceTime(inTimeRaw) : null;
      const checkOutTime = outTimeRaw && outTimeRaw !== '--:--' && outTimeRaw.trim() !== '' ? formatAttendanceTime(outTimeRaw) : null;

      let status: 'Completed' | 'Checked In' | 'Not Marked' = 'Not Marked';
      if (checkInTime && checkOutTime) {
        status = 'Completed';
      } else if (checkInTime) {
        status = 'Checked In';
      }

      result.push({
        employeeId: emp?.employeeId || att?.employeeId || empKey.toUpperCase(),
        employeeName: empName,
        avatar,
        department,
        checkInTime,
        checkOutTime,
        status
      });
    });

    return result.sort((a, b) => {
      if (a.checkInTime && !b.checkInTime) return -1;
      if (!a.checkInTime && b.checkInTime) return 1;
      return a.employeeName.localeCompare(b.employeeName);
    });
  }, [attendanceRecords, faceLogs, todayStr, employees]);

  // Photo resolution helper for attendance records and face logs
  const getRecordPhoto = (record: any, type: 'Check-In' | 'Check-Out'): string | null => {
    if (type === 'Check-In' && record.checkInPhoto) return record.checkInPhoto;
    if (type === 'Check-Out' && record.checkOutPhoto) return record.checkOutPhoto;

    const recDate = normalizeToYYYYMMDD(record.date || record.shiftDate);
    const empId = String(record.employeeId || '').toLowerCase();
    const empName = String(record.employeeName || '').toLowerCase();

    const matchedLog = (faceLogs || []).find(l => {
      const logDate = normalizeToYYYYMMDD(l.timestamp);
      const lEmpId = String(l.employeeId || '').toLowerCase();
      const lEmpName = String(l.employeeName || '').toLowerCase();
      const matchEmp = (empId && (lEmpId === empId || lEmpName === empName)) || (empName && lEmpName === empName);
      return matchEmp && logDate === recDate && l.type === type && l.photoUrl;
    });

    if (matchedLog?.photoUrl) return matchedLog.photoUrl;
    return null;
  };

  // Today live photos for logged-in user
  const myTodayCheckInPhoto = useMemo(() => {
    if (myTodayAttendance?.checkInPhoto) return myTodayAttendance.checkInPhoto;
    const inLog = myTodayFaceLogs.find(l => l.type === 'Check-In' && l.photoUrl);
    if (inLog?.photoUrl) return inLog.photoUrl;
    return null;
  }, [myTodayAttendance, myTodayFaceLogs]);

  const myTodayCheckOutPhoto = useMemo(() => {
    if (myTodayAttendance?.checkOutPhoto) return myTodayAttendance.checkOutPhoto;
    const outLog = myTodayFaceLogs.find(l => l.type === 'Check-Out' && l.photoUrl);
    if (outLog?.photoUrl) return outLog.photoUrl;
    return null;
  }, [myTodayAttendance, myTodayFaceLogs]);

  // Current user's monthly attendance records (Consolidated & deduplicated per date)
  const myMonthlyRecords = useMemo(() => {
    const rawList = attendanceRecords
      .filter(a => {
        const d = normalizeToYYYYMMDD(a.date);
        const sd = normalizeToYYYYMMDD(a.shiftDate);
        const matchesMonth = (d && d.startsWith(selectedMonth)) || (sd && sd.startsWith(selectedMonth));
        return matchesMonth && isLogForCurrentUser(a);
      });

    const byDate = new Map<string, any>();
    rawList.forEach(rec => {
      const dateKey = normalizeToYYYYMMDD(rec.date || rec.shiftDate);
      if (!dateKey) return;

      const existing = byDate.get(dateKey);
      if (!existing) {
        byDate.set(dateKey, { ...rec });
        return;
      }

      // Consolidate duplicate punches for the same day
      const existingHasIn = existing.checkIn && existing.checkIn !== '--:--' && existing.checkIn.trim() !== '';
      const existingHasOut = existing.checkOut && existing.checkOut !== '--:--' && existing.checkOut.trim() !== '';
      const recHasIn = rec.checkIn && rec.checkIn !== '--:--' && rec.checkIn.trim() !== '';
      const recHasOut = rec.checkOut && rec.checkOut !== '--:--' && rec.checkOut.trim() !== '';

      const existingHours = Number(existing.workingHours || 0);
      const recHours = Number(rec.workingHours || 0);

      const isRecManual = (rec.method as string) === 'Manual Override' || rec.method === 'Manual Punch' || Boolean(rec.reason);
      const isExistingManual = (existing.method as string) === 'Manual Override' || existing.method === 'Manual Punch' || Boolean(existing.reason);

      // Prefer HR manual override record, or record that has complete check-out / higher worked hours
      const preferRec = (isRecManual && !isExistingManual) || (!isExistingManual && ((recHasOut && !existingHasOut) || (recHours > existingHours)));
      const base = preferRec ? { ...rec } : { ...existing };

      let finalCheckIn = base.checkIn;
      if (existingHasIn && recHasIn) {
        if (isRecManual && !isExistingManual) {
          finalCheckIn = rec.checkIn;
        } else if (isExistingManual && !isRecManual) {
          finalCheckIn = existing.checkIn;
        } else {
          finalCheckIn = base.checkIn;
        }
      } else {
        finalCheckIn = existingHasIn ? existing.checkIn : rec.checkIn;
      }

      let finalCheckOut = base.checkOut;
      if (existingHasOut && recHasOut) {
        if (isRecManual && !isExistingManual) {
          finalCheckOut = rec.checkOut;
        } else if (isExistingManual && !isRecManual) {
          finalCheckOut = existing.checkOut;
        } else {
          finalCheckOut = base.checkOut;
        }
      } else {
        finalCheckOut = existingHasOut ? existing.checkOut : rec.checkOut;
      }

      const finalHours = (isRecManual && !isExistingManual) ? recHours : (isExistingManual && !isRecManual) ? existingHours : Math.max(existingHours, recHours);

      byDate.set(dateKey, {
        ...base,
        checkIn: finalCheckIn,
        checkOut: finalCheckOut,
        workingHours: finalHours > 0 ? finalHours : base.workingHours,
        checkInPhoto: existing.checkInPhoto || rec.checkInPhoto,
        checkOutPhoto: rec.checkOutPhoto || existing.checkOutPhoto
      });
    });

    return Array.from(byDate.values()).sort((a, b) => {
      const da = normalizeToYYYYMMDD(a.date || a.shiftDate);
      const db = normalizeToYYYYMMDD(b.date || b.shiftDate);
      return String(db).localeCompare(String(da));
    });
  }, [attendanceRecords, selectedMonth, isLogForCurrentUser]);

  // Monthly summary stats for current user
  const monthlyStats = useMemo(() => {
    let presentDays = 0;
    let lateDays = 0;
    let totalWorkedHours = 0;

    myMonthlyRecords.forEach(r => {
      if (r.status === 'Present' || r.status === 'Half Day') {
        presentDays += r.status === 'Half Day' ? 0.5 : 1;
      }
      if ((r.lateStatus && r.lateStatus !== 'On Time' && r.lateStatus !== 'N/A') || (r.lateDurationMinutes && r.lateDurationMinutes > 0)) {
        lateDays++;
      }
      totalWorkedHours += Number(r.workingHours || 0);
    });

    return {
      presentDays,
      lateDays,
      totalHours: Math.round(totalWorkedHours * 10) / 10,
      totalPunches: myMonthlyRecords.length
    };
  }, [myMonthlyRecords]);

  // All Staff Monthly records (Consolidated & deduplicated per employee per date)
  const allStaffMonthlyRecords = useMemo(() => {
    const rawList = attendanceRecords
      .filter(a => {
        const d = normalizeToYYYYMMDD(a.date);
        const sd = normalizeToYYYYMMDD(a.shiftDate);
        return (d && d.startsWith(selectedMonth)) || (sd && sd.startsWith(selectedMonth));
      });

    const byEmpDate = new Map<string, any>();
    rawList.forEach(rec => {
      const dateKey = normalizeToYYYYMMDD(rec.date || rec.shiftDate);
      const empKey = String(rec.employeeId || rec.employeeName || '').toLowerCase();
      if (!dateKey || !empKey) return;
      const uniqueKey = `${empKey}_${dateKey}`;

      const existing = byEmpDate.get(uniqueKey);
      if (!existing) {
        byEmpDate.set(uniqueKey, { ...rec });
        return;
      }

      const existingHasIn = existing.checkIn && existing.checkIn !== '--:--' && existing.checkIn.trim() !== '';
      const recHasIn = rec.checkIn && rec.checkIn !== '--:--' && rec.checkIn.trim() !== '';
      const existingHasOut = existing.checkOut && existing.checkOut !== '--:--' && existing.checkOut.trim() !== '';
      const recHasOut = rec.checkOut && rec.checkOut !== '--:--' && rec.checkOut.trim() !== '';
      const existingHours = Number(existing.workingHours || 0);
      const recHours = Number(rec.workingHours || 0);

      const isRecManual = (rec.method as string) === 'Manual Override' || rec.method === 'Manual Punch' || Boolean(rec.reason);
      const isExistingManual = (existing.method as string) === 'Manual Override' || existing.method === 'Manual Punch' || Boolean(existing.reason);

      const preferRec = (isRecManual && !isExistingManual) || (!isExistingManual && ((recHasOut && !existingHasOut) || (recHours > existingHours)));
      const base = preferRec ? { ...rec } : { ...existing };
      const finalHours = (isRecManual && !isExistingManual) ? recHours : (isExistingManual && !isRecManual) ? existingHours : Math.max(existingHours, recHours);

      byEmpDate.set(uniqueKey, {
        ...base,
        checkIn: (existingHasIn && recHasIn) ? (preferRec ? rec.checkIn : existing.checkIn) : (existingHasIn ? existing.checkIn : rec.checkIn),
        checkOut: (existingHasOut && recHasOut) ? (preferRec ? rec.checkOut : existing.checkOut) : (existingHasOut ? existing.checkOut : rec.checkOut),
        workingHours: finalHours > 0 ? finalHours : base.workingHours,
        checkInPhoto: existing.checkInPhoto || rec.checkInPhoto,
        checkOutPhoto: rec.checkOutPhoto || existing.checkOutPhoto
      });
    });

    return Array.from(byEmpDate.values()).sort((a, b) => {
      const da = normalizeToYYYYMMDD(a.date || a.shiftDate);
      const db = normalizeToYYYYMMDD(b.date || b.shiftDate);
      return String(db).localeCompare(String(da));
    });
  }, [attendanceRecords, selectedMonth]);

  // Filtered all staff monthly by search
  const filteredAllStaffMonthlyRecords = useMemo(() => {
    if (!staffSearchQuery.trim()) return allStaffMonthlyRecords;
    const q = staffSearchQuery.toLowerCase().trim();
    return allStaffMonthlyRecords.filter(r =>
      (r.employeeName && r.employeeName.toLowerCase().includes(q)) ||
      (r.employeeId && r.employeeId.toLowerCase().includes(q)) ||
      (r.department && r.department.toLowerCase().includes(q))
    );
  }, [allStaffMonthlyRecords, staffSearchQuery]);

  const renderMonthlyActivityCard = (isDedicatedLogPage: boolean) => (
    <div
      data-testid={isDedicatedLogPage ? 'attendance-log-card' : 'monthly-activity-card'}
      className={isDedicatedLogPage ? 'attendance-log-card' : 'face-attendance-activity-card'}
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
        padding: isDedicatedLogPage ? '14px' : undefined,
        display: 'flex',
        flexDirection: 'column',
        gap: '14px'
      }}
    >
      {/* Header Strip with Month Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          {!isDedicatedLogPage && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Calendar size={18} color="#0e7490" />
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                Monthly Activity
              </h2>
            </div>
          )}

          {/* Month Picker Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              data-testid="month-prev-btn"
              onClick={handlePrevMonth}
              title="Previous Month"
              aria-label="Previous Month"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#0e7490',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <ChevronLeft size={16} />
            </button>

            <div
              data-testid="month-display"
              style={{
                padding: '4px 12px',
                borderRadius: '8px',
                backgroundColor: '#ecfeff',
                border: '1px solid #a5f3fc',
                color: '#0e7490',
                fontSize: '0.8rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <Calendar size={13} />
              <span>{formatMonthDisplay(selectedMonth)}</span>
            </div>

            <button
              type="button"
              data-testid="month-next-btn"
              onClick={handleNextMonth}
              title="Next Month"
              aria-label="Next Month"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#0e7490',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* If HR / Admin: Toggle between My Monthly and All Staff Monthly */}
        {isHrOrAdmin ? (
          <div style={{
            display: 'inline-flex',
            backgroundColor: '#f1f5f9',
            padding: '3px',
            borderRadius: '10px',
            border: '1px solid #e2e8f0'
          }}>
            <button
              type="button"
              onClick={() => setActivityViewTab('my')}
              style={{
                padding: '5px 12px',
                borderRadius: '7px',
                border: 'none',
                fontSize: '0.76rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                backgroundColor: activityViewTab === 'my' ? '#ffffff' : 'transparent',
                color: activityViewTab === 'my' ? '#0e7490' : '#64748b',
                boxShadow: activityViewTab === 'my' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <User size={13} />
              <span>My Monthly ({myMonthlyRecords.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActivityViewTab('all')}
              style={{
                padding: '5px 12px',
                borderRadius: '7px',
                border: 'none',
                fontSize: '0.76rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                backgroundColor: activityViewTab === 'all' ? '#ffffff' : 'transparent',
                color: activityViewTab === 'all' ? '#0e7490' : '#64748b',
                boxShadow: activityViewTab === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Users size={13} />
              <span>All Staff ({allStaffMonthlyRecords.length})</span>
            </button>
          </div>
        ) : (
          <span
            data-testid="attendance-log-count-badge"
            style={{
              backgroundColor: '#ecfeff',
              color: '#0e7490',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.74rem',
              fontWeight: 800,
              letterSpacing: '0.04em'
            }}
          >
            {myMonthlyRecords.length} {myMonthlyRecords.length === 1 ? 'RECORD' : 'RECORDS'}
          </span>
        )}
      </div>

      {/* Compact Monthly Summary Bar */}
      {activityViewTab === 'my' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
            backgroundColor: '#f8fafc',
            padding: '8px 10px',
            borderRadius: '10px',
            border: '1px solid #e2e8f0'
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.64rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Present</div>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#15803d' }}>{monthlyStats.presentDays} d</div>
          </div>
          <div style={{ textAlign: 'center', borderLeft: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.64rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Late</div>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#b45309' }}>{monthlyStats.lateDays} d</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.64rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Working Hrs</div>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0e7490' }}>{monthlyStats.totalHours} hrs</div>
          </div>
        </div>
      )}

      {/* VIEW 1: MY MONTHLY ACTIVITY */}
      {activityViewTab === 'my' ? (
        <div>
          <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#64748b', letterSpacing: '0.04em', marginBottom: '10px' }}>
            {formatMonthDisplay(selectedMonth).toUpperCase()} PUNCH LOGS ({myMonthlyRecords.length})
          </div>

          {myMonthlyRecords.length === 0 ? (
            <div
              data-testid="attendance-log-empty"
              style={{
                padding: '30px 16px',
                textAlign: 'center',
                backgroundColor: '#f8fafc',
                borderRadius: '12px',
                border: '1px dashed #cbd5e1'
              }}
            >
              <Calendar size={28} color="#94a3b8" style={{ margin: '0 auto 8px', display: 'block' }} />
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a', marginBottom: '2px' }}>
                No records for {formatMonthDisplay(selectedMonth)}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                Punch in using Face Attendance to see your daily verified records and photos.
              </div>
            </div>
          ) : (
            <div
              data-testid="attendance-log-records-list"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: isDedicatedLogPage ? 'none' : '480px',
                overflowY: isDedicatedLogPage ? 'visible' : 'auto',
                paddingRight: isDedicatedLogPage ? 0 : '4px'
              }}
            >
              {myMonthlyRecords.map(rec => {
                const recDate = rec.date || rec.shiftDate;
                const inPhoto = getRecordPhoto(rec, 'Check-In');
                const outPhoto = getRecordPhoto(rec, 'Check-Out');
                const isTodayRow = normalizeToYYYYMMDD(recDate) === todayStr;
                const isExpanded = expandedRecordId === rec.id;

                return (
                  <div
                    key={rec.id}
                    data-testid="attendance-log-record"
                    onClick={() => setExpandedRecordId(prev => (prev === rec.id ? null : rec.id))}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '12px',
                      border: `1px solid ${isTodayRow ? '#a5f3fc' : '#e2e8f0'}`,
                      backgroundColor: isTodayRow ? '#f0fdfa' : '#f8fafc',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    {/* Row Top: Date, TODAY Badge, Status Pill, Working Hours & Expand Chevron */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span data-testid="record-date" style={{ fontWeight: 800, fontSize: '0.82rem', color: '#0f172a' }}>
                          {formatDateDDMMYYYY(recDate)}
                        </span>
                        {isTodayRow && (
                          <span style={{
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            backgroundColor: '#0e7490',
                            color: '#ffffff',
                            padding: '1px 6px',
                            borderRadius: '4px'
                          }}>
                            TODAY
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          data-testid="record-status"
                          style={{
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            backgroundColor: rec.status === 'Present' ? '#dcfce7' : rec.status === 'Half Day' ? '#fef3c7' : '#fee2e2',
                            color: rec.status === 'Present' ? '#15803d' : rec.status === 'Half Day' ? '#b45309' : '#b91c1c'
                          }}
                        >
                          {rec.status}
                        </span>
                        <span data-testid="record-working-hours" style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>
                          {rec.workingHours ?? 0} hrs
                        </span>
                        <ChevronRight
                          size={14}
                          color="#64748b"
                          style={{
                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                            transition: 'transform 0.15s ease'
                          }}
                        />
                      </div>
                    </div>

                    {/* Row Bottom: Side-by-side Check-In and Check-Out with Photos */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                      backgroundColor: '#ffffff',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0'
                    }}>
                      {/* Check-In Side */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                        <div>
                          <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#16a34a' }}>
                            CHECK-IN
                          </div>
                          <div data-testid="record-checkin-time" style={{ fontSize: '0.8rem', fontWeight: 800, color: rec.checkIn ? '#0f172a' : '#94a3b8' }}>
                            {rec.checkIn ? formatAttendanceTime(rec.checkIn) : '—'}
                          </div>
                        </div>

                        {inPhoto ? (
                          <div
                            data-testid="checkin-photo-thumb"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewPhoto({
                                url: inPhoto,
                                title: `${currentUser.name || 'Staff'} - Check-In Photo`,
                                subtitle: formatDateDDMMYYYY(recDate),
                                time: rec.checkIn ? formatAttendanceTime(rec.checkIn) : undefined
                              });
                            }}
                            title="View Check-In Photo"
                            style={{
                              cursor: 'pointer',
                              position: 'relative',
                              width: '32px',
                              height: '32px',
                              borderRadius: '6px',
                              overflow: 'hidden',
                              border: '1.5px solid #86efac',
                              flexShrink: 0
                            }}
                          >
                            <img src={inPhoto} alt="Check-In" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        ) : null}
                      </div>

                      {/* Check-Out Side */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                        <div>
                          <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#0e7490' }}>
                            CHECK-OUT
                          </div>
                          <div data-testid="record-checkout-time" style={{ fontSize: '0.8rem', fontWeight: 800, color: rec.checkOut ? '#0f172a' : rec.checkIn ? '#d97706' : '#94a3b8' }}>
                            {rec.checkOut ? formatAttendanceTime(rec.checkOut) : (rec.checkIn ? 'In Progress' : '—')}
                          </div>
                        </div>

                        {outPhoto ? (
                          <div
                            data-testid="checkout-photo-thumb"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewPhoto({
                                url: outPhoto,
                                title: `${currentUser.name || 'Staff'} - Check-Out Photo`,
                                subtitle: formatDateDDMMYYYY(recDate),
                                time: rec.checkOut ? formatAttendanceTime(rec.checkOut) : undefined
                              });
                            }}
                            title="View Check-Out Photo"
                            style={{
                              cursor: 'pointer',
                              position: 'relative',
                              width: '32px',
                              height: '32px',
                              borderRadius: '6px',
                              overflow: 'hidden',
                              border: '1.5px solid #67e8f9',
                              flexShrink: 0
                            }}
                          >
                            <img src={outPhoto} alt="Check-Out" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Expandable Record Details */}
                    {isExpanded && (
                      <div
                        data-testid="attendance-log-expanded-details"
                        style={{
                          padding: '8px 10px',
                          borderRadius: '8px',
                          backgroundColor: '#ffffff',
                          border: '1px dashed #cbd5e1',
                          fontSize: '0.72rem',
                          color: '#475569',
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '6px'
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>Method: </span>
                          <span>{rec.method || 'Face Scan'}</span>
                        </div>
                        <div>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>Punctuality: </span>
                          <span>{rec.lateStatus || 'On Time'}</span>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>Location: </span>
                          <span>{rec.location?.address || geofenceConfig.officeName || 'Verified Office Geofence'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* VIEW 2: ALL STAFF MONTHLY ATTENDANCE (ACCESSIBLE TO HR/ADMIN) */
        <>
          {/* Search Bar for Filtering Staff */}
          <div style={{ position: 'relative' }}>
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search staff name, ID or department..."
              value={staffSearchQuery}
              onChange={(e) => setStaffSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 32px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.78rem',
                color: '#0f172a',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', letterSpacing: '0.04em' }}>
            COMPANY ATTENDANCE - {formatMonthDisplay(selectedMonth).toUpperCase()} ({filteredAllStaffMonthlyRecords.length} LOGS)
          </div>

          {filteredAllStaffMonthlyRecords.length === 0 ? (
            <div style={{
              padding: '40px 16px',
              textAlign: 'center',
              backgroundColor: '#f8fafc',
              borderRadius: '12px',
              border: '1px dashed #cbd5e1'
            }}>
              <Users size={32} color="#94a3b8" style={{ margin: '0 auto 8px', display: 'block' }} />
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', marginBottom: '2px' }}>
                No staff records found for {formatMonthDisplay(selectedMonth)}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                Records punched by employees in this month will appear here with photos.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '380px', overflowY: 'auto', paddingRight: '4px' }}>
              {filteredAllStaffMonthlyRecords.map(staff => {
                const recDate = staff.date || staff.shiftDate;
                const inPhoto = getRecordPhoto(staff, 'Check-In');
                const outPhoto = getRecordPhoto(staff, 'Check-Out');

                return (
                  <div
                    key={staff.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      backgroundColor: '#f8fafc',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}
                  >
                    {/* Top: Name, Department, Date & Status */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #0e7490, #0891b2)',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '0.7rem'
                        }}>
                          {(staff.employeeName || 'EM').substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#0f172a' }}>
                            {staff.employeeName}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                            {formatDateDDMMYYYY(recDate)} • {staff.department || 'General'}
                          </div>
                        </div>
                      </div>

                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        fontSize: '0.66rem',
                        fontWeight: 800,
                        backgroundColor: staff.status === 'Present' ? '#dcfce7' : staff.status === 'Half Day' ? '#fef3c7' : '#fee2e2',
                        color: staff.status === 'Present' ? '#15803d' : staff.status === 'Half Day' ? '#b45309' : '#b91c1c'
                      }}>
                        {staff.status}
                      </span>
                    </div>

                    {/* Bottom: Side-by-side Check-In and Check-Out Times with Photos */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                      backgroundColor: '#ffffff',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0'
                    }}>
                      {/* Check-In */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#16a34a' }}>
                            CHECK-IN
                          </div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: staff.checkIn ? '#0f172a' : '#94a3b8' }}>
                            {staff.checkIn ? formatAttendanceTime(staff.checkIn) : '—'}
                          </div>
                        </div>

                        {inPhoto ? (
                          <div
                            onClick={() => setPreviewPhoto({
                              url: inPhoto,
                              title: `${staff.employeeName} - Check-In Photo`,
                              subtitle: formatDateDDMMYYYY(recDate),
                              time: staff.checkIn ? formatAttendanceTime(staff.checkIn) : undefined
                            })}
                            title="View Check-In Photo"
                            style={{
                              cursor: 'pointer',
                              width: '30px',
                              height: '30px',
                              borderRadius: '6px',
                              overflow: 'hidden',
                              border: '1.5px solid #86efac',
                              flexShrink: 0
                            }}
                          >
                            <img src={inPhoto} alt="Check-In" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        ) : null}
                      </div>

                      {/* Check-Out */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#0e7490' }}>
                            CHECK-OUT
                          </div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: staff.checkOut ? '#0f172a' : staff.checkIn ? '#d97706' : '#94a3b8' }}>
                            {staff.checkOut ? formatAttendanceTime(staff.checkOut) : (staff.checkIn ? 'In Progress' : '—')}
                          </div>
                        </div>

                        {outPhoto ? (
                          <div
                            onClick={() => setPreviewPhoto({
                              url: outPhoto,
                              title: `${staff.employeeName} - Check-Out Photo`,
                              subtitle: formatDateDDMMYYYY(recDate),
                              time: staff.checkOut ? formatAttendanceTime(staff.checkOut) : undefined
                            })}
                            title="View Check-Out Photo"
                            style={{
                              cursor: 'pointer',
                              width: '30px',
                              height: '30px',
                              borderRadius: '6px',
                              overflow: 'hidden',
                              border: '1.5px solid #67e8f9',
                              flexShrink: 0
                            }}
                          >
                            <img src={outPhoto} alt="Check-Out" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div data-testid={mode === 'log' ? 'attendance-log-page' : 'daily-attendance-page'}>
      {/* Minimal Header */}
      <div className="page-header face-attendance-minimal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div className="page-title-group">
          <h1 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
            {mode === 'log' ? 'Attendance Log' : 'Face Attendance'}
          </h1>
        </div>
      </div>

      {mode === 'log' ? (
        /* SEPARATE ATTENDANCE LOG PAGE */
        renderMonthlyActivityCard(true)
      ) : (
        /* DAILY ATTENDANCE PAGE */
        <div className="face-attendance-grid" style={{ display: 'flex', justifyContent: 'center' }}>
          {/* MINIMAL SINGLE-TAP FACE ATTENDANCE SCREEN */}
          <div className="face-attendance-scanner-card" style={{
            width: '100%',
            maxWidth: '420px',
            margin: '0 auto',
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
            padding: '12px 14px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#0e7490', marginBottom: '8px', letterSpacing: '0.02em' }}>
              Live Camera
            </div>
            {/* LIVE FRONT-CAMERA PREVIEW WITH COMPACT FACE-GUIDANCE FRAME */}
            <div
              data-testid="face-camera-preview"
              style={{
                width: '100%',
                maxWidth: isMobileViewport ? '260px' : '320px',
                aspectRatio: '1 / 1',
                margin: '0 auto',
                backgroundColor: '#f8fafc',
                borderRadius: '16px',
                border: '1.5px solid #cbd5e1',
                overflow: 'hidden',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: isCameraActive ? 'block' : 'none',
                  transform: isMirrored ? 'scaleX(-1)' : 'scaleX(1)'
                }}
              />

              {!isCameraActive && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  color: '#0e7490'
                }}>
                  <ScanFace size={32} strokeWidth={1.75} />
                  <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#475569' }}>
                    Live Camera
                  </span>
                </div>
              )}

              {/* Compact Face-Guidance Frame Inside Camera Preview (no darkening vignette) */}
              <div
                data-testid="face-guidance-frame"
                style={{
                  position: 'absolute',
                  width: '58%',
                  height: '70%',
                  borderRadius: '9999px',
                  border: '2px dashed #0e7490',
                  boxShadow: 'none',
                  pointerEvents: 'none',
                  zIndex: 10
                }}
              />

              {/* Non-Intrusive Low-Light Warning Badge */}
              {isCameraActive && isLowLightCamera && (
                <div
                  data-testid="low-light-warning-badge"
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 20,
                    padding: '3px 10px',
                    borderRadius: '9999px',
                    backgroundColor: 'rgba(15, 23, 42, 0.76)',
                    color: '#fef3c7',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none'
                  }}
                >
                  Low light — move to brighter area
                </div>
              )}

              {/* Subtle Mirror Toggle Icon */}
              {isCameraActive && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMirrored(prev => {
                      const next = !prev;
                      try { localStorage.setItem('vrm_hrms_camera_mirrored', String(next)); } catch {}
                      return next;
                    });
                  }}
                  aria-label="Flip camera preview"
                  style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    zIndex: 20,
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 255, 255, 0.88)',
                    border: '1px solid #cbd5e1',
                    color: '#0e7490',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <FlipHorizontal size={15} />
                </button>
              )}
            </div>

            {/* SHIFT TIMING, GRACE POLICY & GPS VERIFICATION STATUS PANEL */}
            <div
              data-testid="shift-policy-info-panel"
              style={{
                maxWidth: isMobileViewport ? '280px' : '360px',
                margin: '10px auto 0',
                padding: '10px 12px',
                borderRadius: '12px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                textAlign: 'left',
                fontSize: '0.74rem',
                color: '#334155',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={13} color="#0e7490" />
                  <span>{shiftEval.assignedShift?.shiftName?.replace(/\s*\([^)]*\)\s*$/, '') || 'Assigned Shift'}</span>
                </span>
                <span
                  data-testid="shift-expected-status-badge"
                  style={{
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    backgroundColor: isCompletedToday
                      ? '#dcfce7'
                      : isCheckedIn
                        ? (todayAttendance?.status === 'Late' ? '#fef3c7' : '#dcfce7')
                        : !shiftEval.canCheckIn
                          ? '#f1f5f9'
                          : shiftEval.isLateCheckIn
                            ? '#fef3c7'
                            : '#ecfeff',
                    color: isCompletedToday
                      ? '#15803d'
                      : isCheckedIn
                        ? (todayAttendance?.status === 'Late' ? '#b45309' : '#15803d')
                        : !shiftEval.canCheckIn
                          ? '#475569'
                          : shiftEval.isLateCheckIn
                            ? '#b45309'
                            : '#0e7490'
                  }}
                >
                  {isCompletedToday
                    ? 'Shift Completed'
                    : isCheckedIn
                      ? `Checked In (${todayAttendance?.status || 'Present'})`
                      : !shiftEval.canCheckIn
                        ? shiftEval.statusBadge
                        : shiftEval.isLateCheckIn
                          ? 'Late Check-In Allowed'
                          : 'Ready to Punch In'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px', fontSize: '0.72rem' }}>
                <div>
                  <span style={{ color: '#64748b' }}>Shift Time: </span>
                  <strong data-testid="shift-start-end-display" style={{ color: '#0f172a' }}>
                    {shiftEval.shiftStartDisplay} – {shiftEval.shiftEndDisplay}
                  </strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Opens At: </span>
                  <strong data-testid="shift-open-time-display" style={{ color: '#0e7490' }}>
                    {shiftEval.checkInOpenDisplay}
                  </strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Grace Policy: </span>
                  <strong data-testid="shift-grace-mins-display" style={{ color: '#0f172a' }}>
                    {shiftEval.gracePeriodMins} mins
                  </strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Late After: </span>
                  <strong data-testid="shift-late-after-display" style={{ color: '#b45309' }}>
                    {shiftEval.lateAfterDisplay}
                  </strong>
                </div>
              </div>

              {/* GPS Permission, Accuracy & Geofence Row */}
              <div
                data-testid="gps-geofence-status-panel"
                style={{
                  marginTop: '2px',
                  paddingTop: '6px',
                  borderTop: '1px dashed #cbd5e1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '6px',
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: '170px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                    <MapPin size={12} color={gpsStatusDetails.verified ? '#15803d' : gpsPermissionState === 'denied' ? '#dc2626' : '#0e7490'} />
                    <span
                      data-testid="gps-verification-badge"
                      style={{
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        backgroundColor: gpsStatusDetails.verified
                          ? '#dcfce7'
                          : gpsStatusDetails.classification === 'OUTSIDE' ||
                              gpsPermissionState === 'denied' ||
                              lastGpsErrorCode === 'PERMISSION_DENIED' ||
                              lastGpsErrorCode === 'TIMEOUT' ||
                              lastGpsErrorCode === 'POSITION_UNAVAILABLE'
                            ? '#fee2e2'
                            : gpsStatusDetails.classification === 'UNCERTAIN' || isRetryingLocation
                              ? '#fef3c7'
                              : '#f1f5f9',
                        color: gpsStatusDetails.verified
                          ? '#15803d'
                          : gpsStatusDetails.classification === 'OUTSIDE' ||
                              gpsPermissionState === 'denied' ||
                              lastGpsErrorCode === 'PERMISSION_DENIED' ||
                              lastGpsErrorCode === 'TIMEOUT' ||
                              lastGpsErrorCode === 'POSITION_UNAVAILABLE'
                            ? '#dc2626'
                            : gpsStatusDetails.classification === 'UNCERTAIN' || isRetryingLocation
                              ? '#b45309'
                              : '#475569'
                      }}
                    >
                      {isRetryingLocation
                        ? (gpsProgressMsg === 'Improving GPS Accuracy...' ? 'Improving GPS Accuracy...' : 'Getting GPS Location...')
                        : gpsStatusDetails.verified
                          ? 'GPS Verified'
                          : gpsPermissionState === 'denied' || lastGpsErrorCode === 'PERMISSION_DENIED'
                            ? 'Location Permission Denied'
                            : lastGpsErrorCode === 'TIMEOUT' || lastGpsErrorCode === 'POSITION_UNAVAILABLE' || lastGpsErrorCode === 'STALE_READING'
                              ? 'GPS Timed Out — Retry'
                              : gpsStatusDetails.classification === 'OUTSIDE' || lastGpsErrorCode === 'OUTSIDE_GEOFENCE'
                                ? 'Outside Allowed Attendance Area'
                                : gpsStatusDetails.classification === 'UNCERTAIN' || lastGpsErrorCode === 'LOW_GPS_ACCURACY'
                                  ? 'Improving GPS Accuracy...'
                                  : 'Ready • Verified on Punch'}
                    </span>
                    {hasPreservedFaceCapture && !gpsStatusDetails.verified && (
                      <span
                        data-testid="preserved-face-badge"
                        style={{
                          padding: '2px 7px',
                          borderRadius: '9999px',
                          fontSize: '0.66rem',
                          fontWeight: 700,
                          backgroundColor: '#ecfeff',
                          color: '#0e7490',
                          border: '1px solid #a5f3fc'
                        }}
                      >
                        Face Verified &amp; Preserved
                      </span>
                    )}
                  </div>
                  <div data-testid="gps-accuracy-distance-text" style={{ fontSize: '0.69rem', color: '#475569' }}>
                    {gpsStatusDetails.accuracy !== null
                      ? `Accuracy: ±${Math.round(gpsStatusDetails.accuracy)}m${gpsStatusDetails.distance !== null ? ` • Distance: ${Math.round(gpsStatusDetails.distance)}m / ${gpsStatusDetails.radius}m` : ''}`
                      : `Allowed Area: ${geofenceConfig.officeName || 'HQ Office'} (${Number(geofenceConfig.radiusMeters) || 500}m)`}
                  </div>
                </div>

                <button
                  type="button"
                  data-testid="retry-location-btn"
                  disabled={isRetryingLocation || isScanning}
                  onClick={() => void handleRetryLocation()}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '8px',
                    border: '1px solid #0e7490',
                    backgroundColor: '#ecfeff',
                    color: '#0e7490',
                    fontSize: '0.71rem',
                    fontWeight: 700,
                    cursor: isRetryingLocation || isScanning ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    flexShrink: 0
                  }}
                >
                  <RefreshCw size={12} />
                  <span>{isRetryingLocation ? 'Checking...' : 'Retry Location'}</span>
                </button>
              </div>
              {committedPunchSummary && (
                <div
                  data-testid="one-click-punch-success-card"
                  style={{
                    marginTop: '6px',
                    padding: '8px 10px',
                    borderRadius: '10px',
                    backgroundColor: '#f0fdf4',
                    border: '1px solid #86efac',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px',
                    fontSize: '0.73rem',
                    color: '#0f172a'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 800, color: '#15803d' }}>
                      <CheckCircle2 size={14} />
                      <span>{committedPunchSummary.title}</span>
                    </span>
                    <span
                      data-testid="committed-punch-policy-status"
                      style={{
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        backgroundColor: committedPunchSummary.status === 'Late' ? '#fef3c7' : '#dcfce7',
                        color: committedPunchSummary.status === 'Late' ? '#b45309' : '#15803d'
                      }}
                    >
                      {committedPunchSummary.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', color: '#334155', fontSize: '0.7rem' }}>
                    <span>Saved Time: <strong>{committedPunchSummary.savedTime}</strong></span>
                    <span style={{ color: '#15803d', fontWeight: 700 }}>{committedPunchSummary.locationText}</span>
                  </div>
                </div>
              )}
            </div>

            {/* TODAY'S COMPLETED ATTENDANCE SUMMARY OR ACTIVE PUNCH IN TIME */}
            {isCompletedToday ? (
              <div
                data-testid="today-attendance-completed"
                style={{
                  maxWidth: isMobileViewport ? '260px' : '340px',
                  margin: '10px auto 0',
                  padding: '8px 10px',
                  borderRadius: '10px',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#15803d', fontWeight: 800, fontSize: '0.8rem' }}>
                  <CheckCircle2 size={14} />
                  <span>Today&apos;s Attendance Completed</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '0.74rem', fontWeight: 700, color: '#0f172a' }}>
                  <span>Punch In: {myCheckInTime || '--:--'}</span>
                  <span>Punch Out: {myCheckOutTime || '--:--'}</span>
                </div>
              </div>
            ) : (isCheckedIn && myCheckInTime) ? (
              <div
                data-testid="today-punch-in-summary"
                style={{
                  maxWidth: isMobileViewport ? '260px' : '340px',
                  margin: '8px auto 0',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  color: '#0e7490'
                }}
              >
                Punch In: {myCheckInTime}
              </div>
            ) : null}

            {/* SIDE-BY-SIDE PUNCH IN AND PUNCH OUT BUTTONS */}
            <div
              className="face-attendance-actions-row"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
                maxWidth: isMobileViewport ? '260px' : '340px',
                margin: '10px auto 0'
              }}
            >
              {/* PUNCH IN BUTTON */}
              <button
                type="button"
                disabled={isCheckedIn || isScanning || isRequestingPermissions || !shiftEval.canCheckIn}
                onClick={() => handlePunchAction('Check-In')}
                style={{
                  width: '100%',
                  minHeight: '46px',
                  padding: '10px 8px',
                  borderRadius: '12px',
                  backgroundColor: (!isCheckedIn && !isScanning && !isRequestingPermissions && shiftEval.canCheckIn)
                    ? '#0e7490'
                    : '#e2e8f0',
                  color: (!isCheckedIn && !isScanning && !isRequestingPermissions && shiftEval.canCheckIn)
                    ? '#ffffff'
                    : '#94a3b8',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  border: 'none',
                  cursor: (!isCheckedIn && !isScanning && !isRequestingPermissions && shiftEval.canCheckIn)
                    ? 'pointer'
                    : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  boxShadow: (!isCheckedIn && !isScanning && !isRequestingPermissions && shiftEval.canCheckIn)
                    ? '0 4px 12px rgba(14, 116, 144, 0.22)'
                    : 'none'
                }}
              >
                <span>Punch In</span>
              </button>

              {/* PUNCH OUT BUTTON */}
              <button
                type="button"
                disabled={
                  !isCheckedIn ||
                  isCheckedOut ||
                  oneHourCooldown.isCooldownActive ||
                  isScanning ||
                  isRequestingPermissions ||
                  !shiftEval.canCheckOut
                }
                onClick={() => handlePunchAction('Check-Out')}
                style={{
                  width: '100%',
                  minHeight: '46px',
                  padding: '10px 8px',
                  borderRadius: '12px',
                  backgroundColor: (
                    isCheckedIn &&
                    !isCheckedOut &&
                    !oneHourCooldown.isCooldownActive &&
                    !isScanning &&
                    !isRequestingPermissions &&
                    shiftEval.canCheckOut
                  )
                    ? '#0e7490'
                    : '#e2e8f0',
                  color: (
                    isCheckedIn &&
                    !isCheckedOut &&
                    !oneHourCooldown.isCooldownActive &&
                    !isScanning &&
                    !isRequestingPermissions &&
                    shiftEval.canCheckOut
                  )
                    ? '#ffffff'
                    : '#94a3b8',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  border: 'none',
                  cursor: (
                    isCheckedIn &&
                    !isCheckedOut &&
                    !oneHourCooldown.isCooldownActive &&
                    !isScanning &&
                    !isRequestingPermissions &&
                    shiftEval.canCheckOut
                  )
                    ? 'pointer'
                    : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  boxShadow: (
                    isCheckedIn &&
                    !isCheckedOut &&
                    !oneHourCooldown.isCooldownActive &&
                    !isScanning &&
                    !isRequestingPermissions &&
                    shiftEval.canCheckOut
                  )
                    ? '0 4px 12px rgba(14, 116, 144, 0.22)'
                    : 'none'
                }}
              >
                <span>Punch Out</span>
              </button>
            </div>

            {/* SMALL STATUS TEXT */}
            <div
              data-testid="face-attendance-status"
              style={{
                maxWidth: isMobileViewport ? '260px' : '340px',
                margin: '8px auto 0',
                minHeight: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexWrap: 'wrap',
                gap: '8px',
                fontSize: '0.78rem',
                fontWeight: 600,
                color: scanResult.status === 'error'
                  ? '#dc2626'
                  : scanResult.status === 'success'
                    ? '#15803d'
                    : '#0e7490'
              }}
            >
              {isScanning || isRequestingPermissions || isRetryingLocation ? (
                <span>{gpsProgressMsg || 'Getting GPS Location...'}</span>
              ) : scanResult.status === 'error' && scanResult.message ? (
                <>
                  <span>{scanResult.message}</span>
                  {uncertainContext && (
                    <button
                      type="button"
                      onClick={handleRequestHrCorrection}
                      style={{
                        padding: '3px 10px',
                        borderRadius: '6px',
                        border: '1px solid #d97706',
                        backgroundColor: '#fffbeb',
                        color: '#b45309',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Request HR Review
                    </button>
                  )}
                </>
              ) : (
                <span>
                  {[
                    scanResult.status === 'success' && scanResult.message
                      ? scanResult.message
                      : isCompletedToday
                        ? 'Attendance Saved • Punch Out successful'
                        : isCheckedIn
                          ? 'GPS Verified'
                          : !shiftEval.canCheckIn
                            ? shiftEval.statusBadge
                            : (activePunchGps && gpsStatusDetails.verified)
                              ? (shiftEval.isLateCheckIn ? 'Late Check-In Allowed' : 'Ready to Punch In')
                              : gpsStatusDetails.message,
                    isCheckedIn && !isCheckedOut && oneHourCooldown.isCooldownActive
                      ? `Punch Out available in ${oneHourCooldown.remainingMinutes} min`
                      : null
                  ]
                    .filter(Boolean)
                    .join(' • ') || 'Ready to Punch In'}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* GPS CLOCK-IN MODAL DIALOG */}
      {showGpsModal && (
        <div className="modal-overlay" onClick={() => setShowGpsModal(false)}>
          <div 
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '520px', borderRadius: '16px', overflow: 'hidden' }}
          >
            <div className="modal-header" style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  backgroundColor: '#ecfeff',
                  color: '#0e7490',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <MapPin size={22} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                    {hasActiveCheckIn ? 'GPS Geofence Clock-Out' : 'GPS Geofence Clock-In'}
                  </h2>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Live GPS Geolocation Attendance Verification
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setShowGpsModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '24px', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              
              {/* Active Employee Selected */}
              <div style={{ 
                padding: '12px 16px', 
                backgroundColor: '#f8fafc', 
                borderRadius: '12px', 
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active Account</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                    {employees.find(e => e.employeeId === selectedEmpId)?.firstName} {employees.find(e => e.employeeId === selectedEmpId)?.lastName} ({selectedEmpId})
                  </div>
                </div>
                <span className="status-pill present" style={{ fontSize: '0.72rem' }}>Verified</span>
              </div>

              {/* Geofence & Location Status Card */}
              {gpsError ? (
                <div style={{
                  padding: '16px',
                  borderRadius: '14px',
                  border: '1.5px solid #fca5a5',
                  backgroundColor: '#fef2f2',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: '#ef4444',
                        display: 'inline-block'
                      }} />
                      <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#b91c1c' }}>
                        LOCATION / GPS OFF OR UNAVAILABLE
                      </span>
                    </div>
                    <button 
                      type="button" 
                      onClick={fetchGpsStatus} 
                      disabled={gpsLoading}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <RefreshCw size={13} className={gpsLoading ? 'spin' : ''} /> Retry
                    </button>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#7f1d1d', fontWeight: 600 }}>
                    {gpsError}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                    Turn ON location/GPS on your device (phone/PC) and click Retry to verify geofence.
                  </div>
                </div>
              ) : (
                <div style={{
                  padding: '18px',
                  borderRadius: '14px',
                  border: '1.5px solid',
                  backgroundColor: gpsData?.classification === 'INSIDE' ? '#f0fdf4' : gpsData?.classification === 'UNCERTAIN' ? '#fffbeb' : '#fef2f2',
                  borderColor: gpsData?.classification === 'INSIDE' ? '#86efac' : gpsData?.classification === 'UNCERTAIN' ? '#fde68a' : '#fca5a5'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: gpsData?.classification === 'INSIDE' ? '#22c55e' : gpsData?.classification === 'UNCERTAIN' ? '#f59e0b' : '#ef4444',
                        display: 'inline-block',
                        boxShadow: gpsData?.classification === 'INSIDE' ? '0 0 8px #22c55e' : 'none'
                      }} />
                      <span style={{
                        fontSize: '0.84rem',
                        fontWeight: 800,
                        color: gpsData?.classification === 'INSIDE' ? '#15803d' : gpsData?.classification === 'UNCERTAIN' ? '#b45309' : '#b91c1c'
                      }}>
                        {gpsLoading ? 'Acquiring High-Accuracy GPS...' :
                          gpsData?.classification === 'INSIDE' ? 'INSIDE GEOFENCE BOUNDARY' :
                          gpsData?.classification === 'UNCERTAIN' ? 'GPS ACCURACY INSUFFICIENT' :
                          'OUTSIDE GEOFENCE BOUNDARY'}
                      </span>
                    </div>
                    <button 
                      type="button" 
                      onClick={fetchGpsStatus} 
                      disabled={gpsLoading}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0891b2', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <RefreshCw size={13} className={gpsLoading ? 'spin' : ''} /> {gpsLoading ? 'Reading...' : 'Refresh'}
                    </button>
                  </div>

                  <div style={{ fontSize: '0.78rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div><strong>Designated Office:</strong> {geofenceConfig.officeName || 'VRM Structures India Pvt Ltd'}</div>
                    <div><strong>Allowed Zone Radius:</strong> {geofenceConfig.radiusMeters} meters</div>
                    <div><strong>Detected Distance:</strong> {gpsData ? `${gpsData.distance}m away` : 'Calculating...'}</div>
                    <div><strong>GPS Accuracy Radius:</strong> {gpsData ? `±${gpsData.accuracy}m` : 'Calculating...'}</div>
                    <div><strong>Current Coordinates:</strong> {gpsData ? `${gpsData.lat.toFixed(6)}, ${gpsData.lng.toFixed(6)}` : 'Waiting for GPS...'}</div>
                  </div>

                  {gpsData && gpsData.classification === 'OUTSIDE' && (
                    <div style={{ marginTop: '10px', padding: '10px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', fontSize: '0.75rem', fontWeight: 700, lineHeight: 1.4 }}>
                      ⚠️ Punch Blocked: You are {gpsData.distance}m away (Allowed radius: {geofenceConfig.radiusMeters}m). Attendance cannot be punched outside {geofenceConfig.officeName || 'the office'}.
                    </div>
                  )}

                  {gpsData && gpsData.classification === 'UNCERTAIN' && (
                    <div style={{ marginTop: '10px', padding: '10px 12px', backgroundColor: '#fefce8', border: '1px solid #fef08a', borderRadius: '8px', color: '#854d0e', fontSize: '0.75rem', fontWeight: 700, lineHeight: 1.4 }}>
                      ⚠️ GPS Accuracy Insufficient: Measured accuracy is ±{gpsData.accuracy}m (Distance: {gpsData.distance}m, Allowed: {geofenceConfig.radiusMeters}m). Please move to an open area with a clear sky view and tap Refresh.
                    </div>
                  )}
                </div>
              )}

              {/* Smart GPS Punch Button */}
              {(() => {
                const activeEmpModal = employees.find(e => e.employeeId === selectedEmpId || e.id === selectedEmpId);
                const isEmpCeo = activeEmpModal?.role === 'CEO' || 
                                 activeEmpModal?.designation?.toLowerCase().includes('ceo') || 
                                 activeEmpModal?.designation?.toLowerCase().includes('chief executive');
                const isAllowedByGeofence = Boolean(gpsData && (gpsData.canPunch || isEmpCeo));

                return (
                  <div style={{ marginTop: '6px' }}>
                    {isCompletedToday ? (
                      <button
                        type="button"
                        disabled
                        style={{
                          width: '100%',
                          padding: '13px 20px',
                          borderRadius: '10px',
                          backgroundColor: '#e2e8f0',
                          color: '#64748b',
                          fontWeight: 800,
                          fontSize: '0.9rem',
                          border: 'none',
                          cursor: 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px'
                        }}
                      >
                        <CheckCircle2 size={18} /> Today's GPS Attendance Completed
                      </button>
                    ) : hasActiveCheckIn ? (
                      <button
                        type="button"
                        disabled={gpsLoading || isCheckedOut || !shiftEval.canCheckOut || !isAllowedByGeofence}
                        onClick={() => handleGpsPunch('Check-Out')}
                        style={{
                          width: '100%',
                          padding: '13px 20px',
                          borderRadius: '10px',
                          backgroundColor: (!isCheckedOut && shiftEval.canCheckOut && isAllowedByGeofence) ? '#0e7490' : '#cbd5e1',
                          color: '#ffffff',
                          fontWeight: 800,
                          fontSize: '0.9rem',
                          border: 'none',
                          cursor: (!isCheckedOut && shiftEval.canCheckOut && isAllowedByGeofence && !gpsLoading) ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          boxShadow: (!isCheckedOut && shiftEval.canCheckOut && isAllowedByGeofence) ? '0 4px 14px rgba(14, 116, 144, 0.35)' : 'none'
                        }}
                      >
                        <Clock size={18} /> Confirm GPS Clock-Out
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={gpsLoading || !shiftEval.canCheckIn || !isAllowedByGeofence}
                        onClick={() => handleGpsPunch('Check-In')}
                        style={{
                          width: '100%',
                          padding: '13px 20px',
                          borderRadius: '10px',
                          backgroundColor: (shiftEval.canCheckIn && isAllowedByGeofence) ? '#10b981' : '#cbd5e1',
                          color: '#ffffff',
                          fontWeight: 800,
                          fontSize: '0.9rem',
                          border: 'none',
                          cursor: (shiftEval.canCheckIn && isAllowedByGeofence && !gpsLoading) ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          boxShadow: (shiftEval.canCheckIn && isAllowedByGeofence) ? '0 4px 14px rgba(16, 185, 129, 0.35)' : 'none'
                        }}
                      >
                        <CheckCircle2 size={18} /> Confirm GPS Clock-In
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Portal link */}
              <div style={{ textAlign: 'center', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowGpsModal(false);
                    setActiveModule('gps_geofence');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#0891b2',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    textDecoration: 'underline'
                  }}
                >
                  Open Full GPS Geofence & Location Portal →
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* PHOTO PREVIEW LIGHTBOX MODAL */}
      {previewPhoto && (
        <div 
          className="modal-overlay" 
          onClick={() => setPreviewPhoto(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div 
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '460px',
              width: '100%',
              backgroundColor: '#ffffff',
              borderRadius: '20px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
              border: '1px solid #e2e8f0',
              animation: 'fadeIn 0.2s ease-out'
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Camera size={18} color="#0e7490" />
                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>
                  {previewPhoto.title}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748b',
                  padding: '4px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Photo Preview Container */}
            <div style={{
              padding: '16px',
              backgroundColor: '#0f172a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '260px',
              maxHeight: '420px'
            }}>
              <img
                src={previewPhoto.url}
                alt={previewPhoto.title}
                style={{
                  maxWidth: '100%',
                  maxHeight: '380px',
                  borderRadius: '12px',
                  objectFit: 'contain',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
                }}
              />
            </div>

            {/* Footer with verification metadata */}
            <div style={{
              padding: '14px 20px',
              backgroundColor: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px solid #e2e8f0'
            }}>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                  {previewPhoto.subtitle}
                </div>
                {previewPhoto.time && (
                  <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '2px' }}>
                    Punch Time: {previewPhoto.time}
                  </div>
                )}
              </div>
              <span style={{
                padding: '4px 10px',
                borderRadius: '9999px',
                fontSize: '0.72rem',
                fontWeight: 800,
                backgroundColor: '#ecfeff',
                color: '#0e7490',
                border: '1px solid #a5f3fc',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <CheckCircle2 size={12} />
                <span>Face Verified</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
