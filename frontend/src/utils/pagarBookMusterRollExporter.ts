import { Employee, AttendanceRecord, LeaveRequest, Shift, HolidayItem } from '../types/hrms';
import * as XLSX from 'xlsx';

function formatMonthName(monthIndex: number): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[monthIndex] || 'Nov';
}

function getDayInitial(dateObj: Date): string {
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return days[dateObj.getDay()] || 'S';
}

function minutesToHHMM(mins: number): string {
  if (isNaN(mins) || mins <= 0) return '-';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function minutesToHHHMM(mins: number): string {
  if (isNaN(mins) || mins <= 0) return '00:00';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseTimeToMins(timeStr?: string | null): number | null {
  if (!timeStr) return null;
  const clean = String(timeStr).trim();
  if (!clean || clean === '--:--' || clean === '-' || clean === '—' || clean === 'N/A') return null;

  if (clean.includes('T') || clean.includes('Z') || (clean.includes('-') && clean.includes(':'))) {
    const parsed = new Date(clean.endsWith('Z') || clean.includes('+') ? clean : clean + 'Z');
    if (!isNaN(parsed.getTime())) {
      const istStr = parsed.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const parts = istStr.split(':').map(Number);
      let h = parts[0];
      if (h === 24) h = 0;
      return h * 60 + parts[1];
    }
  }

  const match = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + mins;
}

function formatPunchTimeForSheet(timeStr?: string | null): string {
  if (!timeStr) return '-';
  const clean = String(timeStr).trim();
  if (!clean || clean === '--:--' || clean === '-' || clean === '—' || clean.toLowerCase().includes('progress')) {
    return '-';
  }
  if (clean.includes('T') || clean.includes('Z')) {
    const mins = parseTimeToMins(clean);
    if (mins !== null) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }
  return clean.includes(' ') ? clean.split(' ')[0] : clean;
}

/**
 * Resolves the employee's standard shift working hours (defaults to 9 hours).
 * Overtime is strictly calculated only AFTER these standard shift hours are completed.
 */
export function resolveEmployeeStandardShiftHours(emp: Employee, shifts?: Shift[]): number {
  const empCode = (emp.employeeId || '').toLowerCase().trim();
  const empUid = (emp.id || '').toLowerCase().trim();
  const rawShiftName = (emp.workShift || '').trim();
  const cleanShiftName = (rawShiftName.includes('(') ? rawShiftName.split('(')[0] : rawShiftName).toLowerCase().trim();

  if (shifts && shifts.length > 0) {
    // 1. Check explicit shift assignment first
    const assignedShift = shifts.find(s =>
      s.assignments?.some(a => {
        const aId = (typeof a === 'string' ? a : a?.employeeId || '').toLowerCase().trim();
        const isActive = typeof a === 'string' || a?.status !== 'INACTIVE';
        return isActive && aId && (aId === empCode || (empUid && aId === empUid));
      })
    );
    if (assignedShift && Number(assignedShift.workingHours) > 0) {
      return Number(assignedShift.workingHours);
    }

    // 2. Match by employee.workShift name or id
    if (cleanShiftName) {
      const matchedByName = shifts.find(s => {
        const sId = (s.id || '').toLowerCase().trim();
        const sName = (s.shiftName || '').toLowerCase().trim();
        return (
          sId === cleanShiftName ||
          sName === cleanShiftName ||
          sName === rawShiftName.toLowerCase() ||
          sName.includes(cleanShiftName) ||
          cleanShiftName.includes(sName)
        );
      });
      if (matchedByName && Number(matchedByName.workingHours) > 0) {
        return Number(matchedByName.workingHours);
      }
    }
  }

  // 3. Fallback check if shift label explicitly says 9:30-6 (8.5 hours)
  if (rawShiftName.toLowerCase().includes('9:30-6') || rawShiftName.includes('09:30 - 18:00')) {
    return 8.5;
  }

  // Default standard shift working hours is 9 hours
  return 9;
}

export function generatePagarBookMusterRollFilename(
  fromDateStr: string,
  toDateStr: string,
  companyName: string = 'BUSINZ'
): string {
  const [y1, m1, d1] = (fromDateStr || '').split('-').map(Number);
  const [y2, m2, d2] = (toDateStr || '').split('-').map(Number);
  const fromD = y1 && m1 && d1 ? new Date(y1, m1 - 1, d1, 12, 0, 0) : new Date(fromDateStr);
  const toD = y2 && m2 && d2 ? new Date(y2, m2 - 1, d2, 12, 0, 0) : new Date(toDateStr);

  const startDay = String(fromD.getDate()).padStart(2, '0');
  const startMonth = formatMonthName(fromD.getMonth());
  const startYear = fromD.getFullYear();

  const endDay = String(toD.getDate()).padStart(2, '0');
  const endMonth = formatMonthName(toD.getMonth());
  const endYear = toD.getFullYear();

  return `${companyName} - Attendance Muster Roll - ${startDay} ${startMonth} ${startYear} to ${endDay} ${endMonth} ${endYear}.xlsx`;
}

export function downloadPagarBookMusterRollExcel(
  employees: Employee[],
  attendanceRecords: AttendanceRecord[],
  leaveRequests: LeaveRequest[],
  fromDateStr: string,
  toDateStr: string,
  companyName: string = 'BUSINZ',
  shifts: Shift[] = [],
  holidayPolicies: HolidayItem[] = []
): void {
  if (!employees || employees.length === 0) {
    alert('No employee data available to export.');
    return;
  }

  // 1. Generate timezone-safe date list between fromDateStr and toDateStr
  const dates: string[] = [];
  const [y1, m1, d1] = (fromDateStr || '').slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = (toDateStr || '').slice(0, 10).split('-').map(Number);
  if (y1 && m1 && d1 && y2 && m2 && d2) {
    const cur = new Date(y1, m1 - 1, d1, 12, 0, 0);
    const end = new Date(y2, m2 - 1, d2, 12, 0, 0);
    let safety = 0;
    while (cur <= end && safety < 366) {
      const yy = cur.getFullYear();
      const mm = String(cur.getMonth() + 1).padStart(2, '0');
      const dd = String(cur.getDate()).padStart(2, '0');
      dates.push(`${yy}-${mm}-${dd}`);
      cur.setDate(cur.getDate() + 1);
      safety++;
    }
  } else {
    const start = new Date(fromDateStr);
    const end = new Date(toDateStr);
    const cur = new Date(start);
    while (cur <= end) {
      dates.push(cur.toISOString().split('T')[0]);
      cur.setDate(cur.getDate() + 1);
    }
  }

  const dayHeaderCells = dates.map(dStr => {
    const [yy, mm, dd] = dStr.split('-').map(Number);
    const dObj = new Date(yy, mm - 1, dd, 12, 0, 0);
    const dayInitial = getDayInitial(dObj);
    return `${dayInitial} (${String(dd).padStart(2, '0')}-${String(mm).padStart(2, '0')})`;
  });

  // Clean fixed columns matching exact user requirement:
  // 1. Name, 2. Employee ID, 3. Department, 4. Bank Details, 5. Days ➡️ (Punch In, Punch Out, Working Hrs, OT Hrs)
  const fixedHeaders = [
    'S.N.',
    'Employee Name',
    'Employee ID',
    'Department',
    'Bank Name',
    'Bank Account Number',
    'Bank IFSC Code',
    'Days ➡️'
  ];

  const summaryHeaders = [
    'Total Working Hours',
    'Total Overtime Hours',
    'Total Present',
    'Total Absent',
    'Total Half Days',
    'Total Paid Leaves'
  ];

  const aoaRows: (string | number)[][] = [];

  // Title / Company Meta Header
  aoaRows.push([companyName, 'Attendance Muster Roll', `Period: ${fromDateStr} to ${toDateStr}`]);
  aoaRows.push([]); // Empty row

  // Table Headers (Row index 2)
  const headerRow: string[] = [
    ...fixedHeaders,
    ...dayHeaderCells,
    ...summaryHeaders
  ];
  aoaRows.push(headerRow);

  const sortedEmployees = [...employees].sort((a, b) => {
    const codeA = (a.employeeId || '').trim();
    const codeB = (b.employeeId || '').trim();
    const numA = parseInt(codeA.replace(/\D+/g, ''), 10);
    const numB = parseInt(codeB.replace(/\D+/g, ''), 10);
    if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
      return numA - numB;
    }
    return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
  });

  const holidayDateSet = new Set(
    (holidayPolicies || []).map(h => String(h.date || '').slice(0, 10)).filter(Boolean)
  );

  const emptyFixedCols = Array(fixedHeaders.length - 1).fill('');

  sortedEmployees.forEach((emp, empIdx) => {
    const sn = String(empIdx + 1);
    const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'Staff';
    const empId = emp.employeeId || emp.id || '';
    const dept = emp.department || '';
    const bankName = emp.bankDetails?.bankName || (emp as any).bankName || '-';
    const bankAcc = emp.bankDetails?.accountNumber ? String(emp.bankDetails.accountNumber).trim() : '-';
    const ifsc = emp.bankDetails?.ifscCode || (emp as any).ifscCode || '-';

    // Standard shift working hours for this employee (9 hrs for 9h shifts, 8.5 hrs for 8.5h shifts)
    const shiftStandardHours = resolveEmployeeStandardShiftHours(emp, shifts);
    const standardShiftMins = Math.round(shiftStandardHours * 60);

    const stateList: string[] = [];
    const inList: string[] = [];
    const outList: string[] = [];
    const whList: string[] = [];
    const otList: string[] = [];

    let totalPresent = 0;
    let totalAbsent = 0;
    let totalHalfDays = 0;
    let totalPaidLeaves = 0;
    let totalWHMinutes = 0;
    let totalOTMinutes = 0;

    const empCode = (emp.employeeId || '').toLowerCase().trim();
    const empUid = (emp.id || '').toLowerCase().trim();
    const empNameLower = fullName.toLowerCase();

    dates.forEach(dStr => {
      const [yy, mm, dd] = dStr.split('-').map(Number);
      const dObj = new Date(yy, mm - 1, dd, 12, 0, 0);
      const isSunday = dObj.getDay() === 0;
      const isHoliday = holidayDateSet.has(dStr);

      const rec = attendanceRecords.find(r => {
        const rEmp = (r.employeeId || '').toLowerCase().trim();
        const rName = (r.employeeName || '').toLowerCase().trim();
        const rDate = String(r.date || r.shiftDate || '').slice(0, 10);
        const matchesEmp =
          (empCode && rEmp === empCode) ||
          (empUid && rEmp === empUid) ||
          (empNameLower && rName === empNameLower);
        return matchesEmp && rDate === dStr;
      });

      const leave = leaveRequests.find(l => {
        if (l.status !== 'Approved') return false;
        const lEmp = (l.employeeId || '').toLowerCase().trim();
        const lName = (l.employeeName || '').toLowerCase().trim();
        const matchEmp =
          (empCode && lEmp === empCode) ||
          (empUid && lEmp === empUid) ||
          (empNameLower && lName === empNameLower);
        if (!matchEmp) return false;
        const s = (l.startDate || '').slice(0, 10);
        const e = (l.endDate || s).slice(0, 10);
        return s <= dStr && e >= dStr;
      });

      let state = '-';
      let inTime = '-';
      let outTime = '-';
      let whStr = '-';
      let otStr = '-';

      if (leave) {
        const lType = (leave.leaveType || '').toLowerCase();
        const isWfh = lType.includes('work from home') || lType.includes('wfh') || lType.includes('wfo') || lType.includes('office');
        const isFv = lType.includes('field') || lType.includes('visit') || lType.includes('duty');
        if (isWfh) {
          state = 'WFH';
          inTime = rec?.checkIn ? formatPunchTimeForSheet(rec.checkIn) : '09:00';
          outTime = rec?.checkOut ? formatPunchTimeForSheet(rec.checkOut) : '18:00';
          whStr = minutesToHHMM(standardShiftMins);
          totalWHMinutes += standardShiftMins;
          totalPresent++;
        } else if (isFv) {
          state = 'FV';
          inTime = rec?.checkIn ? formatPunchTimeForSheet(rec.checkIn) : '09:30';
          outTime = rec?.checkOut ? formatPunchTimeForSheet(rec.checkOut) : '18:30';
          whStr = minutesToHHMM(standardShiftMins);
          totalWHMinutes += standardShiftMins;
          totalPresent++;
        } else {
          const isUnpaid =
            lType.includes('unpaid') ||
            lType.includes('lwp') ||
            lType.includes('loss of pay') ||
            (leave.paidDaysCount !== undefined && leave.paidDaysCount <= 0 && (leave.unpaidDaysCount || 0) > 0);
          if (isUnpaid) {
            state = 'UL';
            totalAbsent++;
          } else {
            state = 'PL';
            if (lType.includes('sick')) state = 'PL-SL';
            else if (lType.includes('earned') || lType.includes('privilege') || lType.includes('paid')) state = 'PL-EL';
            totalPaidLeaves++;
          }
        }
      } else if (rec) {
        const stLower = (rec.status || '').toLowerCase();
        const methodLower = (rec.method || '').toLowerCase();
        if (stLower === 'holiday' || stLower === 'week off' || methodLower.includes('holiday')) {
          state = isHoliday && !isSunday ? 'H' : 'WO';
          totalPaidLeaves++;
        } else if (stLower.includes('wfh') || stLower.includes('home') || stLower.includes('wfo') || stLower.includes('office')) {
          state = 'WFH';
          totalPresent++;
        } else if (stLower.includes('field') || stLower.includes('visit') || stLower.includes('duty') || methodLower.includes('field')) {
          state = 'FV';
          totalPresent++;
        } else if (rec.status === 'Present' || rec.status === 'Late') {
          state = '1P';
          totalPresent++;
        } else if (rec.status === 'Half Day') {
          state = '0.5P';
          totalHalfDays++;
          totalPresent += 0.5;
        } else if (rec.status === 'Absent') {
          state = 'A';
          totalAbsent++;
        } else if (rec.status === 'On Leave') {
          state = 'PL';
          totalPaidLeaves++;
        } else if (rec.checkIn && rec.checkIn !== '--:--') {
          state = '1P';
          totalPresent++;
        } else {
          state = 'A';
          totalAbsent++;
        }

        inTime = state === 'A' || state === 'H' || state === 'WO' ? '-' : formatPunchTimeForSheet(rec.checkIn);
        outTime = state === 'A' || state === 'H' || state === 'WO' ? '-' : formatPunchTimeForSheet(rec.checkOut);

        let whMins = 0;
        if (state !== 'A' && state !== 'H' && state !== 'WO' && state !== 'PL') {
          if (rec.workingHours && rec.workingHours > 0) {
            whMins = Math.round(rec.workingHours * 60);
          } else if (inTime !== '-' && outTime !== '-') {
            const inM = parseTimeToMins(rec.checkIn);
            const outM = parseTimeToMins(rec.checkOut);
            if (inM !== null && outM !== null) {
              let diff = outM - inM;
              // Handle 12-hour evening punch-out without AM/PM (e.g. IN 09:30, OUT 06:30 -> 18:30)
              if (diff <= 0 && outM < 12 * 60 && inM >= 6 * 60) {
                diff = (outM + 12 * 60) - inM;
              } else if (diff < 0) {
                diff += 24 * 60;
              }
              whMins = Math.max(0, diff);
            }
          }
        }

        if (whMins > 0) {
          whStr = minutesToHHMM(whMins);
          totalWHMinutes += whMins;

          // OT hours strictly calculated ONLY after standard shift working hours (e.g. 9 hrs = 540 mins)
          if (whMins > standardShiftMins) {
            const otMins = whMins - standardShiftMins;
            otStr = minutesToHHMM(otMins);
            totalOTMinutes += otMins;
          }
        }
      } else if (isSunday || isHoliday) {
        state = isHoliday && !isSunday ? 'H' : 'WO';
        totalPaidLeaves++;
      } else {
        state = 'A';
        totalAbsent++;
      }

      stateList.push(state);
      inList.push(inTime);
      outList.push(outTime);
      whList.push(whStr);
      otList.push(otStr);
    });

    const totWHFormatted = minutesToHHHMM(totalWHMinutes);
    const totOTFormatted = minutesToHHHMM(totalOTMinutes);

    // Row 1: Employee Details + Attendance Status
    aoaRows.push([
      sn,
      fullName,
      empId,
      dept,
      bankName,
      bankAcc,
      ifsc,
      'Attendance Status',
      ...stateList,
      totWHFormatted,
      totOTFormatted,
      totalPresent,
      totalAbsent,
      totalHalfDays,
      totalPaidLeaves
    ]);

    // Row 2: Punch In Time (IN)
    aoaRows.push([
      ...emptyFixedCols,
      'IN (Punch In)',
      ...inList,
      ...Array(summaryHeaders.length).fill('')
    ]);

    // Row 3: Punch Out Time (OUT)
    aoaRows.push([
      ...emptyFixedCols,
      'OUT (Punch Out)',
      ...outList,
      ...Array(summaryHeaders.length).fill('')
    ]);

    // Row 4: Total Working Hrs (WH)
    aoaRows.push([
      ...emptyFixedCols,
      'WH (Working Hrs)',
      ...whList,
      totWHFormatted,
      ...Array(summaryHeaders.length - 1).fill('')
    ]);

    // Row 5: OT Hrs (OT)
    aoaRows.push([
      ...emptyFixedCols,
      'OT (Overtime Hrs)',
      ...otList,
      '',
      totOTFormatted,
      ...Array(summaryHeaders.length - 2).fill('')
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoaRows);

  // Ensure Bank Account Number column (col index 5, column F) is always stored as text so 16-digit numbers never become scientific notation
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let r = 3; r <= range.e.r; r++) {
    const cellAddr = XLSX.utils.encode_cell({ r, c: 5 });
    const cell = ws[cellAddr];
    if (cell && cell.v !== undefined && cell.v !== '') {
      cell.t = 's';
      cell.v = String(cell.v);
    }
  }

  // Set clean column widths
  ws['!cols'] = [
    { wch: 6 },  // S.N.
    { wch: 22 }, // Employee Name
    { wch: 13 }, // Employee ID
    { wch: 16 }, // Department
    { wch: 18 }, // Bank Name
    { wch: 20 }, // Bank Account Number
    { wch: 15 }, // Bank IFSC Code
    { wch: 18 }, // Days ➡️
    ...dates.map(() => ({ wch: 10 })),
    ...summaryHeaders.map(() => ({ wch: 18 }))
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Muster Roll');

  const filename = generatePagarBookMusterRollFilename(fromDateStr, toDateStr, companyName);
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  triggerFileDownload(blob, filename);
}

function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
