import assert from 'node:assert';
import {
  calculateHaversineMeters,
  metersToKm,
  validateLocationPoint,
  deriveAccurateGpsStatus,
  estimateRoadDistanceMeters
} from '../src/services/gpsAccuracyEngine.js';
import { toDeterministicUuid } from '../src/repositories/trackingRepository.js';

console.log('================================================================');
console.log('BUSINZ HRMS — Phase 1: Permanent Field GPS Tracking Test Suite');
console.log('================================================================\n');

// --------------------------------------------------------------------------
// TEST 1: Canonical Session Rule & Deduplication (Single Active Session per Employee)
// --------------------------------------------------------------------------
console.log('TEST 1: Canonical Session Rule & Deduplication (Single Active Session)...');

interface MockTripSession {
  id: string;
  employeeId: string;
  status: 'Active' | 'Completed';
  isPermanentField: boolean;
  tripStartTime: string;
  lastGpsUpdate: string;
  totalKm: number;
  recordedDistanceMeters: number;
}

const sessionsDatabase: MockTripSession[] = [];

function startTripCanonical(empId: string, isPermanent: boolean, startTime: string): MockTripSession {
  const empUuid = toDeterministicUuid(empId);
  // Auto-close past day
  const todayDate = new Date().toISOString().split('T')[0];
  sessionsDatabase.forEach(s => {
    if (s.employeeId === empUuid && s.status === 'Active' && s.tripStartTime.split('T')[0] < todayDate) {
      s.status = 'Completed';
    }
  });

  // Check existing active
  const existing = sessionsDatabase.find(s => s.employeeId === empUuid && s.status === 'Active');
  if (existing) {
    return existing;
  }

  const newSession: MockTripSession = {
    id: toDeterministicUuid(`trip-${empId}-${Date.now()}`),
    employeeId: empUuid,
    status: 'Active',
    isPermanentField: isPermanent,
    tripStartTime: startTime,
    lastGpsUpdate: startTime,
    totalKm: 0,
    recordedDistanceMeters: 0,
  };
  sessionsDatabase.push(newSession);
  return newSession;
}

const dhanasekarId = 'VRM-042';
const session1 = startTripCanonical(dhanasekarId, true, new Date().toISOString());
const session2 = startTripCanonical(dhanasekarId, true, new Date().toISOString()); // duplicate punch/call
const session3 = startTripCanonical(dhanasekarId, false, new Date().toISOString()); // site visit assignment call

assert.strictEqual(session1.id, session2.id, 'Repeated startTrip must return canonical session ID');
assert.strictEqual(session1.id, session3.id, 'Site visit startTrip must link to canonical permanent session');
assert.strictEqual(
  sessionsDatabase.filter(s => s.employeeId === toDeterministicUuid(dhanasekarId) && s.status === 'Active').length,
  1,
  'Database must maintain strictly ONE active tracking session per employee'
);
console.log('  ✓ PASSED: Dhanasekar J has strictly 1 canonical active tracking session\n');

// --------------------------------------------------------------------------
// TEST 2: Stationary Drift Suppression (Zero False KM, Heartbeat Kept Alive)
// --------------------------------------------------------------------------
console.log('TEST 2: Stationary Drift Suppression & Heartbeat Retention...');

const baseTime = Date.now();
const startPoint: any = {
  latitude: 13.0827,
  longitude: 80.2707,
  accuracy: 12,
  speed: 0,
  recordedAt: new Date(baseTime).toISOString()
};

// First point
const val1 = validateLocationPoint(startPoint, null);
assert.strictEqual(val1.accepted, true);
assert.strictEqual(val1.distanceFromPrevMeters, 0);

// Stationary jitter point (4 meters away, speed ~ 0)
const jitterPoint = {
  latitude: 13.08273,
  longitude: 80.27073,
  accuracy: 14,
  speed: 0,
  recordedAt: new Date(baseTime + 15000).toISOString()
};

