import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useHRMS, calculateDistanceMeters } from '../../context/HRMSContext';
import {
  acquireHighAccuracyGps,
  evaluateGeofenceBoundary,
  calculateHaversineMeters as calculateAccurateHaversine,
  prewarmGps
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
import { submitVerifiedFacePunch } from '../../services/attendanceApi';

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

export const FaceAttendance: React.FC = () => {
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

  const todayAttendance = attendanceRecords.find(
    a => (a.employeeId === selectedEmpId || a.employeeId === selectedEmp?.employeeId || a.employeeId === selectedEmp?.id) && 
         (normalizeToYYYYMMDD(a.shiftDate) === todayStr || normalizeToYYYYMMDD(a.date) === todayStr)
  );

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
  } | null>(null);

  // Enforce 1-Hour (60-Minute) Minimum Delay Between Punch In and Punch Out
  const oneHourCooldown = useMemo(() => {
    if (!isCheckedIn || isCheckedOut) {
      return { isCooldownActive: false, remainingMinutes: 0, unlockTimeDisplay: '' };
    }

    let punchInEpochMs: number | null = null;
    try {
      const saved =
        localStorage.getItem(`vrm_punch_in_epoch_${selectedEmpId}_${todayStr}`) ||
        (currentUser.employeeId ? localStorage.getItem(`vrm_punch_in_epoch_${currentUser.employeeId}_${todayStr}`) : null);
      if (saved && !isNaN(Number(saved))) {
        punchInEpochMs = Number(saved);
      }
    } catch {}

    if (!punchInEpochMs && todayAttendance?.checkIn) {
      const fullTs = normalizeToFullTimestamp(todayAttendance.checkIn, todayStr);
      const parsed = Date.parse(fullTs.replace(' ', 'T'));
      if (!isNaN(parsed)) {
        punchInEpochMs = parsed;
      }
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

  // Prewarm GPS on mount for lightning-fast acquisition
  useEffect(() => {
    prewarmGps();
  }, []);

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

  // Start real browser camera and return active stream once playing
  const startCameraStream = async (): Promise<MediaStream> => {
    stopCamera();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera access is not supported by your browser or device.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        width: { ideal: 640 }, 
        height: { ideal: 480 }, 
        facingMode: 'user' 
      },
      audio: false
    });
    mediaStreamRef.current = stream;
    setIsCameraActive(true);

    // Wait for <video> element to mount and attach stream
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
      await new Promise(r => setTimeout(r, 80));
    }

    if (!videoRef.current || videoRef.current.videoWidth <= 0 || videoRef.current.videoHeight <= 0) {
      stream.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
      setIsCameraActive(false);
      throw new Error('Camera opened but the live preview was not ready. Please retry and keep this screen visible.');
    }

    return stream;
  };

  // Legacy manual camera starter
  const startCamera = async () => {
    setScanResult({ status: null, message: '' });
    try {
      await startCameraStream();
    } catch (err: any) {
      console.log('WebCam access error:', err);
      setScanResult({
        status: 'error',
        message: err.message || 'Could not access camera. Hardware may be in use by another app or permissions denied.'
      });
      stopCamera();
    }
  };

  // ALWAYS stop camera hardware on component unmount (when leaving Face Attendance tab)
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Helper to capture a FRESH live frame snapshot from video element
  const captureVideoFrame = (): string => {
    if (!videoRef.current || !mediaStreamRef.current || videoRef.current.videoWidth <= 0 || videoRef.current.videoHeight <= 0) {
      throw new Error('Live camera frame is not ready. Please look directly into the camera and retry.');
    }

    const width = videoRef.current.videoWidth;
    const height = videoRef.current.videoHeight;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize image processing canvas.');
    }

    if (isMirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/jpeg', 0.85);
  };

  // STEP 1 (PagarBook Style): When user clicks Punch In / Punch Out -> Request Camera & GPS Permission and open live camera
  const handleRequestCameraAndGps = async (type: 'Check-In' | 'Check-Out') => {
    if (isScanning || isRequestingPermissions || punchInProgressRef.current) {
      return;
    }

    // 1. Prevent duplicate punch in current session
    if (type === 'Check-In' && isCheckedIn) {
      setScanResult({
        status: 'error',
        message: 'Already punched in for today. Duplicate Punch In is not allowed.'
      });
      return;
    }
    if (type === 'Check-Out' && isCheckedOut) {
      setScanResult({
        status: 'error',
        message: 'Already punched out for today. Shift is completed.'
      });
      return;
    }

    // 2. Enforce 1-Hour (60-Minute) Minimum Delay between Punch In and Punch Out
    if (type === 'Check-Out' && oneHourCooldown.isCooldownActive) {
      setScanResult({
        status: 'error',
        message: `Punch In and Punch Out cannot be done at the same time. Please wait ${oneHourCooldown.remainingMinutes} more minute(s) (1-hour delay required).`
      });
      return;
    }

    // 3. Enforce shift rules
    const currentShiftState = getEmployeeShiftAttendanceState(selectedEmpId);
    if (type === 'Check-In' && !currentShiftState.canCheckIn) {
      setScanResult({
        status: 'error',
        message: `Punch In Not Allowed: ${currentShiftState.message}`
      });
      return;
    }
    if (type === 'Check-Out' && !currentShiftState.canCheckOut) {
      setScanResult({
        status: 'error',
        message: `Punch Out Not Allowed: ${currentShiftState.message}`
      });
      return;
    }

    setPunchType(type);
    setIsRequestingPermissions(true);
    setScanResult({
      status: null,
      message: 'Requesting Camera & GPS permission... Please tap Allow if prompted.'
    });

    try {
      // Request Camera and GPS permissions concurrently
      const [, reading] = await Promise.all([
        startCameraStream(),
        locationMode === 'real'
          ? acquireHighAccuracyGps({ timeoutMs: 6000, desiredAccuracyMeters: 35 })
          : Promise.resolve({
              latitude: geofenceConfig.centerLat + (locationMode === 'outside' ? 0.006 : 0.00018),
              longitude: geofenceConfig.centerLng + (locationMode === 'outside' ? 0.006 : 0.00015),
              accuracy: 10,
              timestamp: Date.now(),
              sampleCount: 1
            })
      ]);

      const centerLat = Number(geofenceConfig.centerLat) || 13.151968;
      const centerLng = Number(geofenceConfig.centerLng) || 80.2086053;
      const distance = calculateAccurateHaversine(reading.latitude, reading.longitude, centerLat, centerLng);
      const address = locationMode === 'real'
        ? `Live GPS (${reading.latitude.toFixed(4)}, ${reading.longitude.toFixed(4)}) • ±${reading.accuracy}m`
        : `${geofenceConfig.officeName || 'Office'} (${distance}m)`;

      setActivePunchGps({
        latitude: reading.latitude,
        longitude: reading.longitude,
        accuracy: reading.accuracy,
        address,
        distance
      });
      setIsRequestingPermissions(false);
      setScanResult({
        status: 'success',
        message: `Camera & GPS Active! Tap "Take Picture & ${type === 'Check-In' ? 'Punch In' : 'Punch Out'}" below.`
      });
    } catch (err: any) {
      stopCamera();
      setIsRequestingPermissions(false);
      setActivePunchGps(null);
      setScanResult({
        status: 'error',
        message: err.message || 'Camera & GPS permissions are required. Please allow Camera and Location permissions and try again.'
      });
    }
  };

  // STEP 2 (PagarBook Style): When user clicks "Take Picture & Punch In / Out" -> Snap picture & record attendance
  const handleTakePictureAndPunch = async (type: 'Check-In' | 'Check-Out') => {
    if (isScanning || punchInProgressRef.current) {
      return;
    }

    if (type === 'Check-Out' && oneHourCooldown.isCooldownActive) {
      stopCamera();
      setScanResult({
        status: 'error',
        message: `Punch In and Punch Out cannot be done at the same time. Please wait ${oneHourCooldown.remainingMinutes} more minute(s) (1-hour delay required).`
      });
      return;
    }

    punchInProgressRef.current = true;
    setIsScanning(true);
    setScanResult({
      status: null,
      message: `Capturing photo & recording ${type === 'Check-In' ? 'Punch In' : 'Punch Out'}...`
    });

    try {
      const capturedPhotoUrl = captureVideoFrame();
      const gpsInfo = activePunchGps || {
        latitude: Number(geofenceConfig.centerLat) || 13.151968,
        longitude: Number(geofenceConfig.centerLng) || 80.2086053,
        accuracy: 10,
        address: `Live GPS Verified (${geofenceConfig.officeName || 'HQ Office'})`,
        distance: 0
      };

      const emp = employees.find(e => e.employeeId === selectedEmpId || e.id === selectedEmpId);
      const empName = emp ? `${emp.firstName} ${emp.lastName}`.trim() : (currentUser.name || 'Employee');

      const serverRecord = await submitVerifiedFacePunch({
        employeeId: selectedEmpId,
        type: type === 'Check-In' ? 'IN' : 'OUT',
        photoBase64: capturedPhotoUrl,
        latitude: gpsInfo.latitude,
        longitude: gpsInfo.longitude,
        accuracyMeters: gpsInfo.accuracy,
        locationTimestamp: new Date().toISOString(),
        locationAddress: gpsInfo.address,
      });

      // Reload only after the server transaction succeeds. Never show optimistic success.
      await syncAllWithCloud();
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

      stopCamera();
      setActivePunchGps(null);
      setTicker(prev => prev + 1);

      setScanResult({
        status: 'success',
        message: type === 'Check-In'
          ? `Punch In Successful at ${serverRecord.checkIn || 'server time'}. Punch Out will be available after 1 hour.`
          : `Punch Out Successful at ${serverRecord.checkOut || 'server time'}. Today's attendance is completed.`
      });

      if (type === 'Check-In') {
        setPunchType('Check-Out');
      }

      setIsScanning(false);
      punchInProgressRef.current = false;
    } catch (err: any) {
      console.error('Photo capture error:', err);
      stopCamera();
      setActivePunchGps(null);
      setScanResult({
        status: 'error',
        message: err.message || 'Could not capture photo. Please look at the camera and try again.'
      });
      setIsScanning(false);
      punchInProgressRef.current = false;
    }
  };

  const triggerFaceScan = (type: 'Check-In' | 'Check-Out') => {
    handleRequestCameraAndGps(type);
  };

  const fetchGpsStatus = async () => {
    setGpsLoading(true);
    setGpsError(null);
    try {
      const reading = await acquireHighAccuracyGps({ timeoutMs: 9000, desiredAccuracyMeters: 20 });
      const centerLat = Number(geofenceConfig.centerLat) || 13.151968;
      const centerLng = Number(geofenceConfig.centerLng) || 80.2086053;
      const radius = Number(geofenceConfig.radiusMeters) || 200;
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
        reason: evaluation.message,
        address: `Live GPS (${reading.latitude.toFixed(4)}, ${reading.longitude.toFixed(4)})`,
        timestamp: reading.timestamp,
      });
      setGpsLoading(false);
    } catch (err: any) {
      console.error('GPS status acquisition error:', err);
      setGpsData(null);
      setGpsError(err.message || 'GPS location request failed. Please enable location permissions and retry in an open area.');
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
    return attendanceRecords.find(a => {
      const d = normalizeToYYYYMMDD(a.date);
      const sd = normalizeToYYYYMMDD(a.shiftDate);
      const matchesDate = d === todayStr || sd === todayStr;
      return matchesDate && isLogForCurrentUser(a);
    });
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

  // 3. Extract My Check-In & Check-Out Times for Today
  const myCheckInTime = useMemo(() => {
    const faceIn = myTodayFaceLogs.find(l => l.type === 'Check-In');
    if (faceIn && faceIn.timestamp) {
      return formatAttendanceTime(faceIn.timestamp);
    }
    if (myTodayAttendance?.checkIn && myTodayAttendance.checkIn !== '--:--' && myTodayAttendance.checkIn.trim() !== '') {
      return formatAttendanceTime(myTodayAttendance.checkIn);
    }
    return null;
  }, [myTodayFaceLogs, myTodayAttendance]);

  const myCheckOutTime = useMemo(() => {
    const faceOut = myTodayFaceLogs.find(l => l.type === 'Check-Out');
    if (faceOut && faceOut.timestamp) {
      return formatAttendanceTime(faceOut.timestamp);
    }
    if (myTodayAttendance?.checkOut && myTodayAttendance.checkOut !== '--:--' && myTodayAttendance.checkOut.trim() !== '') {
      return formatAttendanceTime(myTodayAttendance.checkOut);
    }
    return null;
  }, [myTodayFaceLogs, myTodayAttendance]);

  const myTodayStatus: 'Completed' | 'Checked In' | 'Not Marked' = useMemo(() => {
    if (myCheckInTime && myCheckOutTime) return 'Completed';
    if (myCheckInTime) return 'Checked In';
    return 'Not Marked';
  }, [myCheckInTime, myCheckOutTime]);

  // 4. Construct My Today's verified punch events list
  const myTodayLogs = useMemo(() => {
    const logs: typeof faceLogs = [...myTodayFaceLogs];

    if (myCheckInTime && !logs.some(l => l.type === 'Check-In')) {
      const fullTs = normalizeToFullTimestamp(myTodayAttendance?.checkIn || '', todayStr);
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
      const fullTs = normalizeToFullTimestamp(myTodayAttendance?.checkOut || '', todayStr);
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
  }, [myTodayFaceLogs, myCheckInTime, myCheckOutTime, myTodayAttendance, todayStr, currentUser, currentUserEmp]);

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
        if (key) todayAttMap.set(key, att);
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

      const inTimeRaw = faceIn?.timestamp || att?.checkIn;
      const outTimeRaw = faceOut?.timestamp || att?.checkOut;

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

      // Prefer record that has complete check-out or higher worked hours
      const preferRec = (recHasOut && !existingHasOut) || (recHours > existingHours);
      const base = preferRec ? { ...rec } : { ...existing };

      let finalCheckIn = base.checkIn;
      if (existingHasIn && recHasIn) {
        const inMin1 = parseTimeToMinutes(existing.checkIn);
        const inMin2 = parseTimeToMinutes(rec.checkIn);
        if (inMin1 !== null && inMin2 !== null) {
          finalCheckIn = inMin1 <= inMin2 ? existing.checkIn : rec.checkIn;
        }
      } else {
        finalCheckIn = existing.checkIn || rec.checkIn;
      }

      let finalCheckOut = base.checkOut;
      if (existingHasOut && recHasOut) {
        const outMin1 = parseTimeToMinutes(existing.checkOut);
        const outMin2 = parseTimeToMinutes(rec.checkOut);
        if (outMin1 !== null && outMin2 !== null) {
          finalCheckOut = outMin1 >= outMin2 ? existing.checkOut : rec.checkOut;
        }
      } else {
        finalCheckOut = existing.checkOut || rec.checkOut;
      }

      const finalHours = Math.max(existingHours, recHours);

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

      const existingHasOut = existing.checkOut && existing.checkOut !== '--:--' && existing.checkOut.trim() !== '';
      const recHasOut = rec.checkOut && rec.checkOut !== '--:--' && rec.checkOut.trim() !== '';
      const existingHours = Number(existing.workingHours || 0);
      const recHours = Number(rec.workingHours || 0);

      const preferRec = (recHasOut && !existingHasOut) || (recHours > existingHours);
      const base = preferRec ? { ...rec } : { ...existing };
      const finalHours = Math.max(existingHours, recHours);

      byEmpDate.set(uniqueKey, {
        ...base,
        checkIn: existing.checkIn || rec.checkIn,
        checkOut: (existingHasOut && recHasOut) ? (preferRec ? rec.checkOut : existing.checkOut) : (existing.checkOut || rec.checkOut),
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

  return (
    <div>
      {/* Clean PagarBook / Camu Mobile Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div className="page-title-group">
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>Daily Attendance</h1>
          <p className="page-subtitle" style={{ color: '#64748b', fontSize: '0.82rem', marginTop: '2px', margin: 0 }}>Allow Camera & GPS, take selfie & punch attendance</p>
        </div>
      </div>

      {isCEO && (
        <div style={{
          backgroundColor: '#ECFEFF',
          border: '1.5px solid #A5F3FC',
          borderRadius: '14px',
          padding: '14px 16px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <ShieldAlert size={22} color="#0E7490" style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 800, color: '#0E7490', fontSize: '0.88rem' }}>
              Executive Attendance Exemption
            </div>
            <div style={{ fontSize: '0.78rem', color: '#0891B2', marginTop: '2px' }}>
              As CEO / Managing Director, you have executive exemption from daily face scans and GPS punches. You may test hardware cameras or inspect company-wide logs below.
            </div>
          </div>
        </div>
      )}

      {/* Main 2-Column Layout */}
      <div className="face-attendance-grid">
        
        {/* LEFT COLUMN: PAGARBOOK / CAMU STYLE ATTENDANCE CARD */}
        <div className="face-attendance-scanner-card" style={{
          backgroundColor: '#ffffff',
          borderRadius: '18px',
          border: '1px solid #e2e8f0',
          borderTop: `4px solid ${isCompletedToday ? '#16a34a' : isCheckedIn ? '#0e7490' : '#10b981'}`,
          boxShadow: '0 4px 18px rgba(15, 23, 42, 0.04)',
          textAlign: 'center'
        }}>
          {/* Employee Identity & Shift Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            maxWidth: '360px',
            margin: '0 auto 14px',
            padding: '0 4px',
            textAlign: 'left'
          }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.02rem', color: '#0f172a' }}>
                {selectedEmp ? `${selectedEmp.firstName} ${selectedEmp.lastName}` : (currentUser.name || 'Employee')}
              </div>
              <div style={{ fontSize: '0.76rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                <Clock size={12} color="#0e7490" />
                <span>{shiftEval.assignedShift?.shiftName || 'General Shift'} ({shiftEval.assignedShift?.startTime || '09:00 AM'} - {shiftEval.assignedShift?.endTime || '06:00 PM'})</span>
              </div>
            </div>

            <div style={{
              padding: '4px 11px',
              borderRadius: '9999px',
              fontSize: '0.73rem',
              fontWeight: 800,
              backgroundColor: isCompletedToday ? '#dcfce7' : isCheckedIn ? '#ecfeff' : '#f1f5f9',
              color: isCompletedToday ? '#15803d' : isCheckedIn ? '#0e7490' : '#475569',
              border: `1px solid ${isCompletedToday ? '#bbf7d0' : isCheckedIn ? '#a5f3fc' : '#e2e8f0'}`,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: isCompletedToday ? '#22c55e' : isCheckedIn ? '#0891b2' : '#94a3b8'
              }} />
              <span>{isCompletedToday ? 'Completed' : isCheckedIn ? 'Punched In' : 'Not Punched In'}</span>
            </div>
          </div>

          {/* Today's Separate Punch In & Punch Out Summary Strip (Pagar Style) */}
          <div style={{
            maxWidth: '360px',
            margin: '0 auto 14px',
            backgroundColor: '#f8fafc',
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            padding: '10px 14px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            textAlign: 'left'
          }}>
            {/* Punch In Photo & Time */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {myTodayCheckInPhoto ? (
                <div
                  onClick={() => setPreviewPhoto({
                    url: myTodayCheckInPhoto,
                    title: `${selectedEmp?.firstName || 'Staff'} - Punch In Photo`,
                    subtitle: 'Today (Live Selfie)',
                    time: myCheckInTime || undefined
                  })}
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    border: '2px solid #16a34a',
                    flexShrink: 0,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(22, 163, 74, 0.2)'
                  }}
                  title="Tap to view Punch In photo"
                >
                  <img src={myTodayCheckInPhoto} alt="Punch In" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ) : (
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  backgroundColor: '#e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: '#94a3b8'
                }}>
                  <User size={18} />
                </div>
              )}
              <div>
                <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#16a34a', letterSpacing: '0.04em' }}>
                  PUNCH IN
                </div>
                <div style={{ fontSize: '0.84rem', fontWeight: 800, color: myCheckInTime ? '#0f172a' : '#94a3b8' }}>
                  {myCheckInTime || '--:--'}
                </div>
              </div>
            </div>

            {/* Punch Out Photo & Time */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderLeft: '1px solid #e2e8f0', paddingLeft: '12px' }}>
              {myTodayCheckOutPhoto ? (
                <div
                  onClick={() => setPreviewPhoto({
                    url: myTodayCheckOutPhoto,
                    title: `${selectedEmp?.firstName || 'Staff'} - Punch Out Photo`,
                    subtitle: 'Today (Live Selfie)',
                    time: myCheckOutTime || undefined
                  })}
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    border: '2px solid #0891b2',
                    flexShrink: 0,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(8, 145, 178, 0.2)'
                  }}
                  title="Tap to view Punch Out photo"
                >
                  <img src={myTodayCheckOutPhoto} alt="Punch Out" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ) : (
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  backgroundColor: '#e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: '#94a3b8'
                }}>
                  <User size={18} />
                </div>
              )}
              <div>
                <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#0891b2', letterSpacing: '0.04em' }}>
                  PUNCH OUT
                </div>
                <div style={{ fontSize: '0.84rem', fontWeight: 800, color: myCheckOutTime ? '#0f172a' : '#94a3b8' }}>
                  {myCheckOutTime || '--:--'}
                </div>
              </div>
            </div>
          </div>

          {/* CAMERA VIEWFINDER WITH 4 TEAL CORNER BRACKETS */}
          <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: '340px',
            margin: '0 auto 16px'
          }}>
            {/* Top-Left Bracket */}
            <div style={{
              position: 'absolute',
              top: '-8px',
              left: '-8px',
              width: '32px',
              height: '32px',
              borderTop: '3.5px solid #0e7490',
              borderLeft: '3.5px solid #0e7490',
              borderTopLeftRadius: '16px',
              zIndex: 10,
              pointerEvents: 'none'
            }} />
            {/* Top-Right Bracket */}
            <div style={{
              position: 'absolute',
              top: '-8px',
              right: '-8px',
              width: '32px',
              height: '32px',
              borderTop: '3.5px solid #0e7490',
              borderRight: '3.5px solid #0e7490',
              borderTopRightRadius: '16px',
              zIndex: 10,
              pointerEvents: 'none'
            }} />
            {/* Bottom-Left Bracket */}
            <div style={{
              position: 'absolute',
              bottom: '-8px',
              left: '-8px',
              width: '32px',
              height: '32px',
              borderBottom: '3.5px solid #0e7490',
              borderLeft: '3.5px solid #0e7490',
              borderBottomLeftRadius: '16px',
              zIndex: 10,
              pointerEvents: 'none'
            }} />
            {/* Bottom-Right Bracket */}
            <div style={{
              position: 'absolute',
              bottom: '-8px',
              right: '-8px',
              width: '32px',
              height: '32px',
              borderBottom: '3.5px solid #0e7490',
              borderRight: '3.5px solid #0e7490',
              borderBottomRightRadius: '16px',
              zIndex: 10,
              pointerEvents: 'none'
            }} />

            {/* Viewfinder Viewport Screen */}
            <div style={{
              width: '100%',
              aspectRatio: '4 / 3',
              backgroundColor: '#0f172a',
              borderRadius: '20px',
              overflow: 'hidden',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'inset 0 4px 14px rgba(0,0,0,0.6)'
            }}>
              {isCameraActive ? (
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
                      transform: isMirrored ? 'scaleX(-1)' : 'scaleX(1)',
                      transition: 'transform 0.2s ease'
                    }}
                  />

                  {/* Live Camera & GPS Ready Pill */}
                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    left: '12px',
                    zIndex: 30,
                    padding: '5px 10px',
                    borderRadius: '99px',
                    backgroundColor: 'rgba(22, 163, 74, 0.9)',
                    color: '#ffffff',
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.25)'
                  }}>
                    <MapPin size={12} />
                    <span>Camera & GPS Ready</span>
                  </div>
                  
                  {/* Camera Mirror / Flip Toggle Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsMirrored(prev => {
                        const next = !prev;
                        try { localStorage.setItem('vrm_hrms_camera_mirrored', String(next)); } catch {}
                        return next;
                      });
                    }}
                    title={isMirrored ? "Click to switch to standard view (Mirror Off)" : "Click to switch to selfie view (Mirror On)"}
                    style={{
                      position: 'absolute',
                      top: '12px',
                      right: '12px',
                      zIndex: 30,
                      padding: '5px 10px',
                      borderRadius: '99px',
                      backgroundColor: 'rgba(15, 23, 42, 0.8)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255, 255, 255, 0.25)',
                      color: '#ffffff',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      cursor: 'pointer'
                    }}
                  >
                    <FlipHorizontal size={13} />
                    <span>Flip</span>
                  </button>
                </>
              ) : (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '16px' }}>
                  <div style={{
                    width: '58px',
                    height: '58px',
                    borderRadius: '50%',
                    backgroundColor: isCompletedToday ? 'rgba(34, 197, 94, 0.16)' : 'rgba(16, 185, 129, 0.16)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 10px',
                    color: isCompletedToday ? '#22c55e' : '#10b981'
                  }}>
                    {isCompletedToday ? <CheckCircle2 size={30} /> : <Camera size={28} />}
                  </div>
                  <div style={{ fontSize: '0.86rem', color: '#f8fafc', fontWeight: 700 }}>
                    {isCompletedToday
                      ? 'Today\'s Attendance Completed'
                      : oneHourCooldown.isCooldownActive
                        ? `Punch Out unlocks in ${oneHourCooldown.remainingMinutes} min`
                        : isCheckedIn
                          ? 'Tap "Punch Out" to open Camera & GPS'
                          : 'Tap "Punch In" to open Camera & GPS'}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '4px' }}>
                    {isCompletedToday
                      ? `Punch In: ${myCheckInTime} • Punch Out: ${myCheckOutTime}`
                      : 'Selfie photo & live GPS location will be verified'}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 1-Hour Mandatory Delay Banner Between Punch In and Punch Out */}
          {oneHourCooldown.isCooldownActive && !isCameraActive && (
            <div style={{
              maxWidth: '360px',
              margin: '0 auto 14px',
              padding: '10px 14px',
              borderRadius: '12px',
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              color: '#92400e',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <Clock size={18} color="#d97706" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: '0.76rem', lineHeight: 1.4 }}>
                <div style={{ fontWeight: 800, color: '#b45309' }}>
                  1-Hour Delay Active ({oneHourCooldown.remainingMinutes} min remaining)
                </div>
                <div>
                  Punch Out available at <strong>{oneHourCooldown.unlockTimeDisplay || '1 hour after Punch In'}</strong>.
                </div>
              </div>
            </div>
          )}

          {/* Live GPS Status Pill */}
          <div style={{
            maxWidth: '360px',
            margin: '0 auto 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontSize: '0.74rem',
            color: activePunchGps ? '#15803d' : '#64748b',
            backgroundColor: activePunchGps ? '#f0fdf4' : '#f1f5f9',
            border: `1px solid ${activePunchGps ? '#bbf7d0' : '#e2e8f0'}`,
            padding: '7px 12px',
            borderRadius: '10px',
            fontWeight: 700
          }}>
            <MapPin size={13} color={activePunchGps ? '#16a34a' : '#0e7490'} />
            <span>
              {activePunchGps
                ? activePunchGps.address
                : `${geofenceConfig.officeName || 'HQ Office'} • Camera & GPS Required`}
            </span>
          </div>

          {/* PagarBook 2-Step Action Buttons */}
          <div style={{ maxWidth: '360px', margin: '0 auto' }}>
            {isCameraActive ? (
              /* STEP 2 BUTTON: Take Picture & Punch In / Punch Out */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  type="button"
                  disabled={isScanning}
                  onClick={() => handleTakePictureAndPunch(isCheckedIn ? 'Check-Out' : 'Check-In')}
                  style={{
                    width: '100%',
                    padding: '15px 24px',
                    borderRadius: '14px',
                    background: isCheckedIn
                      ? 'linear-gradient(135deg, #0e7490 0%, #0891b2 100%)'
                      : 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '0.98rem',
                    border: 'none',
                    cursor: isScanning ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    boxShadow: isCheckedIn
                      ? '0 6px 20px rgba(14, 116, 144, 0.35)'
                      : '0 6px 20px rgba(16, 185, 129, 0.35)'
                  }}
                >
                  {isScanning ? (
                    <>
                      <RefreshCw size={19} className="spin" />
                      <span>Saving Attendance...</span>
                    </>
                  ) : (
                    <>
                      <Camera size={20} />
                      <span>{isCheckedIn ? 'Take Picture & Punch Out' : 'Take Picture & Punch In'}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setActivePunchGps(null);
                    setScanResult({ status: null, message: '' });
                  }}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '10px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#475569',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Cancel Camera
                </button>
              </div>
            ) : (
              /* STEP 1 BUTTON: Click Punch In / Punch Out to Request Camera & GPS Permission */
              <button
                type="button"
                disabled={
                  isScanning ||
                  isRequestingPermissions ||
                  isCompletedToday ||
                  (isCheckedIn && oneHourCooldown.isCooldownActive) ||
                  (isCheckedIn ? !shiftEval.canCheckOut : !shiftEval.canCheckIn)
                }
                onClick={() => {
                  if (isCompletedToday || isScanning || isRequestingPermissions) return;
                  handleRequestCameraAndGps(isCheckedIn ? 'Check-Out' : 'Check-In');
                }}
                style={{
                  width: '100%',
                  padding: '15px 24px',
                  borderRadius: '14px',
                  background: isCompletedToday
                    ? '#cbd5e1'
                    : (isScanning || isRequestingPermissions)
                      ? '#94a3b8'
                      : (isCheckedIn && oneHourCooldown.isCooldownActive)
                        ? '#e2e8f0'
                        : isCheckedIn
                          ? (shiftEval.canCheckOut ? 'linear-gradient(135deg, #0e7490 0%, #0891b2 100%)' : '#cbd5e1')
                          : (shiftEval.canCheckIn ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' : '#cbd5e1'),
                  color: (isCheckedIn && oneHourCooldown.isCooldownActive) ? '#64748b' : '#ffffff',
                  fontWeight: 800,
                  fontSize: '0.98rem',
                  border: 'none',
                  cursor: (!isCompletedToday && !isScanning && !isRequestingPermissions && !(isCheckedIn && oneHourCooldown.isCooldownActive) && (isCheckedIn ? shiftEval.canCheckOut : shiftEval.canCheckIn))
                    ? 'pointer'
                    : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  boxShadow: (!isCompletedToday && !isScanning && !isRequestingPermissions && !(isCheckedIn && oneHourCooldown.isCooldownActive) && (isCheckedIn ? shiftEval.canCheckOut : shiftEval.canCheckIn))
                    ? (isCheckedIn ? '0 6px 20px rgba(14, 116, 144, 0.3)' : '0 6px 20px rgba(16, 185, 129, 0.3)')
                    : 'none'
                }}
              >
                {isRequestingPermissions ? (
                  <>
                    <RefreshCw size={18} className="spin" />
                    <span>Allowing Camera & GPS...</span>
                  </>
                ) : isCompletedToday ? (
                  <>
                    <CheckCircle2 size={18} />
                    <span>Attendance Completed Today</span>
                  </>
                ) : isCheckedIn && oneHourCooldown.isCooldownActive ? (
                  <>
                    <Clock size={18} />
                    <span>Punch Out in {oneHourCooldown.remainingMinutes} min (1 Hr Delay)</span>
                  </>
                ) : isCheckedIn ? (
                  <>
                    <Camera size={19} />
                    <span>Punch Out</span>
                  </>
                ) : (
                  <>
                    <Camera size={19} />
                    <span>Punch In</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Result Alert Message */}
          {scanResult.message && (
            <div style={{
              maxWidth: '360px',
              margin: '14px auto 0',
              padding: '10px 14px',
              borderRadius: '10px',
              backgroundColor: scanResult.status === 'error' ? '#fff1f2' : scanResult.status === 'success' ? '#f0fdf4' : '#ecfeff',
              border: `1px solid ${scanResult.status === 'error' ? '#f43f5e' : scanResult.status === 'success' ? '#22c55e' : '#0891b2'}`,
              color: scanResult.status === 'error' ? '#9f1239' : scanResult.status === 'success' ? '#166534' : '#0e7490',
              fontSize: '0.8rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}>
              {scanResult.status === 'error' && <ShieldAlert size={16} style={{ flexShrink: 0 }} />}
              {scanResult.status === 'success' && <CheckCircle2 size={16} color="#22c55e" style={{ flexShrink: 0 }} />}
              <span>{scanResult.message}</span>
            </div>
          )}

        </div>

        {/* RIGHT COLUMN: MONTHLY ACTIVITY CARD (SCOPED TO SELECTED MONTH) */}
        <div className="face-attendance-activity-card" style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          {/* Header Strip with Month Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} color="#0e7490" />
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Monthly Activity
                </h2>
              </div>
              
              {/* Month Picker Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  title="Previous Month"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '26px',
                    height: '26px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#0e7490',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <ChevronLeft size={15} />
                </button>

                <div style={{
                  padding: '3px 10px',
                  borderRadius: '6px',
                  backgroundColor: '#ecfeff',
                  border: '1px solid #a5f3fc',
                  color: '#0e7490',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <Calendar size={12} />
                  <span>{formatMonthDisplay(selectedMonth)}</span>
                </div>

                <button
                  type="button"
                  onClick={handleNextMonth}
                  title="Next Month"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '26px',
                    height: '26px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#0e7490',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <ChevronRight size={15} />
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
              <span style={{
                backgroundColor: '#ecfeff',
                color: '#0e7490',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.74rem',
                fontWeight: 800,
                letterSpacing: '0.04em'
              }}>
                {myMonthlyRecords.length} {myMonthlyRecords.length === 1 ? 'RECORD' : 'RECORDS'}
              </span>
            )}
          </div>

          {/* VIEW 1: MY MONTHLY ACTIVITY */}
          {activityViewTab === 'my' ? (
            <>
              {/* Monthly Attendance Records List with Saved Photos */}
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', letterSpacing: '0.04em', marginBottom: '10px' }}>
                  {formatMonthDisplay(selectedMonth).toUpperCase()} PUNCH LOGS ({myMonthlyRecords.length})
                </div>

                {myMonthlyRecords.length === 0 ? (
                  <div style={{
                    padding: '30px 16px',
                    textAlign: 'center',
                    backgroundColor: '#f8fafc',
                    borderRadius: '12px',
                    border: '1px dashed #cbd5e1'
                  }}>
                    <Calendar size={28} color="#94a3b8" style={{ margin: '0 auto 8px', display: 'block' }} />
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a', marginBottom: '2px' }}>
                      No records for {formatMonthDisplay(selectedMonth)}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                      Punch in using Face Attendance or GPS Clock to see your daily verified records and photos.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '480px', overflowY: 'auto', paddingRight: '4px' }}>
                    {myMonthlyRecords.map(rec => {
                      const recDate = rec.date || rec.shiftDate;
                      const inPhoto = getRecordPhoto(rec, 'Check-In');
                      const outPhoto = getRecordPhoto(rec, 'Check-Out');
                      const isTodayRow = normalizeToYYYYMMDD(recDate) === todayStr;

                      return (
                        <div
                          key={rec.id}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '10px',
                            border: `1px solid ${isTodayRow ? '#a5f3fc' : '#e2e8f0'}`,
                            backgroundColor: isTodayRow ? '#f0fdfa' : '#f8fafc',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                          }}
                        >
                          {/* Row Top: Date, Day, Status Pill & Hours */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#0f172a' }}>
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
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                backgroundColor: rec.status === 'Present' ? '#dcfce7' : rec.status === 'Half Day' ? '#fef3c7' : '#fee2e2',
                                color: rec.status === 'Present' ? '#15803d' : rec.status === 'Half Day' ? '#b45309' : '#b91c1c'
                              }}>
                                {rec.status}
                              </span>
                              {rec.workingHours ? (
                                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>
                                  {rec.workingHours} hrs
                                </span>
                              ) : null}
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
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div>
                                <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#16a34a' }}>
                                  CHECK-IN
                                </div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: rec.checkIn ? '#0f172a' : '#94a3b8' }}>
                                  {rec.checkIn ? formatAttendanceTime(rec.checkIn) : '—'}
                                </div>
                              </div>

                              {inPhoto ? (
                                <div
                                  onClick={() => setPreviewPhoto({
                                    url: inPhoto,
                                    title: `${currentUser.name || 'Staff'} - Check-In Photo`,
                                    subtitle: formatDateDDMMYYYY(recDate),
                                    time: rec.checkIn ? formatAttendanceTime(rec.checkIn) : undefined
                                  })}
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
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div>
                                <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#0e7490' }}>
                                  CHECK-OUT
                                </div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: rec.checkOut ? '#0f172a' : rec.checkIn ? '#d97706' : '#94a3b8' }}>
                                  {rec.checkOut ? formatAttendanceTime(rec.checkOut) : (rec.checkIn ? 'In Progress' : '—')}
                                </div>
                              </div>

                              {outPhoto ? (
                                <div
                                  onClick={() => setPreviewPhoto({
                                    url: outPhoto,
                                    title: `${currentUser.name || 'Staff'} - Check-Out Photo`,
                                    subtitle: formatDateDDMMYYYY(recDate),
                                    time: rec.checkOut ? formatAttendanceTime(rec.checkOut) : undefined
                                  })}
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
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
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

      </div>

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
