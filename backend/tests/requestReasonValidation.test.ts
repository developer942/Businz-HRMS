import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLeave } from '../src/controllers/leaveController.js';
import { createShiftRequest, updateShiftRequestReason } from '../src/controllers/shiftController.js';
import { leaveRepository } from '../src/repositories/leaveRepository.js';
import { shiftRepository } from '../src/repositories/shiftRepository.js';
import { createLeaveSchema } from '../src/validators/leaveValidators.js';
import { createShiftRequestSchema, updateShiftRequestSchema } from '../src/validators/shiftValidators.js';
import {
  REQUEST_REASON_ERROR_MESSAGE,
  validateRequestReason,
} from '../src/utils/requestValidation.js';
import { validateRequestReason as validateFrontendRequestReason } from '../../frontend/src/utils/requestValidation';

const invalidReasons: unknown[] = [
  '',
  '   ',
  '\t\t',
  '\n\r',
  '\u200B\u200C\u200D\uFEFF',
  '%#@',
  '!!!...',
  '😀🚀',
  '123456',
  null,
  12345,
];

const leavePayload = (reason: unknown) => ({
  employeeId: 'EMP-001',
  leaveType: 'Casual',
  startDate: '2027-01-10',
  endDate: '2027-01-10',
  reason,
});

const shiftPayload = (reason: unknown) => ({
  employeeName: 'Test Employee',
  currentShift: 'Shift 1',
  requestedShift: 'Shift 2',
  requestedDate: '2027-01-10',
  reason,
});

describe('leave and shift request reason validation', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(invalidReasons)('rejects invalid reason %#', reason => {
    expect(validateRequestReason(reason)).toEqual({
      valid: false,
      error: REQUEST_REASON_ERROR_MESSAGE,
    });
    expect(validateFrontendRequestReason(reason).valid).toBe(false);
    expect(createLeaveSchema.safeParse(leavePayload(reason)).success).toBe(false);
    expect(createShiftRequestSchema.safeParse(shiftPayload(reason)).success).toBe(false);
    expect(updateShiftRequestSchema.safeParse({ reason }).success).toBe(false);
  });

  it.each([
    ['  Family medical appointment on 21 October.  ', 'Family medical appointment on 21 October.'],
    ['  உடல்நலக் குறைவால் இன்று ஓய்வு தேவை.  ', 'உடல்நலக் குறைவால் இன்று ஓய்வு தேவை.'],
    ['Bus #21 was delayed; I need the 10:30 shift.', 'Bus #21 was delayed; I need the 10:30 shift.'],
  ])('accepts written English/Tamil reasons and trims outer whitespace', (reason, expected) => {
    expect(createLeaveSchema.parse(leavePayload(reason)).reason).toBe(expected);
    expect(createShiftRequestSchema.parse(shiftPayload(reason)).reason).toBe(expected);
    expect(validateFrontendRequestReason(reason)).toEqual({ valid: true, value: expected });
  });

  it('returns a field-specific reason issue', () => {
    const result = createLeaveSchema.safeParse(leavePayload('%#@'));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        path: ['reason'],
        message: REQUEST_REASON_ERROR_MESSAGE,
      }));
    }
  });

  it('does not call leave persistence for an invalid create request', async () => {
    const persistence = vi.spyOn(leaveRepository, 'createLeave');
    const next = vi.fn();
    await createLeave(
      { body: leavePayload('\u200B\uFEFF'), user: { employeeId: 'EMP-001' } } as any,
      {} as any,
      next,
    );
    expect(persistence).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('does not call shift persistence for invalid create or update requests', async () => {
    const createPersistence = vi.spyOn(shiftRepository, 'createShiftRequest');
    const updatePersistence = vi.spyOn(shiftRepository, 'updateShiftRequestReason');
    const createNext = vi.fn();
    const updateNext = vi.fn();

    await createShiftRequest(
      { body: shiftPayload('😀'), user: { employeeId: 'EMP-001', name: 'Test Employee' } } as any,
      {} as any,
      createNext,
    );
    await updateShiftRequestReason(
      { body: { reason: '12345' }, params: { id: 'SR-1' }, user: { employeeId: 'EMP-001' } } as any,
      {} as any,
      updateNext,
    );

    expect(createPersistence).not.toHaveBeenCalled();
    expect(updatePersistence).not.toHaveBeenCalled();
    expect(createNext).toHaveBeenCalledOnce();
    expect(updateNext).toHaveBeenCalledOnce();
  });
});
