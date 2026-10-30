export const PRE_SHIFT_CHECKIN_BUFFER_MINUTES = 180; // Strictly 3 hours before shift start
export const DEFAULT_COMPANY_TIMEZONE = 'Asia/Kolkata';
/**
 * Converts an authoritative server instant (`Date`) into a wall-clock `Date` object
 * in the configured IANA timezone (default `Asia/Kolkata`), so `.getFullYear()`, `.getMonth()`,
 * `.getDate()`, `.getHours()`, `.getMinutes()`, `.getSeconds()` reflect the company timezone
 * regardless of the OS timezone of the server container.
 */
export function toTimezoneWallClockDate(instant = new Date(), timeZone = DEFAULT_COMPANY_TIMEZONE) {
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
        const parts = formatter.formatToParts(instant);
        const map = {};
        for (const part of parts) {
            if (part.type !== 'literal') {
                map[part.type] = parseInt(part.value, 10);
            }
        }
        const hour = map.hour === 24 ? 0 : map.hour;
        return new Date(map.year, (map.month || 1) - 1, map.day || 1, hour || 0, map.minute || 0, map.second || 0, instant.getMilliseconds());
    }
    catch {
        return new Date(instant.getTime());
    }
}
/**
 * Formats a 24h HH:mm time string or Date into 12-hour AM/PM display (e.g., "09:00 AM").
 */
