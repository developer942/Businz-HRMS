// VRM Enterprise HRMS - Field Duty & GPS Tracking Types

export type DutyType = 
  | 'Site Visit' 
  | 'Customer Visit' 
  | 'Vendor Visit' 
  | 'Travel' 
  | 'Field Work' 
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
  | 'Cancelled';

export type TripStatus = 
  | 'Active' 
  | 'Completed' 
  | 'Cancelled';

export type GpsStatus = 
  | 'GPS Active' 
  | 'GPS Lost' 
  | 'GPS Off'
  | 'Low Accuracy'
  | 'No Signal';

export type TrackingStatus = 
  | 'Travelling' 
  | 'Stopped'
  | 'Arrived at destination'
  | 'Offline'
  | 'GPS Signal Weak'
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
  heading?: number;
  altitude?: number;
  batteryLevel?: number;
  syncedOffline?: boolean;
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
  segmentType: 'recorded' | 'road_matched' | 'unverified_gap';
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  distanceMeters: number;
  durationSeconds: number;
  polyline?: string;
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
  recordedDistanceMeters?: number;
  roadMatchedDistanceMeters?: number;
  suggestedDistanceMeters?: number;
  unverifiedDistanceMeters?: number;
  rawPointsCount?: number;
  acceptedPointsCount?: number;
  rejectedPointsCount?: number;
  stopCount?: number;
  totalStopDurationSeconds?: number;
  routeGeometry?: string;
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
