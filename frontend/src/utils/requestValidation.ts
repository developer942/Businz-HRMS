/**
 * Universal Request Date Validation & Duplicate Prevention Engine
 * For VRM Enterprise HRM (Businz HRMS)
 * 
 * Rules enforced:
 * Rule 1 - Prevent Past-Date Submissions (Asia/Kolkata timezone authoritative)
 * Rule 2 - Prevent Duplicate Active Requests (Pending/Approved)
 */

export const COMPANY_TIMEZONE = 'Asia/Kolkata';

export const PAST_DATE_ERROR_MESSAGE = "Past dates are not allowed. Please select today's date or a future date.";
export const DUPLICATE_REQUEST_ERROR_MESSAGE = "You have already submitted a request for this date. Please check your existing request before submitting again.";
export const INVALID_DATE_RANGE_ORDER_MESSAGE = "End date cannot be earlier than start date.";

/**
 * Normalizes any date representation (YYYY-MM-DD, DD/MM/YYYY, Date object, ISO string)
 * into standard ISO date string format: YYYY-MM-DD.
 */
export const normalizeToISO = (dateInput: string | Date | null | undefined): string => {
  if (!dateInput) return '';
  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) return '';
    const y = dateInput.getFullYear();
    const m = String(dateInput.getMonth() + 1).padStart(2, '0');
    const d = String(dateInput.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const clean = String(dateInput).trim();
  if (!clean) return '';

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }

  // ISO timestamp (YYYY-MM-DDTHH:mm:ss...)
  if (/^\d{4}-\d{2}-\d{2}T/.test(clean)) {
    return clean.slice(0, 10);
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const [, dd, mm, yyyy] = dmyMatch;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  // Fallback Date parser
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return clean;
};

/**
 * Returns the current date formatted as YYYY-MM-DD in the configured company timezone (Asia/Kolkata).
 * Eliminates UTC crossover bugs when local time is past midnight IST but before midnight UTC.
 */
export const getKolkataDateString = (date: Date = new Date()): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: COMPANY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
};

/**
 * Returns today's date in Asia/Kolkata (YYYY-MM-DD)
 */
export const getTodayKolkata = (): string => getKolkataDateString();

/**
 * Determines whether the given date string is in the past relative to Asia/Kolkata today.
 */
export const isPastDate = (dateStr: string, referenceDate: string = getTodayKolkata()): boolean => {
  const norm = normalizeToISO(dateStr);
  if (!norm) return false;
  return norm < referenceDate;
};

/**
 * Validates a single request date against past date restrictions.
 */
export const validateRequestDate = (
  dateStr: string,
  allowPast: boolean = false
): { isValid: boolean; valid: boolean; error?: string } => {
  const norm = normalizeToISO(dateStr);
  if (!norm) {
    return { isValid: false, valid: false, error: 'Please select a valid date.' };
  }
  if (!allowPast && isPastDate(norm)) {
    return { isValid: false, valid: false, error: PAST_DATE_ERROR_MESSAGE };
  }
  return { isValid: true, valid: true };
};

/**
 * Validates a date range for requests:
 * 1. Both start and end must be specified
 * 2. Start date must not be in past (unless allowed by policy)
 * 3. End date must not be in past
 * 4. Start date must be <= End date
 */
export const validateDateRange = (
  startDate: string,
  endDate: string,
  allowPast: boolean = false
): { isValid: boolean; valid: boolean; error?: string } => {
  const normStart = normalizeToISO(startDate);
  const normEnd = normalizeToISO(endDate);

  if (!normStart || !normEnd) {
    return { isValid: false, valid: false, error: 'Please specify both start date and end date.' };
  }
  if (!allowPast && isPastDate(normStart)) {
    return { isValid: false, valid: false, error: PAST_DATE_ERROR_MESSAGE };
  }
  if (!allowPast && isPastDate(normEnd)) {
    return { isValid: false, valid: false, error: PAST_DATE_ERROR_MESSAGE };
  }
  if (normEnd < normStart) {
    return { isValid: false, valid: false, error: INVALID_DATE_RANGE_ORDER_MESSAGE };
  }
  return { isValid: true, valid: true };
};

/**
 * Checks whether two inclusive date ranges [startA, endA] and [startB, endB] overlap.
 */
