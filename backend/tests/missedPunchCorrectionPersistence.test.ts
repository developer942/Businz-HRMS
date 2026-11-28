import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockGetEmployeeById, mockRecordLog } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockGetEmployeeById: vi.fn(),
  mockRecordLog: vi.fn(),
}));

vi.mock('../src/config/database.js', () => ({
  query: mockQuery,
}));

vi.mock('../src/repositories/employeeRepository.js', () => ({
  employeeRepository: {
    getEmployeeById: mockGetEmployeeById,
  },
}));

vi.mock('../src/repositories/auditRepository.js', () => ({
  auditRepository: {
    recordLog: mockRecordLog,
  },
}));

import {
  correctAttendance,
  mapCorrectionStatusToDbEnum,
} from '../src/controllers/attendanceController.js';

const LIVE_PG_HR_ATTENDANCE_STATUS_ENUM = new Set([
  'Present',
  'Absent',
  'Late',
  'Half Day',
  'Work From Home',
  'On Leave',
  'Holiday',
  'Week Off',
  'Missing Punch',
]);

function makeMockRes() {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe('Missed Punch-Out (MU) Attendance Correction Persistence', () => {
  const empUuid = '1d48e994-b05e-437d-9b6a-4a56cc5f3b93';
  const existingRowId = 'b62a8169-774c-4e38-b93b-6c0f7970a0ad';

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEmployeeById.mockResolvedValue({
      id: empUuid,
      employeeId: 'VRM-044',
      firstName: 'Shinodh G',
      lastName: 'kurup',
    });
    mockRecordLog.mockResolvedValue(undefined);
  });

  it('maps every supported correction status strictly into the live PostgreSQL hr_attendance_status enum', () => {
    const allUiStatuses = [
      'Present',
      'Late',
      'Half Day',
      'Paid Leave',
      'On Leave',
      'Unpaid Leave',
      'Absent',
      'Holiday',
      'Week Off',
      'Work From Home',
      'Field Visit',
      'Missing Punch',
      'Missed Punch-Out',
      'MU',
    ];

    for (const status of allUiStatuses) {
      const mapped = mapCorrectionStatusToDbEnum(status);
      expect(LIVE_PG_HR_ATTENDANCE_STATUS_ENUM.has(mapped.dbStatus)).toBe(true);
    }

    expect(mapCorrectionStatusToDbEnum('MU').dbStatus).toBe('Missing Punch');
    expect(mapCorrectionStatusToDbEnum('Missed Punch-Out').dbStatus).toBe('Missing Punch');
    expect(mapCorrectionStatusToDbEnum('Field Visit')).toEqual({
      dbStatus: 'Present',
      dbMethod: 'Field Visit',
      lateStatus: 'On Time',
    });
    expect(mapCorrectionStatusToDbEnum('Unpaid Leave')).toEqual({
      dbStatus: 'Absent',
      dbMethod: 'Unpaid Leave',
      lateStatus: 'N/A',
    });
  });

  it('regularizes an existing MU record when check-out time is supplied without UUID 22P02 error', async () => {
    mockQuery
      // 1. Existing record SELECT
      .mockResolvedValueOnce({
        rows: [
          {
            id: existingRowId,
            employee_id: empUuid,
            date: '2026-11-12',
            shift_date: '2026-11-12',
            status: 'Missing Punch',
            check_in: '2026-11-12T04:34:00.000Z',
            check_out: null,
            working_hours: 0,
          },
        ],
      })
      // 2. UPDATE RETURNING *
      .mockResolvedValueOnce({
        rows: [
          {
            id: existingRowId,
            employee_id: empUuid,
            date: '2026-11-12',
            shift_date: '2026-11-12',
            status: 'Present',
            check_in: '2026-11-12T04:34:00.000Z',
            check_out: '2026-11-12T13:00:00.000Z',
            working_hours: 8.43,
            calculated_ot_hours: 0,
            late_status: 'On Time',
            method: 'Manual Punch',
          },
        ],
      });

    const req: any = {
      user: { email: 'ceo@vrm.com', role: 'CEO', employeeId: 'VRM-001' },
      body: {
        employeeId: 'VRM-044',
        date: '2026-11-12',
        status: 'MU', // Even if caller left status as MU while supplying check-out time
        checkIn: '10:04 AM',
        checkOut: '06:30 PM',
        reason: 'Regularized from Muster Roll',
      },
    };
    const res = makeMockRes();
    const next = vi.fn();

    await correctAttendance(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.record.id).toBe(existingRowId);
    expect(res.body.data.record.status).toBe('Present');

    // Verify SELECT did NOT pass non-UUID 'VRM-044' into UUID column
    expect(mockQuery).toHaveBeenCalledTimes(2);
    const [selectSql, selectParams] = mockQuery.mock.calls[0];
    expect(selectSql).toContain('employee_id = $1::uuid');
    expect(selectParams).toEqual([empUuid, '2026-11-12']);

    // Verify UPDATE used canonical PG enum + ISO TIMESTAMPTZ values + updated existing row
    const [updateSql, updateParams] = mockQuery.mock.calls[1];
    expect(updateSql).toContain('UPDATE public.attendance_records');
    expect(updateParams[0]).toBe('Present');
    expect(updateParams[1]).toBe('2026-11-12T04:34:00.000Z'); // 10:04 AM IST -> 04:34 UTC
    expect(updateParams[2]).toBe('2026-11-12T13:00:00.000Z'); // 06:30 PM IST -> 13:00 UTC
    expect(updateParams[3]).toBeCloseTo(8.43, 2);
    expect(updateParams[8]).toBe(existingRowId);
  });

  it('converts single check-in time to ISO TIMESTAMPTZ and saves valid Missing Punch enum when keeping MU', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: existingRowId,
            employee_id: empUuid,
            date: '2026-11-12',
            shift_date: '2026-11-12',
            status: 'Missing Punch',
            check_in: '2026-11-12T04:34:00.000Z',
            check_out: null,
            working_hours: 0,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: existingRowId,
            employee_id: empUuid,
            date: '2026-11-12',
            shift_date: '2026-11-12',
            status: 'Missing Punch',
            check_in: '2026-11-12T04:15:00.000Z',
            check_out: null,
            working_hours: 0,
            calculated_ot_hours: 0,
            late_status: 'N/A',
            method: 'Manual Punch',
          },
        ],
      });

    const req: any = {
      user: { email: 'hr@vrm.com', role: 'HR', employeeId: 'VRM-002' },
      body: {
        employeeId: empUuid,
        date: '2026-11-12',
        status: 'Missed Punch-Out',
        checkIn: '09:45 AM',
        checkOut: null,
        reason: 'Adjusted check-in time',
      },
    };
    const res = makeMockRes();
    const next = vi.fn();

    await correctAttendance(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    const [, updateParams] = mockQuery.mock.calls[1];
    expect(updateParams[0]).toBe('Missing Punch');
    expect(updateParams[1]).toBe('2026-11-12T04:15:00.000Z'); // 09:45 AM IST -> 04:15 UTC
    expect(updateParams[2]).toBeNull();
    expect(updateParams[3]).toBe(0);
  });

  it('propagates PostgreSQL persistence errors instead of returning a fake 200 OK', async () => {
    const dbError = new Error('connection terminated unexpectedly');
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(dbError);

    const req: any = {
      user: { email: 'ceo@vrm.com', role: 'CEO', employeeId: 'VRM-001' },
      body: {
        employeeId: 'VRM-044',
        date: '2026-11-12',
        status: 'Present',
        checkIn: '10:04 AM',
        checkOut: '06:30 PM',
        reason: 'Regularized from Muster Roll',
      },
    };
    const res = makeMockRes();
    const next = vi.fn();

    await correctAttendance(req, res, next);

    expect(next).toHaveBeenCalledWith(dbError);
    expect(res.body).toBeNull();
  });
});
