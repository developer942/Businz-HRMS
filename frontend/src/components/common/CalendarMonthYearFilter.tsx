import React from 'react';
import { Calendar } from 'lucide-react';

export const CALENDAR_MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const DEFAULT_CALENDAR_YEARS = ['2024', '2025', '2026', '2027'];

export interface CalendarMonthYearFilterProps {
  month: string;
  year: string | number;
  onMonthChange: (month: string) => void;
  onYearChange: (year: string) => void;
  allowAll?: boolean;
  years?: Array<string | number>;
  className?: string;
}

export const CalendarMonthYearFilter: React.FC<CalendarMonthYearFilterProps> = ({
  month,
  year,
  onMonthChange,
  onYearChange,
  allowAll = true,
  years = DEFAULT_CALENDAR_YEARS,
  className = '',
}) => {
  return (
    <div
      className={`calendar-month-year-filter ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '10px',
        border: '1px solid #CBD5E1',
        backgroundColor: '#FFFFFF',
        minHeight: '38px',
        boxSizing: 'border-box',
        flexWrap: 'nowrap',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#0E7490',
          flexShrink: 0,
        }}
        title="Filter by Month and Year"
      >
        <Calendar size={15} strokeWidth={2.2} />
      </span>

      {/* Separate Month Dropdown */}
      <select
        value={month}
        onChange={(e) => onMonthChange(e.target.value)}
        aria-label="Select Month"
        style={{
          border: 'none',
          backgroundColor: 'transparent',
          color: '#0E7490',
          fontWeight: 700,
          fontSize: '0.82rem',
          cursor: 'pointer',
          outline: 'none',
          padding: '2px 4px',
        }}
      >
        {allowAll && <option value="ALL">All Months</option>}
        {CALENDAR_MONTH_NAMES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <span style={{ color: '#CBD5E1', fontSize: '0.8rem', userSelect: 'none' }}>|</span>

      {/* Separate Year Dropdown */}
      <select
        value={String(year)}
        onChange={(e) => onYearChange(e.target.value)}
        aria-label="Select Year"
        style={{
          border: 'none',
          backgroundColor: 'transparent',
          color: '#0E7490',
          fontWeight: 700,
          fontSize: '0.82rem',
          cursor: 'pointer',
          outline: 'none',
          padding: '2px 4px',
        }}
      >
        {allowAll && <option value="ALL">All Years</option>}
        {years.map((yr) => (
          <option key={String(yr)} value={String(yr)}>
            {yr}
          </option>
        ))}
      </select>
    </div>
  );
};

/**
 * Helper to check if a date string (YYYY-MM-DD, DD/MM/YYYY, ISO timestamp, or month name)
 * matches the selected Month ('ALL' or 'January'..'December') and Year ('ALL' or '2026').
 */
export function matchesCalendarMonthYear(
  dateInput: string | undefined | null,
  selectedMonth: string,
  selectedYear: string | number,
  explicitYear?: string | number
): boolean {
  const mFilter = String(selectedMonth || 'ALL').trim();
  const yFilter = String(selectedYear || 'ALL').trim();
  if (mFilter === 'ALL' && yFilter === 'ALL') return true;

  if (!dateInput && !explicitYear) return false;
  const raw = String(dateInput || '').trim();

  let parsedMonthName = '';
  let parsedYearStr = explicitYear ? String(explicitYear).trim() : '';

  // Case 1: YYYY-MM-DD or ISO string
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})/);
  if (isoMatch) {
    parsedYearStr = parsedYearStr || isoMatch[1];
    const mIdx = parseInt(isoMatch[2], 10) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      parsedMonthName = CALENDAR_MONTH_NAMES[mIdx];
    }
  } else {
    // Case 2: DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (dmyMatch) {
      parsedYearStr = parsedYearStr || dmyMatch[3];
      const mIdx = parseInt(dmyMatch[2], 10) - 1;
      if (mIdx >= 0 && mIdx < 12) {
        parsedMonthName = CALENDAR_MONTH_NAMES[mIdx];
      }
    } else {
      // Case 3: Month name string (e.g. "November" or "November 2026")
      for (const mName of CALENDAR_MONTH_NAMES) {
        if (raw.toLowerCase().includes(mName.toLowerCase()) || raw.toLowerCase() === mName.slice(0, 3).toLowerCase()) {
          parsedMonthName = mName;
          break;
        }
      }
      const yrMatch = raw.match(/\b(20\d{2})\b/);
      if (yrMatch && !parsedYearStr) {
        parsedYearStr = yrMatch[1];
      }
    }
  }

  if (mFilter !== 'ALL') {
    if (!parsedMonthName || parsedMonthName.toLowerCase() !== mFilter.toLowerCase()) {
      return false;
    }
  }

  if (yFilter !== 'ALL') {
    if (!parsedYearStr || parsedYearStr !== yFilter) {
      return false;
    }
  }

  return true;
}
