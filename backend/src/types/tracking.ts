// VRM Enterprise HRMS - Field Duty & GPS Tracking Types

export type DutyType = 
  | 'Site Visit' 
  | 'Customer Visit' 
  | 'Vendor Visit' 
  | 'Travel' 
  | 'Field Work' 
  | 'Permanent Field'
  | 'Other';

export type ScheduleType = 
  | 'One Day' 
  | 'Date Range' 
  | 'Weekly' 
  | 'Monthly' 
  | 'Custom Dates';

export type AttendanceType = 
  | 'Site Geofence' 
  | 'Flexible Field Check-in';

export type AssignmentStatus = 
  | 'Scheduled' 
  | 'Active' 
  | 'Completed' 
  | 'Archived'
  | 'Cancelled';

export type TripStatus = 
  | 'Active' 
  | 'Completed' 
  | 'Auto Closed'
  | 'Attendance Review Required'
  | 'Cancelled';

export type GpsDataQuality = 
  | 'Good GPS Data'
  | 'Partial GPS Data'
  | 'Insufficient GPS Data'
  | 'No GPS Data'
  | 'GPS Gaps Detected'
  | 'Verified' 
  | 'Partial (Gaps Detected)';

export type GpsStatus = 
  | 'GPS Active'
  | 'Active'
  | 'Travelling'
  | 'Stationary'
  | 'GPS Weak'
  | 'GPS Disabled'
  | 'Permission Denied'
  | 'Offline'
  | 'Stale Location'
  | 'Tracking Stopped'
  | 'Completed'
  | 'GPS Lost' 
  | 'GPS Off'
  | 'Low Accuracy'
  | 'No Signal';

export type TrackingStatus = 
  | 'Travelling' 
  | 'Stationary'
  | 'Stopped'
  | 'Arrived at destination'
  | 'Active'
  | 'Merged into canonical session'
  | 'Offline'
  | 'Stale Location'
  | 'Stationary (Stale)'
  | 'GPS Signal Weak'
  | 'GPS Weak'
  | 'GPS Disabled'
  | 'Permission Denied'
  | 'Pending GPS Fix'
  | 'Tracking Active'
  | 'Tracking Stopped'
  | 'Visit Completed'
  | 'On Site' 
  | 'Duty Active' 
  | 'Interrupted' 
  | 'Completed' 
  | 'Idle';

export type AlertType = 
  | 'GPS Disabled' 
  | 'Location Permission Denied' 
  | 'No Location Received' 
  | 'Low Accuracy' 
  | 'Tracking Interrupted';

export type AlertStatus = 'Open' | 'Resolved';

export interface FieldAssignment {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeAvatar?: string;
  department: string;
  dutyType: DutyType;
  scheduleType: ScheduleType;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  customerSiteName: string;
  siteAddress: string;
  purpose: string;
  trackingRequired: boolean;
  travelKmRequired: boolean;
  attendanceType: AttendanceType;
  siteLat?: number;
  siteLng?: number;
  allowedRadiusMeters: number;
  notes?: string;
  isPermanentField?: boolean;
  attendanceRecordId?: string;
  status: AssignmentStatus;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocationPoint {
  id: string;
  tripId: string;
  assignmentId: string;
  employeeId: string;
  recordedAt: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  speedMps?: number;
  heading?: number;
  altitude?: number;
  batteryLevel?: number;
  syncedOffline?: boolean;
  uploadStatus?: 'pending' | 'uploaded' | 'failed';
  qualityFlag?: 'high' | 'moderate' | 'low_accuracy' | 'rejected';
  distanceFromPrevMeters?: number;
  isRejected?: boolean;
  rejectionReason?: string;
  source?: string;
  isRoadSnapped?: boolean;
  snappedLat?: number;
  snappedLng?: number;
}

export interface FieldVisitStop {
  id: string;
  tripId: string;
  assignmentId: string;
  employeeId: string;
  stopType: string;
  latitude: number;
  longitude: number;
  address?: string;
  arrivedAt: string;
  departedAt?: string;
  durationSeconds: number;
  notes?: string;
  createdAt: string;
}

export interface FieldVisitDistanceSegment {
  id: string;
  tripId: string;
  segmentType: 'recorded' | 'road_matched' | 'estimated_road' | 'unverified_gap';
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  startTime?: string;
  endTime?: string;
  distanceMeters: number;
  durationSeconds: number;
  polyline?: string;
  coordinates?: [number, number][];
  createdAt: string;
}

export interface FieldTripSession {
  id: string;
  assignmentId: string;
  employeeId: string;
  employeeName: string;
  department: string;
  dutyType: DutyType;
  customerSiteName: string;
  tripStartTime: string;
  tripEndTime?: string;
  startLat: number;
  startLng: number;
  startAddress: string;
  endLat?: number;
  endLng?: number;
  endAddress?: string;
  totalKm: number;
  legacyStoredKm?: number;
  verifiedDistanceMeters?: number;
  estimatedDistanceMeters?: number;
  recordedDistanceMeters?: number;
  roadMatchedDistanceMeters?: number;
  suggestedDistanceMeters?: number;
  unverifiedDistanceMeters?: number;
  gpsDataQuality?: 'Verified' | 'Partial (Gaps Detected)' | 'Insufficient GPS Data';
  missingIntervalsCount?: number;
  missingDurationSeconds?: number;
  rawPointsCount?: number;
  acceptedPointsCount?: number;
  rejectedPointsCount?: number;
  stopCount?: number;
  totalStopDurationSeconds?: number;
  routeGeometry?: string;
  isPermanentField?: boolean;
  attendanceRecordId?: string;
  gpsQuality?: GpsDataQuality | string;
  childVisitsCount?: number;
  childVisits?: FieldAssignment[];
  notes?: string;
  status: TripStatus;
  checkInTime?: string;
  checkOutTime?: string;
  locationPoints: LocationPoint[];
  stops?: FieldVisitStop[];
  segments?: FieldVisitDistanceSegment[];
  gpsStatus: GpsStatus;
  trackingStatus: TrackingStatus;
  lastGpsUpdate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrackingAlert {
  id: string;
  assignmentId?: string;
  employeeId: string;
  employeeName: string;
  department: string;
  alertType: AlertType;
  issueStartTime: string;
  issueEndTime?: string;
  durationMinutes?: number;
  lastKnownLocation?: string;
  lastKnownLat?: number;
  lastKnownLng?: number;
  status: AlertStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TrackingOverviewMetrics {
  fieldEmployeesToday: number;
  currentlyTravelling: number;
  gpsIssues: number;
  totalKmToday: number;
  totalVerifiedKmToday?: number;
  totalEstimatedKmToday?: number;
}
