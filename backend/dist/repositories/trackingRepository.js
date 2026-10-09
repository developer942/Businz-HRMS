import { getSupabaseAdmin, isRealSupabaseConfigured } from '../config/supabase.js';
import { employeeRepository } from './employeeRepository.js';
// Sequential distance calculator (Haversine)
function calculateHaversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
const todayIso = new Date().toISOString().split('T')[0];
const inMemoryAssignments = [];
const inMemoryTrips = [];
const inMemoryAlerts = [];
export class TrackingRepository {
    async getAssignments(filters) {
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                let query = supabase.from('field_duty_assignments').select('*').order('created_at', { ascending: false });
                if (filters?.employeeId) {
                    let filterUuid = filters.employeeId;
                    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filterUuid);
                    if (!isUuid) {
                        const emp = await employeeRepository.getEmployeeById(filterUuid);
                        if (emp?.id)
                            filterUuid = emp.id;
                    }
                    query = query.eq('employee_id', filterUuid);
                }
                if (filters?.status)
                    query = query.eq('status', filters.status);
                const { data, error } = await query;
                if (data && !error && data.length > 0) {
                    return data.map((d) => ({
                        id: d.id,
                        employeeId: d.employee_id,
                        employeeName: d.employee_name || 'Staff',
                        department: d.department || 'Operations',
                        dutyType: d.duty_type,
                        scheduleType: d.schedule_type,
                        startDate: d.start_date,
                        endDate: d.end_date,
                        startTime: d.start_time,
                        endTime: d.end_time,
                        customerSiteName: d.customer_site_name,
                        siteAddress: d.site_address,
                        purpose: d.purpose,
                        trackingRequired: d.tracking_required,
                        travelKmRequired: d.travel_km_required,
                        attendanceType: d.attendance_type,
                        siteLat: d.site_lat,
                        siteLng: d.site_lng,
                        allowedRadiusMeters: d.allowed_radius_meters,
                        status: d.status,
                        createdAt: d.created_at,
                        updatedAt: d.updated_at,
                    }));
                }
            }
            catch {
                // fallback
            }
        }
        let list = [...inMemoryAssignments];
        if (filters?.date) {
            list = list.filter((a) => a.startDate <= filters.date && a.endDate >= filters.date);
        }
        if (filters?.status) {
            list = list.filter((a) => a.status.toLowerCase() === filters.status?.toLowerCase());
        }
        if (filters?.employeeId) {
            list = list.filter((a) => a.employeeId === filters.employeeId);
        }
        return list;
    }
    async createAssignment(data) {
        if (!data.employeeId) {
            throw new Error('employeeId is required for field duty assignment');
        }
        const emp = await employeeRepository.getEmployeeById(data.employeeId);
        const empName = emp ? `${emp.firstName} ${emp.lastName}`.trim() : data.employeeId;
        const newAssignment = {
            id: `fa-${Date.now()}`,
            employeeId: data.employeeId,
            employeeName: empName,
            department: emp?.department || 'Operations',
            dutyType: data.dutyType || 'Site Visit',
            scheduleType: data.scheduleType || 'One Day',
            startDate: data.startDate || todayIso,
            endDate: data.endDate || todayIso,
            startTime: data.startTime || '09:00',
            endTime: data.endTime || '18:00',
            customerSiteName: data.customerSiteName || 'Client Site',
            siteAddress: data.siteAddress || '',
            purpose: data.purpose || 'Field Duty Operations',
            trackingRequired: data.trackingRequired ?? true,
            travelKmRequired: data.travelKmRequired ?? true,
            attendanceType: data.attendanceType || 'Site Geofence',
            siteLat: data.siteLat,
            siteLng: data.siteLng,
            allowedRadiusMeters: data.allowedRadiusMeters || 200,
            notes: data.notes,
            status: 'Scheduled',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        inMemoryAssignments.unshift(newAssignment);
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                const targetEmployeeUuid = emp?.id || newAssignment.employeeId;
                await supabase.from('field_duty_assignments').insert({
                    employee_id: targetEmployeeUuid,
                    employee_name: newAssignment.employeeName,
                    duty_type: newAssignment.dutyType,
                    schedule_type: newAssignment.scheduleType,
                    start_date: newAssignment.startDate,
                    end_date: newAssignment.endDate,
                    start_time: newAssignment.startTime,
                    end_time: newAssignment.endTime,
                    customer_site_name: newAssignment.customerSiteName,
                    site_address: newAssignment.siteAddress,
                    purpose: newAssignment.purpose,
                    tracking_required: newAssignment.trackingRequired,
                    travel_km_required: newAssignment.travelKmRequired,
                    attendance_type: newAssignment.attendanceType,
                    site_lat: newAssignment.siteLat,
                    site_lng: newAssignment.siteLng,
                    allowed_radius_meters: newAssignment.allowedRadiusMeters,
                    status: newAssignment.status,
                });
            }
            catch (err) {
                console.warn('Could not persist field duty assignment to Supabase:', err);
            }
        }
        return newAssignment;
    }
    async updateAssignment(id, updates) {
        const item = inMemoryAssignments.find((a) => a.id === id);
        if (!item)
            return null;
        Object.assign(item, updates);
        item.updatedAt = new Date().toISOString();
        if (isRealSupabaseConfigured()) {
            try {
                const supabase = getSupabaseAdmin();
                await supabase
                    .from('field_duty_assignments')
                    .update({
                    status: item.status,
                    customer_site_name: item.customerSiteName,
                    site_address: item.siteAddress,
                })
                    .eq('id', id);
            }
            catch (err) {
                console.warn('Could not update assignment in Supabase:', err);
            }
        }
        return item;
    }
    async startTrip(params) {
        const assignment = inMemoryAssignments.find((a) => a.id === params.assignmentId);
        const existingActiveTrip = inMemoryTrips.find((t) => t.assignmentId === params.assignmentId && t.employeeId === params.employeeId && t.status === 'Active');
        if (existingActiveTrip)
            return existingActiveTrip;
        const emp = await employeeRepository.getEmployeeById(params.employeeId);
        const empName = emp ? `${emp.firstName} ${emp.lastName}`.trim() : 'Staff';
        const now = new Date().toISOString();
        const tripId = `trip-${Date.now()}`;
        const newTrip = {
            id: tripId,
            assignmentId: params.assignmentId,
            employeeId: params.employeeId,
            employeeName: empName,
            department: emp?.department || 'Operations',
            dutyType: assignment?.dutyType || 'Site Visit',
            customerSiteName: assignment?.customerSiteName || 'Site',
            tripStartTime: now,
            startLat: params.startLat,
            startLng: params.startLng,
            startAddress: params.startAddress || 'Origin Location',
            totalKm: 0,
            status: 'Active',
            locationPoints: [
                {
                    id: `lp-${Date.now()}`,
                    tripId,
                    assignmentId: params.assignmentId,
                    employeeId: params.employeeId,
                    recordedAt: now,
                    latitude: params.startLat,
                    longitude: params.startLng,
                    accuracy: 10,
                    speed: 0,
                },
            ],
            gpsStatus: 'GPS Active',
            trackingStatus: 'Travelling',
            lastGpsUpdate: now,
            createdAt: now,
            updatedAt: now,
        };
        inMemoryTrips.unshift(newTrip);
        if (assignment) {
            assignment.status = 'Active';
        }
        return newTrip;
    }
    async recordLocationPoints(points) {
        if (points.length === 0)
            return { added: 0, totalKm: 0 };
        const tripId = points[0].tripId;
        const trip = inMemoryTrips.find((t) => t.id === tripId);
        if (!trip)
            return { added: 0, totalKm: 0 };
        let addedKm = 0;
        let prevPoint = trip.locationPoints[trip.locationPoints.length - 1];
        for (const pt of points) {
            if (prevPoint) {
                // Calculate incremental sequential distance
                const dist = calculateHaversineKm(prevPoint.latitude, prevPoint.longitude, pt.latitude, pt.longitude);
                // Jump filter: only add if speed <= 150 km/h and dist >= 0.015 km (15m)
                if (dist >= 0.015 && dist <= 20) {
                    addedKm += dist;
                }
            }
            trip.locationPoints.push(pt);
            prevPoint = pt;
        }
        trip.totalKm = Math.round((trip.totalKm + addedKm) * 100) / 100;
        trip.lastGpsUpdate = new Date().toISOString();
        trip.updatedAt = new Date().toISOString();
        return { added: points.length, totalKm: trip.totalKm };
    }
    async endTrip(tripId, endLat, endLng, endAddress, totalKmOverride) {
        const trip = inMemoryTrips.find((t) => t.id === tripId);
        if (!trip)
            return null;
        trip.status = 'Completed';
        trip.tripEndTime = new Date().toISOString();
        trip.endLat = endLat;
        trip.endLng = endLng;
        trip.endAddress = endAddress || 'Destination Site';
        if (totalKmOverride !== undefined) {
            trip.totalKm = totalKmOverride;
        }
        trip.trackingStatus = 'Completed';
        trip.updatedAt = new Date().toISOString();
        const assignment = inMemoryAssignments.find((a) => a.id === trip.assignmentId);
        if (assignment) {
            assignment.status = 'Completed';
        }
        return trip;
    }
    async getTrips(filters) {
        let list = [...inMemoryTrips];
        if (filters?.employeeId) {
            list = list.filter((t) => t.employeeId === filters.employeeId);
        }
        if (filters?.status) {
            list = list.filter((t) => t.status.toLowerCase() === filters.status?.toLowerCase());
        }
        return list;
    }
    async getTripLocationPoints(tripId) {
        const trip = inMemoryTrips.find((t) => t.id === tripId);
        return trip ? trip.locationPoints : [];
    }
    async getAlerts(status) {
        if (status) {
            return inMemoryAlerts.filter((a) => a.status.toLowerCase() === status.toLowerCase());
        }
        return inMemoryAlerts;
    }
    async resolveAlert(alertId) {
        const alert = inMemoryAlerts.find((a) => a.id === alertId);
        if (!alert) {
            return null;
        }
        alert.status = 'Resolved';
        alert.issueEndTime = new Date().toISOString();
        alert.updatedAt = new Date().toISOString();
        return alert;
    }
    async getTrackingOverview() {
        const activeTrips = inMemoryTrips.filter((t) => t.status === 'Active').length;
        const openAlerts = inMemoryAlerts.filter((a) => a.status === 'Open').length;
        const totalKm = inMemoryTrips.reduce((acc, t) => acc + (t.totalKm || 0), 0);
        const assignedCount = inMemoryAssignments.length;
        return {
            fieldEmployeesToday: assignedCount,
            currentlyTravelling: activeTrips,
            gpsIssues: openAlerts,
            totalKmToday: Math.round(totalKm * 10) / 10,
        };
    }
}
export const trackingRepository = new TrackingRepository();
//# sourceMappingURL=trackingRepository.js.map