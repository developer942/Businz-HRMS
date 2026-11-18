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
  Search,
  SlidersHorizontal
} from 'lucide-react';
import { formatDateDDMMYYYY, normalizeToYYYYMMDD, formatTimeDisplay } from '../../utils/dateUtils';
import {
  parseTimeToMinutes,
  buildEmployeeMonthlyAttendanceOtReport,
  calculateEnterpriseOvertimeRateAndAmount
} from '../../services/attendanceCalculationEngine';
import { isOwnerOrCEO, isAttendanceExemptEmployee } from '../../data/hrmsInitialData';
import { formatCurrency } from '../../utils/numbers';
import type { FaceLog } from '../../types/hrms';
import {
  submitVerifiedFacePunch,
  fetchCanonicalGeofenceSettings,
  reportClientGpsDiagnostic
} from '../../services/attendanceApi';
import { supabaseDirect } from '../../services/supabaseDirectService';

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
    syncAllWithCloud,
    overtimeRequests,
    overtimePolicy,
    departmentOtPolicies,
    employeeOtPolicies,
    payrollSettingsConfig,
    shifts,
    holidayPolicies
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
  const isCEO = isOwnerOrCEO(currentUser);
  const isHrOrAdmin = useMemo(() => {
    const role = String(currentUser.role || '').trim();
    const dept = String(currentUser.department || '').trim().toLowerCase();
    const desig = String(currentUser.designation || '').trim().toLowerCase();
    return (
      role === 'Super Admin' ||
      role === 'HR Manager' ||
      role === 'HR Admin' ||
      role === 'HR' ||
      role === 'Management' ||
      role === 'Admin' ||
      dept === 'hr' ||
      dept.includes('human resource') ||
      desig.includes('hr')
    );
  }, [currentUser]);

  const [activityViewTab, setActivityViewTab] = useState<'my' | 'all'>(() =>
    (isOwnerOrCEO(currentUser) || isHrOrAdmin) ? 'all' : 'my'
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [staffSearchQuery, setStaffSearchQuery] = useState<string>('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('all');
  const [selectedEmpFilter, setSelectedEmpFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [isMobileFilterSheetOpen, setIsMobileFilterSheetOpen] = useState<boolean>(false);
  const [draftDeptFilter, setDraftDeptFilter] = useState<string>('all');
  const [draftEmpFilter, setDraftEmpFilter] = useState<string>('all');
  const [draftStatusFilter, setDraftStatusFilter] = useState<string>('all');
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

  const selectedEmp = employees.find(e =>
    String(e.employeeId || '').trim().toLowerCase() === String(selectedEmpId || '').trim().toLowerCase() ||
    String(e.id || '').trim().toLowerCase() === String(selectedEmpId || '').trim().toLowerCase()
  );

  // Local immediate committed record for today so UI buttons (Punch In / Punch Out) never lag or flicker during cloud sync
  const [committedTodayRecord, setCommittedTodayRecord] = useState<any | null>(null);

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
    const candidateIds = new Set(
      [
        selectedEmpId,
        selectedEmp?.employeeId,
        selectedEmp?.id,
        currentUser.employeeId,
        currentUser.id,
      ]
        .filter(Boolean)
        .map(v => String(v).trim().toLowerCase())
    );
    const matches = attendanceRecords.filter(a => {
      const aEmp = String(a.employeeId || '').trim().toLowerCase();
      const matchesEmp = Boolean(aEmp && candidateIds.has(aEmp));
      const matchesDate = normalizeToYYYYMMDD(a.shiftDate) === todayStr || normalizeToYYYYMMDD(a.date) === todayStr;
      return matchesEmp && matchesDate;
    });

    const fromRecords = matches.length <= 1
      ? matches[0]
      : (
          matches.find(a => a.checkIn && a.checkIn !== '--:--' && a.checkIn.trim() !== '') ||
          matches.find(a => (a.method as string) === 'Manual Override' || a.method === 'Manual Punch' || Boolean(a.reason)) ||
          matches[0]
        );

    const isCommittedForToday =
      committedTodayRecord &&
      (normalizeToYYYYMMDD(committedTodayRecord.shiftDate) === todayStr || normalizeToYYYYMMDD(committedTodayRecord.date) === todayStr) &&
      candidateIds.has(String(committedTodayRecord.employeeId || '').trim().toLowerCase());

    if (!fromRecords) {
      return isCommittedForToday ? committedTodayRecord : undefined;
    }
    if (!isCommittedForToday) {
      return fromRecords;
    }
    const isManualOverride = (fromRecords.method as string) === 'Manual Override' || fromRecords.method === 'Manual Punch' || Boolean(fromRecords.reason);
    if (isManualOverride) {
      return fromRecords;
    }
    return {
      ...fromRecords,
      checkIn: (fromRecords.checkIn && fromRecords.checkIn !== '--:--' && fromRecords.checkIn.trim() !== '')
        ? fromRecords.checkIn
        : committedTodayRecord.checkIn,
      checkOut: (fromRecords.checkOut && fromRecords.checkOut !== '--:--' && fromRecords.checkOut.trim() !== '')
        ? fromRecords.checkOut
        : committedTodayRecord.checkOut,
      checkInPhoto: fromRecords.checkInPhoto || committedTodayRecord.checkInPhoto,
      checkOutPhoto: fromRecords.checkOutPhoto || committedTodayRecord.checkOutPhoto,
    };
  }, [attendanceRecords, selectedEmpId, selectedEmp, currentUser.employeeId, currentUser.id, todayStr, committedTodayRecord]);

  const isCheckedIn = Boolean(todayAttendance?.checkIn && todayAttendance.checkIn.trim() !== '' && todayAttendance.checkIn !== '--:--');
  const isCheckedOut = Boolean(todayAttendance?.checkOut && todayAttendance.checkOut.trim() !== '' && todayAttendance.checkOut !== '--:--');
  const isCompletedToday = Boolean(isCheckedIn && isCheckedOut);

  useEffect(() => {
    if (isCEO || isHrOrAdmin) {
      setActivityViewTab('all');
    } else {
      setActivityViewTab('my');
    }
  }, [isCEO, isHrOrAdmin, currentUser.id, currentUser.employeeId]);

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

  // Sync selected employee whenever logged-in user or employee directory changes
  useEffect(() => {
    const matchedEmp = employees.find(e =>
      (currentUser.employeeId && (e.employeeId?.toLowerCase() === currentUser.employeeId.toLowerCase() || e.id?.toLowerCase() === currentUser.employeeId.toLowerCase())) ||
      (currentUser.id && (e.id?.toLowerCase() === currentUser.id.toLowerCase() || e.employeeId?.toLowerCase() === currentUser.id.toLowerCase())) ||
      (currentUser.email && e.email?.toLowerCase() === currentUser.email.toLowerCase())
    );
    const resolvedId = matchedEmp?.employeeId || currentUser.employeeId || currentUser.id;
    if (resolvedId && resolvedId !== selectedEmpId) {
      setSelectedEmpId(resolvedId);
    }
  }, [currentUser, employees]);

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
    cameraOpenMs?: number;
    photoCaptureMs?: number;
    confirmToSuccessMs?: number;
  } | null>(null);
  const [isFullScreenCameraOpen, setIsFullScreenCameraOpen] = useState<boolean>(false);
  const [fullScreenStep, setFullScreenStep] = useState<'CAMERA' | 'CONFIRM'>('CAMERA');
  const [capturedFullScreenPhoto, setCapturedFullScreenPhoto] = useState<string | null>(null);
  const [fullScreenError, setFullScreenError] = useState<string | null>(null);
  const [perfMetrics, setPerfMetrics] = useState<{
    cameraOpenMs: number;
    photoCaptureMs: number;
    gpsDurationMs: number;
    confirmToSuccessMs: number;
  }>({
    cameraOpenMs: 0,
    photoCaptureMs: 0,
    gpsDurationMs: 0,
    confirmToSuccessMs: 0
  });
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
    const isFlexibleEmp = selectedEmp?.attendanceMethod === 'Flexible' || (selectedEmp as any)?.attendance_method === 'Flexible';
    const isFieldDutyAuthorized = Boolean(fieldAssignment) || isFlexibleEmp;
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
          address: fieldAssignment
            ? `Authorized Field Duty (${fieldAssignment?.customerSiteName || fieldAssignment?.siteAddress || 'Field Site'})`
            : isFlexibleEmp
              ? 'Daily Field Work (GPS Verified)'
              : (geofenceConfig.officeName || 'HQ Office'),
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
      } else if (!geofenceConfig.enabled || evaluation.canPunch) {
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

    // If a preserved face verification exists within its 90-second freshness window, keep it ready for Confirm Punch In / Out
    const preserved = preservedFaceCaptureRef.current;
    if (
      verifiedOnRetry &&
      preserved &&
      preserved.employeeId === selectedEmpId &&
      Date.now() - preserved.capturedAt <= 90000
    ) {
      setFullScreenError(null);
    }
  };

  // Do NOT keep the camera permanently active on the Attendance home screen.
  // Camera opens only in full-screen mode when the employee taps Punch In or Punch Out.

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

    // Ensure camera is never permanently active on the Attendance home screen
    stopCamera();

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

    if (isCEO || isOwnerOrCEO(selectedEmp)) {
      setScanResult({
        status: 'error',
        message: 'CEO / Company Owner is exempt from personal attendance tracking.'
      });
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

    // Reset full-screen camera state and open immediately
    setCommittedPunchSummary(null);
    setScanResult({ status: null, message: '' });
    setCapturedFullScreenPhoto(null);
    setFullScreenError(null);
    setFullScreenStep('CAMERA');
    setIsFullScreenCameraOpen(true);
    setCameraAccessDenied(false);

    // Start GPS acquisition simultaneously in parallel with camera initialization (non-blocking)
    void startConcurrentGpsAcquisition().catch(() => {});

    // Open front camera and measure camera initialization latency
    const camStartMs = Date.now();
    try {
      await startCameraStream();
      setCameraAccessDenied(false);
      setPerfMetrics(prev => ({
        ...prev,
        cameraOpenMs: Math.max(1, Date.now() - camStartMs)
      }));
    } catch (camErr: any) {
      setCameraAccessDenied(true);
      const errMsg =
        camErr?.name === 'NotAllowedError' || camErr?.name === 'PermissionDeniedError'
          ? 'Camera Permission Denied. Please allow camera access in browser settings.'
          : (camErr?.message || 'Camera access is required for Face Attendance.');
      setFullScreenError(errMsg);
      setScanResult({
        status: 'error',
        message: errMsg
      });
    }
  };

  // Start or reuse concurrent GPS acquisition in parallel with camera opening (no duplicate requests)
  const startConcurrentGpsAcquisition = () => {
    const centerLat = Number(geofenceConfig.centerLat) || 13.151660;
    const centerLng = Number(geofenceConfig.centerLng) || 80.208618;
    const radius = Number(geofenceConfig.radiusMeters) || 500;
    const maxAccuracyThreshold = Number((geofenceConfig as any).maxAccuracyMeters) > 0
      ? Number((geofenceConfig as any).maxAccuracyMeters)
      : undefined;
    const fieldAssignment = getTodayFieldAssignment(selectedEmpId);
    const isFlexibleEmp = selectedEmp?.attendanceMethod === 'Flexible' || (selectedEmp as any)?.attendance_method === 'Flexible';
    const isFieldDutyAuthorized = Boolean(fieldAssignment) || isFlexibleEmp;

    // If a verified GPS reading was acquired within the last 45s, reuse it immediately (0ms wait)
    if (
      activePunchGps &&
      gpsStatusDetails.verified &&
      typeof activePunchGps.timestamp === 'number' &&
      Date.now() - activePunchGps.timestamp < 45000
    ) {
      setPerfMetrics(prev => ({ ...prev, gpsDurationMs: 0 }));
      return Promise.resolve({
        latitude: activePunchGps.latitude,
        longitude: activePunchGps.longitude,
        accuracy: activePunchGps.accuracy,
        timestamp: activePunchGps.timestamp,
        readingAgeMs: Math.max(0, Date.now() - activePunchGps.timestamp),
        sampleCount: activePunchGps.sampleCount ?? 1,
        durationMs: 0,
        retryCount: activePunchGps.retryCount ?? 0,
        deviceCategory: activePunchGps.browserDeviceCategory || detectBrowserDeviceCategory(),
        browserDeviceCategory: activePunchGps.browserDeviceCategory || detectBrowserDeviceCategory()
      });
    }

    // If an active GPS promise is already in flight, share it without restarting geolocation
    if (activeGpsPromiseRef.current) {
      return activeGpsPromiseRef.current;
    }

    setGpsProgressMsg('Getting GPS Location...');
    setLastGpsErrorCode(null);

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
    })
      .then((reading) => {
        setGpsPermissionState('granted');
        setPerfMetrics(prev => ({ ...prev, gpsDurationMs: reading.durationMs ?? 0 }));
        const distance = calculateAccurateHaversine(reading.latitude, reading.longitude, centerLat, centerLng);
        const evaluation = evaluateGeofenceBoundary(
          distance,
          radius,
          reading.accuracy,
          geofenceConfig.officeName || 'HQ Office',
          maxAccuracyThreshold
        );

        if (isFieldDutyAuthorized && reading.accuracy <= (maxAccuracyThreshold ?? 150)) {
          setActivePunchGps({
            latitude: reading.latitude,
            longitude: reading.longitude,
            accuracy: reading.accuracy,
            address: fieldAssignment
            ? `Authorized Field Duty (${fieldAssignment?.customerSiteName || fieldAssignment?.siteAddress || 'Field Site'})`
            : isFlexibleEmp
              ? 'Daily Field Work (GPS Verified)'
              : (geofenceConfig.officeName || 'HQ Office'),
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
        } else if (!geofenceConfig.enabled || evaluation.canPunch) {
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
        }
        setGpsProgressMsg('');
        return reading;
      })
      .finally(() => {
        if (activeGpsPromiseRef.current === task) {
          activeGpsPromiseRef.current = null;
        }
      });

    activeGpsPromiseRef.current = task;
    return task;
  };

  // Close the Full-Screen Camera modal and release camera hardware immediately
  const handleCloseFullScreenCamera = () => {
    if (isScanning || punchInProgressRef.current) return;
    stopCamera();
    setIsFullScreenCameraOpen(false);
    setFullScreenStep('CAMERA');
    setCapturedFullScreenPhoto(null);
    setFullScreenError(null);
    setGpsProgressMsg('');
  };

  // STEP 2: Employee taps Capture Photo in Full-Screen Camera -> Display Captured Photo & Confirm Button Only (NO Retake)
  const handleCaptureFullScreenPhoto = () => {
    setFullScreenError(null);
    const capStartMs = Date.now();
    try {
      const frame = captureVideoFrame();
      if (
        punchType === 'Check-Out' &&
        ((myTodayCheckInPhoto && frame === myTodayCheckInPhoto) ||
          (todayAttendance?.checkInPhoto && frame === todayAttendance.checkInPhoto))
      ) {
        setFullScreenError('New selfie required for Punch Out. Please capture a live photo.');
        return;
      }

      const captureMs = Math.max(1, Date.now() - capStartMs);
      setPerfMetrics(prev => ({ ...prev, photoCaptureMs: captureMs }));

      // Preserve verified face photo for this punch session
      preservedFaceCaptureRef.current = {
        photoBase64: frame,
        capturedAt: Date.now(),
        punchType,
        employeeId: selectedEmpId
      };
      setHasPreservedFaceCapture(true);
      setCapturedFullScreenPhoto(frame);
      setFullScreenStep('CONFIRM');

      // Stop live camera hardware once photo is captured while keeping concurrent GPS running untouched
      stopCamera();
    } catch (err: any) {
      setFullScreenError(err?.message || 'Camera frame not ready. Please try again.');
    }
  };

  // STEP 3: Employee taps Confirm Punch In / Confirm Punch Out -> Validate Face, GPS, Geofence & Shift -> Save to PostgreSQL
  const handleConfirmFullScreenPunch = async () => {
    if (isScanning || punchInProgressRef.current) return;
    const type = punchType;
    const capturedPhotoUrl = capturedFullScreenPhoto || preservedFaceCaptureRef.current?.photoBase64;
    if (!capturedPhotoUrl) {
      setFullScreenError('Please capture your face photo first.');
      setFullScreenStep('CAMERA');
      void startCameraStream().catch(() => {});
      return;
    }

    const confirmStartMs = Date.now();
    punchInProgressRef.current = true;
    setIsScanning(true);
    setIsRequestingPermissions(true);
    setFullScreenError(null);
    setUncertainContext(null);

    const centerLat = Number(geofenceConfig.centerLat) || 13.151660;
    const centerLng = Number(geofenceConfig.centerLng) || 80.208618;
    const radius = Number(geofenceConfig.radiusMeters) || 500;
    const maxAccuracyThreshold = Number((geofenceConfig as any).maxAccuracyMeters) > 0
      ? Number((geofenceConfig as any).maxAccuracyMeters)
      : undefined;
    const fieldAssignment = getTodayFieldAssignment(selectedEmpId);
    const isFlexibleEmp = selectedEmp?.attendanceMethod === 'Flexible' || (selectedEmp as any)?.attendance_method === 'Flexible';
    const isFieldDutyAuthorized = Boolean(fieldAssignment) || isFlexibleEmp;

    try {
      // Wait for concurrent GPS acquisition (or reuse already-verified fresh reading in 0ms)
      const reading = await startConcurrentGpsAcquisition();

      setGpsPermissionState('granted');
      setIsRequestingPermissions(false);
      setGpsProgressMsg('Saving Attendance...');

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
            ? `Outside Allowed Attendance Area (${Math.round(distance)}m from ${geofenceConfig.officeName || 'Office'}, allowed ${radius}m)`
            : `GPS Accuracy Insufficient (±${Math.round(reading.accuracy)}m) — Tap Retry Location`;
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
        }

        throw new Error(conciseMsg);
      }

      const gpsInfo = {
        latitude: reading.latitude,
        longitude: reading.longitude,
        accuracy: reading.accuracy,
        address: isFieldDutyAuthorized
          ? (fieldAssignment
              ? `Authorized Field Duty (${fieldAssignment?.customerSiteName || fieldAssignment?.siteAddress || 'Field Site'})`
              : 'Daily Field Work (GPS Verified)')
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
      const activeSessionMarker =
        type === 'Check-In'
          ? (todayAttendance?.checkIn && todayAttendance.checkIn !== '--:--' ? todayAttendance.checkIn : 'fresh')
          : (todayAttendance?.checkOut && todayAttendance.checkOut !== '--:--' ? todayAttendance.checkOut : 'fresh');
      const idempotencyKey = `punch-${selectedEmpId}-${todayStr}-${type === 'Check-In' ? 'IN' : 'OUT'}-${activeSessionMarker}`;

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

      const confirmElapsedMs = Math.max(1, Date.now() - confirmStartMs);
      setPerfMetrics(prev => ({
        ...prev,
        gpsDurationMs: reading.durationMs ?? prev.gpsDurationMs,
        confirmToSuccessMs: confirmElapsedMs
      }));

      const fallbackNowTime = formatTimeDisplay(new Date(), '');
      const resolvedCheckIn =
        formatTimeDisplay(serverRecord.checkIn, '') ||
        (type === 'Check-In' ? fallbackNowTime : (todayAttendance?.checkIn || null));
      const resolvedCheckOut =
        formatTimeDisplay(serverRecord.checkOut, '') ||
        (type === 'Check-Out' ? fallbackNowTime : (todayAttendance?.checkOut || null));

      // Clear preserved face capture once attendance is committed to PostgreSQL
      preservedFaceCaptureRef.current = null;
      setHasPreservedFaceCapture(false);
      setCommittedPunchSummary({
        title: type === 'Check-In' ? 'Punch In Successful' : 'Punch Out Successful',
        savedTime:
          type === 'Check-In'
            ? (resolvedCheckIn || fallbackNowTime)
            : (resolvedCheckOut || fallbackNowTime),
        status: serverRecord.status || 'Present',
        lateStatus: serverRecord.lateStatus || (serverRecord.status === 'Late' ? 'Late' : 'On Time'),
        locationText: `GPS Verified (${Math.round(distance)}m / ${radius}m, ±${Math.round(reading.accuracy)}m)`,
        totalLatencyMs: confirmElapsedMs,
        gpsDurationMs: reading.durationMs ?? 0,
        cameraOpenMs: perfMetrics.cameraOpenMs,
        photoCaptureMs: perfMetrics.photoCaptureMs,
        confirmToSuccessMs: confirmElapsedMs
      });
      stopCamera();
      setIsFullScreenCameraOpen(false);
      setFullScreenStep('CAMERA');
      setCapturedFullScreenPhoto(null);
      setFullScreenError(null);

      // Apply authoritative PostgreSQL record immediately upon server confirmation
      const committedRecord = {
        id: serverRecord.id,
        employeeId: serverRecord.employeeId || selectedEmpId,
        employeeName: empName,
        department: emp?.department || 'General',
        designation: emp?.designation,
        date: serverRecord.date || todayStr,
        shiftDate: serverRecord.shiftDate || serverRecord.date || todayStr,
        checkIn: resolvedCheckIn,
        checkOut: resolvedCheckOut,
        checkInPhoto: serverRecord.checkInPhoto || (type === 'Check-In' ? capturedPhotoUrl : todayAttendance?.checkInPhoto),
        checkOutPhoto: serverRecord.checkOutPhoto || (type === 'Check-Out' ? capturedPhotoUrl : todayAttendance?.checkOutPhoto),
        workingHours: serverRecord.workingHours,
        status: (serverRecord.status || 'Present') as any,
        lateStatus: (serverRecord.lateStatus || 'On Time') as any,
        method: 'Face Recognition' as const,
        faceVerified: true,
        location: {
          lat: serverRecord.locationLat ?? gpsInfo.latitude,
          lng: serverRecord.locationLng ?? gpsInfo.longitude,
          address: serverRecord.locationAddress || gpsInfo.address,
          inGeofence: serverRecord.inGeofence ?? true,
        },
      };
      setCommittedTodayRecord(committedRecord);
      applyServerAttendanceRecord(committedRecord);
      // Synchronize full cloud state asynchronously in background without blocking UI confirmation
      void syncAllWithCloud().catch(() => {});

      if (type === 'Check-In') {
        const authoritativeEpoch = serverRecord.createdAt ? Date.parse(serverRecord.createdAt) : Date.now();
        const nowEpoch = String(Number.isFinite(authoritativeEpoch) ? authoritativeEpoch : Date.now());
        try {
          localStorage.setItem(`vrm_punch_in_epoch_${selectedEmpId}_${todayStr}`, nowEpoch);
          if (serverRecord.employeeId) {
            localStorage.setItem(`vrm_punch_in_epoch_${serverRecord.employeeId}_${todayStr}`, nowEpoch);
          }
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
      let conciseErr = err?.message || 'GPS Timed Out — Retry Location';
      if (err instanceof GpsAcquisitionError) {
        setActivePunchGps(null);
        setLastGpsErrorCode(err.code);
        if (err.code === 'PERMISSION_DENIED') {
          setGpsPermissionState('denied');
          conciseErr = 'Location Permission Denied — Please enable Precise Location in Browser Settings';
        } else {
          conciseErr = hasPreserved
            ? 'GPS Timed Out — Tap Retry Location (Captured Photo Preserved)'
            : 'GPS Timed Out — Retry Location';
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
      setFullScreenError(conciseErr);
      setScanResult({
        status: 'error',
        message: conciseErr
      });
      return;
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

    const isCeo = isOwnerOrCEO(activeEmp) || isOwnerOrCEO(currentUser);
    if (isCeo) {
      setScanResult({
        status: 'error',
        message: 'CEO / Company Owner is exempt from personal attendance tracking.'
      });
      punchInProgressRef.current = false;
      return;
    }

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

    if (geofenceConfig.enabled && !canPunch) {
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
      matches.find(a => a.checkIn && a.checkIn !== '--:--' && a.checkIn.trim() !== '') ||
      matches.find(a => (a.method as string) === 'Manual Override' || a.method === 'Manual Punch' || Boolean(a.reason)) ||
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
      if (isOwnerOrCEO(emp || att)) {
        return;
      }

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

  const [monthPhotosMap, setMonthPhotosMap] = useState<Record<string, { checkInPhoto?: string; checkOutPhoto?: string }>>({});

  useEffect(() => {
    if (mode !== 'log' || !selectedMonth) return;
    let cancelled = false;
    supabaseDirect.getAttendancePhotosByMonth(selectedMonth).then(rows => {
      if (cancelled || !Array.isArray(rows)) return;
      const nextMap: Record<string, { checkInPhoto?: string; checkOutPhoto?: string }> = {};
      rows.forEach(r => {
        if (r?.id && (r.check_in_photo || r.check_out_photo)) {
          nextMap[r.id] = {
            checkInPhoto: r.check_in_photo || undefined,
            checkOutPhoto: r.check_out_photo || undefined,
          };
        }
      });
      setMonthPhotosMap(prev => ({ ...prev, ...nextMap }));
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mode, selectedMonth, attendanceRecords.length]);

  // Photo resolution helper for attendance records and face logs
  const getRecordPhoto = (record: any, type: 'Check-In' | 'Check-Out'): string | null => {
    const cachedPhoto = record?.id ? monthPhotosMap[record.id] : undefined;
    if (type === 'Check-In' && (record.checkInPhoto || cachedPhoto?.checkInPhoto)) {
      return record.checkInPhoto || cachedPhoto?.checkInPhoto || null;
    }
    if (type === 'Check-Out' && (record.checkOutPhoto || cachedPhoto?.checkOutPhoto)) {
      return record.checkOutPhoto || cachedPhoto?.checkOutPhoto || null;
    }

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

  // Elapsed Week Off (Sunday) & Company Holiday dates in the selected month (up to today)
  const elapsedMonthHolidayDates = useMemo(() => {
    const result: Array<{ dateStr: string; label: string }> = [];
    if (!selectedMonth) return result;
    const [year, month] = selectedMonth.split('-').map(Number);
    if (!year || !month) return result;
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (dateStr > todayStr) continue;
      const dateObj = new Date(year, month - 1, day, 12, 0, 0);
      const isSunday = dateObj.getDay() === 0;
      const matchedHoliday = (holidayPolicies || []).find(h => normalizeToYYYYMMDD(h.date) === dateStr);
      if (isSunday || matchedHoliday) {
        result.push({
          dateStr,
          label: matchedHoliday ? ((matchedHoliday as any).name || (matchedHoliday as any).holidayName || 'Holiday') : 'Week Off'
        });
      }
    }
    return result;
  }, [selectedMonth, todayStr, holidayPolicies]);

  // Current user's monthly attendance records (Consolidated & deduplicated per date, including Week Off / Holiday rows)
  const myMonthlyRecords = useMemo(() => {
    if (isCEO || isOwnerOrCEO(currentUserEmp)) return [];
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

    const myJoiningDate = normalizeToYYYYMMDD(currentUserEmp?.joiningDate || currentUserEmp?.dateOfJoining);
    elapsedMonthHolidayDates.forEach(({ dateStr, label }) => {
      if (myJoiningDate && dateStr < myJoiningDate) return;
      if (!byDate.has(dateStr)) {
        const empCode = currentUserEmp?.employeeId || currentUser.employeeId || '';
        byDate.set(dateStr, {
          id: `HOL-${empCode || 'ME'}-${dateStr}`,
          employeeId: empCode,
          employeeName: currentUser.name || 'Employee',
          department: currentUserEmp?.department || currentUser.department || 'General',
          date: dateStr,
          shiftDate: dateStr,
          checkIn: null,
          checkOut: null,
          workingHours: 0,
          status: 'Holiday',
          method: label
        });
      }
    });

    return Array.from(byDate.values()).sort((a, b) => {
      const da = normalizeToYYYYMMDD(a.date || a.shiftDate);
      const db = normalizeToYYYYMMDD(b.date || b.shiftDate);
      return String(db).localeCompare(String(da));
    });
  }, [attendanceRecords, selectedMonth, isLogForCurrentUser, elapsedMonthHolidayDates, currentUserEmp, currentUser]);

  const resolveEffectiveRecordStatus = (rec: any): string => {
    const rawStatus = String(rec?.status || 'Present').trim();
    const statusNorm = rawStatus.toLowerCase();
    if (statusNorm === 'holiday' || statusNorm === 'week off' || statusNorm === 'weekoff' || statusNorm === 'wo') {
      return 'Holiday';
    }
    if (statusNorm === 'half day' || statusNorm === 'half-day' || statusNorm === 'hd') {
      return 'Half Day';
    }
    const hasOut = Boolean(rec?.checkOut && rec.checkOut !== '--:--' && String(rec.checkOut).trim() !== '');
    const hrs = Number(rec?.workingHours || 0);
    if (hasOut && hrs > 0 && hrs < 9 * 0.7 && (statusNorm === 'present' || statusNorm === 'late')) {
      return 'Half Day';
    }
    if (statusNorm === 'late' || (rec?.lateStatus && rec.lateStatus !== 'On Time' && rec.lateStatus !== 'N/A')) {
      return 'Late';
    }
    return rawStatus || 'Present';
  };

  const getRecordDailyOt = (rec: any): { otHrs: number; otAmount: number } => {
    const empMatch = employees.find(
      e =>
        String(e.employeeId || '').toLowerCase() === String(rec?.employeeId || '').toLowerCase() ||
        String(e.id || '').toLowerCase() === String(rec?.employeeId || '').toLowerCase()
    ) || currentUserEmp || currentUser;
    if (!empMatch || isOwnerOrCEO(empMatch)) return { otHrs: 0, otAmount: 0 };
    if (rec?.otApprovalStatus === 'Rejected' || rec?.otStatus === 'Rejected') return { otHrs: 0, otAmount: 0 };

    const recDate = normalizeToYYYYMMDD(rec?.date || rec?.shiftDate);
    const matchedOtReq = (overtimeRequests || []).find(req => {
      const rEmpId = String(req.employeeId || '').trim().toLowerCase();
      const recEmpId = String(rec?.employeeId || (empMatch as any).employeeId || '').trim().toLowerCase();
      const isApproved = req.status === 'Approved' || req.status === 'Partially Approved' || req.status === 'Paid';
      return isApproved && rEmpId === recEmpId && normalizeToYYYYMMDD(req.date) === recDate;
    });

    const stdShiftHours = 9;
    const workHrs = Number(rec?.workingHours || 0);
    const explicitOt =
      matchedOtReq
        ? Number(matchedOtReq.approvedOtHours || (matchedOtReq as any).otHours || matchedOtReq.requestedOtHours || 0)
        : (rec?.approvedOtHours !== undefined && Number(rec.approvedOtHours) > 0
            ? Number(rec.approvedOtHours)
            : Number((rec as any)?.otHours || rec?.overtimeHours || rec?.calculatedOtHours || 0));
    const autoExcessOt = workHrs > stdShiftHours ? Math.round((workHrs - stdShiftHours + Number.EPSILON) * 100) / 100 : 0;
    const otHrs = explicitOt > 0 ? explicitOt : autoExcessOt;
    if (otHrs <= 0) return { otHrs: 0, otAmount: 0 };

    const [yStr, mStr] = (selectedMonth || '').split('-');
    const calc = calculateEnterpriseOvertimeRateAndAmount({
      employee: empMatch as any,
      approvedOtHours: otHrs,
      month: Number(mStr) || undefined,
      year: Number(yStr) || undefined,
      dateStr: recDate,
      payrollConfig: payrollSettingsConfig,
      overtimePolicy,
      departmentOtPolicies,
      employeeOtPolicies,
    });
    return {
      otHrs: Math.round((otHrs + Number.EPSILON) * 100) / 100,
      otAmount: calc.overtimeAmount
    };
  };

  // Monthly summary stats for current user
  const monthlyStats = useMemo(() => {
    let presentDays = 0;
    let halfDays = 0;
    let lateDays = 0;
    let totalWorkedHours = 0;
    let totalOtHours = 0;
    let totalOtAmount = 0;

    myMonthlyRecords.forEach(r => {
      const effStatus = resolveEffectiveRecordStatus(r);
      if (effStatus === 'Half Day') {
        presentDays += 0.5;
        halfDays += 1;
      } else if (effStatus === 'Present' || effStatus === 'Late') {
        presentDays += 1;
      }
      if (effStatus === 'Late' || (r.lateStatus && r.lateStatus !== 'On Time' && r.lateStatus !== 'N/A') || (r.lateDurationMinutes && r.lateDurationMinutes > 0)) {
        lateDays++;
      }
      totalWorkedHours += Number(r.workingHours || 0);
      const dailyOt = getRecordDailyOt(r);
      totalOtHours += dailyOt.otHrs;
      totalOtAmount += dailyOt.otAmount;
    });

    return {
      presentDays,
      halfDays,
      lateDays,
      totalHours: Math.round(totalWorkedHours * 10) / 10,
      totalOtHours: Math.round((totalOtHours + Number.EPSILON) * 100) / 100,
      totalOtAmount: Math.round((totalOtAmount + Number.EPSILON) * 100) / 100,
      totalPunches: myMonthlyRecords.length
    };
  }, [myMonthlyRecords, employees, currentUserEmp, currentUser, overtimeRequests, selectedMonth, payrollSettingsConfig, overtimePolicy, departmentOtPolicies, employeeOtPolicies]);

  // All Staff Monthly records (Consolidated & deduplicated per employee per date)
  const allStaffMonthlyRecords = useMemo(() => {
    const rawList = attendanceRecords
      .filter(a => {
        if (isOwnerOrCEO(a)) return false;
        const empMatch = employees.find(
          e =>
            String(e.employeeId || '').toLowerCase() === String(a.employeeId || '').toLowerCase() ||
            String(e.id || '').toLowerCase() === String(a.employeeId || '').toLowerCase()
        );
        if (empMatch && isOwnerOrCEO(empMatch)) return false;
        const d = normalizeToYYYYMMDD(a.date);
        const sd = normalizeToYYYYMMDD(a.shiftDate);
        return (d && d.startsWith(selectedMonth)) || (sd && sd.startsWith(selectedMonth));
      });

    const byEmpDate = new Map<string, any>();
    rawList.forEach(rec => {
      const dateKey = normalizeToYYYYMMDD(rec.date || rec.shiftDate);
      const empMatch = employees.find(
        e =>
          String(e.employeeId || '').toLowerCase() === String(rec.employeeId || '').toLowerCase() ||
          String(e.id || '').toLowerCase() === String(rec.employeeId || '').toLowerCase()
      );
      const canonicalEmpId = empMatch?.employeeId || rec.employeeId || '';
      const empName = empMatch ? `${empMatch.firstName} ${empMatch.lastName}`.trim() : (rec.employeeName || 'Employee');
      const empDept = empMatch?.department || rec.department || 'General';
      const empKey = String(canonicalEmpId || empName).toLowerCase();
      if (!dateKey || !empKey) return;
      const uniqueKey = `${empKey}_${dateKey}`;

      const enrichedRec = {
        ...rec,
        employeeId: canonicalEmpId || rec.employeeId,
        employeeName: empName,
        department: empDept,
        designation: empMatch?.designation || '',
        avatar: empMatch?.avatar || ''
      };

      const existing = byEmpDate.get(uniqueKey);
      if (!existing) {
        byEmpDate.set(uniqueKey, enrichedRec);
        return;
      }

      const existingHasIn = existing.checkIn && existing.checkIn !== '--:--' && existing.checkIn.trim() !== '';
      const recHasIn = enrichedRec.checkIn && enrichedRec.checkIn !== '--:--' && enrichedRec.checkIn.trim() !== '';
      const existingHasOut = existing.checkOut && existing.checkOut !== '--:--' && existing.checkOut.trim() !== '';
      const recHasOut = enrichedRec.checkOut && enrichedRec.checkOut !== '--:--' && enrichedRec.checkOut.trim() !== '';
      const existingHours = Number(existing.workingHours || 0);
      const recHours = Number(enrichedRec.workingHours || 0);

      const isRecManual = (enrichedRec.method as string) === 'Manual Override' || enrichedRec.method === 'Manual Punch' || Boolean(enrichedRec.reason);
      const isExistingManual = (existing.method as string) === 'Manual Override' || existing.method === 'Manual Punch' || Boolean(existing.reason);

      const preferRec = (isRecManual && !isExistingManual) || (!isExistingManual && ((recHasOut && !existingHasOut) || (recHours > existingHours)));
      const base = preferRec ? { ...enrichedRec } : { ...existing };
      const finalHours = (isRecManual && !isExistingManual) ? recHours : (isExistingManual && !isRecManual) ? existingHours : Math.max(existingHours, recHours);

      byEmpDate.set(uniqueKey, {
        ...base,
        checkIn: (existingHasIn && recHasIn) ? (preferRec ? enrichedRec.checkIn : existing.checkIn) : (existingHasIn ? existing.checkIn : enrichedRec.checkIn),
        checkOut: (existingHasOut && recHasOut) ? (preferRec ? enrichedRec.checkOut : existing.checkOut) : (existingHasOut ? existing.checkOut : enrichedRec.checkOut),
        workingHours: finalHours > 0 ? finalHours : base.workingHours,
        checkInPhoto: existing.checkInPhoto || enrichedRec.checkInPhoto,
        checkOutPhoto: enrichedRec.checkOutPhoto || existing.checkOutPhoto
      });
    });

    // Also include Week Off / Company Holiday rows for active employees on elapsed dates in the month
    const activeEmps = employees.filter(e => {
      if (isOwnerOrCEO(e) || isAttendanceExemptEmployee(e)) return false;
      const st = String(e.status || '').toLowerCase().trim();
      const accSt = String((e as any).accountStatus || '').toLowerCase().trim();
      const profSt = String((e as any).profile_data?.status || '').toLowerCase().trim();
      if (st === 'inactive' || st === 'terminated' || accSt === 'deactivated' || accSt === 'disabled' || profSt === 'inactive' || (e as any).isActive === false || e.employeeId === 'EMP-000') {
        return false;
      }
      return true;
    });

    activeEmps.forEach(emp => {
      const canonicalEmpId = emp.employeeId || emp.id || '';
      const empName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'Employee';
      const empKey = String(canonicalEmpId || empName).toLowerCase();
      if (!empKey) return;
      const joinDate = normalizeToYYYYMMDD(emp.joiningDate || emp.dateOfJoining);

      elapsedMonthHolidayDates.forEach(({ dateStr, label }) => {
        if (joinDate && dateStr < joinDate) return;
        const uniqueKey = `${empKey}_${dateStr}`;
        if (!byEmpDate.has(uniqueKey)) {
          byEmpDate.set(uniqueKey, {
            id: `HOL-${canonicalEmpId}-${dateStr}`,
            employeeId: canonicalEmpId,
            employeeName: empName,
            department: emp.department || 'General',
            designation: emp.designation || '',
            avatar: emp.avatar || '',
            date: dateStr,
            shiftDate: dateStr,
            checkIn: null,
            checkOut: null,
            workingHours: 0,
            status: 'Holiday',
            method: label
          });
        }
      });
    });

    return Array.from(byEmpDate.values()).sort((a, b) => {
      const da = normalizeToYYYYMMDD(a.date || a.shiftDate);
      const db = normalizeToYYYYMMDD(b.date || b.shiftDate);
      const cmp = String(db).localeCompare(String(da));
      if (cmp !== 0) return cmp;
      return String(a.employeeName || '').localeCompare(String(b.employeeName || ''));
    });
  }, [attendanceRecords, selectedMonth, employees, elapsedMonthHolidayDates]);

  const availableDepartments = useMemo(() => {
    const depts = new Set<string>();
    employees.forEach(e => {
      if (!isOwnerOrCEO(e) && e.department) depts.add(e.department.trim());
    });
    allStaffMonthlyRecords.forEach(r => {
      if (r.department) depts.add(String(r.department).trim());
    });
    return Array.from(depts).filter(Boolean).sort();
  }, [employees, allStaffMonthlyRecords]);

  const availableFilterEmployees = useMemo(() => {
    return employees
      .filter(e => !isOwnerOrCEO(e))
      .filter(e => selectedDeptFilter === 'all' || String(e.department || '').trim().toLowerCase() === selectedDeptFilter.toLowerCase())
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  }, [employees, selectedDeptFilter]);

  // Filtered all staff monthly by search, department, employee, and status
  const filteredAllStaffMonthlyRecords = useMemo(() => {
    const q = staffSearchQuery.toLowerCase().trim();
    return allStaffMonthlyRecords.filter(r => {
      if (selectedDeptFilter !== 'all' && String(r.department || '').trim().toLowerCase() !== selectedDeptFilter.toLowerCase()) {
        return false;
      }
      if (selectedEmpFilter !== 'all' && String(r.employeeId || '').trim().toLowerCase() !== selectedEmpFilter.toLowerCase()) {
        return false;
      }
      const effStatus = resolveEffectiveRecordStatus(r);
      if (selectedStatusFilter !== 'all' && effStatus.toLowerCase() !== selectedStatusFilter.toLowerCase()) {
        return false;
      }
      if (!q) return true;
      return (
        (r.employeeName && r.employeeName.toLowerCase().includes(q)) ||
        (r.employeeId && r.employeeId.toLowerCase().includes(q)) ||
        (r.department && r.department.toLowerCase().includes(q))
      );
    });
  }, [allStaffMonthlyRecords, staffSearchQuery, selectedDeptFilter, selectedEmpFilter, selectedStatusFilter]);

  const showAllEmployeesView = (isCEO || isHrOrAdmin) && activityViewTab === 'all';
  const activeLogRecords = showAllEmployeesView ? filteredAllStaffMonthlyRecords : myMonthlyRecords;
  const totalScopeEmployees = availableFilterEmployees.length;

  const activeSummaryStats = useMemo(() => {
    let presentCount = 0;
    let lateCount = 0;
    let halfDayCount = 0;
    activeLogRecords.forEach(r => {
      const effStatus = resolveEffectiveRecordStatus(r);
      if (effStatus === 'Half Day') {
        halfDayCount++;
      } else if (effStatus === 'Late') {
        lateCount++;
      } else if (effStatus === 'Present') {
        presentCount++;
      }
    });
    return {
      totalRecords: activeLogRecords.length,
      presentCount,
      lateCount,
      halfDayCount
    };
  }, [activeLogRecords]);

  const draftFilterEmployees = useMemo(() => {
    return employees
      .filter(e => !isOwnerOrCEO(e))
      .filter(e => draftDeptFilter === 'all' || String(e.department || '').trim().toLowerCase() === draftDeptFilter.toLowerCase())
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  }, [employees, draftDeptFilter]);

  const activeMobileFilterCount = useMemo(() => {
    let c = 0;
    if (selectedDeptFilter !== 'all') c++;
    if (selectedEmpFilter !== 'all') c++;
    if (selectedStatusFilter !== 'all') c++;
    return c;
  }, [selectedDeptFilter, selectedEmpFilter, selectedStatusFilter]);

  const getStatusDotColor = (statusStr: string): string => {
    if (statusStr === 'Present') return '#16a34a';
    if (statusStr === 'Late') return '#d97706';
    if (statusStr === 'Half Day') return '#d97706';
    if (statusStr === 'Holiday') return '#2563eb';
    return '#dc2626';
  };

  const renderPlainStatus = (statusStr: string) => {
    const label = statusStr || 'Absent';
    const dotColor = getStatusDotColor(label);
    return (
      <span
        data-testid="record-status"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '0.82rem',
          fontWeight: 600,
          color: '#0f172a',
          background: 'transparent',
          border: 'none',
          padding: 0,
          borderRadius: 0,
          whiteSpace: 'nowrap'
        }}
      >
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: dotColor,
            display: 'inline-block',
            flexShrink: 0
          }}
        />
        <span>{label}</span>
      </span>
    );
  };

  const getWeekdayShort = (dateRaw?: string) => {
    const ymd = normalizeToYYYYMMDD(dateRaw);
    if (!ymd) return '';
    const [y, m, d] = ymd.split('-').map(Number);
    if (!y || !m || !d) return '';
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' });
  };

  const formatShortHumanDate = (dateRaw?: string) => {
    const ymd = normalizeToYYYYMMDD(dateRaw);
    if (!ymd) return formatDateDDMMYYYY(dateRaw);
    const [y, m, d] = ymd.split('-').map(Number);
    if (!y || !m || !d) return formatDateDDMMYYYY(dateRaw);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const renderDesktopPunchInline = (
    type: 'Check-In' | 'Check-Out',
    timeVal: string | undefined,
    photoUrl: string | null,
    personName: string,
    recDate: string,
    hasCheckIn?: boolean
  ) => {
    const isCheckIn = type === 'Check-In';
    const hasTime = Boolean(timeVal && timeVal !== '--:--' && String(timeVal).trim() !== '');
    if (!hasTime && !isCheckIn && hasCheckIn) {
      return (
        <span
          data-testid="record-checkout-time"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.82rem',
            fontWeight: 500,
            color: '#64748b'
          }}
        >
          <Clock size={14} color="#64748b" />
          <span>In Progress</span>
        </span>
      );
    }

    if (!hasTime) {
      return (
        <span
          data-testid={isCheckIn ? 'record-checkin-time' : 'record-checkout-time'}
          style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 500 }}
        >
          —
        </span>
      );
    }

    const formatted = formatAttendanceTime(timeVal!);

    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
        {photoUrl ? (
          <button
            type="button"
            data-testid={isCheckIn ? 'checkin-photo-thumb' : 'checkout-photo-thumb'}
            onClick={(e) => {
              e.stopPropagation();
              setPreviewPhoto({
                url: photoUrl,
                title: `${personName} – ${type} Photo`,
                subtitle: formatDateDDMMYYYY(recDate),
                time: formatted
              });
            }}
            title={`View ${type} Photo`}
            style={{
              cursor: 'pointer',
              width: '32px',
              height: '32px',
              padding: 0,
              borderRadius: '6px',
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              flexShrink: 0
            }}
          >
            <img src={photoUrl} alt={type} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </button>
        ) : null}
        <span
          data-testid={isCheckIn ? 'record-checkin-time' : 'record-checkout-time'}
          style={{
            fontSize: '0.82rem',
            fontWeight: 600,
            color: '#0f172a',
            whiteSpace: 'nowrap'
          }}
        >
          {formatted}
        </span>
      </div>
    );
  };

  const renderRecordsResponsiveView = (records: any[], showEmployeeCol: boolean) => {
    if (records.length === 0) {
      return (
        <div
          data-testid="attendance-log-empty"
          style={{
            padding: '44px 16px',
            textAlign: 'center',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0'
          }}
        >
          <Calendar size={26} color="#94a3b8" style={{ margin: '0 auto 8px', display: 'block' }} />
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>
            No attendance records for {formatMonthDisplay(selectedMonth)}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            {showEmployeeCol
              ? 'No employee punch records match your selected filters for this month.'
              : 'Punch in using Face Attendance to see your daily verified records and photos.'}
          </div>
        </div>
      );
    }

    const totalViewOtHours = Math.round(
      records.reduce((sum, r) => sum + getRecordDailyOt(r).otHrs, 0) * 100
    ) / 100;
    const totalViewOtAmount = Math.round(
      records.reduce((sum, r) => sum + getRecordDailyOt(r).otAmount, 0) * 100
    ) / 100;

    if (isMobileViewport) {
      return (
        <div
          data-testid="attendance-log-records-list"
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            overflow: 'hidden'
          }}
        >
          {records.map((rec, idx) => {
            const recDate = rec.date || rec.shiftDate;
            const recordKey = rec.id || `${rec.employeeId}_${recDate}`;
            const isExpanded = expandedRecordId === recordKey;
            const inPhoto = getRecordPhoto(rec, 'Check-In');
            const outPhoto = getRecordPhoto(rec, 'Check-Out');
            const effStatus = resolveEffectiveRecordStatus(rec);
            const personName = showEmployeeCol ? (rec.employeeName || 'Employee') : (currentUser.name || 'You');
            const hasIn = Boolean(rec.checkIn && rec.checkIn !== '--:--' && String(rec.checkIn).trim() !== '');
            const hasOut = Boolean(rec.checkOut && rec.checkOut !== '--:--' && String(rec.checkOut).trim() !== '');
            const checkInDisplay = hasIn ? formatAttendanceTime(rec.checkIn) : '—';
            const checkOutDisplay = hasOut ? formatAttendanceTime(rec.checkOut) : (hasIn ? 'In Progress' : '—');
            const workHrsVal = Number(rec.workingHours || 0);
            const workHrsDisplay = workHrsVal > 0 ? `${workHrsVal} hrs` : '—';
            const dailyOt = getRecordDailyOt(rec);

            return (
              <div
                key={recordKey}
                data-testid="attendance-log-record"
                onClick={() => setExpandedRecordId(prev => (prev === recordKey ? null : recordKey))}
                style={{
                  padding: '13px 14px',
                  borderBottom: idx < records.length - 1 ? '1px solid #f1f5f9' : 'none',
                  backgroundColor: '#ffffff',
                  cursor: 'pointer'
                }}
              >
                {/* Top Line: Primary Title & Expand Chevron */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ minWidth: 0 }}>
                    {showEmployeeCol ? (
                      <>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', lineHeight: 1.3 }}>
                          {rec.employeeName}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '1px' }}>
                          {rec.employeeId} · {rec.department || 'General'}
                        </div>
                      </>
                    ) : (
                      <div data-testid="record-date" style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', lineHeight: 1.3 }}>
                        {formatShortHumanDate(recDate)} ({getWeekdayShort(recDate)})
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {!showEmployeeCol && renderPlainStatus(effStatus)}
                    <ChevronRight
                      size={16}
                      color="#94a3b8"
                      style={{
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.15s ease'
                      }}
                    />
                  </div>
                </div>

                {/* Date & Status Line for All Employees Mobile View */}
                {showEmployeeCol && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '0.78rem', color: '#334155' }}>
                    <span data-testid="record-date" style={{ fontWeight: 500, color: '#475569' }}>
                      {formatShortHumanDate(recDate)}
                    </span>
                    <span style={{ color: '#cbd5e1' }}>·</span>
                    {renderPlainStatus(effStatus)}
                  </div>
                )}

                {/* Compact Times & Working Hours Summary */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '4px 12px',
                    marginTop: '8px',
                    fontSize: '0.78rem',
                    color: '#475569'
                  }}
                >
                  <div>
                    <span style={{ color: '#64748b' }}>Check-in: </span>
                    <span data-testid="record-checkin-time" style={{ fontWeight: 600, color: '#0f172a' }}>
                      {checkInDisplay}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Check-out: </span>
                    <span
                      data-testid="record-checkout-time"
                      style={{
                        fontWeight: 600,
                        color: hasOut ? '#0f172a' : '#64748b',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {!hasOut && hasIn && <Clock size={12} color="#64748b" />}
                      {checkOutDisplay}
                    </span>
                  </div>
                  <div style={{ gridColumn: '1 / -1', marginTop: '2px' }}>
                    <span style={{ color: '#64748b' }}>Working Hours: </span>
                    <span data-testid="record-working-hours" style={{ fontWeight: 600, color: '#0f172a' }}>
                      {workHrsDisplay}
                    </span>
                  </div>
                </div>

                {/* Expandable Details on Tap */}
                {isExpanded && (
                  <div
                    data-testid="attendance-log-expanded-details"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      marginTop: '10px',
                      paddingTop: '10px',
                      borderTop: '1px solid #f1f5f9',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}
                  >
                    {/* Photos Row */}
                    {(inPhoto || outPhoto) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {inPhoto && (
                          <button
                            type="button"
                            data-testid="checkin-photo-thumb"
                            onClick={() =>
                              setPreviewPhoto({
                                url: inPhoto,
                                title: `${personName} – Check-In Photo`,
                                subtitle: formatDateDDMMYYYY(recDate),
                                time: hasIn ? formatAttendanceTime(rec.checkIn) : undefined
                              })
                            }
                            style={{
                              minHeight: '44px',
                              padding: '5px 10px 5px 6px',
                              borderRadius: '8px',
                              border: '1px solid #e2e8f0',
                              backgroundColor: '#f8fafc',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '8px',
                              cursor: 'pointer'
                            }}
                          >
                            <img
                              src={inPhoto}
                              alt="Check-In"
                              style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'cover' }}
                            />
                            <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#0f172a' }}>
                              Check-In Photo
                            </span>
                          </button>
                        )}
                        {outPhoto && (
                          <button
                            type="button"
                            data-testid="checkout-photo-thumb"
                            onClick={() =>
                              setPreviewPhoto({
                                url: outPhoto,
                                title: `${personName} – Check-Out Photo`,
                                subtitle: formatDateDDMMYYYY(recDate),
                                time: hasOut ? formatAttendanceTime(rec.checkOut) : undefined
                              })
                            }
                            style={{
                              minHeight: '44px',
                              padding: '5px 10px 5px 6px',
                              borderRadius: '8px',
                              border: '1px solid #e2e8f0',
                              backgroundColor: '#f8fafc',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '8px',
                              cursor: 'pointer'
                            }}
                          >
                            <img
                              src={outPhoto}
                              alt="Check-Out"
                              style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'cover' }}
                            />
                            <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#0f172a' }}>
                              Check-Out Photo
                            </span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Expanded Metrics Grid */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '6px 12px',
                        fontSize: '0.76rem',
                        color: '#475569'
                      }}
                    >
                      <div>
                        <span style={{ color: '#64748b' }}>Working Hours: </span>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>{workHrsDisplay}</span>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>OT Hours: </span>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>{dailyOt.otHrs} hrs</span>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>OT Amount: </span>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>{formatCurrency(dailyOt.otAmount)}</span>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Verification: </span>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>{rec.method || 'Face Verified'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    // Desktop / Laptop Clean Apple-Style Table View
    return (
      <div
        data-testid="attendance-log-records-list"
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          overflow: 'hidden',
          backgroundColor: '#ffffff'
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: '#64748b', fontSize: '0.76rem' }}>Date</th>
                {showEmployeeCol && (
                  <>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: '#64748b', fontSize: '0.76rem' }}>Employee</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: '#64748b', fontSize: '0.76rem' }}>Department</th>
                  </>
                )}
                <th style={{ padding: '12px 16px', fontWeight: 600, color: '#64748b', fontSize: '0.76rem' }}>Check-In</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: '#64748b', fontSize: '0.76rem' }}>Check-Out</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: '#64748b', fontSize: '0.76rem' }}>Working Hrs</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: '#64748b', fontSize: '0.76rem' }}>OT Hrs</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: '#64748b', fontSize: '0.76rem' }}>OT Amount</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: '#64748b', fontSize: '0.76rem', textAlign: 'left' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map(rec => {
                const recDate = rec.date || rec.shiftDate;
                const inPhoto = getRecordPhoto(rec, 'Check-In');
                const outPhoto = getRecordPhoto(rec, 'Check-Out');
                const effStatus = resolveEffectiveRecordStatus(rec);
                const personName = showEmployeeCol ? (rec.employeeName || 'Employee') : (currentUser.name || 'You');
                const hasIn = Boolean(rec.checkIn && rec.checkIn !== '--:--' && String(rec.checkIn).trim() !== '');
                const dailyOt = getRecordDailyOt(rec);

                return (
                  <tr
                    key={rec.id || `${rec.employeeId}_${recDate}`}
                    data-testid="attendance-log-record"
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      backgroundColor: '#ffffff'
                    }}
                  >
                    {/* Date */}
                    <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                      <div data-testid="record-date" style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.84rem' }}>
                        {formatDateDDMMYYYY(recDate)}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '1px' }}>
                        {getWeekdayShort(recDate)}
                      </div>
                    </td>

                    {/* Employee & Department */}
                    {showEmployeeCol && (
                      <>
                        <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                backgroundColor: '#f1f5f9',
                                border: '1px solid #e2e8f0',
                                color: '#334155',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 600,
                                fontSize: '0.72rem',
                                flexShrink: 0
                              }}
                            >
                              {(rec.employeeName || 'EM').substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.84rem' }}>
                                {rec.employeeName}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '1px' }}>
                                {rec.employeeId}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '11px 16px', whiteSpace: 'nowrap', color: '#334155', fontSize: '0.8rem', fontWeight: 500 }}>
                          {rec.department || 'General'}
                        </td>
                      </>
                    )}

                    {/* Check-In */}
                    <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                      {renderDesktopPunchInline('Check-In', rec.checkIn, inPhoto, personName, recDate, hasIn)}
                    </td>

                    {/* Check-Out */}
                    <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                      {renderDesktopPunchInline('Check-Out', rec.checkOut, outPhoto, personName, recDate, hasIn)}
                    </td>

                    {/* Working Hours */}
                    <td data-testid="record-working-hours" style={{ padding: '11px 16px', whiteSpace: 'nowrap', color: '#334155', fontWeight: 500 }}>
                      {rec.workingHours ?? 0} hrs
                    </td>

                    {/* Daily OT Hours */}
                    <td style={{ padding: '11px 16px', whiteSpace: 'nowrap', fontWeight: 500, color: '#334155' }}>
                      {dailyOt.otHrs > 0 ? `${dailyOt.otHrs} hrs` : '0 hrs'}
                    </td>

                    {/* Daily OT Amount */}
                    <td style={{ padding: '11px 16px', whiteSpace: 'nowrap', fontWeight: 500, color: '#334155' }}>
                      {formatCurrency(dailyOt.otAmount)}
                    </td>

                    {/* Status (Plain text + tiny indicator dot) */}
                    <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                      {renderPlainStatus(effStatus)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                <td colSpan={showEmployeeCol ? 6 : 4} style={{ padding: '10px 16px', fontWeight: 600, color: '#334155', fontSize: '0.78rem' }}>
                  Total OT Hours: {totalViewOtHours} hrs
                </td>
                <td colSpan={3} style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: '#0f172a', fontSize: '0.8rem' }}>
                  Total OT Amount: {formatCurrency(totalViewOtAmount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  const renderMonthlyActivityCard = (isDedicatedLogPage: boolean) => (
    <div
      data-testid={isDedicatedLogPage ? 'attendance-log-card' : 'monthly-activity-card'}
      className={isDedicatedLogPage ? 'attendance-log-card' : 'face-attendance-activity-card'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: isMobileViewport ? '12px' : '16px'
      }}
    >
      {/* Top Bar: Month Picker + Employee Scope Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
              minWidth: isMobileViewport ? '44px' : '36px',
              minHeight: isMobileViewport ? '44px' : '36px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              backgroundColor: '#ffffff',
              color: '#334155',
              cursor: 'pointer'
            }}
          >
            <ChevronLeft size={16} />
          </button>

          <div
            data-testid="month-display"
            style={{
              minHeight: isMobileViewport ? '44px' : '36px',
              padding: '0 14px',
              borderRadius: '8px',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              color: '#0f172a',
              fontSize: '0.84rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '7px'
            }}
          >
            <Calendar size={14} color="#64748b" />
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
              minWidth: isMobileViewport ? '44px' : '36px',
              minHeight: isMobileViewport ? '44px' : '36px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              backgroundColor: '#ffffff',
              color: '#334155',
              cursor: 'pointer'
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {(isHrOrAdmin || isCEO) ? (
          isCEO ? (
            <div
              style={{
                minHeight: isMobileViewport ? '44px' : '36px',
                padding: '0 14px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                color: '#0f172a',
                fontSize: '0.8rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Users size={14} color="#64748b" />
              <span>All Employees ({totalScopeEmployees})</span>
            </div>
          ) : (
            <div
              style={{
                display: 'inline-flex',
                backgroundColor: '#f1f5f9',
                padding: '3px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0'
              }}
            >
              <button
                type="button"
                onClick={() => setActivityViewTab('all')}
                style={{
                  minHeight: isMobileViewport ? '38px' : '30px',
                  padding: '0 12px',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  backgroundColor: activityViewTab === 'all' ? '#ffffff' : 'transparent',
                  color: activityViewTab === 'all' ? '#0f172a' : '#64748b',
                  boxShadow: activityViewTab === 'all' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                }}
              >
                <Users size={13} />
                <span>All Employees ({totalScopeEmployees})</span>
              </button>
              <button
                type="button"
                onClick={() => setActivityViewTab('my')}
                style={{
                  minHeight: isMobileViewport ? '38px' : '30px',
                  padding: '0 12px',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  backgroundColor: activityViewTab === 'my' ? '#ffffff' : 'transparent',
                  color: activityViewTab === 'my' ? '#0f172a' : '#64748b',
                  boxShadow: activityViewTab === 'my' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                }}
              >
                <User size={13} />
                <span>My Attendance ({myMonthlyRecords.length})</span>
              </button>
            </div>
          )
        ) : (
          <span
            data-testid="attendance-log-count-badge"
            style={{
              backgroundColor: '#ffffff',
              color: '#334155',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.78rem',
              fontWeight: 600,
              border: '1px solid #e2e8f0'
            }}
          >
            {myMonthlyRecords.length} {myMonthlyRecords.length === 1 ? 'Record' : 'Records'}
          </span>
        )}
      </div>

      {/* Unified Summary Section (1 Horizontal Row on Desktop, 2x2 Grid on Mobile) */}
      <div
        data-testid="attendance-log-summary"
        style={{
          display: 'grid',
          gridTemplateColumns: isMobileViewport ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            padding: isMobileViewport ? '12px 14px' : '14px 20px',
            borderRight: '1px solid #f1f5f9',
            borderBottom: isMobileViewport ? '1px solid #f1f5f9' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          {!isMobileViewport && <Users size={18} color="#64748b" />}
          <div>
            <div style={{ fontSize: '0.74rem', fontWeight: 500, color: '#64748b' }}>Total Records</div>
            <div data-testid="summary-total-records" style={{ fontSize: isMobileViewport ? '1.15rem' : '1.35rem', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
              {activeSummaryStats.totalRecords}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: isMobileViewport ? '12px 14px' : '14px 20px',
            borderRight: isMobileViewport ? 'none' : '1px solid #f1f5f9',
            borderBottom: isMobileViewport ? '1px solid #f1f5f9' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          {!isMobileViewport && <CheckCircle2 size={18} color="#64748b" />}
          <div>
            <div style={{ fontSize: '0.74rem', fontWeight: 500, color: '#64748b' }}>Present</div>
            <div data-testid="summary-present" style={{ fontSize: isMobileViewport ? '1.15rem' : '1.35rem', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
              {activeSummaryStats.presentCount}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: isMobileViewport ? '12px 14px' : '14px 20px',
            borderRight: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          {!isMobileViewport && <Clock size={18} color="#64748b" />}
          <div>
            <div style={{ fontSize: '0.74rem', fontWeight: 500, color: '#64748b' }}>Late</div>
            <div data-testid="summary-late" style={{ fontSize: isMobileViewport ? '1.15rem' : '1.35rem', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
              {activeSummaryStats.lateCount}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: isMobileViewport ? '12px 14px' : '14px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          {!isMobileViewport && <Calendar size={18} color="#64748b" />}
          <div>
            <div style={{ fontSize: '0.74rem', fontWeight: 500, color: '#64748b' }}>Half Day</div>
            <div data-testid="summary-halfday" style={{ fontSize: isMobileViewport ? '1.15rem' : '1.35rem', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
              {activeSummaryStats.halfDayCount}
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filters Section */}
      {showAllEmployeesView && (
        isMobileViewport ? (
          /* Mobile: Full-width search + Compact Filters button opening bottom sheet */
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search employee, ID, or dept..."
                value={staffSearchQuery}
                onChange={(e) => setStaffSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '0 12px 0 36px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#ffffff',
                  fontSize: '0.84rem',
                  color: '#0f172a',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              type="button"
              data-testid="mobile-filters-btn"
              onClick={() => {
                setDraftDeptFilter(selectedDeptFilter);
                setDraftEmpFilter(selectedEmpFilter);
                setDraftStatusFilter(selectedStatusFilter);
                setIsMobileFilterSheetOpen(true);
              }}
              style={{
                minHeight: '44px',
                padding: '0 14px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                color: '#0f172a',
                fontSize: '0.82rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <SlidersHorizontal size={15} color="#475569" />
              <span>Filters</span>
              {activeMobileFilterCount > 0 && (
                <span
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    backgroundColor: '#0e7490',
                    color: '#ffffff',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {activeMobileFilterCount}
                </span>
              )}
            </button>
          </div>
        ) : (
          /* Desktop: Clean 4-column inline filter row */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.5fr 1fr 1fr 0.8fr',
              gap: '10px'
            }}
          >
            <div style={{ position: 'relative' }}>
              <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search employee name, ID, or department..."
                value={staffSearchQuery}
                onChange={(e) => setStaffSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  height: '38px',
                  padding: '0 12px 0 36px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#ffffff',
                  fontSize: '0.8rem',
                  color: '#0f172a',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <select
              value={selectedDeptFilter}
              onChange={(e) => {
                setSelectedDeptFilter(e.target.value);
                setSelectedEmpFilter('all');
              }}
              style={{
                width: '100%',
                height: '38px',
                padding: '0 10px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                fontSize: '0.8rem',
                fontWeight: 500,
                color: '#0f172a',
                outline: 'none'
              }}
            >
              <option value="all">All Departments</option>
              {availableDepartments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>

            <select
              value={selectedEmpFilter}
              onChange={(e) => setSelectedEmpFilter(e.target.value)}
              style={{
                width: '100%',
                height: '38px',
                padding: '0 10px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                fontSize: '0.8rem',
                fontWeight: 500,
                color: '#0f172a',
                outline: 'none'
              }}
            >
              <option value="all">All Employees ({totalScopeEmployees})</option>
              {availableFilterEmployees.map(emp => (
                <option key={emp.employeeId} value={emp.employeeId}>
                  {emp.firstName} {emp.lastName} ({emp.employeeId})
                </option>
              ))}
            </select>

            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              style={{
                width: '100%',
                height: '38px',
                padding: '0 10px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                fontSize: '0.8rem',
                fontWeight: 500,
                color: '#0f172a',
                outline: 'none'
              }}
            >
              <option value="all">All Status</option>
              <option value="Present">Present</option>
              <option value="Half Day">Half Day</option>
              <option value="Late">Late</option>
              <option value="Holiday">Holiday</option>
            </select>
          </div>
        )
      )}

      {/* Attendance Log Records (Table on Desktop/Laptop, Compact Expandable Rows on Mobile) */}
      {showAllEmployeesView
        ? renderRecordsResponsiveView(filteredAllStaffMonthlyRecords, true)
        : renderRecordsResponsiveView(myMonthlyRecords, false)}

      {/* Mobile Filter Bottom Sheet */}
      {isMobileFilterSheetOpen && (
        <div
          data-testid="mobile-filter-sheet-overlay"
          onClick={() => setIsMobileFilterSheetOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99998,
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center'
          }}
        >
          <div
            data-testid="mobile-filter-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '500px',
              backgroundColor: '#ffffff',
              borderTopLeftRadius: '18px',
              borderTopRightRadius: '18px',
              padding: '16px 16px calc(18px + env(safe-area-inset-bottom, 0px))',
              boxShadow: '0 -10px 25px rgba(15, 23, 42, 0.12)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>Filter Attendance</span>
              <button
                type="button"
                onClick={() => setIsMobileFilterSheetOpen(false)}
                aria-label="Close filters"
                style={{
                  width: '44px',
                  height: '44px',
                  marginRight: '-8px',
                  border: 'none',
                  background: 'transparent',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.76rem', fontWeight: 600, color: '#475569' }}>Department</label>
              <select
                value={draftDeptFilter}
                onChange={(e) => {
                  setDraftDeptFilter(e.target.value);
                  setDraftEmpFilter('all');
                }}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '0 12px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#ffffff',
                  fontSize: '0.84rem',
                  color: '#0f172a',
                  outline: 'none'
                }}
              >
                <option value="all">All Departments</option>
                {availableDepartments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.76rem', fontWeight: 600, color: '#475569' }}>Employee</label>
              <select
                value={draftEmpFilter}
                onChange={(e) => setDraftEmpFilter(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '0 12px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#ffffff',
                  fontSize: '0.84rem',
                  color: '#0f172a',
                  outline: 'none'
                }}
              >
                <option value="all">All Employees ({draftFilterEmployees.length})</option>
                {draftFilterEmployees.map(emp => (
                  <option key={emp.employeeId} value={emp.employeeId}>
                    {emp.firstName} {emp.lastName} ({emp.employeeId})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.76rem', fontWeight: 600, color: '#475569' }}>Status</label>
              <select
                value={draftStatusFilter}
                onChange={(e) => setDraftStatusFilter(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '0 12px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#ffffff',
                  fontSize: '0.84rem',
                  color: '#0f172a',
                  outline: 'none'
                }}
              >
                <option value="all">All Status</option>
                <option value="Present">Present</option>
                <option value="Half Day">Half Day</option>
                <option value="Late">Late</option>
                <option value="Holiday">Holiday</option>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px' }}>
              <button
                type="button"
                data-testid="mobile-filter-clear-btn"
                onClick={() => {
                  setSelectedDeptFilter('all');
                  setSelectedEmpFilter('all');
                  setSelectedStatusFilter('all');
                  setDraftDeptFilter('all');
                  setDraftEmpFilter('all');
                  setDraftStatusFilter('all');
                  setIsMobileFilterSheetOpen(false);
                }}
                style={{
                  minHeight: '44px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#ffffff',
                  color: '#334155',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Clear
              </button>
              <button
                type="button"
                data-testid="mobile-filter-apply-btn"
                onClick={() => {
                  setSelectedDeptFilter(draftDeptFilter);
                  setSelectedEmpFilter(draftEmpFilter);
                  setSelectedStatusFilter(draftStatusFilter);
                  setIsMobileFilterSheetOpen(false);
                }}
                style={{
                  minHeight: '44px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: '#0e7490',
                  color: '#ffffff',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div data-testid={mode === 'log' ? 'attendance-log-page' : 'daily-attendance-page'}>
      {/* Minimal Header */}
      <div className="page-header face-attendance-minimal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobileViewport ? '10px' : '14px' }}>
        <div className="page-title-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {mode === 'log' && !isMobileViewport && (
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0e7490',
                flexShrink: 0
              }}
            >
              <Calendar size={18} />
            </div>
          )}
          <div>
            <h1 style={{ fontSize: isMobileViewport ? '1.1rem' : '1.25rem', fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
              {mode === 'log' ? 'Attendance Log' : 'Face Attendance'}
            </h1>
            {mode === 'log' && (
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                Employee check-in and check-out records
              </div>
            )}
          </div>
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

              {/* ScanFace live camera placeholder removed */}

              {/* Attendance Home Banner (Camera is NOT permanently active on the home screen; opens in Full-Screen when Punch In / Out is tapped) */}
              <div
                data-testid="face-guidance-frame"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '12px',
                  textAlign: 'center',
                  zIndex: 10
                }}
              >
                <div
                  style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '50%',
                    backgroundColor: '#ecfeff',
                    border: '2px dashed #0e7490',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#0e7490'
                  }}
                >
                  <Camera size={24} />
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a' }}>
                  {isCompletedToday
                    ? "Today's Shift Attendance Completed"
                    : isCheckedIn
                      ? 'Tap Punch Out to Open Full-Screen Camera'
                      : 'Tap Punch In to Open Full-Screen Camera'}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#475569', lineHeight: 1.35, maxWidth: '240px' }}>
                  Front camera &amp; GPS start together when you tap <strong>{isCheckedIn && !isCheckedOut ? 'Punch Out' : 'Punch In'}</strong>.
                </div>
              </div>
            </div>

            {/* FULL-SCREEN FRONT CAMERA MODAL & COMMITTED PUNCH SUMMARY (Shift/GPS info panel hidden on frontend home screen per user request) */}
            <div>
              {isFullScreenCameraOpen && (
                <div
                  data-testid="fullscreen-face-camera-modal"
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 99990,
                    backgroundColor: '#f8fafc',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    overflow: 'hidden'
                  }}
                >
                  {/* Top Bar: Action Title, Shift Status, Compact GPS Pill & Close Button */}
                  <div
                    style={{
                      padding: '14px 18px',
                      backgroundColor: '#ffffff',
                      borderBottom: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '10px',
                          backgroundColor: '#ecfeff',
                          color: '#0e7490',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        <ScanFace size={20} />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                          {punchType === 'Check-In' ? 'Punch In Verification' : 'Punch Out Verification'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                          {shiftEval.assignedShift?.shiftName?.replace(/\s*\([^)]*\)\s*$/, '') || 'Assigned Shift'} • {shiftEval.shiftStartDisplay} – {shiftEval.shiftEndDisplay}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        data-testid="fullscreen-gps-status-pill"
                        style={{
                          padding: '4px 10px',
                          borderRadius: '9999px',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          backgroundColor: gpsStatusDetails.verified
                            ? '#dcfce7'
                            : lastGpsErrorCode && lastGpsErrorCode !== 'NONE'
                              ? '#fee2e2'
                              : '#ecfeff',
                          color: gpsStatusDetails.verified
                            ? '#15803d'
                            : lastGpsErrorCode && lastGpsErrorCode !== 'NONE'
                              ? '#dc2626'
                              : '#0e7490'
                        }}
                      >
                        <MapPin size={12} />
                        <span>
                          {gpsStatusDetails.verified
                            ? `GPS Ready (${Math.round(gpsStatusDetails.distance ?? 0)}m)`
                            : gpsProgressMsg
                              ? gpsProgressMsg
                              : lastGpsErrorCode && lastGpsErrorCode !== 'NONE'
                                ? 'GPS Retry Needed'
                                : 'Acquiring GPS...'}
                        </span>
                      </span>

                      <button
                        type="button"
                        data-testid="fullscreen-close-btn"
                        disabled={isScanning}
                        onClick={handleCloseFullScreenCamera}
                        aria-label="Close full-screen camera"
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '10px',
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#ffffff',
                          color: '#475569',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: isScanning ? 'not-allowed' : 'pointer'
                        }}
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Center Viewport: Live Full-Screen Front Camera OR Captured Photo Preview */}
                  <div
                    style={{
                      flex: 1,
                      position: 'relative',
                      backgroundColor: '#0f172a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden'
                    }}
                  >
                    {fullScreenStep === 'CAMERA' ? (
                      <>
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            transform: isMirrored ? 'scaleX(-1)' : 'scaleX(1)'
                          }}
                        />

                        {/* Clean Face Alignment Guide */}
                        <div
                          data-testid="fullscreen-face-guide"
                          style={{
                            position: 'absolute',
                            width: isMobileViewport ? '240px' : '290px',
                            height: isMobileViewport ? '300px' : '360px',
                            borderRadius: '9999px',
                            border: '3px dashed rgba(255, 255, 255, 0.88)',
                            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.28)',
                            pointerEvents: 'none',
                            zIndex: 10
                          }}
                        />

                        <div
                          style={{
                            position: 'absolute',
                            top: '16px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            zIndex: 20,
                            padding: '6px 14px',
                            borderRadius: '9999px',
                            backgroundColor: 'rgba(15, 23, 42, 0.72)',
                            color: '#ffffff',
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          Align your face inside the oval &amp; tap Capture Photo
                        </div>

                        {isCameraActive && isLowLightCamera && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '16px',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              zIndex: 20,
                              padding: '5px 12px',
                              borderRadius: '9999px',
                              backgroundColor: 'rgba(15, 23, 42, 0.82)',
                              color: '#fef3c7',
                              fontSize: '0.72rem',
                              fontWeight: 700
                            }}
                          >
                            Low light — move to a brighter area
                          </div>
                        )}

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
                              top: '16px',
                              right: '16px',
                              zIndex: 20,
                              width: '38px',
                              height: '38px',
                              borderRadius: '50%',
                              backgroundColor: 'rgba(255, 255, 255, 0.9)',
                              border: '1px solid #cbd5e1',
                              color: '#0e7490',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer'
                            }}
                          >
                            <FlipHorizontal size={17} />
                          </button>
                        )}
                      </>
                    ) : (
                      <div
                        data-testid="fullscreen-captured-photo-preview"
                        style={{
                          width: '100%',
                          height: '100%',
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: '#0f172a'
                        }}
                      >
                        {capturedFullScreenPhoto && (
                          <img
                            src={capturedFullScreenPhoto}
                            alt="Captured Attendance Selfie"
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover'
                            }}
                          />
                        )}
                        <div
                          style={{
                            position: 'absolute',
                            top: '16px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            zIndex: 20,
                            padding: '6px 14px',
                            borderRadius: '9999px',
                            backgroundColor: 'rgba(21, 128, 61, 0.92)',
                            color: '#ffffff',
                            fontSize: '0.76rem',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)'
                          }}
                        >
                          <CheckCircle2 size={15} />
                          <span>Photo Captured • Ready to Confirm</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Bottom Action Sheet: Capture Photo (Step 1) OR Confirm Punch In / Confirm Punch Out ONLY (Step 2 — NO Retake Button) */}
                  <div
                    style={{
                      padding: '16px 20px 24px',
                      backgroundColor: '#ffffff',
                      borderTop: '1px solid #e2e8f0',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '10px',
                      boxShadow: '0 -4px 16px rgba(15, 23, 42, 0.05)'
                    }}
                  >
                    {fullScreenError && (
                      <div
                        data-testid="fullscreen-error-banner"
                        style={{
                          width: '100%',
                          maxWidth: '420px',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          backgroundColor: '#fef2f2',
                          border: '1px solid #fecaca',
                          color: '#b91c1c',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          flexWrap: 'wrap'
                        }}
                      >
                        <span style={{ flex: 1 }}>{fullScreenError}</span>
                        {fullScreenStep === 'CONFIRM' && (
                          <button
                            type="button"
                            data-testid="fullscreen-retry-location-btn"
                            disabled={isRetryingLocation || isScanning}
                            onClick={() => {
                              setFullScreenError(null);
                              void handleRetryLocation({ silentOnStart: true });
                            }}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '8px',
                              border: '1px solid #0e7490',
                              backgroundColor: '#ecfeff',
                              color: '#0e7490',
                              fontSize: '0.74rem',
                              fontWeight: 800,
                              cursor: isRetryingLocation || isScanning ? 'not-allowed' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              flexShrink: 0
                            }}
                          >
                            <RefreshCw size={13} />
                            <span>{isRetryingLocation ? 'Checking GPS...' : 'Retry Location'}</span>
                          </button>
                        )}
                      </div>
                    )}

                    {fullScreenStep === 'CAMERA' ? (
                      <button
                        type="button"
                        data-testid="fullscreen-capture-photo-btn"
                        disabled={!isCameraActive || cameraAccessDenied}
                        onClick={handleCaptureFullScreenPhoto}
                        style={{
                          width: '100%',
                          maxWidth: '420px',
                          minHeight: '54px',
                          padding: '14px 20px',
                          borderRadius: '14px',
                          backgroundColor: isCameraActive && !cameraAccessDenied ? '#0e7490' : '#cbd5e1',
                          color: '#ffffff',
                          fontSize: '1rem',
                          fontWeight: 800,
                          border: 'none',
                          cursor: isCameraActive && !cameraAccessDenied ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          boxShadow: isCameraActive && !cameraAccessDenied ? '0 6px 16px rgba(14, 116, 144, 0.28)' : 'none'
                        }}
                      >
                        <Camera size={20} />
                        <span>Capture Photo</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        data-testid="fullscreen-confirm-punch-btn"
                        disabled={isScanning || isRetryingLocation}
                        onClick={() => void handleConfirmFullScreenPunch()}
                        style={{
                          width: '100%',
                          maxWidth: '420px',
                          minHeight: '54px',
                          padding: '14px 20px',
                          borderRadius: '14px',
                          backgroundColor: isScanning || isRetryingLocation ? '#0891b2' : '#0e7490',
                          color: '#ffffff',
                          fontSize: '1rem',
                          fontWeight: 800,
                          border: 'none',
                          cursor: isScanning || isRetryingLocation ? 'wait' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          boxShadow: '0 6px 16px rgba(14, 116, 144, 0.3)'
                        }}
                      >
                        <CheckCircle2 size={20} />
                        <span>
                          {isScanning
                            ? (gpsProgressMsg || 'Verifying & Saving Attendance...')
                            : punchType === 'Check-In'
                              ? 'Confirm Punch In'
                              : 'Confirm Punch Out'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              )}
              {committedPunchSummary && (
                <div
                  data-testid="one-click-punch-success-card"
                  style={{
                    maxWidth: isMobileViewport ? '280px' : '360px',
                    margin: '10px auto 0',
                    padding: '8px 10px',
                    borderRadius: '10px',
                    backgroundColor: '#f0fdf4',
                    border: '1px solid #86efac',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px',
                    fontSize: '0.73rem',
                    color: '#0f172a',
                    textAlign: 'left'
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
                        ? 'Punch Out Successful'
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
                const isEmpCeo = isOwnerOrCEO(activeEmpModal) || isOwnerOrCEO(currentUser);
                const isAllowedByGeofence = Boolean(gpsData && gpsData.canPunch && !isEmpCeo);

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

      {/* PHOTO PREVIEW LIGHTBOX MODAL (CLEAN APPLE-STYLE WHITE MODAL) */}
      {previewPhoto && (
        <div 
          className="modal-overlay" 
          data-testid="photo-preview-modal"
          onClick={() => setPreviewPhoto(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            overflowY: 'auto'
          }}
        >
          <div 
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '400px',
              width: '100%',
              backgroundColor: '#ffffff',
              borderRadius: '18px',
              overflow: 'hidden',
              boxShadow: '0 20px 25px -5px rgba(15, 23, 42, 0.14)',
              border: '1px solid #e2e8f0'
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px 12px',
              backgroundColor: '#ffffff'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <Camera size={18} color="#334155" style={{ flexShrink: 0 }} />
                <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {previewPhoto.title}
                </span>
              </div>
              <button
                type="button"
                aria-label="Close photo preview"
                onClick={() => setPreviewPhoto(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748b',
                  width: '44px',
                  height: '44px',
                  margin: '-10px -10px -10px 0',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Clean Photo Preview Container (No dark box) */}
            <div style={{
              padding: '0 16px',
              backgroundColor: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <img
                src={previewPhoto.url}
                alt={previewPhoto.title}
                style={{
                  width: '100%',
                  maxHeight: '58vh',
                  borderRadius: '12px',
                  objectFit: 'cover',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #f1f5f9',
                  display: 'block'
                }}
              />
            </div>

            {/* Footer with verification metadata */}
            <div style={{
              padding: '14px 16px 16px',
              backgroundColor: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px'
            }}>
              <div>
                <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a' }}>
                  {previewPhoto.subtitle}
                </div>
                {previewPhoto.time && (
                  <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px' }}>
                    Punch Time: {previewPhoto.time}
                  </div>
                )}
              </div>
              <span style={{
                padding: '5px 10px',
                borderRadius: '9999px',
                fontSize: '0.74rem',
                fontWeight: 600,
                backgroundColor: '#f0f9ff',
                color: '#0284c7',
                border: '1px solid #bae6fd',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                flexShrink: 0
              }}>
                <CheckCircle2 size={13} />
                <span>Face Verified</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
