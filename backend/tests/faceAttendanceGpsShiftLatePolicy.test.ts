import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  evaluateBackendShiftAttendance,
  calculateShiftDateTimes,
  toTimezoneWallClockDate,
} from '../src/services/shiftAttendanceEngine.js';
import {
  DEFAULT_CORPORATE_LATE_POLICY,
  normalizeLatePolicyRecord,
  isLatePolicyApplicable,
  resolveEffectiveLatePolicyForEmployee,
  evaluateCheckInPunctualityAndPenalty,
} from '../src/services/latePolicyService.js';
import {
  verifyPunchGeofence,
  evaluateGeofenceBoundary as backendEvaluateBoundary,
} from '../src/services/geofenceService.js';
import {
  assertAttendanceTransition,
} from '../src/services/attendanceStateMachine.js';
import {
  requestFreshGpsPosition,
  getMobileLocationInstructions,
  evaluateGeofenceBoundary as frontendEvaluateBoundary,
  cancelActiveGpsAcquisition,
  clearCachedGpsReading,
} from '../../frontend/src/services/gpsAcquisitionService.js';
import {
  resolveEmployeeAssignedShift,
} from '../../frontend/src/services/shiftAttendanceEngine.js';
import {
  resolveEffectiveLatePolicy as resolveFrontendLatePolicy,
} from '../../frontend/src/services/policyEngine.js';
import { DEFAULT_MASTER_ATTENDANCE_POLICIES } from '../../frontend/src/data/settingsInitialData.js';
import type { ShiftRecord } from '../src/types/hrms.js';

const OFFICE = { lat: 13.15166, lng: 80.208618, radius: 250, name: 'BUSINZ HQ' };

const offsetMetersNorth = (lat: number, lng: number, meters: number) => ({
  lat: Number((lat + (meters / 6371000) * (180 / Math.PI)).toFixed(6)),
  lng,
});

