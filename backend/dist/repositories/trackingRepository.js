// ==============================================================================
// VRM Enterprise HRMS — PostgreSQL Tracking Repository
// ==============================================================================
import { query, withTransaction } from '../config/database.js';
import { employeeRepository } from './employeeRepository.js';
import { validateLocationPoint, calculateHaversineMeters, estimateRoadDistanceMeters, metersToKm, } from '../services/gpsAccuracyEngine.js';
const isUuid = (val) => Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));
export class TrackingRepository {
    /**
     * Helper to resolve any employee identifier (e.g. 'VRM-027' or UUID) to employee UUID.
     */
    async resolveEmployeeUuid(identifier) {
        if (!identifier)
            return null;
        const emp = await employeeRepository.getEmployeeById(identifier);
        if (!emp)
            return null;
        return {
            uuid: emp.id,
            code: emp.employeeId || emp.id,
            name: `${emp.firstName} ${emp.lastName}`.trim(),
            dept: emp.department || 'Operations',
        };
    }
    // --------------------------------------------------------------------------
    // Assignments
    // --------------------------------------------------------------------------
    async getAssignments(filters) {
        try {
            const conditions = [];
            const values = [];
            let idx = 1;
            if (filters?.employeeId) {
                let empUuid = filters.employeeId;
                if (!isUuid(empUuid)) {
                    const emp = await employeeRepository.getEmployeeById(empUuid);
                    if (emp?.id)
                        empUuid = emp.id;
                }
                conditions.push(`(fa.employee_id = $${idx} OR e.employee_id = $${idx})`);
                values.push(empUuid);
                idx++;
            }
            if (filters?.date) {
                conditions.push(`($${idx}::date >= fa.start_date AND $${idx}::date <= fa.end_date)`);
                values.push(filters.date);
                idx++;
            }
            if (filters?.status) {
                conditions.push(`LOWER(fa.status) = LOWER($${idx})`);
                values.push(filters.status);
                idx++;
            }
            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
            const sql = `
        SELECT 
          fa.id,
          fa.employee_id,
          COALESCE(e.employee_id, fa.employee_id::text) AS employee_code,
          TRIM(CONCAT(e.first_name, ' ', e.last_name)) AS employee_name,
          e.avatar_url AS employee_avatar,
          COALESCE(fa.department, e.department, 'Operations') AS department,
          fa.duty_type,
          fa.schedule_type,
          fa.start_date::text AS start_date,
          fa.end_date::text AS end_date,
          fa.start_time::text AS start_time,
          fa.end_time::text AS end_time,
          fa.customer_site_name,
          fa.site_address,
          fa.purpose,
          fa.tracking_required,
          fa.travel_km_required,
          fa.attendance_type,
          fa.site_lat,
          fa.site_lng,
          fa.allowed_radius_meters,
          fa.notes,
          fa.status,
          fa.created_by,
          fa.created_at,
          fa.updated_at
        FROM public.field_duty_assignments fa
        LEFT JOIN public.employees e ON e.id = fa.employee_id
        ${whereClause}
        ORDER BY fa.start_date DESC, fa.created_at DESC
      `;
            const result = await query(sql, values);
            return result.rows.map((d) => ({
                id: d.id,
                employeeId: d.employee_code || d.employee_id,
                employeeName: d.employee_name || 'Staff',
                employeeAvatar: d.employee_avatar,
                department: d.department,
                dutyType: d.duty_type,
                scheduleType: d.schedule_type,
                startDate: d.start_date,
                endDate: d.end_date,
                startTime: (d.start_time || '09:00').substring(0, 5),
                endTime: (d.end_time || '18:00').substring(0, 5),
                customerSiteName: d.customer_site_name,
                siteAddress: d.site_address || '',
                purpose: d.purpose,
                trackingRequired: Boolean(d.tracking_required),
                travelKmRequired: Boolean(d.travel_km_required),
                attendanceType: d.attendance_type,
                siteLat: d.site_lat ? Number(d.site_lat) : undefined,
                siteLng: d.site_lng ? Number(d.site_lng) : undefined,
                allowedRadiusMeters: Number(d.allowed_radius_meters) || 200,
                notes: d.notes,
                status: d.status,
                createdBy: d.created_by,
                createdAt: d.created_at,
                updatedAt: d.updated_at,
            }));
        }
        catch (err) {
            console.error('[TrackingRepository] getAssignments error:', err);
            return [];
        }
    }
    async createAssignment(data) {
        if (!data.employeeId) {
            throw new Error('employeeId is required for field duty assignment');
        }
        const empInfo = await this.resolveEmployeeUuid(data.employeeId);
        if (!empInfo) {
            throw new Error(`Employee not found for identifier: ${data.employeeId}`);
        }
        const todayIso = new Date().toISOString().split('T')[0];
        const sDate = data.startDate || todayIso;
        const eDate = data.endDate || sDate;
        const sTime = data.startTime || '09:00';
        const eTime = data.endTime || '18:00';
        const insertSql = `
      INSERT INTO public.field_duty_assignments (
        employee_id,
        department,
        duty_type,
        schedule_type,
        start_date,
        end_date,
        start_time,
        end_time,
        customer_site_name,
        site_address,
        purpose,
        tracking_required,
        travel_km_required,
        attendance_type,
        site_lat,
        site_lng,
        allowed_radius_meters,
        notes,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `;
        const values = [
            empInfo.uuid,
            data.department || empInfo.dept,
            data.dutyType || 'Site Visit',
            data.scheduleType || 'One Day',
            sDate,
            eDate,
            sTime,
            eTime,
            data.customerSiteName || 'Client Site',
            data.siteAddress || 'Site Location',
            data.purpose || 'Field Duty Operations',
            data.trackingRequired ?? true,
            data.travelKmRequired ?? true,
            data.attendanceType || 'Site Geofence',
            data.siteLat ?? 13.0827,
            data.siteLng ?? 80.2707,
            data.allowedRadiusMeters ?? 200,
            data.notes || null,
            data.status || 'Scheduled',
        ];
        const result = await query(insertSql, values);
        const row = result.rows[0];
        return {
            id: row.id,
            employeeId: empInfo.code,
            employeeName: empInfo.name,
            department: row.department,
            dutyType: row.duty_type,
            scheduleType: row.schedule_type,
            startDate: row.start_date,
            endDate: row.end_date,
            startTime: String(row.start_time).substring(0, 5),
            endTime: String(row.end_time).substring(0, 5),
            customerSiteName: row.customer_site_name,
            siteAddress: row.site_address,
            purpose: row.purpose,
            trackingRequired: Boolean(row.tracking_required),
            travelKmRequired: Boolean(row.travel_km_required),
            attendanceType: row.attendance_type,
            siteLat: row.site_lat ? Number(row.site_lat) : undefined,
            siteLng: row.site_lng ? Number(row.site_lng) : undefined,
            allowedRadiusMeters: Number(row.allowed_radius_meters),
            notes: row.notes,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    async updateAssignment(id, updates) {
        const fields = [];
        const values = [];
        let idx = 1;
        if (updates.status) {
            fields.push(`status = $${idx++}`);
            values.push(updates.status);
        }
        if (updates.customerSiteName) {
            fields.push(`customer_site_name = $${idx++}`);
            values.push(updates.customerSiteName);
        }
        if (updates.siteAddress) {
            fields.push(`site_address = $${idx++}`);
            values.push(updates.siteAddress);
        }
        if (updates.notes !== undefined) {
            fields.push(`notes = $${idx++}`);
            values.push(updates.notes);
        }
        if (fields.length === 0)
            return null;
        values.push(id);
        const sql = `
      UPDATE public.field_duty_assignments
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING *
    `;
        const result = await query(sql, values);
        if (result.rows.length === 0)
            return null;
        const row = result.rows[0];
        return {
            id: row.id,
            employeeId: row.employee_id,
            employeeName: 'Staff',
            department: row.department,
            dutyType: row.duty_type,
            scheduleType: row.schedule_type,
            startDate: row.start_date,
            endDate: row.end_date,
            startTime: String(row.start_time).substring(0, 5),
            endTime: String(row.end_time).substring(0, 5),
            customerSiteName: row.customer_site_name,
            siteAddress: row.site_address,
            purpose: row.purpose,
            trackingRequired: Boolean(row.tracking_required),
            travelKmRequired: Boolean(row.travel_km_required),
            attendanceType: row.attendance_type,
            allowedRadiusMeters: Number(row.allowed_radius_meters),
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    // --------------------------------------------------------------------------
    // Trips & Sessions
    // --------------------------------------------------------------------------
    async startTrip(params) {
        const empInfo = await this.resolveEmployeeUuid(params.employeeId);
        if (!empInfo) {
            throw new Error(`Employee not found: ${params.employeeId}`);
        }
        // Check if active trip already exists for this assignment
        const checkSql = `
      SELECT * FROM public.field_trip_sessions
      WHERE assignment_id = $1 AND employee_id = $2 AND status = 'Active'
      LIMIT 1
    `;
        const existing = await query(checkSql, [params.assignmentId, empInfo.uuid]);
        if (existing.rows.length > 0) {
            return this.mapTripRow(existing.rows[0], empInfo);
        }
        return withTransaction(async (client) => {
            // 1. Insert new trip session
            const insertTripSql = `
        INSERT INTO public.field_trip_sessions (
          assignment_id,
          employee_id,
          trip_start_time,
          start_lat,
          start_lng,
          start_address,
          total_km,
          recorded_distance_meters,
          road_matched_distance_meters,
          unverified_distance_meters,
          status,
          tracking_status,
          gps_status,
          last_gps_update,
          raw_points_count,
          accepted_points_count
        ) VALUES ($1, $2, NOW(), $3, $4, $5, 0.0, 0.0, 0.0, 0.0, 'Active', 'Travelling', 'GPS Active', NOW(), 1, 1)
        RETURNING *
      `;
            const tripRes = await client.query(insertTripSql, [
                params.assignmentId,
                empInfo.uuid,
                params.startLat,
                params.startLng,
                params.startAddress || 'Starting Point',
            ]);
            const tripRow = tripRes.rows[0];
            // 2. Insert initial location point
            const insertPointSql = `
        INSERT INTO public.field_location_points (
          trip_id,
          assignment_id,
          employee_id,
          recorded_at,
          latitude,
          longitude,
          accuracy,
          speed,
          heading,
          distance_from_prev_meters,
          is_rejected,
          source
        ) VALUES ($1, $2, $3, NOW(), $4, $5, 10, 0, 0, 0, FALSE, 'start_point')
        RETURNING *
      `;
            const ptRes = await client.query(insertPointSql, [
                tripRow.id,
                params.assignmentId,
                empInfo.uuid,
                params.startLat,
                params.startLng,
            ]);
            // 3. Mark assignment as Active
            await client.query(`UPDATE public.field_duty_assignments SET status = 'Active', updated_at = NOW() WHERE id = $1`, [params.assignmentId]);
            const trip = this.mapTripRow(tripRow, empInfo);
            trip.locationPoints = [this.mapLocationPointRow(ptRes.rows[0])];
            return trip;
        });
    }
    async recordLocationPoints(points) {
        if (points.length === 0) {
            return { added: 0, accepted: 0, totalKm: 0, recordedKm: 0, roadMatchedKm: 0 };
        }
        const tripId = points[0].tripId;
        return withTransaction(async (client) => {
            // 1. Fetch trip and last accepted point
            const tripRes = await client.query(`SELECT * FROM public.field_trip_sessions WHERE id = $1 AND status = 'Active' FOR UPDATE`, [tripId]);
            if (tripRes.rows.length === 0) {
                return { added: 0, accepted: 0, totalKm: 0, recordedKm: 0, roadMatchedKm: 0 };
            }
            const trip = tripRes.rows[0];
            const lastPtRes = await client.query(`SELECT * FROM public.field_location_points 
         WHERE trip_id = $1 AND is_rejected = FALSE 
         ORDER BY recorded_at DESC LIMIT 1`, [tripId]);
            let prevAccepted = lastPtRes.rows.length > 0
                ? this.mapLocationPointRow(lastPtRes.rows[0])
                : null;
            let recordedMeters = Number(trip.recorded_distance_meters || 0);
            let roadMatchedMeters = Number(trip.road_matched_distance_meters || recordedMeters);
            let unverifiedMeters = Number(trip.unverified_distance_meters || 0);
            let rawCount = Number(trip.raw_points_count || 0);
            let acceptedCount = Number(trip.accepted_points_count || 0);
            let rejectedCount = Number(trip.rejected_points_count || 0);
            let lastSpeed = 0;
            let lastRecordedAt = trip.last_gps_update || new Date().toISOString();
            for (const pt of points) {
                rawCount++;
                const validation = validateLocationPoint(pt, prevAccepted);
                if (!validation.accepted) {
                    rejectedCount++;
                    // Insert rejected point for audit trail
                    await client.query(`INSERT INTO public.field_location_points (
              trip_id, assignment_id, employee_id, recorded_at, latitude, longitude,
              accuracy, speed, heading, altitude, battery_level, synced_offline,
              distance_from_prev_meters, is_rejected, rejection_reason, source
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, TRUE, $14, $15)`, [
                        tripId,
                        trip.assignment_id,
                        trip.employee_id,
                        pt.recordedAt || new Date().toISOString(),
                        pt.latitude,
                        pt.longitude,
                        pt.accuracy ?? null,
                        pt.speed ?? 0,
                        pt.heading ?? null,
                        pt.altitude ?? null,
                        pt.batteryLevel ?? null,
                        pt.syncedOffline ?? false,
                        validation.distanceFromPrevMeters,
                        validation.rejectionReason,
                        pt.source || 'browser_watch',
                    ]);
                    continue;
                }
                // Accepted point
                acceptedCount++;
                lastSpeed = validation.calculatedSpeedKmh;
                lastRecordedAt = pt.recordedAt || new Date().toISOString();
                if (validation.isGap) {
                    // Missing / background gap
                    unverifiedMeters += validation.distanceFromPrevMeters;
                    const roadEst = estimateRoadDistanceMeters(validation.distanceFromPrevMeters);
                    roadMatchedMeters += roadEst;
                    // Record gap segment
                    if (prevAccepted) {
                        await client.query(`INSERT INTO public.field_visit_distance_segments (
                trip_id, segment_type, start_lat, start_lng, end_lat, end_lng,
                distance_meters, duration_seconds
              ) VALUES ($1, 'unverified_gap', $2, $3, $4, $5, $6, $7)`, [
                            tripId,
                            prevAccepted.latitude,
                            prevAccepted.longitude,
                            pt.latitude,
                            pt.longitude,
                            validation.distanceFromPrevMeters,
                            validation.gapDurationSeconds,
                        ]);
                    }
                }
                else {
                    // Continuous verified movement
                    recordedMeters += validation.distanceFromPrevMeters;
                    roadMatchedMeters += validation.distanceFromPrevMeters;
                    if (prevAccepted && validation.distanceFromPrevMeters >= 5) {
                        await client.query(`INSERT INTO public.field_visit_distance_segments (
                trip_id, segment_type, start_lat, start_lng, end_lat, end_lng,
                distance_meters, duration_seconds
              ) VALUES ($1, 'recorded', $2, $3, $4, $5, $6, $7)`, [
                            tripId,
                            prevAccepted.latitude,
                            prevAccepted.longitude,
                            pt.latitude,
                            pt.longitude,
                            validation.distanceFromPrevMeters,
                            Math.round(validation.timeDeltaSeconds),
                        ]);
                    }
                }
                const ptRes = await client.query(`INSERT INTO public.field_location_points (
            trip_id, assignment_id, employee_id, recorded_at, latitude, longitude,
            accuracy, speed, heading, altitude, battery_level, synced_offline,
            distance_from_prev_meters, is_rejected, source
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, FALSE, $14)
          RETURNING *`, [
                    tripId,
                    trip.assignment_id,
                    trip.employee_id,
                    lastRecordedAt,
                    pt.latitude,
                    pt.longitude,
                    pt.accuracy ?? null,
                    pt.speed ?? validation.calculatedSpeedKmh,
                    pt.heading ?? null,
                    pt.altitude ?? null,
                    pt.batteryLevel ?? null,
                    pt.syncedOffline ?? false,
                    validation.distanceFromPrevMeters,
                    pt.source || 'browser_watch',
                ]);
                prevAccepted = this.mapLocationPointRow(ptRes.rows[0]);
            }
            // 3. Compute final road-matched KM
            const finalKm = metersToKm(roadMatchedMeters > 0 ? roadMatchedMeters : recordedMeters);
            let trackingStatus = lastSpeed > 4 ? 'Travelling' : 'Stopped';
            // 4. Geofence arrival detection against assigned client destination
            if (trip.assignment_id && prevAccepted) {
                try {
                    const assignRes = await client.query(`SELECT site_lat, site_lng, allowed_radius_meters, customer_site_name, site_address 
             FROM public.field_duty_assignments WHERE id = $1`, [trip.assignment_id]);
                    if (assignRes.rows.length > 0) {
                        const assign = assignRes.rows[0];
                        if (assign.site_lat && assign.site_lng) {
                            const distToSite = calculateHaversineMeters(prevAccepted.latitude, prevAccepted.longitude, Number(assign.site_lat), Number(assign.site_lng));
                            const fenceRadius = Number(assign.allowed_radius_meters) || 150;
                            if (distToSite <= fenceRadius) {
                                trackingStatus = 'Arrived at destination';
                                const stopCheck = await client.query(`SELECT id FROM public.field_visit_stops WHERE trip_id = $1 AND stop_type = 'Client Site Arrival' LIMIT 1`, [tripId]);
                                if (stopCheck.rows.length === 0) {
                                    await client.query(`INSERT INTO public.field_visit_stops (
                      trip_id, assignment_id, employee_id, stop_type, latitude, longitude, address, arrived_at, duration_seconds
                    ) VALUES ($1, $2, $3, 'Client Site Arrival', $4, $5, $6, NOW(), 0)`, [
                                        tripId,
                                        trip.assignment_id,
                                        trip.employee_id,
                                        prevAccepted.latitude,
                                        prevAccepted.longitude,
                                        assign.site_address || assign.customer_site_name || 'Assigned Client Site',
                                    ]);
                                    await client.query(`UPDATE public.field_trip_sessions SET stop_count = stop_count + 1 WHERE id = $1`, [tripId]);
                                }
                            }
                        }
                    }
                }
                catch (fenceErr) {
                    console.warn('[trackingRepository] Geofence check warning:', fenceErr);
                }
            }
            await client.query(`UPDATE public.field_trip_sessions SET
          total_km = $1,
          recorded_distance_meters = $2,
          road_matched_distance_meters = $3,
          unverified_distance_meters = $4,
          raw_points_count = $5,
          accepted_points_count = $6,
          rejected_points_count = $7,
          tracking_status = $8,
          last_gps_update = $9,
          updated_at = NOW()
        WHERE id = $10`, [
                finalKm,
                Math.round(recordedMeters),
                Math.round(roadMatchedMeters),
                Math.round(unverifiedMeters),
                rawCount,
                acceptedCount,
                rejectedCount,
                trackingStatus,
                lastRecordedAt,
                tripId,
            ]);
            return {
                added: points.length,
                accepted: acceptedCount,
                totalKm: finalKm,
                recordedKm: metersToKm(recordedMeters),
                roadMatchedKm: metersToKm(roadMatchedMeters),
            };
        });
    }
    async endTrip(tripId, endLat, endLng, endAddress, totalKmOverride) {
        return withTransaction(async (client) => {
            const tripRes = await client.query(`SELECT * FROM public.field_trip_sessions WHERE id = $1 FOR UPDATE`, [tripId]);
            if (tripRes.rows.length === 0)
                return null;
            const trip = tripRes.rows[0];
            // Add final arrival point if provided
            if (endLat && endLng) {
                await client.query(`INSERT INTO public.field_location_points (
            trip_id, assignment_id, employee_id, recorded_at, latitude, longitude,
            accuracy, speed, distance_from_prev_meters, is_rejected, source
          ) VALUES ($1, $2, $3, NOW(), $4, $5, 10, 0, 0, FALSE, 'destination_arrival')`, [tripId, trip.assignment_id, trip.employee_id, endLat, endLng]);
            }
            const finalKm = totalKmOverride !== undefined ? totalKmOverride : Number(trip.total_km);
            const updateSql = `
        UPDATE public.field_trip_sessions SET
          end_lat = $1,
          end_lng = $2,
          end_address = $3,
          trip_end_time = NOW(),
          total_km = $4,
          status = 'Completed',
          tracking_status = 'Completed',
          updated_at = NOW()
        WHERE id = $5
        RETURNING *
      `;
            const completedRes = await client.query(updateSql, [
                endLat,
                endLng,
                endAddress || 'Destination Site',
                finalKm,
                tripId,
            ]);
            // Complete assignment
            await client.query(`UPDATE public.field_duty_assignments SET status = 'Completed', updated_at = NOW() WHERE id = $1`, [trip.assignment_id]);
            return this.mapTripRow(completedRes.rows[0]);
        });
    }
    async getTrips(filters) {
        try {
            const conditions = [];
            const values = [];
            let idx = 1;
            if (filters?.employeeId) {
                let empUuid = filters.employeeId;
                if (!isUuid(empUuid)) {
                    const emp = await employeeRepository.getEmployeeById(empUuid);
                    if (emp?.id)
                        empUuid = emp.id;
                }
                conditions.push(`(ts.employee_id = $${idx} OR e.employee_id = $${idx})`);
                values.push(empUuid);
                idx++;
            }
            if (filters?.status) {
                conditions.push(`LOWER(ts.status) = LOWER($${idx})`);
                values.push(filters.status);
                idx++;
            }
            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
            const sql = `
        SELECT 
          ts.*,
          COALESCE(e.employee_id, ts.employee_id::text) AS employee_code,
          TRIM(CONCAT(e.first_name, ' ', e.last_name)) AS employee_name,
          e.avatar_url AS employee_avatar,
          COALESCE(fa.department, e.department, 'Operations') AS department,
          COALESCE(fa.duty_type, 'Site Visit') AS duty_type,
          COALESCE(fa.customer_site_name, 'Site') AS customer_site_name
        FROM public.field_trip_sessions ts
        LEFT JOIN public.employees e ON e.id = ts.employee_id
        LEFT JOIN public.field_duty_assignments fa ON fa.id = ts.assignment_id
        ${whereClause}
        ORDER BY ts.trip_start_time DESC
      `;
            const result = await query(sql, values);
            const trips = [];
            for (const row of result.rows) {
                const trip = this.mapTripRow(row, {
                    uuid: row.employee_id,
                    code: row.employee_code,
                    name: row.employee_name,
                    dept: row.department,
                });
                // Fetch location points for this trip
                const ptsRes = await query(`SELECT * FROM public.field_location_points WHERE trip_id = $1 ORDER BY recorded_at ASC`, [row.id]);
                trip.locationPoints = ptsRes.rows.map((p) => this.mapLocationPointRow(p));
                trips.push(trip);
            }
            return trips;
        }
        catch (err) {
            console.error('[TrackingRepository] getTrips error:', err);
            return [];
        }
    }
    async getTripLocationPoints(tripId) {
        try {
            const sql = `
        SELECT * FROM public.field_location_points 
        WHERE trip_id = $1 
        ORDER BY recorded_at ASC
      `;
            const res = await query(sql, [tripId]);
            return res.rows.map((p) => this.mapLocationPointRow(p));
        }
        catch (err) {
            console.error('[TrackingRepository] getTripLocationPoints error:', err);
            return [];
        }
    }
    async getAlerts(status) {
        try {
            const whereClause = status ? `WHERE LOWER(status) = LOWER($1)` : '';
            const values = status ? [status] : [];
            const sql = `
        SELECT a.*, e.employee_id AS employee_code, TRIM(CONCAT(e.first_name, ' ', e.last_name)) AS employee_name, e.department
        FROM public.field_tracking_alerts a
        LEFT JOIN public.employees e ON e.id = a.employee_id
        ${whereClause}
        ORDER BY a.created_at DESC
      `;
            const res = await query(sql, values);
            return res.rows.map((r) => ({
                id: r.id,
                assignmentId: r.assignment_id,
                employeeId: r.employee_code || r.employee_id,
                employeeName: r.employee_name || 'Staff',
                department: r.department || 'Operations',
                alertType: r.alert_type,
                issueStartTime: r.issue_start_time,
                issueEndTime: r.issue_end_time,
                durationMinutes: r.duration_minutes,
                lastKnownLocation: r.last_known_location,
                lastKnownLat: r.last_known_lat,
                lastKnownLng: r.last_known_lng,
                status: r.status,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
            }));
        }
        catch (err) {
            console.error('[TrackingRepository] getAlerts error:', err);
            return [];
        }
    }
    async resolveAlert(alertId) {
        try {
            const sql = `
        UPDATE public.field_tracking_alerts SET
          status = 'Resolved',
          issue_end_time = NOW(),
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `;
            const res = await query(sql, [alertId]);
            if (res.rows.length === 0)
                return null;
            const r = res.rows[0];
            return {
                id: r.id,
                assignmentId: r.assignment_id,
                employeeId: r.employee_id,
                employeeName: 'Staff',
                department: 'Operations',
                alertType: r.alert_type,
                issueStartTime: r.issue_start_time,
                issueEndTime: r.issue_end_time,
                status: r.status,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
            };
        }
        catch (err) {
            console.error('[TrackingRepository] resolveAlert error:', err);
            return null;
        }
    }
    async getTrackingOverview() {
        try {
            const activeRes = await query(`SELECT COUNT(*) FROM public.field_trip_sessions WHERE status = 'Active'`);
            const alertsRes = await query(`SELECT COUNT(*) FROM public.field_tracking_alerts WHERE status = 'Open'`);
            const totalKmRes = await query(`SELECT COALESCE(SUM(total_km), 0) AS total_km FROM public.field_trip_sessions WHERE trip_start_time::date = CURRENT_DATE`);
            const assignmentsRes = await query(`SELECT COUNT(*) FROM public.field_duty_assignments WHERE CURRENT_DATE >= start_date AND CURRENT_DATE <= end_date`);
            return {
                fieldEmployeesToday: Number(assignmentsRes.rows[0]?.count || 0),
                currentlyTravelling: Number(activeRes.rows[0]?.count || 0),
                gpsIssues: Number(alertsRes.rows[0]?.count || 0),
                totalKmToday: Math.round(Number(totalKmRes.rows[0]?.total_km || 0) * 100) / 100,
            };
        }
        catch (err) {
            console.error('[TrackingRepository] getTrackingOverview error:', err);
            return {
                fieldEmployeesToday: 0,
                currentlyTravelling: 0,
                gpsIssues: 0,
                totalKmToday: 0,
            };
        }
    }
    // --------------------------------------------------------------------------
    // Row Mappers
    // --------------------------------------------------------------------------
    mapTripRow(row, empInfo) {
        return {
            id: row.id,
            assignmentId: row.assignment_id,
            employeeId: empInfo?.code || row.employee_code || row.employee_id,
            employeeName: empInfo?.name || row.employee_name || 'Staff',
            department: empInfo?.dept || row.department || 'Operations',
            dutyType: row.duty_type || 'Site Visit',
            customerSiteName: row.customer_site_name || 'Site',
            tripStartTime: row.trip_start_time,
            tripEndTime: row.trip_end_time,
            startLat: Number(row.start_lat),
            startLng: Number(row.start_lng),
            startAddress: row.start_address || 'Origin',
            endLat: row.end_lat ? Number(row.end_lat) : undefined,
            endLng: row.end_lng ? Number(row.end_lng) : undefined,
            endAddress: row.end_address,
            totalKm: Number(row.total_km) || 0,
            recordedDistanceMeters: Number(row.recorded_distance_meters) || 0,
            roadMatchedDistanceMeters: row.road_matched_distance_meters ? Number(row.road_matched_distance_meters) : undefined,
            unverifiedDistanceMeters: Number(row.unverified_distance_meters) || 0,
            rawPointsCount: Number(row.raw_points_count) || 0,
            acceptedPointsCount: Number(row.accepted_points_count) || 0,
            rejectedPointsCount: Number(row.rejected_points_count) || 0,
            status: row.status,
            checkInTime: row.check_in_time,
            checkOutTime: row.check_out_time,
            locationPoints: [],
            gpsStatus: row.gps_status || 'GPS Active',
            trackingStatus: row.tracking_status || 'Travelling',
            lastGpsUpdate: row.last_gps_update,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    mapLocationPointRow(row) {
        return {
            id: row.id,
            tripId: row.trip_id,
            assignmentId: row.assignment_id,
            employeeId: row.employee_id,
            recordedAt: row.recorded_at,
            latitude: Number(row.latitude),
            longitude: Number(row.longitude),
            accuracy: row.accuracy ? Number(row.accuracy) : undefined,
            speed: row.speed ? Number(row.speed) : undefined,
            heading: row.heading ? Number(row.heading) : undefined,
            altitude: row.altitude ? Number(row.altitude) : undefined,
            batteryLevel: row.battery_level ? Number(row.battery_level) : undefined,
            syncedOffline: Boolean(row.synced_offline),
            distanceFromPrevMeters: row.distance_from_prev_meters ? Number(row.distance_from_prev_meters) : 0,
            isRejected: Boolean(row.is_rejected),
            rejectionReason: row.rejection_reason,
            source: row.source,
            isRoadSnapped: Boolean(row.is_road_snapped),
            snappedLat: row.snapped_lat ? Number(row.snapped_lat) : undefined,
            snappedLng: row.snapped_lng ? Number(row.snapped_lng) : undefined,
        };
    }
}
export const trackingRepository = new TrackingRepository();
//# sourceMappingURL=trackingRepository.js.map