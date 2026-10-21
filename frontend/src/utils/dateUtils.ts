/**
 * Standard Date Formatting Utility for VRM Enterprise HRM
 * Formats dates strictly as DD/MM/YYYY across all modules and tables.
 */

const isValidDateParts = (year: number, month: number, day: number): boolean => {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
};

export const parseDDMMYYYY = (value: string): string | null => {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!isValidDateParts(year, month, day)) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
};

export const isValidISODate = (value: string): boolean => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return Boolean(match && isValidDateParts(Number(match[1]), Number(match[2]), Number(match[3])));
};

export const formatDateDDMMYYYY = (dateInput: string | Date | null | undefined): string => {
  if (!dateInput) return '';

  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (!trimmed) return '';

    // If it's already in DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      return parseDDMMYYYY(trimmed) ? trimmed : '';
    }

    // Standard ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss...
    const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymdMatch) {
      const [, yyyy, mm, dd] = ymdMatch;
      return isValidDateParts(Number(yyyy), Number(mm), Number(dd)) ? `${dd}/${mm}/${yyyy}` : '';
    }

    // DD-MM-YYYY format
    const dmyMatch = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})/);
    if (dmyMatch) {
      const [, dd, mm, yyyy] = dmyMatch;
      return isValidDateParts(Number(yyyy), Number(mm), Number(dd)) ? `${dd}/${mm}/${yyyy}` : '';
    }
  }

  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);

  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

export const formatDate = formatDateDDMMYYYY;

export const formatDateRange = (
  startDate: string | Date | null | undefined, 
  endDate: string | Date | null | undefined,
  separator: string = ' to '
): string => {
  const start = formatDateDDMMYYYY(startDate);
  const end = formatDateDDMMYYYY(endDate);
  if (!start && !end) return '';
  if (!end) return start;
  if (!start) return end;
  return `${start}${separator}${end}`;
};

export const normalizeToYYYYMMDD = (val: string | Date | null | undefined): string => {
  if (!val) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const clean = String(val).trim();
  if (!clean) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
    const iso = clean.slice(0, 10);
    return isValidISODate(iso) ? iso : '';
  }
  return parseDDMMYYYY(clean) || '';
};

export const formatDateTimeDDMMYYYY = (value: string | Date | null | undefined): string => {
  if (!value) return '';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return formatDateDDMMYYYY(value);
  return `${parsed.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' })}, ${parsed.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })}`;
};

/**
 * Standard Time Formatting Utility for VRM Enterprise HRM
 * Converts UTC ISO timestamps, 24-hr times, and date strings strictly into Indian Standard Time (IST) 12-hour AM/PM format (e.g. "06:18 PM").
 */
export const formatTimeDisplay = (timeInput?: string | Date | null, fallback = '—'): string => {
  if (!timeInput) return fallback;
  if (timeInput instanceof Date) {
    if (isNaN(timeInput.getTime())) return fallback;
    return timeInput.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  const raw = String(timeInput).trim();
  if (!raw || raw === '--:--' || raw === '—' || raw === '-' || raw.toLowerCase() === 'missing') {
    return fallback;
  }

  // 1. Full ISO timestamp or datetime string from PostgreSQL TIMESTAMPTZ (stored in UTC)
  if (raw.includes('T') || raw.includes('Z') || (raw.includes('-') && raw.includes(':'))) {
    let parsed: Date;
    if (raw.endsWith('Z') || raw.includes('+') || /-[0-9]{2}:?[0-9]{2}$/.test(raw)) {
      parsed = new Date(raw);
    } else if (raw.includes('T')) {
      parsed = new Date(raw.endsWith('Z') ? raw : raw + 'Z');
    } else {
      parsed = new Date(raw.replace(/\s+/, 'T') + 'Z');
    }

    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    }
  }

  // 2. 12-hour AM/PM string (e.g. "6:18 PM", "06:18:30 PM", "9:17 AM")
  const ampmMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (ampmMatch) {
    const hh = ampmMatch[1].padStart(2, '0');
    const mm = ampmMatch[2];
    const mer = ampmMatch[3].toUpperCase();
    return `${hh}:${mm} ${mer}`;
  }

  // 3. 24-hour time string (e.g. "18:18", "09:17", "18:18:30")
  const hhmmMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hhmmMatch) {
    let hours = parseInt(hhmmMatch[1], 10);
    const mins = hhmmMatch[2];
    const mer = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    return `${String(hours).padStart(2, '0')}:${mins} ${mer}`;
  }

  return raw;
};

export const formatTime = formatTimeDisplay;

