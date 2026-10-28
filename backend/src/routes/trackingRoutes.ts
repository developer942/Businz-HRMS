import { Router } from 'express';
import {
  getAssignments,
  createAssignment,
  updateAssignment,
  startTrip,
  recordLocationPoints,
  endTrip,
  getTrips,
  getTripLocationPoints,
  getAlerts,
  resolveAlert,
  getTrackingOverview,
  streamLiveTracking,
} from '../controllers/trackingController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireRoles } from '../middleware/rbacMiddleware.js';

export const trackingRouter = Router();

trackingRouter.use(authenticateToken);

// Real-Time SSE Telemetry Stream
trackingRouter.get('/live-stream', streamLiveTracking);

// Assignments
trackingRouter.get('/assignments', getAssignments);
trackingRouter.post(
  '/assignments',
  requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Department Manager', 'Department Head']),
  createAssignment
);
trackingRouter.put(
  '/assignments/:id',
  requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Department Manager', 'Department Head']),
  updateAssignment
);

// Trips & Live Telemetry
trackingRouter.post('/trips/start', startTrip);
trackingRouter.post('/trips/:id/end', endTrip);
trackingRouter.get('/trips', getTrips);
trackingRouter.post('/points', recordLocationPoints);
trackingRouter.get('/points/:tripId', getTripLocationPoints);

// Alerts
trackingRouter.get('/alerts', getAlerts);
trackingRouter.put(
  '/alerts/:id/resolve',
  requireRoles(['Super Admin', 'CEO', 'HR Manager', 'Department Manager', 'Department Head']),
  resolveAlert
);

// KPI Overview
trackingRouter.get('/overview', getTrackingOverview);
