export const MINIMUM_PUNCH_GAP_MS = 60 * 60 * 1000;
export const getAttendanceState = (row, serverNow) => {
    if (!row?.check_in)
        return 'NOT_CHECKED_IN';
    if (row.check_out)
        return 'CHECKED_OUT';
    return serverNow.getTime() >= new Date(row.check_in).getTime() + MINIMUM_PUNCH_GAP_MS
        ? 'CHECK_OUT_AVAILABLE'
        : 'CHECKED_IN';
};
export const assertAttendanceTransition = (params) => {
    const state = getAttendanceState(params.row, params.serverNow);
    if (params.type === 'IN') {
        if (state !== 'NOT_CHECKED_IN')
            throw new Error('Already checked in for this shift. Duplicate check-in is not allowed.');
        return 'CHECKED_IN';
    }
    if (state === 'NOT_CHECKED_IN')
        throw new Error('Check-out is not allowed before check-in. Please punch in first.');
    if (state === 'CHECKED_OUT')
        throw new Error('Already checked out for this shift. Duplicate check-out is not allowed.');
    if (state === 'CHECKED_IN') {
        const earliest = new Date(new Date(params.row.check_in).getTime() + MINIMUM_PUNCH_GAP_MS);
        const availableAt = earliest.toLocaleTimeString('en-US', {
            timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true,
        });
        throw new Error(`Punch Out available at ${availableAt}.`);
    }
    if (params.checkInPhotoFingerprint && params.checkInPhotoFingerprint === params.newPhotoFingerprint) {
        throw new Error('Punch Out requires a new face photograph. The Punch In photograph cannot be reused.');
    }
    return 'CHECKED_OUT';
};
//# sourceMappingURL=attendanceStateMachine.js.map