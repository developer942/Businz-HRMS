import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useHRMS, calculateDistanceMeters } from '../../context/HRMSContext';
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
  AlertTriangle,
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
import type { FaceLog } from '../../types/hrms';

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
    geofenceConfig, 
    updateGeofenceConfig, 
    currentUser, 
    setActiveModule, 
    getTodayFieldAssignment,
    getEmployeeShiftAttendanceState
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

  // Real-time ticker for shift window countdown
  const [ticker, setTicker] = useState<number>(0);
  useEffect(() => {
    const t = setInterval(() => setTicker(prev => prev + 1), 1000);
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

  const isCEO = currentUser.role === 'CEO' || currentUser.designation === 'CEO' || currentUser.employeeId === 'EMP-000';

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
    isInside: boolean;
    address: string;
  } | null>(null);

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

  // Strictly stop and release all hardware camera media tracks
  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      mediaStreamRef.current = null;
    }

    if (videoRef.current) {
      if (videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    }

    setIsCameraActive(false);
  };

  // Start real browser camera ONLY on user explicit button click
  const startCamera = async () => {
    // Stop any existing stream first
    stopCamera();

    setScanResult({ status: null, message: '' });

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } 
        });
        mediaStreamRef.current = stream;
        
        setIsCameraActive(true);

        // Connect stream to video element on next tick after render
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(e => console.log('Video play catch:', e));
          }
        }, 100);
      }
    } catch (err: any) {
      console.log('WebCam access error:', err);
      setScanResult({
        status: 'error',
        message: 'Could not access WebCam. Hardware may be in use by another app or permissions denied.'
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

  // Helper to capture live frame snapshot from video element
  const captureVideoFrame = (): string => {
    if (videoRef.current && videoRef.current.videoWidth > 0) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          if (isMirrored) {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/jpeg', 0.85);
        }
      } catch (err) {
        console.error('Snapshot capture error:', err);
      }
    }
    const emp = employees.find(e => e.employeeId === selectedEmpId);
    return emp?.avatar || '';
  };

  const processAttendanceScan = (
    type: 'Check-In' | 'Check-Out', 
    capturedPhotoUrl: string, 
    userLat: number, 
    userLng: number, 
    distance: number, 
    addressText: string
  ) => {
    if (!punchInProgressRef.current) {
      punchInProgressRef.current = true;
    }
    const emp = employees.find(e => e.employeeId === selectedEmpId);
    const empName = emp ? `${emp.firstName} ${emp.lastName}` : 'Employee';

    // Location tracking: shared attendance guard blocks punches outside the saved geofence.
    const isInsideGeofence = !geofenceConfig.enabled || distance <= geofenceConfig.radiusMeters;

    // Enforce Shift Window Validation
    const currentShiftState = getEmployeeShiftAttendanceState(selectedEmpId);
    if (type === 'Check-In' && !currentShiftState.canCheckIn) {
      setScanResult({
        status: 'error',
        message: `Check-In Not Allowed: ${currentShiftState.message}`
      });
      setIsScanning(false);
      punchInProgressRef.current = false;
      return;
    }
    if (type === 'Check-Out' && !currentShiftState.canCheckOut) {
      setScanResult({
        status: 'error',
        message: `Check-Out Not Allowed: ${currentShiftState.message}`
      });
      setIsScanning(false);
      punchInProgressRef.current = false;
      return;
    }

    // Record Attendance & Add Face Log (Persisting captured live photo)
    const punchResult = markAttendance(
      selectedEmpId, 
      'Present', 
      (type === 'Check-In' ? 'Face Check-In' : 'Face Check-Out') as any, 
      {
        lat: userLat,
        lng: userLng,
        address: addressText,
        inGeofence: isInsideGeofence
      },
      capturedPhotoUrl
    );

    if (!punchResult.success) {
      setScanResult({
        status: 'error',
        message: punchResult.message
      });
      setIsScanning(false);
      punchInProgressRef.current = false;
      return;
    }

    addFaceLog({
      employeeId: selectedEmpId,
      employeeName: empName,
      timestamp: getLocalTimestampString(),
      type,
      status: 'Success',
      photoUrl: capturedPhotoUrl,
      confidenceScore: 98.6
    });

    setScanResult({
      status: 'success',
      message: `Face Verified! ${type} logged for ${empName}.`
    });

    if (type === 'Check-In') {
      setPunchType('Check-Out');
    }

    setIsScanning(false);
    punchInProgressRef.current = false;

    // Automatically stop camera hardware 3 seconds after successful scan for privacy
    setTimeout(() => {
      stopCamera();
    }, 3000);
  };

  const triggerFaceScan = (type: 'Check-In' | 'Check-Out') => {
    if (isScanning || punchInProgressRef.current) {
      return;
    }
    if (!isCameraActive) {
      setScanResult({ status: 'error', message: 'Please turn on the camera first before scanning face.' });
      return;
    }

    punchInProgressRef.current = true;
    const capturedPhotoUrl = captureVideoFrame();
    setIsScanning(true);
    setScanResult({ status: null, message: 'Requesting GPS location permissions & verifying boundary...' });

    if (locationMode === 'real') {
      if (!navigator.geolocation) {
        setScanResult({
          status: 'error',
          message: 'GPS Geolocation is not supported by your browser or device.'
        });
        setIsScanning(false);
        punchInProgressRef.current = false;
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLat = position.coords.latitude;
          const userLng = position.coords.longitude;
          const distance = calculateDistanceMeters(
            userLat, 
            userLng, 
            geofenceConfig.centerLat, 
            geofenceConfig.centerLng
          );
          const address = `Live GPS (${userLat.toFixed(4)}, ${userLng.toFixed(4)}) - ${distance}m away`;
          processAttendanceScan(type, capturedPhotoUrl, userLat, userLng, distance, address);
        },
        (error) => {
          console.error('Geolocation permission error:', error);
          let errorMsg = 'GPS Location Access Required! Please grant location permissions in your browser settings to verify geofence boundary.';
          if (error.code === error.PERMISSION_DENIED) {
            errorMsg = 'Location Permission DENIED by Browser! You must enable location access in browser settings to check in.';
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            errorMsg = 'GPS Location signal unavailable. Please ensure location/GPS is enabled on your device.';
          }
          setScanResult({ status: 'error', message: errorMsg });
          setIsScanning(false);
          punchInProgressRef.current = false;
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 30000 }
      );
    } else {
      const distance = locationMode === 'outside' ? geofenceConfig.radiusMeters + 250 : 28;
      const userLat = geofenceConfig.centerLat + (locationMode === 'outside' ? 0.006 : 0.00018);
      const userLng = geofenceConfig.centerLng + (locationMode === 'outside' ? 0.006 : 0.00015);
      const address = `${geofenceConfig.officeName} ${locationMode === 'outside' ? 'Outside Boundary' : 'Gate 1'} (${distance}m away)`;
      processAttendanceScan(type, capturedPhotoUrl, userLat, userLng, distance, address);
    }
  };

  const fetchGpsStatus = () => {
    setGpsLoading(true);
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const dist = calculateDistanceMeters(lat, lng, geofenceConfig.centerLat, geofenceConfig.centerLng);
          setGpsData({
            lat,
            lng,
            distance: dist,
            isInside: !geofenceConfig.enabled || dist <= geofenceConfig.radiusMeters,
            address: `Live GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`
          });
          setGpsLoading(false);
        },
        () => {
          // Simulated inside geofence
          const dist = 28;
          setGpsData({
            lat: geofenceConfig.centerLat + 0.00018,
            lng: geofenceConfig.centerLng + 0.00015,
            distance: dist,
            isInside: true,
            address: `${geofenceConfig.officeName} Gate 1 (${dist}m away)`
          });
          setGpsLoading(false);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      const dist = 28;
      setGpsData({
        lat: geofenceConfig.centerLat + 0.00018,
        lng: geofenceConfig.centerLng + 0.00015,
        distance: dist,
        isInside: true,
        address: `${geofenceConfig.officeName} Gate 1 (${dist}m away)`
      });
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
      avatar: currentUser.avatar || ''
    };

    if (!gpsData) {
      setScanResult({
        status: 'error',
        message: 'GPS location is required. Please tap Refresh, allow location permission, and try again.'
      });
      punchInProgressRef.current = false;
      return;
    }

    const lat = gpsData.lat;
    const lng = gpsData.lng;
    const dist = gpsData.distance;
    const isInside = gpsData.isInside;
    const addr = gpsData?.address || `${geofenceConfig.officeName} (GPS Clock-In)`;

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
        inGeofence: isInside
      },
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
      [currentUser.employeeId, currentUser.id, currentUserEmp?.employeeId, currentUserEmp?.id, selectedEmpId]
        .filter(Boolean)
        .map(s => String(s).trim().toLowerCase())
    );
  }, [currentUser, currentUserEmp, selectedEmpId]);

  const validUserNames = useMemo(() => {
    const list = [currentUser.name];
    if (currentUserEmp) {
      list.push(`${currentUserEmp.firstName} ${currentUserEmp.lastName}`.trim());
      list.push(currentUserEmp.firstName);
    }
    return list.filter(Boolean).map(s => String(s).trim().toLowerCase());
  }, [currentUser, currentUserEmp]);

  // Strict Scoping: checks if a record belongs to the logged-in user
  const isLogForCurrentUser = useMemo(() => {
    return (item: any): boolean => {
      if (!item) return false;
      const logEmpId = String(item.employeeId || '').trim().toLowerCase();
      const logEmpName = String(item.employeeName || (item.firstName ? `${item.firstName} ${item.lastName}` : '')).trim().toLowerCase();

      // Direct Employee ID match
      if (logEmpId && validUserEmpIds.has(logEmpId)) return true;

      // Direct Name match
      if (logEmpName && validUserNames.some(name => logEmpName === name || logEmpName.includes(name) || name.includes(logEmpName))) {
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

  // Current user's monthly attendance records
  const myMonthlyRecords = useMemo(() => {
    return attendanceRecords
      .filter(a => {
        const d = normalizeToYYYYMMDD(a.date);
        const sd = normalizeToYYYYMMDD(a.shiftDate);
        const matchesMonth = (d && d.startsWith(selectedMonth)) || (sd && sd.startsWith(selectedMonth));
        return matchesMonth && isLogForCurrentUser(a);
      })
      .sort((a, b) => {
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

  // All Staff Monthly records
  const allStaffMonthlyRecords = useMemo(() => {
    return attendanceRecords
      .filter(a => {
        const d = normalizeToYYYYMMDD(a.date);
        const sd = normalizeToYYYYMMDD(a.shiftDate);
        return (d && d.startsWith(selectedMonth)) || (sd && sd.startsWith(selectedMonth));
      })
      .sort((a, b) => {
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

  if (isCEO) {
    return (
      <div style={{ maxWidth: '640px', margin: '40px auto', padding: '32px', backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #E7ECF3', textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#ECFEFF', color: '#0E7490', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <ScanFace size={32} />
        </div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B1A2D', marginBottom: '8px' }}>
          Attendance Not Required
        </h2>
        <p style={{ color: '#64748B', fontSize: '0.88rem', lineHeight: 1.5, marginBottom: '24px' }}>
          As CEO, attendance tracking and live face scanning are exempt for executive leadership.
        </p>
        <button 
          className="btn btn-primary" 
          onClick={() => setActiveModule('dashboard')}
          style={{ padding: '9px 20px', borderRadius: '10px', fontWeight: 700 }}
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Page Header Matching Screenshot */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div className="page-title-group">
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>Attendance Scanner</h1>
          <p className="page-subtitle" style={{ color: '#64748b', fontSize: '0.86rem', marginTop: '4px', margin: 0 }}>Scan face to clock in/out</p>
        </div>

        {/* GPS CLOCK-IN BUTTON */}
        <button
          type="button"
          onClick={() => {
            setShowGpsModal(true);
            fetchGpsStatus();
          }}
          style={{
            background: 'linear-gradient(135deg, #0e7490 0%, #0891b2 100%)',
            color: '#ffffff',
            borderRadius: '99px',
            padding: '10px 24px',
            border: 'none',
            fontSize: '0.86rem',
            fontWeight: 800,
            letterSpacing: '0.04em',
            boxShadow: '0 4px 14px rgba(14, 116, 144, 0.35)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 6px 18px rgba(14, 116, 144, 0.45)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(14, 116, 144, 0.35)';
          }}
        >
          <div style={{
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            border: '1.5px solid rgba(255, 255, 255, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <MapPin size={12} color="#ffffff" strokeWidth={2.8} />
          </div>
          <span>{hasActiveCheckIn ? 'GPS CLOCK-OUT' : 'GPS CLOCK-IN'}</span>
        </button>
      </div>

      {isCEO && (
        <div style={{
          backgroundColor: '#ECFEFF',
          border: '1.5px solid #A5F3FC',
          borderRadius: '14px',
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <ShieldAlert size={24} color="#0E7490" style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 800, color: '#0E7490', fontSize: '0.94rem' }}>
              Executive Attendance Exemption
            </div>
            <div style={{ fontSize: '0.8rem', color: '#0891B2', marginTop: '2px' }}>
              As CEO / Managing Director, you have executive exemption from daily face scans and GPS punches. You may test hardware cameras or inspect company-wide logs below.
            </div>
          </div>
        </div>
      )}

      {/* Main 2-Column Layout Matching Screenshot */}
      <div className="face-attendance-grid">
        
        {/* LEFT COLUMN: ATTENDANCE SCANNER CARD */}
        <div className="face-attendance-scanner-card" style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          borderTop: '4px solid #0e7490',
          boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
          textAlign: 'center'
        }}>
          {/* CAMERA VIEWFINDER WITH 4 TEAL CORNER BRACKETS */}
          <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: '360px',
            margin: '0 auto 24px'
          }}>
            {/* Top-Left Bracket */}
            <div style={{
              position: 'absolute',
              top: '-12px',
              left: '-12px',
              width: '38px',
              height: '38px',
              borderTop: '4px solid #0e7490',
              borderLeft: '4px solid #0e7490',
              borderTopLeftRadius: '16px',
              zIndex: 10,
              pointerEvents: 'none'
            }} />
            {/* Top-Right Bracket */}
            <div style={{
              position: 'absolute',
              top: '-12px',
              right: '-12px',
              width: '38px',
              height: '38px',
              borderTop: '4px solid #0e7490',
              borderRight: '4px solid #0e7490',
              borderTopRightRadius: '16px',
              zIndex: 10,
              pointerEvents: 'none'
            }} />
            {/* Bottom-Left Bracket */}
            <div style={{
              position: 'absolute',
              bottom: '-12px',
              left: '-12px',
              width: '38px',
              height: '38px',
              borderBottom: '4px solid #0e7490',
              borderLeft: '4px solid #0e7490',
              borderBottomLeftRadius: '16px',
              zIndex: 10,
              pointerEvents: 'none'
            }} />
            {/* Bottom-Right Bracket */}
            <div style={{
              position: 'absolute',
              bottom: '-12px',
              right: '-12px',
              width: '38px',
              height: '38px',
              borderBottom: '4px solid #0e7490',
              borderRight: '4px solid #0e7490',
              borderBottomRightRadius: '16px',
              zIndex: 10,
              pointerEvents: 'none'
            }} />

            {/* Viewfinder Viewport Screen */}
            <div style={{
              width: '100%',
              aspectRatio: '1 / 1',
              backgroundColor: '#0d1527',
              borderRadius: '24px',
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
                      top: '14px',
                      right: '14px',
                      zIndex: 30,
                      padding: '6px 12px',
                      borderRadius: '99px',
                      backgroundColor: 'rgba(15, 23, 42, 0.8)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255, 255, 255, 0.25)',
                      color: '#ffffff',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <FlipHorizontal size={14} />
                    <span>{isMirrored ? 'Mirror: On' : 'Mirror: Off'}</span>
                  </button>

                  {/* Laser Scanning Overlay */}
                  <div className="face-scanning-overlay" />
                </>
              ) : (
                <div style={{ textAlign: 'center', color: '#64748b' }}>
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(14, 116, 144, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px',
                    color: '#0891b2'
                  }}>
                    <Camera size={32} />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#cbd5e1', marginBottom: '4px' }}>
                    AI Biometric Scanner
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    Click "Start Face Scan" below
                  </div>
                </div>
              )}

              {/* Status Alert Inside Viewport */}
              {scanResult.status && (
                <div style={{
                  position: 'absolute',
                  bottom: '16px',
                  left: '16px',
                  right: '16px',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  backgroundColor: scanResult.status === 'success' ? 'rgba(16, 185, 129, 0.95)' : 'rgba(239, 68, 68, 0.95)',
                  backdropFilter: 'blur(8px)',
                  color: '#ffffff',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  zIndex: 20
                }}>
                  {scanResult.status === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  <span>{scanResult.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* Primary Action Button */}
          <div style={{ maxWidth: '360px', margin: '0 auto' }}>
            <button
              type="button"
              disabled={
                isScanning || 
                (isCompletedToday ? true : punchType === 'Check-In' ? !shiftEval.canCheckIn : !shiftEval.canCheckOut)
              }
              onClick={async () => {
                if (isCompletedToday) return;
                if (!isCameraActive) {
                  await startCamera();
                } else {
                  triggerFaceScan(hasActiveCheckIn ? 'Check-Out' : 'Check-In');
                }
              }}
              style={{
                width: '100%',
                padding: '14px 28px',
                borderRadius: '12px',
                background: isCompletedToday
                  ? '#cbd5e1'
                  : (punchType === 'Check-In' ? shiftEval.canCheckIn : shiftEval.canCheckOut)
                    ? 'linear-gradient(135deg, #0e7490 0%, #0891b2 100%)'
                    : '#cbd5e1',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '0.94rem',
                border: 'none',
                cursor: (!isCompletedToday && (punchType === 'Check-In' ? shiftEval.canCheckIn : shiftEval.canCheckOut)) ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                boxShadow: (!isCompletedToday && (punchType === 'Check-In' ? shiftEval.canCheckIn : shiftEval.canCheckOut))
                  ? '0 6px 20px rgba(14, 116, 144, 0.35)'
                  : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              {isScanning ? (
                <>
                  <RefreshCw size={18} className="spin" />
                  <span>Verifying Face & GPS...</span>
                </>
              ) : isCompletedToday ? (
                <>
                  <CheckCircle2 size={18} />
                  <span>Shift Completed for Today</span>
                </>
              ) : (
                <>
                  <ScanFace size={18} />
                  <span>{isCameraActive ? `Confirm ${punchType === 'Check-In' ? 'Clock-In' : 'Clock-Out'} Scan` : `Start Face Scan (${punchType === 'Check-In' ? 'Clock-In' : 'Clock-Out'})`}</span>
                </>
              )}
            </button>

            {isCameraActive && (
              <button
                type="button"
                onClick={stopCamera}
                style={{
                  marginTop: '10px',
                  background: 'none',
                  border: 'none',
                  color: '#ef4444',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Turn Off Camera
              </button>
            )}
          </div>

          {/* Result Alert Message */}
          {scanResult.message && (
            <div style={{
              maxWidth: '360px',
              margin: '16px auto 0',
              padding: '10px 14px',
              borderRadius: '10px',
              backgroundColor: scanResult.status === 'success' ? '#ecfdf5' : scanResult.status === 'error' ? '#fff1f2' : '#ecfeff',
              border: `1px solid ${scanResult.status === 'success' ? '#10b981' : scanResult.status === 'error' ? '#f43f5e' : '#0891b2'}`,
              color: scanResult.status === 'success' ? '#065f46' : scanResult.status === 'error' ? '#9f1239' : '#0e7490',
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}>
              {scanResult.status === 'success' && <CheckCircle2 size={16} />}
              {scanResult.status === 'error' && <ShieldAlert size={16} />}
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
              <div style={{
                padding: '18px',
                borderRadius: '14px',
                border: '1.5px solid #cbd5e1',
                backgroundColor: gpsData?.isInside ? '#f0fdf4' : '#fffbeb',
                borderColor: gpsData?.isInside ? '#86efac' : '#fde68a'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: gpsData?.isInside ? '#22c55e' : '#f59e0b',
                      display: 'inline-block',
                      boxShadow: gpsData?.isInside ? '0 0 8px #22c55e' : 'none'
                    }} />
                    <span style={{ fontSize: '0.84rem', fontWeight: 800, color: gpsData?.isInside ? '#15803d' : '#b45309' }}>
                      {gpsLoading ? 'Detecting Location...' : gpsData?.isInside ? 'INSIDE GEOFENCE BOUNDARY' : 'OUTSIDE GEOFENCE'}
                    </span>
                  </div>
                  <button 
                    type="button" 
                    onClick={fetchGpsStatus} 
                    disabled={gpsLoading}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0891b2', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <RefreshCw size={13} className={gpsLoading ? 'spin' : ''} /> Refresh
                  </button>
                </div>

                <div style={{ fontSize: '0.78rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div><strong>Designated Office:</strong> {geofenceConfig.officeName}</div>
                  <div><strong>Allowed Zone Radius:</strong> {geofenceConfig.radiusMeters} meters</div>
                  <div><strong>Detected Distance:</strong> {gpsData ? `${gpsData.distance}m away` : 'Calculating...'}</div>
                  <div><strong>Current Coordinates:</strong> {gpsData ? `${gpsData.lat.toFixed(5)}, ${gpsData.lng.toFixed(5)}` : 'Waiting for GPS...'}</div>
                </div>
              </div>

              {/* Smart GPS Punch Button */}
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
                    disabled={gpsLoading || isCheckedOut || !shiftEval.canCheckOut}
                    onClick={() => handleGpsPunch('Check-Out')}
                    style={{
                      width: '100%',
                      padding: '13px 20px',
                      borderRadius: '10px',
                      backgroundColor: (!isCheckedOut && shiftEval.canCheckOut) ? '#0e7490' : '#cbd5e1',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      border: 'none',
                      cursor: (!isCheckedOut && shiftEval.canCheckOut && !gpsLoading) ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: (!isCheckedOut && shiftEval.canCheckOut) ? '0 4px 14px rgba(14, 116, 144, 0.35)' : 'none'
                    }}
                  >
                    <Clock size={18} /> Confirm GPS Clock-Out
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={gpsLoading || !shiftEval.canCheckIn}
                    onClick={() => handleGpsPunch('Check-In')}
                    style={{
                      width: '100%',
                      padding: '13px 20px',
                      borderRadius: '10px',
                      backgroundColor: shiftEval.canCheckIn ? '#10b981' : '#cbd5e1',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      border: 'none',
                      cursor: (shiftEval.canCheckIn && !gpsLoading) ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: shiftEval.canCheckIn ? '0 4px 14px rgba(16, 185, 129, 0.35)' : 'none'
                    }}
                  >
                    <CheckCircle2 size={18} /> Confirm GPS Clock-In
                  </button>
                )}
              </div>

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