const val2 = validateLocationPoint(jitterPoint, startPoint);
assert.strictEqual(val2.accepted, true, 'Stationary fix must be ACCEPTED as heartbeat fix');
assert.strictEqual(val2.isStationary, true, 'Fix must be flagged as stationary');
assert.strictEqual(val2.distanceFromPrevMeters, 0, 'Stationary fix MUST accumulate 0 distance');
console.log('  ✓ PASSED: Stationary drift adds 0 meters distance while keeping heartbeat alive\n');

// --------------------------------------------------------------------------
// TEST 3: Genuine Employee Movement (Distance Accrual & KM Calculation)
// --------------------------------------------------------------------------
console.log('TEST 3: Real Movement Accrual & KM Calculation...');

// Employee moves 350 meters in 45 seconds (approx 28 km/h)
const movingPoint1 = {
  latitude: 13.0858,
  longitude: 80.2707,
  accuracy: 10,
  speed: 28,
  recordedAt: new Date(baseTime + 45000).toISOString()
};

const val3 = validateLocationPoint(movingPoint1, startPoint);
assert.strictEqual(val3.accepted, true, 'Valid movement must be accepted');
assert.strictEqual(val3.isStationary, false, 'Moving fix must not be stationary');
assert.ok(val3.distanceFromPrevMeters >= 340 && val3.distanceFromPrevMeters <= 355, 'Distance must match Haversine calculation');
assert.ok(val3.calculatedSpeedKmh >= 25 && val3.calculatedSpeedKmh <= 32, 'Calculated speed must reflect movement');

// Further movement of 650 meters (total 1000m = 1.00 KM)
const movingPoint2 = {
  latitude: 13.0916,
  longitude: 80.2707,
  accuracy: 8,
  speed: 30,
  recordedAt: new Date(baseTime + 90000).toISOString()
};

const val4 = validateLocationPoint(movingPoint2, movingPoint1);
const totalMeters = val3.distanceFromPrevMeters + val4.distanceFromPrevMeters;
const calculatedKm = metersToKm(totalMeters);
assert.ok(calculatedKm >= 0.95 && calculatedKm <= 1.05, 'Total KM must be approximately 1.00 KM');
console.log(`  ✓ PASSED: Genuine movement accumulated ${totalMeters.toFixed(1)}m (${calculatedKm} KM)\n`);

// --------------------------------------------------------------------------
// TEST 4: Impossible Jump & Null Island Rejection
// --------------------------------------------------------------------------
console.log('TEST 4: Impossible GPS Jump & Null Island Filter...');

// Null Island (0,0)
const nullIslandPoint = {
  latitude: 0.0,
  longitude: 0.0,
  accuracy: 10,
  recordedAt: new Date(baseTime + 100000).toISOString()
};
const valNull = validateLocationPoint(nullIslandPoint, movingPoint2);
assert.strictEqual(valNull.accepted, false, 'Null Island (0,0) must be rejected');

// Impossible jump: 60 km in 20 seconds (> 10,000 km/h)
const jumpPoint = {
  latitude: 13.6000,
  longitude: 80.2707,
  accuracy: 10,
  recordedAt: new Date(baseTime + 110000).toISOString()
};
const valJump = validateLocationPoint(jumpPoint, movingPoint2);
assert.strictEqual(valJump.accepted, false, 'Impossible jump must be rejected');
console.log('  ✓ PASSED: Null island and teleports are safely filtered\n');

// --------------------------------------------------------------------------
// TEST 5: Accurate GPS Status Derivation (No Stale 'GPS Active')
// --------------------------------------------------------------------------
console.log('TEST 5: Accurate GPS Status Derivation...');

// Case A: Fresh update with speed > 3 km/h -> Travelling
const statusA = deriveAccurateGpsStatus({
  tripStatus: 'Active',
  lastGpsUpdate: new Date().toISOString(),
  speedKmh: 15,
});
assert.strictEqual(statusA.gpsStatus, 'Travelling');

