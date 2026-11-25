import { Router } from 'express';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../controllers/notificationController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/rbacMiddleware.js';

export const notificationRouter = Router();

notificationRouter.use(authenticateToken);
notificationRouter.use(requirePermission('notifications', 'view'));
notificationRouter.get('/', listNotifications);
notificationRouter.patch('/read-all', markAllNotificationsRead);
notificationRouter.patch('/:id/read', markNotificationRead);
