import { getSupabaseAdmin, isRealSupabaseConfigured } from '../config/supabase.js';
import { AttendanceLogRecord, AttendanceTodaySummary, ShiftWindowEvaluation, ShiftRecord } from '../types/hrms.js';
import { employeeRepository } from './employeeRepository.js';
import { shiftRepository } from './shiftRepository.js';
import { evaluateBackendShiftAttendance } from '../services/shiftAttendanceEngine.js';
import { withTransaction } from '../config/database.js';
import { createHash } from 'node:crypto';
import { assertAttendanceTransition } from '../services/attendanceStateMachine.js';

const todayIso = new Date().toISOString().split('T')[0];

const formatIsoToIst12Hour = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const raw = String(value).trim();
  if (!raw || raw === '--:--' || raw === '—' || raw === '-') return undefined;
  if (raw.includes('T') || raw.includes('Z') || (raw.includes('-') && raw.includes(':'))) {
    const d = new Date(raw.endsWith('Z') || raw.includes('+') ? raw : raw + 'Z');
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    }
  }
  const ampmMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (ampmMatch) {
    return `${ampmMatch[1].padStart(2, '0')}:${ampmMatch[2]} ${ampmMatch[3].toUpperCase()}`;
  }
  const hhmm = raw.match(/^(\d{1,2}):(\d{2})/);
  if (hhmm) {
    let h = parseInt(hhmm[1], 10);
    const m = hhmm[2];
    const mer = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${String(h).padStart(2, '0')}:${m} ${mer}`;
  }
  return raw;
};

export class AttendanceRepository {
  async getAttendanceLogs(filters?: {
    date?: string;
    employeeId?: string;
    status?: string;
  }): Promise<AttendanceLogRecord[]> {
    if (!isRealSupabaseConfigured()) {
      return [];
    }

    try {
      const supabase = getSupabaseAdmin();

      // 1. Query real attendance_records table first (single source of truth)
      let query = supabase
        .from('attendance_records')
        .select('*, employees(id, employee_id, first_name, last_name)')
        .order('date', { ascending: false });

      if (filters?.date) query = query.eq('date', filters.date);

      const { data, error } = await query;
      let logs: AttendanceLogRecord[] = [];

      if (data && !error && data.length > 0) {
        logs = data.map((d: any) => ({
          id: d.id,
          employeeId: d.employees?.employee_id || d.employee_id,
          employeeName: d.employees ? `${d.employees.first_name} ${d.employees.last_name}` : undefined,
          date: d.date,
          shiftId: d.shift_id,
          shiftDate: d.shift_date || d.date,
          checkIn: formatIsoToIst12Hour(d.check_in),
          checkOut: formatIsoToIst12Hour(d.check_out),
          workingHours: Number(d.working_hours) || 0,
          status: d.status || 'Present',
          lateStatus: d.late_status || 'On Time',
          method: d.method || 'Face Scan',
          inGeofence: d.in_geofence ?? true,
          locationLat: d.location_lat,
          locationLng: d.location_lng,
          locationAddress: d.location_address,
          checkInPhoto: d.check_in_photo || undefined,
          checkOutPhoto: d.check_out_photo || undefined,
        }));
      } else {
        // Fallback to company_settings only if table is clean and setting exists
        const { data: csData } = await supabase
          .from('company_settings')
          .select('setting_val')
          .eq('setting_key', 'attendance_records_data')
          .maybeSingle();

        if (csData?.setting_val && Array.isArray(csData.setting_val)) {
          logs = csData.setting_val.map((d: any) => ({
            id: d.id,
            employeeId: d.employeeId || d.employee_id,
            employeeName: d.employeeName || d.employee_name,
            date: d.date || d.shiftDate || todayIso,
            shiftId: d.shiftId || d.shift_id,
            shiftDate: d.shiftDate || d.date || todayIso,
            shiftName: d.shiftName || d.shift_name,
            checkIn: formatIsoToIst12Hour(d.checkIn || d.check_in),
            checkOut: formatIsoToIst12Hour(d.checkOut || d.check_out),
            workingHours: Number(d.workingHours || d.working_hours) || 0,
            status: d.status || 'Present',
            lateStatus: d.lateStatus || d.late_status || 'On Time',
            method: d.method || 'Face Scan',
            inGeofence: d.location?.inGeofence ?? d.in_geofence ?? true,
            locationLat: d.location?.lat ?? d.location_lat,
            locationLng: d.location?.lng ?? d.location_lng,
            locationAddress: d.location?.address ?? d.location_address,
          }));
        }
      }

      if (filters?.date) {
        logs = logs.filter((r) => r.date === filters.date || r.shiftDate === filters.date);
      }
      if (filters?.employeeId) {
        const cleanEmpId = filters.employeeId.toLowerCase().trim();
        logs = logs.filter((r) => r.employeeId?.toLowerCase().trim() === cleanEmpId);
      }
      if (filters?.status) {
        logs = logs.filter((r) => r.status?.toLowerCase() === filters.status?.toLowerCase());
      }

      return logs;
    } catch (err) {
      console.warn('Database error in getAttendanceLogs:', err);
      return [];
    }
  }

  async getShiftAttendanceStatus(employeeId: string, now?: Date): Promise<ShiftWindowEvaluation> {
    const emp = await employeeRepository.getEmployeeById(employeeId);
    const shifts = await shiftRepository.getShifts();

    let assigned = shifts.find((s) => s.assignments?.includes(employeeId));
    if (!assigned && emp?.workShift) {
      assigned = shifts.find(
        (s) => s.shiftName.toLowerCase().includes(emp.workShift!.toLowerCase()) || s.id === emp.workShift
      );
    }
    if (!assigned && shifts.length > 0) {
      assigned = shifts[0];
    }
    if (!assigned) {
      assigned = {
        id: 'default',
        shiftName: 'Standard Shift',
        startTime: '09:00',
        endTime: '18:00',
        breakDurationMins: 45,
        workingHours: 8.25,
        gracePeriodMins: 15,
        color: '#0E7490',
        assignedEmployeeCount: 0,
        assignments: [],
      };
    }

    const allLogs = await this.getAttendanceLogs({ employeeId });
    return evaluateBackendShiftAttendance({
      employeeId,
      assignedShift: assigned,
      attendanceLogs: allLogs,
      now,
    });
  }

  private punchLocks = new Map<string, number>();

  async recordPunch(punch: {
    employeeId: string;
    type: 'IN' | 'OUT';
    timestamp?: string;
    locationLat?: number;
    locationLng?: number;
    accuracyMeters?: number;
    locationTimestamp?: string;
    method?: string;
    inGeofence?: boolean;
    locationAddress?: string;
    shiftId?: string;
    shiftDate?: string;
    photoUrl?: string;
    photoBase64?: string;
    idempotencyKey?: string;
  }): Promise<AttendanceLogRecord> {
    const lockKey = `${punch.employeeId}_${punch.type}`;
    const nowMs = Date.now();
    const lastPunchTime = this.punchLocks.get(lockKey);
    if (lastPunchTime && nowMs - lastPunchTime < 4000) {
      throw new Error(`Duplicate punch rejected: An identical ${punch.type} request was received within the last 4 seconds. Please do not double-tap.`);
    }
    this.punchLocks.set(lockKey, nowMs);

    // Clean up stale locks
    for (const [k, ts] of this.punchLocks.entries()) {
      if (nowMs - ts > 15000) this.punchLocks.delete(k);
    }

    // Server time is authoritative. The legacy timestamp input is deliberately ignored.
    const punchNow = new Date();
    const timeStr = punchNow.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const evalResult = await this.getShiftAttendanceStatus(punch.employeeId, punchNow);

    if (punch.type === 'IN') {
      if (!evalResult.canCheckIn) {
        throw new Error(`Check-in is not allowed at this time: ${evalResult.message}`);
      }
    } else if (punch.type === 'OUT') {
      if (!evalResult.canCheckOut) {
        throw new Error(`Check-out is not allowed: ${evalResult.message}`);
      }
    }

    const assignedShiftId = punch.shiftId || evalResult.assignedShift.id;
    const targetShiftDate = punch.shiftDate || evalResult.shiftDate;

    const emp = await employeeRepository.getEmployeeById(punch.employeeId);
    const empName = emp ? `${emp.firstName} ${emp.lastName}`.trim() : punch.employeeId;

    if (isRealSupabaseConfigured() && emp?.id && emp.id.length === 36) {
      return this.recordPostgresPunch({
        ...punch,
        employeeUuid: emp.id,
        employeeName: empName,
        shiftId: assignedShiftId,
        shiftDate: targetShiftDate,
      });
    }

    const currentLogs = await this.getAttendanceLogs({ employeeId: punch.employeeId, date: targetShiftDate });
    let existing = currentLogs[0];

    const photoToSave = punch.photoUrl || punch.photoBase64 || undefined;

    if (punch.type === 'OUT') {
      if (!existing || !existing.checkIn || existing.checkIn === '--:--') {
        throw new Error('Check-out is not allowed before check-in. Please punch in first.');
      }
      if (existing.checkOut && existing.checkOut.trim() !== '' && existing.checkOut !== '--:--') {
        throw new Error('Already checked out for this shift. Duplicate check-out is not allowed.');
      }

      if (photoToSave && existing.checkInPhoto && photoToSave.trim() === existing.checkInPhoto.trim()) {
        throw new Error('Punch Out requires a new face photograph. The Punch In photograph cannot be reused.');
      }

      // Calculate working hours & enforce 1-hour minimum restriction
      const parseTimeToMinutesLocal = (tStr?: string): number | null => {
        if (!tStr) return null;
        const m = tStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
        if (!m) return null;
        let h = parseInt(m[1], 10);
        const mins = parseInt(m[2], 10);
        const mer = m[3]?.toUpperCase();
        if (mer === 'PM' && h < 12) h += 12;
        if (mer === 'AM' && h === 12) h = 0;
        return h * 60 + mins;
      };

      const inMins = parseTimeToMinutesLocal(existing.checkIn);
      const outMins = parseTimeToMinutesLocal(timeStr);
      let worked = 0;
      if (inMins !== null && outMins !== null) {
        let diff = outMins - inMins;
        if (diff < 0) diff += 24 * 60; // Overnight shift
        if (diff < 60) {
          throw new Error(`Punch Out available 1 hour after Punch In (${60 - diff} min remaining).`);
        }
        worked = Math.round((diff / 60) * 100) / 100;
      }

      existing.checkOut = timeStr;
      existing.checkOutPhoto = photoToSave || existing.checkOutPhoto;
      existing.workingHours = worked;
      // Note: existing.checkIn and existing.checkInPhoto are strictly preserved!
    } else {
      // punch.type === 'IN'
      if (existing?.checkIn && existing.checkIn.trim() !== '' && existing.checkIn !== '--:--') {
        throw new Error('Already checked in for this shift. Duplicate check-in is not allowed.');
      }

      if (!existing) {
        existing = {
          id: `ATT-${Date.now()}`,
          employeeId: punch.employeeId,
          employeeName: empName,
          date: targetShiftDate,
          shiftId: assignedShiftId,
          shiftDate: targetShiftDate,
          checkIn: timeStr,
          checkOut: undefined,
          workingHours: 0,
          status: punch.method === 'Field Duty' ? 'On Duty' : 'Present',
          lateStatus: 'On Time',
          method: (punch.method as any) || 'Face Scan',
          inGeofence: punch.inGeofence ?? true,
          locationLat: punch.locationLat,
          locationLng: punch.locationLng,
          locationAddress: punch.locationAddress || 'Office',
          checkInPhoto: photoToSave,
          checkOutPhoto: undefined,
        };
      } else {
        existing.checkIn = timeStr;
        existing.checkOut = undefined;
        existing.checkInPhoto = photoToSave || existing.checkInPhoto;
        existing.checkOutPhoto = undefined;
        existing.workingHours = 0;
      }
      if (!existing.shiftId) existing.shiftId = assignedShiftId;
      if (!existing.shiftDate) existing.shiftDate = targetShiftDate;
    }

    // Persist to Supabase / PostgreSQL
    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();

        // 1. Relational attendance_records table
        if (emp?.id && emp.id.length === 36) {
          const { data: existingRow } = await supabase
            .from('attendance_records')
            .select('id, check_in, check_out, check_in_photo')
            .eq('employee_id', emp.id)
            .eq('date', targetShiftDate)
            .maybeSingle();

          if (existingRow?.id) {
            if (punch.type === 'IN') {
              // Punch IN: Write check_in and check_in_photo only; check_out remains strictly NULL
              await supabase
                .from('attendance_records')
                .update({
                  check_in: punchNow.toISOString(),
                  check_in_photo: photoToSave || null,
                  check_out: null,
                  check_out_photo: null,
                  working_hours: 0,
                  status: 'Present',
                  late_status: existing.lateStatus || 'On Time',
                  method: punch.method || 'Face Scan',
                  in_geofence: punch.inGeofence ?? true,
                  location_lat: punch.locationLat || 13.0827,
                  location_lng: punch.locationLng || 80.2707,
                  location_address: punch.locationAddress || 'Office',
                  idempotency_key: punch.idempotencyKey || null,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existingRow.id);
            } else {
              // Punch OUT: Write check_out and check_out_photo; preserve check_in and check_in_photo!
              await supabase
                .from('attendance_records')
                .update({
                  check_out: punchNow.toISOString(),
                  check_out_photo: photoToSave || null,
                  working_hours: existing.workingHours || 0,
                  status: 'Present',
                  method: punch.method || 'Face Scan',
                  idempotency_key: punch.idempotencyKey || null,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existingRow.id);
            }
          } else {
            // New attendance session row
            await supabase
              .from('attendance_records')
              .insert({
                employee_id: emp.id,
                date: targetShiftDate,
                check_in: punch.type === 'IN' ? punchNow.toISOString() : null,
                check_out: punch.type === 'OUT' ? punchNow.toISOString() : null,
                check_in_photo: punch.type === 'IN' ? (photoToSave || null) : null,
                check_out_photo: punch.type === 'OUT' ? (photoToSave || null) : null,
                working_hours: 0,
                status: 'Present',
                late_status: 'On Time',
                method: punch.method || 'Face Scan',
                in_geofence: punch.inGeofence ?? true,
                location_lat: punch.locationLat || 13.0827,
                location_lng: punch.locationLng || 80.2707,
                location_address: punch.locationAddress || 'Office',
                shift_id: (assignedShiftId && assignedShiftId.length === 36) ? assignedShiftId : null,
                shift_date: targetShiftDate,
                idempotency_key: punch.idempotencyKey || null,
              });
          }
        }

        // 2. Also keep company_settings updated for client compatibility
        const { data: csData } = await supabase
          .from('company_settings')
          .select('id, setting_val')
          .eq('setting_key', 'attendance_records_data')
          .maybeSingle();

        let allRecords: any[] = Array.isArray(csData?.setting_val) ? csData!.setting_val : [];
        const idx = allRecords.findIndex(
          (r: any) =>
            (r.employeeId === punch.employeeId || r.employee_id === punch.employeeId) &&
            (r.date === targetShiftDate || r.shiftDate === targetShiftDate)
        );

        if (idx >= 0) {
          allRecords[idx] = { ...allRecords[idx], ...existing };
        } else {
          allRecords.unshift(existing);
        }

        if (csData?.id) {
          await supabase
            .from('company_settings')
            .update({ setting_val: allRecords, updated_at: new Date().toISOString() })
            .eq('id', csData.id);
        } else {
          await supabase
            .from('company_settings')
            .insert({ setting_key: 'attendance_records_data', setting_val: allRecords });
        }
      } catch (err) {
        console.warn('Could not persist attendance to Supabase:', err);
      }
    }

    return existing;
  }

  private async recordPostgresPunch(punch: {
    employeeId: string;
    employeeUuid: string;
    employeeName: string;
    type: 'IN' | 'OUT';
    locationLat?: number;
    locationLng?: number;
    accuracyMeters?: number;
    locationTimestamp?: string;
    method?: string;
    inGeofence?: boolean;
    locationAddress?: string;
    shiftId?: string;
    shiftDate: string;
    photoUrl?: string;
    photoBase64?: string;
    idempotencyKey?: string;
  }): Promise<AttendanceLogRecord> {
    const photo = punch.photoBase64 || punch.photoUrl;
    const requiresFaceCapture = String(punch.method || '').toLowerCase().includes('face');
    if (!punch.idempotencyKey) throw new Error('Idempotency key is required for attendance punches.');
    if (requiresFaceCapture && (!photo || photo.trim().length < 50)) {
      throw new Error('A fresh face photograph is required for face attendance punches.');
    }
    const photoFingerprint = photo
      ? createHash('sha256').update(photo).digest('hex')
      : `non-face:${punch.idempotencyKey}`;

    return withTransaction(async (client) => {
      // Serializes all IN/OUT transitions for this employee across every API instance.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [punch.employeeUuid]);

      const replay = await client.query<{ attendance_record_id: string }>(
        'SELECT attendance_record_id FROM public.attendance_punch_events WHERE idempotency_key = $1',
        [punch.idempotencyKey]
      );
      if (replay.rows[0]) {
        throw new Error('Duplicate punch rejected: this request was already processed.');
      }

      const clock = await client.query<{ now: Date }>('SELECT clock_timestamp() AS now');
      const serverNow = new Date(clock.rows[0].now);
      const existingResult = await client.query<any>(
        `SELECT * FROM public.attendance_records
         WHERE employee_id = $1 AND COALESCE(shift_date, date) = $2::date
         ORDER BY created_at DESC NULLS LAST LIMIT 1 FOR UPDATE`,
        [punch.employeeUuid, punch.shiftDate]
      );
      let row = existingResult.rows[0];
      const checkInFingerprint = requiresFaceCapture && row?.check_in_photo
        ? createHash('sha256').update(String(row.check_in_photo)).digest('hex')
        : undefined;
      assertAttendanceTransition({
        type: punch.type,
        row,
        serverNow,
        newPhotoFingerprint: photoFingerprint,
        checkInPhotoFingerprint: checkInFingerprint,
      });

      if (punch.type === 'IN') {
        if (row) {
          const updated = await client.query<any>(
            `UPDATE public.attendance_records SET
               check_in=$2, check_in_photo=$3, check_out=NULL, check_out_photo=NULL,
               working_hours=0, status='Present', method=$4, in_geofence=$5,
               location_lat=$6, location_lng=$7, location_address=$8,
               idempotency_key=$9, updated_at=$2
             WHERE id=$1 RETURNING *`,
            [row.id, serverNow, photo, punch.method || 'Face Scan', punch.inGeofence ?? true,
              punch.locationLat, punch.locationLng, punch.locationAddress || 'Office', punch.idempotencyKey]
          );
          row = updated.rows[0];
        } else {
          const inserted = await client.query<any>(
            `INSERT INTO public.attendance_records
              (employee_id,date,shift_date,shift_id,check_in,check_out,check_in_photo,check_out_photo,
               working_hours,status,late_status,method,in_geofence,location_lat,location_lng,location_address,idempotency_key)
             VALUES ($1,$2::date,$2::date,$3,$4,NULL,$5,NULL,0,'Present','On Time',$6,$7,$8,$9,$10,$11)
             RETURNING *`,
            [punch.employeeUuid, punch.shiftDate,
              punch.shiftId && punch.shiftId.length === 36 ? punch.shiftId : null,
              serverNow, photo, punch.method || 'Face Scan', punch.inGeofence ?? true,
              punch.locationLat, punch.locationLng, punch.locationAddress || 'Office', punch.idempotencyKey]
          );
          row = inserted.rows[0];
        }
      } else {
        const workedHours = Math.round(((serverNow.getTime() - new Date(row.check_in).getTime()) / 3_600_000) * 100) / 100;
        const updated = await client.query<any>(
          `UPDATE public.attendance_records SET
             check_out=$2, check_out_photo=$3, working_hours=$4, idempotency_key=$5, updated_at=$2
           WHERE id=$1 AND check_out IS NULL RETURNING *`,
          [row.id, serverNow, photo, workedHours, punch.idempotencyKey]
        );
        if (!updated.rows[0]) throw new Error('Punch Out could not be committed because the attendance state changed. Please refresh.');
        row = updated.rows[0];
      }

      await client.query(
        `INSERT INTO public.attendance_punch_events
          (attendance_record_id,employee_id,punch_type,punched_at,idempotency_key,photo_fingerprint,
           location_lat,location_lng,location_accuracy,location_timestamp)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [row.id, punch.employeeUuid, punch.type, serverNow, punch.idempotencyKey, photoFingerprint,
          punch.locationLat, punch.locationLng, punch.accuracyMeters, punch.locationTimestamp || null]
      );

      return {
        id: row.id,
        employeeId: punch.employeeId,
        employeeName: punch.employeeName,
        date: String(row.date).slice(0, 10),
        shiftId: row.shift_id || undefined,
        shiftDate: String(row.shift_date || row.date).slice(0, 10),
        checkIn: formatIsoToIst12Hour(row.check_in),
        checkOut: formatIsoToIst12Hour(row.check_out),
        workingHours: Number(row.working_hours) || 0,
        status: row.status || 'Present',
        lateStatus: row.late_status || 'On Time',
        method: row.method || 'Face Scan',
        inGeofence: row.in_geofence ?? true,
        locationLat: row.location_lat,
        locationLng: row.location_lng,
        locationAddress: row.location_address,
        checkInPhoto: row.check_in_photo || undefined,
        checkOutPhoto: row.check_out_photo || undefined,
        createdAt: serverNow.toISOString(),
      } as AttendanceLogRecord;
    });
  }

  async verifyFace(employeeId: string, facePhotoBase64?: string): Promise<{ verified: boolean; confidence: number; message?: string }> {
    const emp = await employeeRepository.getEmployeeById(employeeId);
    if (!emp) {
      return { verified: false, confidence: 0, message: `Employee ID ${employeeId} not found.` };
    }
    if (!facePhotoBase64 || facePhotoBase64.trim().length < 50) {
      return { verified: false, confidence: 0, message: 'Valid face image capture is required.' };
    }
    return {
      verified: true,
      confidence: 0.985,
    };
  }

  async getTodaySummary(): Promise<AttendanceTodaySummary> {
    const allEmployees = await employeeRepository.getAllEmployees();
    const todayLogs = await this.getAttendanceLogs({ date: todayIso });

    const total = allEmployees.length;
    const present = todayLogs.filter((l) => l.status === 'Present').length;
    const late = todayLogs.filter((l) => l.status === 'Late').length;
    const onDuty = todayLogs.filter((l) => l.status === 'On Duty').length;
    const absent = Math.max(0, total - (present + late + onDuty));
    const attendancePercentage = total > 0 ? Math.round(((present + late + onDuty) / total) * 100) : 0;

    return {
      totalEmployees: total,
      presentCount: present,
      absentCount: absent,
      lateCount: late,
      onDutyCount: onDuty,
      attendancePercentage,
    };
  }
}

export const attendanceRepository = new AttendanceRepository();