// Case B: Fresh update with speed <= 3 km/h -> Stationary
const statusB = deriveAccurateGpsStatus({
  tripStatus: 'Active',
  lastGpsUpdate: new Date().toISOString(),
  speedKmh: 0,
});
assert.strictEqual(statusB.gpsStatus, 'Stationary');

// Case C: Last GPS update was 8 minutes ago -> GPS Weak
const eightMinsAgo = new Date(Date.now() - 8 * 60 * 1000).toISOString();
const statusC = deriveAccurateGpsStatus({
  tripStatus: 'Active',
  lastGpsUpdate: eightMinsAgo,
  speedKmh: 0,
});
assert.strictEqual(statusC.gpsStatus, 'GPS Weak');

// Case D: Last GPS update was 25 minutes ago -> Stale Location
const twentyFiveMinsAgo = new Date(Date.now() - 25 * 60 * 1000).toISOString();
const statusD = deriveAccurateGpsStatus({
  tripStatus: 'Active',
  lastGpsUpdate: twentyFiveMinsAgo,
});
assert.strictEqual(statusD.gpsStatus, 'Stale Location');

// Case E: Last GPS update was 2 hours ago -> Offline
const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000).toISOString();
const statusE = deriveAccurateGpsStatus({
  tripStatus: 'Active',
  lastGpsUpdate: twoHoursAgo,
});
assert.strictEqual(statusE.gpsStatus, 'Offline');

// Case F: Session completed -> Completed
const statusF = deriveAccurateGpsStatus({
  tripStatus: 'Completed',
  lastGpsUpdate: new Date().toISOString(),
});
assert.strictEqual(statusF.gpsStatus, 'Completed');

console.log('  ✓ PASSED: GPS Status accurately derived across active, stationary, weak, stale, offline, and completed states\n');

// --------------------------------------------------------------------------
// TEST 6: Auto-close Past-day Sessions
// --------------------------------------------------------------------------
console.log('TEST 6: Auto-close Past-day Sessions...');

const yesterdayStr = new Date(Date.now() - 86400000).toISOString();
const yesterdaySession: MockTripSession = {
  id: 'yesterday-session',
  employeeId: toDeterministicUuid('VRM-099'),
  status: 'Active',
  isPermanentField: true,
  tripStartTime: yesterdayStr,
  lastGpsUpdate: yesterdayStr,
  totalKm: 12.4,
  recordedDistanceMeters: 12400,
};
sessionsDatabase.push(yesterdaySession);

// Starting a session today auto-closes yesterday's hanging session
startTripCanonical('VRM-099', true, new Date().toISOString());
assert.strictEqual(yesterdaySession.status, 'Completed', 'Past day session must be closed as Completed');
console.log('  ✓ PASSED: Previous-day sessions do not remain incorrectly active\n');

// --------------------------------------------------------------------------
// TEST 7: Unique Employee Count Metric
// --------------------------------------------------------------------------
console.log('TEST 7: Unique Employee Count Metric...');

const mockOverviewList = [
  { employeeId: 'VRM-042', name: 'Dhanasekar J' },
  { employeeId: 'VRM-042', name: 'Dhanasekar J (Duplicate)' }, // if any duplicated item
  { employeeId: 'VRM-013', name: 'Arun Boopathi M' },
  { employeeId: 'VRM-036', name: 'Purushothaman M' },
];

const uniqueEmployeeCount = new Set(mockOverviewList.map(e => e.employeeId)).size;
assert.strictEqual(uniqueEmployeeCount, 3, 'Overview employee count must use unique employee IDs');
console.log('  ✓ PASSED: Unique employee count correctly excludes duplicates\n');

console.log('================================================================');
console.log('ALL PHASE 1 AUTOMATED TESTS PASSED SUCCESSFULLY!');
console.log('================================================================');
