import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { punchSchema } from '../src/validators/attendanceValidators.js';
import { calculateHaversineMeters } from '../src/services/geofenceService.js';
import { assertAttendanceTransition, getAttendanceState } from '../src/services/attendanceStateMachine.js';

const fingerprint = (value: string) => createHash('sha256').update(value).digest('hex');

describe('Face Attendance server-authoritative state machine', () => {
  it('requires a durable idempotency key', () => {
    const base = {
      type: 'IN', method: 'Face Scan', locationLat: 13.151968, locationLng: 80.208605,
      photoBase64: `data:image/jpeg;base64,${'A'.repeat(80)}`,
    };
    expect(punchSchema.safeParse(base).success).toBe(false);
    expect(punchSchema.safeParse({ ...base, idempotencyKey: 'attendance-in-1234567890' }).success).toBe(true);
  });

  it('creates CHECKED_IN only and blocks duplicate IN', () => {
    const now = new Date('2026-10-28T03:30:00.000Z');
    expect(assertAttendanceTransition({ type: 'IN', row: null, serverNow: now, newPhotoFingerprint: 'new' })).toBe('CHECKED_IN');
    const row = { check_in: now, check_out: null, check_in_photo: 'photo-in' };
    expect(() => assertAttendanceTransition({ type: 'IN', row, serverNow: now, newPhotoFingerprint: 'new' })).toThrow('Already checked in');
  });

  it('blocks Punch Out until one full server-authoritative hour has elapsed', () => {
    const row = { check_in: '2026-10-28T03:30:00.000Z', check_out: null, check_in_photo: 'photo-in' };
    expect(getAttendanceState(row, new Date('2026-10-28T04:29:59.999Z'))).toBe('CHECKED_IN');
    expect(() => assertAttendanceTransition({
      type: 'OUT', row, serverNow: new Date('2026-10-28T04:29:59.999Z'), newPhotoFingerprint: fingerprint('photo-out'),
      checkInPhotoFingerprint: fingerprint('photo-in'),
    })).toThrow('Punch Out available at');
    expect(getAttendanceState(row, new Date('2026-10-28T04:30:00.000Z'))).toBe('CHECK_OUT_AVAILABLE');
  });

  it('requires a different Punch Out face capture', () => {
    const row = { check_in: '2026-10-28T03:30:00.000Z', check_out: null, check_in_photo: 'same-photo' };
    expect(() => assertAttendanceTransition({
      type: 'OUT', row, serverNow: new Date('2026-10-28T04:30:00.000Z'),
      newPhotoFingerprint: fingerprint('same-photo'), checkInPhotoFingerprint: fingerprint('same-photo'),
    })).toThrow('new face photograph');
    expect(assertAttendanceTransition({
      type: 'OUT', row, serverNow: new Date('2026-10-28T04:30:00.000Z'),
      newPhotoFingerprint: fingerprint('new-photo'), checkInPhotoFingerprint: fingerprint('same-photo'),
    })).toBe('CHECKED_OUT');
  });

  it('handles an overnight shift by elapsed timestamps rather than clock strings', () => {
    const row = { check_in: '2026-10-27T18:30:00.000Z', check_out: null, check_in_photo: 'photo-in' };
    expect(getAttendanceState(row, new Date('2026-10-27T19:30:00.000Z'))).toBe('CHECK_OUT_AVAILABLE');
  });

  it('calculates geofence distance accurately', () => {
    const near = calculateHaversineMeters(13.151968, 80.208605, 13.152050, 80.208650);
    const far = calculateHaversineMeters(13.151968, 80.208605, 13.158000, 80.215000);
    expect(near).toBeLessThan(50);
    expect(far).toBeGreaterThan(500);
  });

  it('supports Flexible attendance method for daily field workers', () => {
    const fieldPunch = {
      type: 'IN',
      method: 'Flexible',
      locationLat: 13.0827,
      locationLng: 80.2707,
      photoBase64: `data:image/jpeg;base64,${'B'.repeat(80)}`,
      idempotencyKey: 'attendance-flexible-field-12345',
      fieldDutyAuthorized: true,
    };
    expect(punchSchema.safeParse(fieldPunch).success).toBe(true);
  });
});
