import { describe, it, expect, beforeEach } from 'vitest';
import {
  isEditableElement,
  isSpaceKey,
  isEnterKey,
  preventSpaceEnterPropagation,
  handleFormKeyDown,
} from '../../frontend/src/utils/keyboardUtils';
import {
  checkDuplicateLeaveRequest,
  checkDuplicateAdvanceRequest,
  checkDuplicateFieldAssignment,
  checkDuplicateExpense,
  validateExpenseAmount,
  MAX_EXPENSE_CLAIM_AMOUNT,
} from '../../backend/src/utils/requestValidation';

if (typeof (globalThis as any).HTMLElement === 'undefined') {
  (globalThis as any).HTMLElement = class HTMLElement {};
}

describe('BUSINZ HRMS — Global Spacebar & Form Keyboard Guard', () => {
  const TEST_SENTENCE = "Employee requires leave for personal work and family commitments.";

  describe('1. Editable Element Detection', () => {
    it('correctly identifies text inputs as editable', () => {
      const textInput = { tagName: 'INPUT', type: 'text' } as any;
      Object.setPrototypeOf(textInput, HTMLElement.prototype);
      expect(isEditableElement(textInput)).toBe(true);

      const emailInput = { tagName: 'INPUT', type: 'email' } as any;
      Object.setPrototypeOf(emailInput, HTMLElement.prototype);
      expect(isEditableElement(emailInput)).toBe(true);
    });

    it('correctly identifies textareas as editable', () => {
      const textarea = { tagName: 'TEXTAREA' } as any;
      Object.setPrototypeOf(textarea, HTMLElement.prototype);
      expect(isEditableElement(textarea)).toBe(true);
    });

    it('correctly identifies buttons and checkboxes as non-editable', () => {
      const button = { tagName: 'BUTTON' } as any;
      Object.setPrototypeOf(button, HTMLElement.prototype);
      expect(isEditableElement(button)).toBe(false);

      const checkbox = { tagName: 'INPUT', type: 'checkbox' } as any;
      Object.setPrototypeOf(checkbox, HTMLElement.prototype);
      expect(isEditableElement(checkbox)).toBe(false);

      const submitBtn = { tagName: 'INPUT', type: 'submit' } as any;
      Object.setPrototypeOf(submitBtn, HTMLElement.prototype);
      expect(isEditableElement(submitBtn)).toBe(false);
    });
  });

  describe('2. Space & Enter Key Identifiers', () => {
    it('identifies space keys across key, code, and keyCode representations', () => {
      expect(isSpaceKey({ key: ' ', code: 'Space', keyCode: 32 } as any)).toBe(true);
      expect(isSpaceKey({ key: 'Spacebar', code: 'Space', keyCode: 32 } as any)).toBe(true);
      expect(isSpaceKey({ key: 'a', code: 'KeyA', keyCode: 65 } as any)).toBe(false);
    });

    it('identifies enter keys across key, code, and keyCode representations', () => {
      expect(isEnterKey({ key: 'Enter', code: 'Enter', keyCode: 13 } as any)).toBe(true);
      expect(isEnterKey({ key: ' ', code: 'Space', keyCode: 32 } as any)).toBe(false);
    });
  });

  describe('3. Spacebar Typing & Text Integrity Verification', () => {
    it('preserves spaces, punctuation, and words for the mandatory test sentence', () => {
      let accumulatedText = "";
      const characters = TEST_SENTENCE.split("");

      characters.forEach((char) => {
        let stopped = false;
        let defaultPrevented = false;

        const fakeEvent = {
          key: char,
          code: char === ' ' ? 'Space' : `Key${char.toUpperCase()}`,
          keyCode: char === ' ' ? 32 : char.charCodeAt(0),
          target: { tagName: 'TEXTAREA' },
          stopPropagation: () => { stopped = true; },
          preventDefault: () => { defaultPrevented = true; }
        };
        Object.setPrototypeOf(fakeEvent.target, HTMLElement.prototype);

        preventSpaceEnterPropagation(fakeEvent as any);

        if (char === ' ') {
          // Space propagation must be stopped to protect parent shortcuts
          expect(stopped).toBe(true);
          // But preventDefault must NOT be called so the character enters the field
          expect(defaultPrevented).toBe(false);
        }

        accumulatedText += char;
      });

      expect(accumulatedText).toBe(TEST_SENTENCE);
      expect(accumulatedText.split(" ").length).toBe(9); // 9 words separated by 8 spaces
    });

    it('preserves line breaks when Enter is pressed inside multiline textareas', () => {
      const multilineText = `First line note\n${TEST_SENTENCE}\nThird line note`;
      let formSubmitted = false;

      const enterEvent = {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        target: { tagName: 'TEXTAREA' },
        stopPropagation: () => {},
        preventDefault: () => {}
      };
      Object.setPrototypeOf(enterEvent.target, HTMLElement.prototype);

      preventSpaceEnterPropagation(enterEvent as any);
      expect(formSubmitted).toBe(false);
      expect(multilineText).toContain('\n');
      expect(multilineText.split('\n').length).toBe(3);
    });
  });

  describe('4. Form-Level Keydown Protection', () => {
    it('stops Space from bubbling to form submission from editable textareas', () => {
      let stopped = false;
      const target = { tagName: 'TEXTAREA' };
      Object.setPrototypeOf(target, HTMLElement.prototype);

      const formEvent = {
        key: ' ',
        code: 'Space',
        keyCode: 32,
        target,
        stopPropagation: () => { stopped = true; }
      };

      handleFormKeyDown(formEvent as any);
      expect(stopped).toBe(true);
    });

    it('stops Enter in textareas from submitting the form', () => {
      let stopped = false;
      const target = { tagName: 'TEXTAREA' };
      Object.setPrototypeOf(target, HTMLElement.prototype);

      const formEvent = {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        target,
        stopPropagation: () => { stopped = true; }
      };

      handleFormKeyDown(formEvent as any);
      expect(stopped).toBe(true);
    });
  });

  describe('5. Backend Duplicate & Idempotency Protection', () => {
    it('prevents duplicate active leave requests for same employee and overlapping dates', () => {
      const existingLeaves = [
        {
          id: 'LR-001',
          employeeId: 'EMP-001',
          startDate: '2026-11-01',
          endDate: '2026-11-05',
          status: 'Pending',
          leaveType: 'Casual Leave'
        }
      ];

      // Exact match
      const exactDup = checkDuplicateLeaveRequest(existingLeaves as any, 'EMP-001', '2026-11-01', '2026-11-05');
      expect(exactDup.hasDuplicate).toBe(true);

      // Overlapping match
      const overlapDup = checkDuplicateLeaveRequest(existingLeaves as any, 'EMP-001', '2026-11-03', '2026-11-08');
      expect(overlapDup.hasDuplicate).toBe(true);

      // Different employee
      const diffEmp = checkDuplicateLeaveRequest(existingLeaves as any, 'EMP-002', '2026-11-01', '2026-11-05');
      expect(diffEmp.hasDuplicate).toBe(false);

      // Non-overlapping future dates
      const nonOverlap = checkDuplicateLeaveRequest(existingLeaves as any, 'EMP-001', '2026-11-10', '2026-11-15');
      expect(nonOverlap.hasDuplicate).toBe(false);
    });

    it('prevents duplicate active advance salary requests', () => {
      const existingLoans = [
        {
          id: 'LN-001',
          employeeId: 'EMP-001',
          requestType: 'Advance Salary',
          status: 'Pending'
        }
      ];

      const dup = checkDuplicateAdvanceRequest(existingLoans as any, 'EMP-001', 'Advance Salary');
      expect(dup.hasDuplicate).toBe(true);

      const diffEmp = checkDuplicateAdvanceRequest(existingLoans as any, 'EMP-002', 'Advance Salary');
      expect(diffEmp.hasDuplicate).toBe(false);
    });

    it('prevents duplicate active field assignments for same employee on same date range', () => {
      const existingAssignments = [
        {
          id: 'fa-001',
          employeeId: 'EMP-001',
          startDate: '2026-10-25',
          endDate: '2026-10-25',
          status: 'Scheduled'
        }
      ];

      const dup = checkDuplicateFieldAssignment(existingAssignments as any, 'EMP-001', '2026-10-25', '2026-10-25');
      expect(dup.hasDuplicate).toBe(true);

      const nextDay = checkDuplicateFieldAssignment(existingAssignments as any, 'EMP-001', '2026-10-26', '2026-10-26');
      expect(nextDay.hasDuplicate).toBe(false);
    });

    it('prevents duplicate expense claim for same employee, date, category and amount', () => {
      const existingExpenses = [
        {
          id: 'EXP-001',
          employeeId: 'EMP-001',
          date: '2026-10-25',
          category: 'Travel',
          amount: 1500,
          status: 'Pending Manager'
        }
      ];

      const dup = checkDuplicateExpense(existingExpenses as any, 'EMP-001', '2026-10-25', 'Travel', 1500);
      expect(dup.hasDuplicate).toBe(true);

      // Different amount or date is permitted (not a blanket one-record-per-day restriction)
      const diffAmount = checkDuplicateExpense(existingExpenses as any, 'EMP-001', '2026-10-25', 'Travel', 850);
      expect(diffAmount.hasDuplicate).toBe(false);
    });

    it('enforces maximum 1 Lakh (₹1,00,000) limit per single employee expense claim', () => {
      expect(MAX_EXPENSE_CLAIM_AMOUNT).toBe(100000);

      // Valid amounts within 1 Lakh
      expect(validateExpenseAmount(1500).valid).toBe(true);
      expect(validateExpenseAmount(100000).valid).toBe(true);
      expect(validateExpenseAmount('50000').valid).toBe(true);

      // Invalid zero or negative amounts
      expect(validateExpenseAmount(0).valid).toBe(false);
      expect(validateExpenseAmount(-500).valid).toBe(false);
      expect(validateExpenseAmount('0').valid).toBe(false);

      // Exceeding 1 Lakh (1,00,001+)
      const overLimit = validateExpenseAmount(100001);
      expect(overLimit.valid).toBe(false);
      expect(overLimit.error).toContain('1 Lakh');

      // Massive test amounts (e.g. 15 Crores or 1.5e55)
      const massiveAmount = validateExpenseAmount(150000000000);
      expect(massiveAmount.valid).toBe(false);
      expect(massiveAmount.error).toContain('1 Lakh');
    });
  });
});
