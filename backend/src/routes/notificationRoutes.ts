import { Router } from 'express';
import {
  listNotifications,
  createNotification,
  markAllNotificationsRead,
  markNotificationRead,
  markActionHandled,
  getUnreadCount,
} from '../controllers/notificationController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

export const notificationRouter = Router();

// All notification operations require authenticated session
notificationRouter.use(authenticateToken);

notificationRouter.get('/', listNotifications);
notificationRouter.post('/', createNotification);
notificationRouter.get('/unread-count', getUnreadCount);
notificationRouter.patch('/read-all', markAllNotificationsRead);
notificationRouter.patch('/:id/read', markNotificationRead);
notificationRouter.patch('/actions/:module/:recordId/handle', markActionHandled);