export const rangesOverlap = (
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean => {
  const sA = normalizeToISO(startA);
  const eA = normalizeToISO(endA);
  const sB = normalizeToISO(startB);
  const eB = normalizeToISO(endB);
  return sA <= eB && eA >= sB;
};

/**
 * Normalizes employee identifiers for robust matching (trims, lowercases, handles codes and UUIDs)
 */
export const areSameEmployee = (idA?: string, idB?: string): boolean => {
  if (!idA || !idB) return false;
  return idA.trim().toLowerCase() === idB.trim().toLowerCase();
};

/**
 * Status check helper: returns true if a request is active (Pending or Approved)
 */
export const isActiveRequestStatus = (status?: string): boolean => {
  if (!status) return false;
  const s = status.trim().toLowerCase();
  return (
    s === 'pending' ||
    s === 'approved' ||
    s === 'pending manager' ||
    s === 'pending hr' ||
    s === 'active' ||
    s === 'scheduled' ||
    s === 'disbursed'
  );
};

// -------------------------------------------------------------------------
// MODULE-SPECIFIC DUPLICATE CHECKERS
// -------------------------------------------------------------------------

/**
 * SHIFT CHANGE / SHIFT SWAP DUPLICATE CHECK
 * Blocks duplicate Pending or Approved requests for the same employee and requestedDate.
 */
export interface ShiftRequestLike {
  id: string;
  employeeId?: string;
  employeeName?: string;
  requestedDate: string;
  status: string;
  requestedShift?: string;
}

export const checkDuplicateShiftRequest = (
  existingRequests: ShiftRequestLike[],
  employeeId: string,
  requestedDate: string,
  excludeId?: string
): { hasDuplicate: boolean; error?: string; conflictingRequest?: ShiftRequestLike } => {
  const targetDate = normalizeToISO(requestedDate);
  const conflict = existingRequests.find((req) => {
    if (excludeId && req.id === excludeId) return false;
    if (!areSameEmployee(req.employeeId, employeeId)) return false;
    if (!isActiveRequestStatus(req.status)) return false;
    return normalizeToISO(req.requestedDate) === targetDate;
  });

  if (conflict) {
    return {
      hasDuplicate: true,
      error: DUPLICATE_REQUEST_ERROR_MESSAGE,
      conflictingRequest: conflict
    };
  }
  return { hasDuplicate: false };
};

/**
 * LEAVE REQUEST DUPLICATE & OVERLAP CHECK
 * Blocks duplicate or overlapping date ranges for the same employee with Pending or Approved status.
 */
export interface LeaveRequestLike {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  status: string;
  leaveType?: string;
}

export const checkDuplicateLeaveRequest = (
  existingLeaves: LeaveRequestLike[],
  employeeId: string,
  startDate: string,
  endDate: string,
  excludeId?: string
): { hasDuplicate: boolean; error?: string; conflictingRequest?: LeaveRequestLike } => {
  const normStart = normalizeToISO(startDate);
  const normEnd = normalizeToISO(endDate);

  const conflict = existingLeaves.find((leave) => {
    if (excludeId && leave.id === excludeId) return false;
    if (!areSameEmployee(leave.employeeId, employeeId)) return false;
    if (!isActiveRequestStatus(leave.status)) return false;
    return rangesOverlap(normStart, normEnd, leave.startDate, leave.endDate);
  });

  if (conflict) {
    return {
      hasDuplicate: true,
      error: DUPLICATE_REQUEST_ERROR_MESSAGE,
      conflictingRequest: conflict
    };
  }
  return { hasDuplicate: false };
};

/**
 * SALARY ADVANCE & LOAN REQUEST DUPLICATE CHECK
 * An employee cannot have multiple Pending or Approved requests of the same type.
 */
export interface LoanRecordLike {
  id: string;
  employeeId: string;
  requestType: string;
  status: string;
  neededByDate?: string;
  requestedDate?: string;
}

export const checkDuplicateAdvanceRequest = (
  existingRecords: LoanRecordLike[],
  employeeId: string,
  requestType: string,
  excludeId?: string
): { hasDuplicate: boolean; error?: string; conflictingRequest?: LoanRecordLike } => {
  const normType = requestType.trim().toLowerCase();
  const conflict = existingRecords.find((rec) => {
    if (excludeId && rec.id === excludeId) return false;
    if (!areSameEmployee(rec.employeeId, employeeId)) return false;
    if (!isActiveRequestStatus(rec.status)) return false;
    const recType = (rec.requestType || '').trim().toLowerCase();
    // Advance Salary vs Loan
    const isAdvA = normType.includes('advance');
    const isAdvB = recType.includes('advance');
    return isAdvA === isAdvB;
  });

  if (conflict) {
    return {
      hasDuplicate: true,
      error: "You already have an active pending or approved request of this type. Please wait for completion before submitting again.",
      conflictingRequest: conflict
    };
  }
  return { hasDuplicate: false };
};

/**
 * FIELD ASSIGNMENT DUPLICATE & OVERLAP CHECK
 * An employee cannot have overlapping active field duty assignments on the same dates.
 */
export interface FieldAssignmentLike {
  id: string;
  employeeId: string;
  startDate?: string;
  endDate?: string;
  scheduledDate?: string;
  status: string;
}

export const checkDuplicateFieldAssignment = (
  existingAssignments: FieldAssignmentLike[],
  employeeId: string,
  startDate: string,
  endDate: string,
  excludeId?: string
): { hasDuplicate: boolean; error?: string; conflictingAssignment?: FieldAssignmentLike } => {
  const normStart = normalizeToISO(startDate);
  const normEnd = normalizeToISO(endDate);

  const conflict = existingAssignments.find((a) => {
    if (excludeId && a.id === excludeId) return false;
    if (!areSameEmployee(a.employeeId, employeeId)) return false;
    if (!isActiveRequestStatus(a.status)) return false;
    const aStart = normalizeToISO(a.startDate || a.scheduledDate);
    const aEnd = normalizeToISO(a.endDate || a.startDate || a.scheduledDate);
    return rangesOverlap(normStart, normEnd, aStart, aEnd);
  });

  if (conflict) {
    return {
      hasDuplicate: true,
      error: DUPLICATE_REQUEST_ERROR_MESSAGE,
      conflictingAssignment: conflict
    };
  }
  return { hasDuplicate: false };
};

/**
 * ATTENDANCE REGULARIZATION / MISSED PUNCH DUPLICATE CHECK
 * Blocks duplicate Pending or Approved regularization requests for the same employee and date.
 */
export interface MissedPunchLike {
  id: string;
  employeeId: string;
  date: string;
  status: string;
}

export const checkDuplicateMissedPunchRequest = (
  existingRequests: MissedPunchLike[],
  employeeId: string,
  date: string,
  excludeId?: string
): { hasDuplicate: boolean; error?: string; conflictingRequest?: MissedPunchLike } => {
  const targetDate = normalizeToISO(date);
  const conflict = existingRequests.find((r) => {
    if (excludeId && r.id === excludeId) return false;
    if (!areSameEmployee(r.employeeId, employeeId)) return false;
    if (!isActiveRequestStatus(r.status)) return false;
    return normalizeToISO(r.date) === targetDate;
  });

  if (conflict) {
    return {
      hasDuplicate: true,
      error: DUPLICATE_REQUEST_ERROR_MESSAGE,
      conflictingRequest: conflict
    };
  }
  return { hasDuplicate: false };
};

/**
 * OVERTIME REQUEST DUPLICATE CHECK
 * Blocks duplicate Pending or Approved overtime claims for the same employee and date.
 */
export interface OvertimeRequestLike {
  id: string;
  employeeId: string;
  date: string;
  status: string;
}

export const checkDuplicateOtRequest = (
  existingRequests: OvertimeRequestLike[],
  employeeId: string,
  date: string,
  excludeId?: string
): { hasDuplicate: boolean; error?: string; conflictingRequest?: OvertimeRequestLike } => {
  const targetDate = normalizeToISO(date);
  const conflict = existingRequests.find((r) => {
    if (excludeId && r.id === excludeId) return false;
    if (!areSameEmployee(r.employeeId, employeeId)) return false;
    if (!isActiveRequestStatus(r.status)) return false;
    return normalizeToISO(r.date) === targetDate;
  });

  if (conflict) {
    return {
      hasDuplicate: true,
      error: DUPLICATE_REQUEST_ERROR_MESSAGE,
      conflictingRequest: conflict
    };
  }
  return { hasDuplicate: false };
};

/**
 * EXPENSE DUPLICATE CHECK
 * Allows multiple distinct expenses on the same date, but blocks exact duplicate submissions
 * (same employee, same date, same category, and same amount).
 */
export interface ExpenseLike {
  id: string;
  employeeId: string;
  date: string;
  category: string;
  amount: number;
  status: string;
}

export const checkDuplicateExpense = (
  existingExpenses: ExpenseLike[],
  employeeId: string,
  date: string,
  category: string,
  amount: number,
  excludeId?: string
): { hasDuplicate: boolean; error?: string; conflictingExpense?: ExpenseLike } => {
  const targetDate = normalizeToISO(date);
  const conflict = existingExpenses.find((exp) => {
    if (excludeId && exp.id === excludeId) return false;
    if (!areSameEmployee(exp.employeeId, employeeId)) return false;
    if (exp.status === 'Rejected' || exp.status === 'Cancelled') return false;
    return (
      normalizeToISO(exp.date) === targetDate &&
      exp.category.trim().toLowerCase() === category.trim().toLowerCase() &&
      Math.abs(Number(exp.amount) - Number(amount)) < 0.01
    );
  });

  if (conflict) {
    return {
      hasDuplicate: true,
      error: "You have already submitted an identical expense claim for this date and category.",
      conflictingExpense: conflict
    };
  }
  return { hasDuplicate: false };
};

/**
 * EXPENSE AMOUNT LIMIT VALIDATION (1 Lakh Limit per policy)
 * Ensures single expense claim does not exceed ₹1,00,000 (1 Lakh).
 */
export const MAX_EXPENSE_CLAIM_AMOUNT = 100000; // ₹1,00,000 (1 Lakh)
export const MAX_EXPENSE_CLAIM_AMOUNT_ERROR_MESSAGE = 'Expense claim amount cannot exceed ₹1,00,000 (1 Lakh) per claim.';

export const validateExpenseAmount = (
  amount: number | string | unknown
): { valid: boolean; error?: string } => {
  const num = Number(amount);
  if (isNaN(num) || num <= 0) {
    return { valid: false, error: 'Please enter a valid expense amount greater than zero.' };
  }
  if (num > MAX_EXPENSE_CLAIM_AMOUNT) {
    return { valid: false, error: MAX_EXPENSE_CLAIM_AMOUNT_ERROR_MESSAGE };
  }
  return { valid: true };
};