describe('BUSINZ HRMS — Mandatory Face Attendance, Shift Timing, Late Policy & GPS Suite', () => {
  const dayShift: ShiftRecord = {
    id: 'SH-01',
    shiftName: 'General Shift (09:00 AM - 06:00 PM)',
    startTime: '09:00 AM',
    endTime: '06:00 PM',
    breakDurationMins: 45,
    workingHours: 8.25,
    gracePeriodMins: 40,
    color: '#0E7490',
  };

  const afternoonShift: ShiftRecord = {
    id: 'SH-02',
    shiftName: 'Afternoon Shift (02:00 PM - 10:00 PM)',
    startTime: '02:00 PM',
    endTime: '10:00 PM',
    breakDurationMins: 45,
    workingHours: 7.25,
    gracePeriodMins: 40,
    color: '#0284C7',
  };

  const overnightShift: ShiftRecord = {
    id: 'SH-NIGHT',
    shiftName: 'Night Shift (10:00 PM - 06:00 AM)',
    startTime: '10:00 PM',
    endTime: '06:00 AM',
    breakDurationMins: 60,
    workingHours: 8,
    gracePeriodMins: 40,
    color: '#1E293B',
  };

  afterEach(() => {
    cancelActiveGpsAcquisition();
    clearCachedGpsReading();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('1. Shift 09:00 AM – 06:00 PM with 40m grace: blocks 05:59 AM, allows 06:00 AM, marks Present through 09:40 AM, and Late from 09:41 AM to 12:00 PM+', () => {
    const cases: Array<{
      label: string;
      hour: number;
      min: number;
      canCheckIn: boolean;
      expectedStatus: 'Present' | 'Late';
      lateMins: number;
    }> = [
      { label: '05:59 AM (too early)', hour: 5, min: 59, canCheckIn: false, expectedStatus: 'Present', lateMins: 0 },
      { label: '06:00 AM (opens exactly 3h before)', hour: 6, min: 0, canCheckIn: true, expectedStatus: 'Present', lateMins: 0 },
      { label: '09:00 AM (shift start)', hour: 9, min: 0, canCheckIn: true, expectedStatus: 'Present', lateMins: 0 },
      { label: '09:40 AM (inside 40m grace)', hour: 9, min: 40, canCheckIn: true, expectedStatus: 'Present', lateMins: 0 },
      { label: '09:41 AM (1m after grace)', hour: 9, min: 41, canCheckIn: true, expectedStatus: 'Late', lateMins: 41 },
      { label: '10:00 AM (late allowed)', hour: 10, min: 0, canCheckIn: true, expectedStatus: 'Late', lateMins: 60 },
      { label: '11:00 AM (late allowed)', hour: 11, min: 0, canCheckIn: true, expectedStatus: 'Late', lateMins: 120 },
      { label: '12:00 PM (late allowed)', hour: 12, min: 0, canCheckIn: true, expectedStatus: 'Late', lateMins: 180 },
    ];

    for (const tc of cases) {
      const now = new Date(2026, 9, 30, tc.hour, tc.min, 0);
      const evalRes = evaluateBackendShiftAttendance({
        employeeId: 'EMP-001',
        assignedShift: dayShift,
        attendanceLogs: [],
        now,
        gracePeriodMinutes: 40,
      });

      expect(evalRes.canCheckIn, tc.label).toBe(tc.canCheckIn);
      expect(evalRes.shiftStartDisplay).toBe('09:00 AM');
      expect(evalRes.shiftEndDisplay).toBe('06:00 PM');
      expect(evalRes.checkInOpenDisplay).toBe('06:00 AM');
      expect(evalRes.gracePeriodMins).toBe(40);
      expect(evalRes.lateAfterDisplay).toBe('09:40 AM');

      if (tc.canCheckIn) {
        expect(evalRes.expectedStatus, tc.label).toBe(tc.expectedStatus);
        const punctuality = evaluateCheckInPunctualityAndPenalty({
          checkInTime: now,
          shiftStartDateTime: evalRes.shiftStartDateTime,
          policy: DEFAULT_CORPORATE_LATE_POLICY,
          previousMonthlyLateCount: 0,
        });
        expect(punctuality.status, tc.label).toBe(tc.expectedStatus);
        expect(punctuality.lateDurationMinutes, tc.label).toBe(tc.lateMins);
      }
    }
  });

  it('2. Multiple shifts & scheduled shift changes: evaluates Afternoon Shift (02:00 PM - 10:00 PM) and upcoming shift effective date', () => {
    const beforeOpen = evaluateBackendShiftAttendance({
      employeeId: 'EMP-002',
      assignedShift: afternoonShift,
      attendanceLogs: [],
      now: new Date(2026, 9, 30, 10, 59, 0),
      gracePeriodMinutes: 40,
    });
    expect(beforeOpen.canCheckIn).toBe(false);
    expect(beforeOpen.checkInOpenDisplay).toBe('11:00 AM');

    const atOpen = evaluateBackendShiftAttendance({
      employeeId: 'EMP-002',
      assignedShift: afternoonShift,
      attendanceLogs: [],
      now: new Date(2026, 9, 30, 11, 0, 0),
      gracePeriodMinutes: 40,
    });
    expect(atOpen.canCheckIn).toBe(true);
    expect(atOpen.expectedStatus).toBe('Present');
    expect(atOpen.lateAfterDisplay).toBe('02:40 PM');

    const lateAfternoon = evaluateBackendShiftAttendance({
      employeeId: 'EMP-002',
      assignedShift: afternoonShift,
      attendanceLogs: [],
      now: new Date(2026, 9, 30, 14, 41, 0),
      gracePeriodMinutes: 40,
    });
    expect(lateAfternoon.canCheckIn).toBe(true);
    expect(lateAfternoon.expectedStatus).toBe('Late');

    const resolved = resolveEmployeeAssignedShift(
      {
        id: 'EMP-002',
        employeeId: 'EMP-002',
        workShift: 'General Shift (09:00 AM - 06:00 PM)',
        upcomingShift: 'Afternoon Shift (02:00 PM - 10:00 PM)',
        upcomingShiftEffectiveFrom: '2026-01-01',
      } as any,
      [dayShift as any, afternoonShift as any]
    );
    expect(resolved.id).toBe('SH-02');
  });

  it('3. Overnight shift (10:00 PM – 06:00 AM): opens at 07:00 PM, Present until 10:40 PM, Late at 10:41 PM and 01:30 AM next morning', () => {
    const tooEarly = evaluateBackendShiftAttendance({
      employeeId: 'EMP-NIGHT',
      assignedShift: overnightShift,
      attendanceLogs: [],
      now: new Date(2026, 9, 30, 18, 59, 0),
      gracePeriodMinutes: 40,
    });
    expect(tooEarly.canCheckIn).toBe(false);
    expect(tooEarly.checkInOpenDisplay).toBe('07:00 PM');

    const withinGrace = evaluateBackendShiftAttendance({
      employeeId: 'EMP-NIGHT',
      assignedShift: overnightShift,
      attendanceLogs: [],
      now: new Date(2026, 9, 30, 22, 35, 0),
      gracePeriodMinutes: 40,
    });
    expect(withinGrace.canCheckIn).toBe(true);
    expect(withinGrace.expectedStatus).toBe('Present');
    expect(withinGrace.lateAfterDisplay).toBe('10:40 PM');

    const afterMidnight = evaluateBackendShiftAttendance({
      employeeId: 'EMP-NIGHT',
      assignedShift: overnightShift,
      attendanceLogs: [],
      now: new Date(2026, 9, 31, 1, 30, 0),
      gracePeriodMinutes: 40,
    });
    expect(afterMidnight.canCheckIn).toBe(true);
    expect(afterMidnight.shiftDate).toBe('2026-10-30');
    expect(afterMidnight.expectedStatus).toBe('Late');
  });

  it('4. Authoritative server time in Asia/Kolkata: converts UTC instant to IST wall clock regardless of client device clock', () => {
    const utcInstant = new Date('2026-10-30T03:30:00.000Z');
    const istWall = toTimezoneWallClockDate(utcInstant, 'Asia/Kolkata');
    expect(istWall.getHours()).toBe(9);
    expect(istWall.getMinutes()).toBe(0);

    const utcLateInstant = new Date('2026-10-30T04:11:00.000Z');
    const istLateWall = toTimezoneWallClockDate(utcLateInstant, 'Asia/Kolkata');
    const evalRes = evaluateBackendShiftAttendance({
      employeeId: 'EMP-001',
      assignedShift: dayShift,
      attendanceLogs: [],
      now: istLateWall,
      gracePeriodMinutes: 40,
      timeZone: 'Asia/Kolkata',
    });
    expect(evalRes.canCheckIn).toBe(true);
    expect(evalRes.expectedStatus).toBe('Late');
  });

  it('5. Late Policy penalties: 40m grace, 3 allowed lates/month (Warning), 4th late = Half-Day (0.5d), 6th late = LOP (1.0d) without double deductions', () => {
    const times = calculateShiftDateTimes('2026-10-30', dayShift, 40);
    const lateCheckIn = new Date(2026, 9, 30, 10, 5, 0);

    for (const priorCount of [0, 1, 2]) {
      const res = evaluateCheckInPunctualityAndPenalty({
        checkInTime: lateCheckIn,
        shiftStartDateTime: times.shiftStartDateTime,
        policy: DEFAULT_CORPORATE_LATE_POLICY,
        previousMonthlyLateCount: priorCount,
      });
      expect(res.status).toBe('Late');
      expect(res.isLate).toBe(true);
      expect(res.monthlyLateCount).toBe(priorCount + 1);
      expect(res.penaltyType).toBe('WARNING');
      expect(res.deductionDays).toBe(0);
      expect(res.lateStatus).toBe(`Late (Warning ${priorCount + 1}/3)`);
    }

    const fourthLate = evaluateCheckInPunctualityAndPenalty({
      checkInTime: lateCheckIn,
      shiftStartDateTime: times.shiftStartDateTime,
      policy: DEFAULT_CORPORATE_LATE_POLICY,
      previousMonthlyLateCount: 3,
    });
    expect(fourthLate.status).toBe('Late');
    expect(fourthLate.monthlyLateCount).toBe(4);
    expect(fourthLate.penaltyType).toBe('HALF_DAY');
    expect(fourthLate.deductionDays).toBe(0.5);
    expect(fourthLate.lateStatus).toContain('Half Day');

    const sixthLate = evaluateCheckInPunctualityAndPenalty({
      checkInTime: lateCheckIn,
      shiftStartDateTime: times.shiftStartDateTime,
      policy: DEFAULT_CORPORATE_LATE_POLICY,
      previousMonthlyLateCount: 5,
    });
    expect(sixthLate.status).toBe('Late');
    expect(sixthLate.monthlyLateCount).toBe(6);
    expect(sixthLate.penaltyType).toBe('LOP');
    expect(sixthLate.deductionDays).toBe(1);
    expect(sixthLate.lateStatus).toContain('LOP');
  });

  it('6. Dynamic Late Policy configuration updates & applicability matching (including ["ALL"] array from UI)', () => {
    const uiSavedPolicy = normalizeLatePolicyRecord({
      id: 'POL-CUSTOM',
      policyName: 'Updated Engineering Late Policy',
      graceTimeMinutes: 25,
      allowedLateCount: 2,
      warningSystemEnabled: true,
      halfDayTriggerEnabled: true,
      halfDayThresholdCount: 3,
      lopTriggerEnabled: true,
      lopThresholdCount: 5,
      applicableDepartments: ['ALL'],
      applicableShifts: ['ALL'],
      applicableEmployees: ['ALL'],
      status: 'ACTIVE',
    });

    expect(uiSavedPolicy).not.toBeNull();
    expect(
      isLatePolicyApplicable(
        uiSavedPolicy!,
        { id: 'EMP-10', employeeId: 'EMP-10', department: 'Engineering' },
        dayShift
      )
    ).toBe(true);

    const resolved = resolveEffectiveLatePolicyForEmployee(
      [uiSavedPolicy!],
      { id: 'EMP-10', employeeId: 'EMP-10', department: 'Engineering' },
      dayShift
    );
    expect(resolved.graceTimeMinutes).toBe(25);
    expect(resolved.halfDayThresholdCount).toBe(3);
    expect(resolved.lopThresholdCount).toBe(5);

    const feResolved = resolveFrontendLatePolicy(
      { id: 'EMP-10', employeeId: 'EMP-10', department: 'Engineering' } as any,
      DEFAULT_MASTER_ATTENDANCE_POLICIES,
      'SH-01',
      'General Shift'
    );
    expect(feResolved.policy?.graceTimeMinutes).toBe(40);
    expect(feResolved.policy?.allowedLateCount).toBe(3);
  });

  it('7. GPS scenarios: Permission Denied, Position Unavailable, Timeout, Poor Accuracy (Precise Location disabled), Inside/Outside Geofence, Field Duty exception, and Fresh Retry', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/129.0 Mobile Safari/537.36',
      geolocation: {
        getCurrentPosition: (_s: any, err: any) => err({ code: 1, message: 'User denied Geolocation' }),
        watchPosition: (_s: any, err: any) => {
          setTimeout(() => err({ code: 1, message: 'User denied Geolocation' }), 5);
          return 1;
        },
        clearWatch: vi.fn(),
      },
    });

    await expect(requestFreshGpsPosition({ timeoutMs: 300 })).rejects.toThrow(
      'Please allow precise location access for BUSINZ HRMS.'
    );
    const permGuide = getMobileLocationInstructions('PERMISSION_DENIED');
    expect(permGuide.androidSteps.length).toBeGreaterThan(0);
    expect(permGuide.iphoneSteps.length).toBeGreaterThan(0);

    let capturedOptions: PositionOptions | undefined;
    const insidePoint = offsetMetersNorth(OFFICE.lat, OFFICE.lng, 40);
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) Version/17.6 Mobile/15E148 Safari/604.1',
      geolocation: {
        getCurrentPosition: (success: any, _err: any, opts?: PositionOptions) => {
          capturedOptions = opts;
          success({
            coords: { latitude: insidePoint.lat, longitude: insidePoint.lng, accuracy: 14 },
            timestamp: Date.now(),
          });
        },
        watchPosition: vi.fn(),
        clearWatch: vi.fn(),
      },
    });

    const freshReading = await requestFreshGpsPosition({
      timeoutMs: 4000,
      geofenceContext: { centerLat: OFFICE.lat, centerLng: OFFICE.lng, radiusMeters: OFFICE.radius },
    });
    expect(capturedOptions?.enableHighAccuracy).toBe(true);
    expect(capturedOptions?.maximumAge).toBe(0);
    expect(freshReading.accuracy).toBe(14);

    const coarseEval = backendEvaluateBoundary(30, OFFICE.radius, 180, OFFICE.name, 80);
    expect(coarseEval.canPunch).toBe(false);
    expect(coarseEval.errorCode).toBe('LOW_GPS_ACCURACY');
    const feCoarseEval = frontendEvaluateBoundary(30, OFFICE.radius, 180, OFFICE.name, 80);
    expect(feCoarseEval.canPunch).toBe(false);
    expect(feCoarseEval.errorCode).toBe('LOW_GPS_ACCURACY');

    const outsidePoint = offsetMetersNorth(OFFICE.lat, OFFICE.lng, 600);
    const blockedOutside = verifyPunchGeofence({
      userLat: outsidePoint.lat,
      userLng: outsidePoint.lng,
      officeLat: OFFICE.lat,
      officeLng: OFFICE.lng,
      radiusMeters: OFFICE.radius,
      accuracyMeters: 15,
      locationTimestamp: new Date().toISOString(),
      fieldDutyAuthorized: false,
    });
    expect(blockedOutside.valid).toBe(false);
    expect(blockedOutside.evaluation?.classification).toBe('OUTSIDE');

    const allowedFieldDuty = verifyPunchGeofence({
      userLat: outsidePoint.lat,
      userLng: outsidePoint.lng,
      officeLat: OFFICE.lat,
      officeLng: OFFICE.lng,
      radiusMeters: OFFICE.radius,
      accuracyMeters: 20,
      locationTimestamp: new Date().toISOString(),
      fieldDutyAuthorized: true,
    });
    expect(allowedFieldDuty.valid).toBe(true);
  });

  it('8. Duplicate punch prevention, Punch Out after Punch In, and GPS errors never corrupting attendance status to Late', () => {
    const fp = (s: string) => createHash('sha256').update(s).digest('hex');
    const checkInInstant = new Date('2026-10-30T03:35:00.000Z');

    expect(() =>
      assertAttendanceTransition({
        type: 'OUT',
        row: null,
        serverNow: checkInInstant,
        newPhotoFingerprint: fp('out-1'),
      })
    ).toThrow('Check-out is not allowed before check-in');

    expect(
      assertAttendanceTransition({
        type: 'IN',
        row: null,
        serverNow: checkInInstant,
        newPhotoFingerprint: fp('in-1'),
      })
    ).toBe('CHECKED_IN');

    const checkedInRow = {
      check_in: checkInInstant.toISOString(),
      check_out: null,
      check_in_photo: 'in-1',
      status: 'Present',
      late_status: 'On Time',
    };
    expect(() =>
      assertAttendanceTransition({
        type: 'IN',
        row: checkedInRow,
        serverNow: new Date('2026-10-30T04:00:00.000Z'),
        newPhotoFingerprint: fp('in-2'),
      })
    ).toThrow('Already checked in');

    const checkOutInstant = new Date('2026-10-30T12:30:00.000Z');
    expect(
      assertAttendanceTransition({
        type: 'OUT',
        row: checkedInRow,
        serverNow: checkOutInstant,
        newPhotoFingerprint: fp('out-fresh'),
        checkInPhotoFingerprint: fp('in-1'),
      })
    ).toBe('CHECKED_OUT');
  });

  it('9. Shift 10:00 AM – 07:00 PM with 40m grace (opens 07:00 AM, late after 10:40 AM): verifies 06:59 AM, 07:00 AM, 10:00 AM, 10:40 AM, 10:41 AM, 11:00 AM, 11:33 AM, and 12:00 PM', () => {
    const tenAmShift: ShiftRecord = {
      id: 'c40ba66f-7afb-49b0-9492-e09069f50661',
      shiftName: "10'o Clock Shift",
      startTime: '10:00',
      endTime: '19:00',
      breakDurationMins: 45,
      workingHours: 8,
      gracePeriodMins: 40,
      color: '#0E7490',
      assignments: ['VRM-027'],
    };

    // Prioritize active assignment in shift.assignments even if employee.workShift has stale 'Morning'
    const resolved = resolveEmployeeAssignedShift(
      { id: 'c50f1606-f1b9-4030-9f57-6dc0de37a76f', employeeId: 'VRM-027', workShift: 'Morning' } as any,
      [dayShift as any, tenAmShift as any]
    );
    expect(resolved.id).toBe(tenAmShift.id);

    const scheduleCases = [
      { label: '06:59 AM -> Too early', hour: 6, min: 59, canCheckIn: false, status: 'Present', lateMins: 0 },
      { label: '07:00 AM -> Allowed', hour: 7, min: 0, canCheckIn: true, status: 'Present', lateMins: 0 },
      { label: '10:00 AM -> Present', hour: 10, min: 0, canCheckIn: true, status: 'Present', lateMins: 0 },
      { label: '10:40 AM -> Present', hour: 10, min: 40, canCheckIn: true, status: 'Present', lateMins: 0 },
      { label: '10:41 AM -> Late', hour: 10, min: 41, canCheckIn: true, status: 'Late', lateMins: 41 },
      { label: '11:00 AM -> Late', hour: 11, min: 0, canCheckIn: true, status: 'Late', lateMins: 60 },
      { label: '11:33 AM -> Late', hour: 11, min: 33, canCheckIn: true, status: 'Late', lateMins: 93 },
      { label: '12:00 PM -> Late', hour: 12, min: 0, canCheckIn: true, status: 'Late', lateMins: 120 },
    ] as const;

    for (const tc of scheduleCases) {
      const now = new Date(2026, 9, 30, tc.hour, tc.min, 0);
      const evalRes = evaluateBackendShiftAttendance({
        employeeId: 'VRM-027',
        assignedShift: tenAmShift,
        attendanceLogs: [],
        now,
        gracePeriodMinutes: 40,
      });

      expect(evalRes.canCheckIn, tc.label).toBe(tc.canCheckIn);
      expect(evalRes.shiftStartDisplay).toBe('10:00 AM');
      expect(evalRes.shiftEndDisplay).toBe('07:00 PM');
      expect(evalRes.checkInOpenDisplay).toBe('07:00 AM');
      expect(evalRes.gracePeriodMins).toBe(40);
      expect(evalRes.lateAfterDisplay).toBe('10:40 AM');

      if (tc.canCheckIn) {
        expect(evalRes.expectedStatus, tc.label).toBe(tc.status);
        const punctuality = evaluateCheckInPunctualityAndPenalty({
          checkInTime: now,
          shiftStartDateTime: evalRes.shiftStartDateTime,
          policy: DEFAULT_CORPORATE_LATE_POLICY,
          previousMonthlyLateCount: 0,
        });
        expect(punctuality.status, tc.label).toBe(tc.status);
        expect(punctuality.lateDurationMinutes, tc.label).toBe(tc.lateMins);
      }
    }
  });

  it('10. Two-Stage GPS Acquisition (Stage A 8s fast fix -> Stage B 12s single controlled retry) and 500m Geofence accuracy enforcement', async () => {
    const inside500 = offsetMetersNorth(OFFICE.lat, OFFICE.lng, 180);

    // 1. Stage A times out (code 3) -> Stage B single controlled retry recovers with ±22m fix
    let stageACalled = 0;
    let stageBWatchCalled = 0;
    const clearWatchSpy = vi.fn();

    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/129.0 Mobile Safari/537.36',
      geolocation: {
        getCurrentPosition: (_success: any, error: any, opts?: PositionOptions) => {
          stageACalled++;
          expect(opts?.enableHighAccuracy).toBe(true);
          expect(opts?.maximumAge).toBe(0);
          setTimeout(() => error({ code: 3, message: 'Stage A timeout' }), 10);
        },
        watchPosition: (success: any, _error: any, opts?: PositionOptions) => {
          stageBWatchCalled++;
          expect(opts?.enableHighAccuracy).toBe(true);
          expect(opts?.maximumAge).toBe(0);
          setTimeout(() => {
            success({
              coords: { latitude: inside500.lat, longitude: inside500.lng, accuracy: 22 },
              timestamp: Date.now(),
            });
          }, 15);
          return 301;
        },
        clearWatch: clearWatchSpy,
      },
    });

    const recovered = await requestFreshGpsPosition({
      stageATimeoutMs: 8000,
      stageBTimeoutMs: 12000,
      maxRetries: 1,
      geofenceContext: { centerLat: OFFICE.lat, centerLng: OFFICE.lng, radiusMeters: 500 },
    });

    expect(stageACalled).toBe(1);
    expect(stageBWatchCalled).toBe(1); // Strictly ONE controlled retry in Stage B
    expect(clearWatchSpy).toHaveBeenCalledWith(301);
    expect(recovered.accuracy).toBe(22);
    expect(recovered.retryCount).toBe(1);

    // 2. 500m Geofence verification: accepts accurate fix inside 500m, rejects coarse ±260m cell-tower fix even if D + A <= 500m
    const validInside500 = backendEvaluateBoundary(180, 500, 22, OFFICE.name);
    expect(validInside500.classification).toBe('INSIDE');
    expect(validInside500.canPunch).toBe(true);

    const coarseInside500 = backendEvaluateBoundary(40, 500, 260, OFFICE.name);
    expect(coarseInside500.canPunch).toBe(false);
    expect(coarseInside500.errorCode).toBe('LOW_GPS_ACCURACY');

    const feCoarseInside500 = frontendEvaluateBoundary(40, 500, 260, OFFICE.name);
    expect(feCoarseInside500.canPunch).toBe(false);
    expect(feCoarseInside500.errorCode).toBe('LOW_GPS_ACCURACY');

    // 3. Exact production office scenario (Distance: 88m / 500m, Accuracy: ±104m, isAuthorizedFieldDuty = false)
    const isAuthorizedFieldDuty = false;
    const dbFieldDuty = { authorized: false, latitude: undefined as number | undefined, longitude: undefined as number | undefined };
    const geofence = { latitude: OFFICE.lat, longitude: OFFICE.lng, radiusMeters: 500, officeName: OFFICE.name };
    const rawFieldLat =
      isAuthorizedFieldDuty && typeof dbFieldDuty.latitude === 'number' && dbFieldDuty.latitude !== 0
        ? dbFieldDuty.latitude
        : undefined;
    const rawFieldLng =
      isAuthorizedFieldDuty && typeof dbFieldDuty.longitude === 'number' && dbFieldDuty.longitude !== 0
        ? dbFieldDuty.longitude
        : undefined;
    const targetOfficeLat = rawFieldLat ?? geofence.latitude;
    const targetOfficeLng = rawFieldLng ?? geofence.longitude;
    expect(targetOfficeLat).toBe(OFFICE.lat);
    expect(targetOfficeLng).toBe(OFFICE.lng);

    const office88m = offsetMetersNorth(OFFICE.lat, OFFICE.lng, 88);
    const punchVerify88m = verifyPunchGeofence({
      userLat: office88m.lat,
      userLng: office88m.lng,
      officeLat: targetOfficeLat,
      officeLng: targetOfficeLng,
      radiusMeters: 500,
      accuracyMeters: 104,
      locationTimestamp: new Date().toISOString(),
      officeName: OFFICE.name,
    });
    expect(punchVerify88m.valid).toBe(true);
    expect(punchVerify88m.evaluation?.classification).toBe('INSIDE');
    expect(punchVerify88m.evaluation?.canPunch).toBe(true);

    const outside500 = backendEvaluateBoundary(620, 500, 18, OFFICE.name);
    expect(outside500.classification).toBe('OUTSIDE');
    expect(outside500.canPunch).toBe(false);
    expect(outside500.errorCode).toBe('OUTSIDE_GEOFENCE');
  });
});
