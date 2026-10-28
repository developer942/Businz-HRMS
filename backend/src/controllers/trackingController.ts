import { Request, Response, NextFunction } from 'express';
import { trackingRepository } from '../repositories/trackingRepository.js';
import {
  createAssignmentSchema,
  updateAssignmentSchema,
  startTripSchema,
  endTripSchema,
  locationPointsSchema,
} from '../validators/trackingValidators.js';
import { FieldAssignment, LocationPoint } from '../types/tracking.js';
import { checkDuplicateFieldAssignment, DUPLICATE_REQUEST_ERROR_MESSAGE } from '../utils/requestValidation.js';

export const getAssignments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { date, status, employeeId } = req.query;
    const assignments = await trackingRepository.getAssignments({
      date: date as string,
      status: status as string,
      employeeId: employeeId as string,
    });

    res.status(200).json({
      success: true,
      data: assignments,
    });
  } catch (err) {
    next(err);
  }
};

export const createAssignment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = createAssignmentSchema.parse(req.body);

    // Business-specific duplicate validation for Field Duty Assignment
    const sDate = validated.startDate || validated.scheduledDate || new Date().toISOString().split('T')[0];
    const eDate = validated.endDate || sDate;
    const existing = await trackingRepository.getAssignments({ employeeId: validated.employeeId });
    const dupCheck = checkDuplicateFieldAssignment(
      existing as any,
      validated.employeeId,
      sDate,
      eDate
    );

    if (dupCheck.hasDuplicate) {
      res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_REQUEST',
          message: dupCheck.error || DUPLICATE_REQUEST_ERROR_MESSAGE,
          details: [],
        },
      });
      return;
    }

    const assignment = await trackingRepository.createAssignment(validated as unknown as Partial<FieldAssignment>);

    res.status(201).json({
      success: true,
      data: assignment,
    });
  } catch (err) {
    next(err);
  }
};

export const updateAssignment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = String(req.params.id);
    const validated = updateAssignmentSchema.parse(req.body);
    const updated = await trackingRepository.updateAssignment(id, validated as unknown as Partial<FieldAssignment>);

    if (!updated) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Field assignment ${id} not found`,
          details: [],
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

export const startTrip = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = startTripSchema.parse(req.body);
    const targetEmpId = validated.employeeId || req.user?.employeeId;

    if (!targetEmpId) {
      res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'employeeId is required to start trip',
          details: [],
        },
      });
      return;
    }

    const trip = await trackingRepository.startTrip({
      assignmentId: validated.assignmentId,
      employeeId: targetEmpId,
      startLat: validated.startLat,
      startLng: validated.startLng,
      startAddress: validated.startAddress,
    });

    broadcastTrackingEvent({
      type: 'trip_started',
      trip,
    });

    res.status(201).json({
      success: true,
      data: trip,
    });
  } catch (err) {
    next(err);
  }
};

export const recordLocationPoints = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = locationPointsSchema.parse(req.body);
    const rawPoints = Array.isArray(validated) ? validated : [validated];

    const points: LocationPoint[] = rawPoints.map((p, idx) => ({
      id: `lp-${Date.now()}-${idx}`,
      tripId: p.tripId,
      assignmentId: p.assignmentId || '',
      employeeId: p.employeeId || req.user?.employeeId || '',
      recordedAt: p.recordedAt || p.timestamp || new Date().toISOString(),
      latitude: p.latitude,
      longitude: p.longitude,
      accuracy: p.accuracy ?? 10,
      speed: p.speed ?? 0,
      heading: p.heading,
      altitude: p.altitude,
      source: p.source || 'browser_watch',
      batteryLevel: p.batteryLevel ?? 100,
      syncedOffline: p.syncedOffline ?? false,
    }));

    const result = await trackingRepository.recordLocationPoints(points);

    broadcastTrackingEvent({
      type: 'location_update',
      tripId: points[0]?.tripId,
      employeeId: points[0]?.employeeId,
      points,
      result,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const endTrip = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = String(req.params.id);
    const validated = endTripSchema.parse(req.body);

    const completed = await trackingRepository.endTrip(
      id,
      validated.endLat,
      validated.endLng,
      validated.endAddress,
      validated.totalKm
    );

    if (!completed) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Trip ${id} not found`,
          details: [],
        },
      });
      return;
    }

    broadcastTrackingEvent({
      type: 'trip_ended',
      trip: completed,
    });

    res.status(200).json({
      success: true,
      data: completed,
    });
  } catch (err) {
    next(err);
  }
};

export const getTrips = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { employeeId, status } = req.query;
    const trips = await trackingRepository.getTrips({
      employeeId: employeeId as string,
      status: status as string,
    });

    res.status(200).json({
      success: true,
      data: trips,
    });
  } catch (err) {
    next(err);
  }
};

export const getTripLocationPoints = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tripId = String(req.params.tripId);
    const points = await trackingRepository.getTripLocationPoints(tripId);

    res.status(200).json({
      success: true,
      data: points,
    });
  } catch (err) {
    next(err);
  }
};

export const getAlerts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status } = req.query;
    const alerts = await trackingRepository.getAlerts(status as string);

    res.status(200).json({
      success: true,
      data: alerts,
    });
  } catch (err) {
    next(err);
  }
};

export const resolveAlert = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = String(req.params.id);
    const resolved = await trackingRepository.resolveAlert(id);

    if (!resolved) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Alert ${id} not found`,
          details: [],
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: resolved,
    });
  } catch (err) {
    next(err);
  }
};

export const getTrackingOverview = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const overview = await trackingRepository.getTrackingOverview();

    res.status(200).json({
      success: true,
      data: overview,
    });
  } catch (err) {
    next(err);
  }
};

// ----------------------------------------------------------------------------
// SERVER-SENT EVENTS (SSE) REAL-TIME LIVE TRACKING STREAM
// ----------------------------------------------------------------------------
interface TrackingSseClient {
  id: string;
  res: Response;
}

const sseClients: TrackingSseClient[] = [];

export const streamLiveTracking = (req: Request, res: Response): void => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable proxy buffering for Nginx
  });

  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

  const clientId = `sse-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  sseClients.push({ id: clientId, res });

  // 25s keepalive heartbeat ping
  const pingInterval = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(pingInterval);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(pingInterval);
    const idx = sseClients.findIndex((c) => c.id === clientId);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
};

export const broadcastTrackingEvent = (event: { type: string; [key: string]: any }): void => {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].res.write(payload);
    } catch {
      sseClients.splice(i, 1);
    }
  }
};