export function formatMinutesOrDateToAmPm(date) {
    const h24 = date.getHours();
    const m = date.getMinutes();
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}
export function formatTimeStrToAmPm(timeStr) {
    const { hours, minutes } = parseShiftTime(timeStr);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${String(h12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
}
/**
 * Parses HH:mm or HH:mm AM/PM into { hours, minutes } in 24h format
 */
export function parseShiftTime(timeStr) {
    if (!timeStr)
        return { hours: 9, minutes: 0 };
    const clean = timeStr.trim().toUpperCase();
    const isPM = clean.includes('PM');
    const isAM = clean.includes('AM');
    const timePart = clean.replace(/AM|PM/g, '').trim();
    const [hStr, mStr] = timePart.split(':');
    let hours = parseInt(hStr, 10) || 0;
    const minutes = parseInt(mStr, 10) || 0;
    if (isPM && hours < 12)
        hours += 12;
    if (isAM && hours === 12)
        hours = 0;
    return { hours, minutes };
}
/**
 * Formats Date object to YYYY-MM-DD
 */
export function toDateStr(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
/**
 * Calculates shift start, shift end, 3-hour early check-in open time, and grace cutoff
 * for a given shiftDate (YYYY-MM-DD) and ShiftRecord.
 * Handles overnight shifts (where endTime <= startTime).
 */
export function calculateShiftDateTimes(shiftDateStr, shift, earlyWindowMinutes = PRE_SHIFT_CHECKIN_BUFFER_MINUTES, policyGraceMinutes) {
    const [year, month, day] = shiftDateStr.split('-').map(Number);
    const start = parseShiftTime(shift.startTime);
    const end = parseShiftTime(shift.endTime);
    const shiftStartDateTime = new Date(year, month - 1, day, start.hours, start.minutes, 0, 0);
    const shiftEndDateTime = new Date(year, month - 1, day, end.hours, end.minutes, 0, 0);
    let isNightShift = false;
    if (shiftEndDateTime.getTime() <= shiftStartDateTime.getTime()) {
        shiftEndDateTime.setDate(shiftEndDateTime.getDate() + 1);
        isNightShift = true;
    }
    const earlyCheckInDateTime = new Date(shiftStartDateTime.getTime() - earlyWindowMinutes * 60 * 1000);
    const effectiveGraceMins = policyGraceMinutes !== undefined && Number.isFinite(policyGraceMinutes) && policyGraceMinutes >= 0
        ? policyGraceMinutes
        : shift.gracePeriodMins ?? 40;
    const graceEndDateTime = new Date(shiftStartDateTime.getTime() + effectiveGraceMins * 60 * 1000);
    return {
        shiftStartDateTime,
        shiftEndDateTime,
        earlyCheckInDateTime,
        graceEndDateTime,
        effectiveGraceMins,
        isNightShift,
    };
}
/**
 * Authoritative Backend Shift Window Evaluator.
 * Enforces:
 * - Check-in opens strictly 3 hours before assigned shift start.
 * - Never blocks check-in at shift start or after grace period.
 * - Allows late check-in throughout the shift attendance window.
 * - Uses Late Policy grace period to determine whether check-in is Present or Late.
 * - Handles overnight shifts, multiple shifts, holidays, and approved leaves.
 */
export function evaluateBackendShiftAttendance(params) {
    const { employeeId, assignedShift, attendanceLogs, now: nowInput, earlyWindowMinutes = PRE_SHIFT_CHECKIN_BUFFER_MINUTES, policyGraceMinutes, timeZone = DEFAULT_COMPANY_TIMEZONE, useTimeZoneWallClock = false, holidayInfo, leaveInfo, } = params;
    const rawNow = nowInput || new Date();
    const now = useTimeZoneWallClock ? toTimezoneWallClockDate(rawNow, timeZone) : rawNow;
    const todayStr = toDateStr(now);
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = toDateStr(yesterdayDate);
    const tomorrowDate = new Date(now);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = toDateStr(tomorrowDate);
    const empLogs = attendanceLogs.filter((r) => r.employeeId === employeeId);
    const hasValidIn = (r) => Boolean(r?.checkIn && r.checkIn !== '--:--' && r.checkIn.trim() !== '');
    const hasValidOut = (r) => Boolean(r?.checkOut && r.checkOut !== '--:--' && r.checkOut.trim() !== '');
    // 1. Check if employee has an open check-in from yesterday (overnight shift still in progress)
    const yesterdayRecord = empLogs.find((r) => (r.shiftDate || r.date) === yesterdayStr);
    const todayRecord = empLogs.find((r) => (r.shiftDate || r.date) === todayStr);
    let targetShiftDateStr = todayStr;
    let activeRecord = todayRecord;
    if (yesterdayRecord && hasValidIn(yesterdayRecord) && !hasValidOut(yesterdayRecord)) {
        const yTimes = calculateShiftDateTimes(yesterdayStr, assignedShift, earlyWindowMinutes, policyGraceMinutes);
        const maxCheckoutCutoff = new Date(yTimes.shiftEndDateTime.getTime() + 6 * 60 * 60 * 1000);
        if (now.getTime() <= maxCheckoutCutoff.getTime()) {
            targetShiftDateStr = yesterdayStr;
            activeRecord = yesterdayRecord;
        }
    }
    else if (!todayRecord) {
        // Also check if assignedShift is an overnight shift that started yesterday and is STILL within its active shift window right now
        const yTimes = calculateShiftDateTimes(yesterdayStr, assignedShift, earlyWindowMinutes, policyGraceMinutes);
        const yesterdayCompleted = Boolean(yesterdayRecord && hasValidIn(yesterdayRecord) && hasValidOut(yesterdayRecord));
        if (yTimes.isNightShift &&
            !yesterdayCompleted &&
            now.getTime() >= yTimes.earlyCheckInDateTime.getTime() &&
            now.getTime() <= yTimes.shiftEndDateTime.getTime()) {
            targetShiftDateStr = yesterdayStr;
            activeRecord = yesterdayRecord;
        }
    }
    // 2. If today's shift is already completed (checked in AND checked out), advance to tomorrow's shift
    if (activeRecord && hasValidIn(activeRecord) && hasValidOut(activeRecord)) {
        const nextTimes = calculateShiftDateTimes(tomorrowStr, assignedShift, earlyWindowMinutes, policyGraceMinutes);
        const diffMs = Math.max(0, nextTimes.earlyCheckInDateTime.getTime() - now.getTime());
        const countdownSeconds = Math.floor(diffMs / 1000);
        return {
            state: 'WAITING_FOR_NEXT_SHIFT',
            canCheckIn: false,
            canCheckOut: false,
            assignedShift,
            shiftDate: tomorrowStr,
            shiftStartDateTime: nextTimes.shiftStartDateTime.toISOString(),
            shiftEndDateTime: nextTimes.shiftEndDateTime.toISOString(),
            earlyCheckInDateTime: nextTimes.earlyCheckInDateTime.toISOString(),
            graceEndDateTime: nextTimes.graceEndDateTime.toISOString(),
            countdownSeconds,
            isWithinGrace: false,
            isLateCheckIn: false,
            activeAttendance: activeRecord,
            message: `Completed today's shift (${assignedShift.shiftName}). Next check-in opens tomorrow at ${formatMinutesOrDateToAmPm(nextTimes.earlyCheckInDateTime)}.`,
            shiftStartDisplay: formatMinutesOrDateToAmPm(nextTimes.shiftStartDateTime),
            shiftEndDisplay: formatMinutesOrDateToAmPm(nextTimes.shiftEndDateTime),
            checkInOpenDisplay: formatMinutesOrDateToAmPm(nextTimes.earlyCheckInDateTime),
            gracePeriodMins: nextTimes.effectiveGraceMins,
            lateAfterDisplay: formatMinutesOrDateToAmPm(nextTimes.graceEndDateTime),
            expectedStatus: 'Present',
            timeZone,
            isHoliday: Boolean(holidayInfo?.isHoliday),
            holidayName: holidayInfo?.holidayName,
            isOnApprovedLeave: Boolean(leaveInfo?.isOnApprovedLeave),
            leaveType: leaveInfo?.leaveType,
        };
    }
    const times = calculateShiftDateTimes(targetShiftDateStr, assignedShift, earlyWindowMinutes, policyGraceMinutes);
    // 3. If employee is currently Checked In (and not Checked Out)
    if (activeRecord && hasValidIn(activeRecord) && !hasValidOut(activeRecord)) {
        return {
            state: 'CHECKED_IN',
            canCheckIn: false,
            canCheckOut: true,
            assignedShift,
            shiftDate: targetShiftDateStr,
            shiftStartDateTime: times.shiftStartDateTime.toISOString(),
            shiftEndDateTime: times.shiftEndDateTime.toISOString(),
            earlyCheckInDateTime: times.earlyCheckInDateTime.toISOString(),
            graceEndDateTime: times.graceEndDateTime.toISOString(),
            countdownSeconds: 0,
            isWithinGrace: false,
            isLateCheckIn: false,
            activeAttendance: activeRecord,
            message: `Checked in at ${activeRecord.checkIn}. Shift ends at ${formatMinutesOrDateToAmPm(times.shiftEndDateTime)}.`,
            shiftStartDisplay: formatMinutesOrDateToAmPm(times.shiftStartDateTime),
            shiftEndDisplay: formatMinutesOrDateToAmPm(times.shiftEndDateTime),
            checkInOpenDisplay: formatMinutesOrDateToAmPm(times.earlyCheckInDateTime),
            gracePeriodMins: times.effectiveGraceMins,
            lateAfterDisplay: formatMinutesOrDateToAmPm(times.graceEndDateTime),
            expectedStatus: (activeRecord.status === 'Late' ? 'Late' : 'Present'),
            timeZone,
            isHoliday: Boolean(holidayInfo?.isHoliday),
            holidayName: holidayInfo?.holidayName,
            isOnApprovedLeave: Boolean(leaveInfo?.isOnApprovedLeave),
            leaveType: leaveInfo?.leaveType,
        };
    }
    // 4. Employee has NOT checked in yet for targetShiftDateStr:
    // A) Before the 3-hour early check-in window -> UPCOMING (Blocked as too early)
    if (now.getTime() < times.earlyCheckInDateTime.getTime()) {
        const diffMs = Math.max(0, times.earlyCheckInDateTime.getTime() - now.getTime());
        const countdownSeconds = Math.floor(diffMs / 1000);
        return {
            state: 'UPCOMING',
            canCheckIn: false,
            canCheckOut: false,
            assignedShift,
            shiftDate: targetShiftDateStr,
            shiftStartDateTime: times.shiftStartDateTime.toISOString(),
            shiftEndDateTime: times.shiftEndDateTime.toISOString(),
            earlyCheckInDateTime: times.earlyCheckInDateTime.toISOString(),
            graceEndDateTime: times.graceEndDateTime.toISOString(),
            countdownSeconds,
            isWithinGrace: false,
            isLateCheckIn: false,
            message: `Check-in for ${assignedShift.shiftName} opens at ${formatMinutesOrDateToAmPm(times.earlyCheckInDateTime)} (3 hours before ${formatMinutesOrDateToAmPm(times.shiftStartDateTime)} shift start).`,
            shiftStartDisplay: formatMinutesOrDateToAmPm(times.shiftStartDateTime),
            shiftEndDisplay: formatMinutesOrDateToAmPm(times.shiftEndDateTime),
            checkInOpenDisplay: formatMinutesOrDateToAmPm(times.earlyCheckInDateTime),
            gracePeriodMins: times.effectiveGraceMins,
            lateAfterDisplay: formatMinutesOrDateToAmPm(times.graceEndDateTime),
            expectedStatus: 'Present',
            timeZone,
            isHoliday: Boolean(holidayInfo?.isHoliday),
            holidayName: holidayInfo?.holidayName,
            isOnApprovedLeave: Boolean(leaveInfo?.isOnApprovedLeave),
            leaveType: leaveInfo?.leaveType,
        };
    }
    // B) Within the active shift attendance window (from 3h before shiftStart up to shiftEnd + 4h buffer,
    //    or before next day's 3-hour early check-in window opens)
    const postShiftCheckInCutoff = new Date(times.shiftEndDateTime.getTime() + 2 * 60 * 60 * 1000);
    if (now.getTime() <= postShiftCheckInCutoff.getTime()) {
        const isWithinGrace = now.getTime() <= times.graceEndDateTime.getTime();
        const isLateCheckIn = now.getTime() > times.graceEndDateTime.getTime();
        const expectedStatus = isLateCheckIn ? 'Late' : 'Present';
        let statusMsg = `Check-in open for ${assignedShift.shiftName}.`;
        if (now.getTime() < times.shiftStartDateTime.getTime()) {
            statusMsg = `Early check-in open for ${assignedShift.shiftName} (Starts at ${formatMinutesOrDateToAmPm(times.shiftStartDateTime)}).`;
        }
        else if (isWithinGrace) {
            statusMsg = `Within ${times.effectiveGraceMins}-min grace window (until ${formatMinutesOrDateToAmPm(times.graceEndDateTime)}) — will be marked Present.`;
        }
        else {
            statusMsg = `Past ${formatMinutesOrDateToAmPm(times.graceEndDateTime)} grace cutoff — check-in is allowed and will be marked Late.`;
        }
        return {
            state: 'CHECK_IN_AVAILABLE',
            canCheckIn: true,
            canCheckOut: false,
            assignedShift,
            shiftDate: targetShiftDateStr,
            shiftStartDateTime: times.shiftStartDateTime.toISOString(),
            shiftEndDateTime: times.shiftEndDateTime.toISOString(),
            earlyCheckInDateTime: times.earlyCheckInDateTime.toISOString(),
            graceEndDateTime: times.graceEndDateTime.toISOString(),
            countdownSeconds: 0,
            isWithinGrace,
            isLateCheckIn,
            message: statusMsg,
            shiftStartDisplay: formatMinutesOrDateToAmPm(times.shiftStartDateTime),
            shiftEndDisplay: formatMinutesOrDateToAmPm(times.shiftEndDateTime),
            checkInOpenDisplay: formatMinutesOrDateToAmPm(times.earlyCheckInDateTime),
            gracePeriodMins: times.effectiveGraceMins,
            lateAfterDisplay: formatMinutesOrDateToAmPm(times.graceEndDateTime),
            expectedStatus,
            timeZone,
            isHoliday: Boolean(holidayInfo?.isHoliday),
            holidayName: holidayInfo?.holidayName,
            isOnApprovedLeave: Boolean(leaveInfo?.isOnApprovedLeave),
            leaveType: leaveInfo?.leaveType,
        };
    }
    // C) Past today's shift window -> waiting for tomorrow's shift
    const nextTimes = calculateShiftDateTimes(tomorrowStr, assignedShift, earlyWindowMinutes, policyGraceMinutes);
    const diffMs = Math.max(0, nextTimes.earlyCheckInDateTime.getTime() - now.getTime());
    const countdownSeconds = Math.floor(diffMs / 1000);
    return {
        state: 'WAITING_FOR_NEXT_SHIFT',
        canCheckIn: false,
        canCheckOut: false,
        assignedShift,
        shiftDate: tomorrowStr,
        shiftStartDateTime: nextTimes.shiftStartDateTime.toISOString(),
        shiftEndDateTime: nextTimes.shiftEndDateTime.toISOString(),
        earlyCheckInDateTime: nextTimes.earlyCheckInDateTime.toISOString(),
        graceEndDateTime: nextTimes.graceEndDateTime.toISOString(),
        countdownSeconds,
        isWithinGrace: false,
        isLateCheckIn: false,
        message: `Shift window for today has closed. Next check-in opens at ${formatMinutesOrDateToAmPm(nextTimes.earlyCheckInDateTime)}.`,
        shiftStartDisplay: formatMinutesOrDateToAmPm(nextTimes.shiftStartDateTime),
        shiftEndDisplay: formatMinutesOrDateToAmPm(nextTimes.shiftEndDateTime),
        checkInOpenDisplay: formatMinutesOrDateToAmPm(nextTimes.earlyCheckInDateTime),
        gracePeriodMins: nextTimes.effectiveGraceMins,
        lateAfterDisplay: formatMinutesOrDateToAmPm(nextTimes.graceEndDateTime),
        expectedStatus: 'Present',
        timeZone,
        isHoliday: Boolean(holidayInfo?.isHoliday),
        holidayName: holidayInfo?.holidayName,
        isOnApprovedLeave: Boolean(leaveInfo?.isOnApprovedLeave),
        leaveType: leaveInfo?.leaveType,
    };
}
//# sourceMappingURL=shiftAttendanceEngine.js.map