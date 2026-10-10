import { Router } from 'express';
import {
  getCompanySettings,
  updateCompanySettings,
  getGeofenceSettings,
  updateGeofenceSettings,
  getCompanySmtpConfig,
  saveCompanySmtpConfig,
  testCompanySmtpConnection,
} from '../controllers/settingsController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireRoles } from '../middleware/rbacMiddleware.js';

export const settingsRouter = Router();

settingsRouter.use(authenticateToken);

// Company Profile Settings
settingsRouter.get('/company', getCompanySettings);
settingsRouter.put('/company', requireRoles(['Super Admin', 'CEO', 'HR Manager']), updateCompanySettings);

// Geofence Attendance Settings
settingsRouter.get('/geofence', getGeofenceSettings);
settingsRouter.put('/geofence', requireRoles(['Super Admin', 'CEO', 'HR Manager']), updateGeofenceSettings);

// Company SMTP Relay Configuration (Google Workspace / Gmail / Custom SMTP)
settingsRouter.get('/smtp/config', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin']), getCompanySmtpConfig);
settingsRouter.post('/smtp/config', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin']), saveCompanySmtpConfig);
settingsRouter.post('/smtp/test-connection', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin']), testCompanySmtpConnection);
