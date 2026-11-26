import type { NextFunction, Request, Response } from 'express';
import { notificationRepository, NotificationCreationParams } from '../repositories/notificationRepository.js';

export const listNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const filter = String(req.query.filter || 'all').toLowerCase() as any;
    const moduleName = req.query.module ? String(req.query.module).trim() : undefined;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const result = await notificationRepository.getNotificationsForUser(user, {
      filter,
      module: moduleName,
      limit,
      offset,
    });

    res.json({
      success: true,
      data: result.data,
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
};

export const createNotification = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const {
      title,
      message,
      priority,
      category,
      link,
      module: notifModule,
      recordId,
      eventType,
      dedupKey,
      actionRequired,
      targetRoles,
      targetEmployeeIds,
      metadata,
    } = req.body;

    if (!title || !message) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Title and message are required', details: [] },
      });
      return;
    }

    // Role-based validation: only CEO, Super Admin, HR can broadcast to ALL or role groups
    const isPrivileged = ['CEO', 'Super Admin', 'HR', 'HR Manager', 'HR Admin'].includes(user.role);
    if ((targetRoles && targetRoles.length > 0) && !isPrivileged) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only HR and Management can broadcast to role groups', details: [] },
      });
      return;
    }

    const params: NotificationCreationParams = {
      title: String(title).trim(),
      message: String(message).trim(),
      priority,
      category: category || 'Announcement',
      link,
      module: notifModule,
      recordId,
      eventType,
      dedupKey,
      actionRequired: Boolean(actionRequired),
      senderId: user.id,
      senderName: user.name || user.email,
      targetRoles: Array.isArray(targetRoles) ? targetRoles : [],
      targetEmployeeIds: Array.isArray(targetEmployeeIds) ? targetEmployeeIds : [],
      companyId: user.company_id || user.companyId || 'company-a',
      metadata,
    };

    const created = await notificationRepository.createNotification(params);

    res.status(created.created ? 201 : 200).json({
      success: true,
      data: {
        id: created.id,
        dedupKey: created.dedupKey,
        isNew: created.created,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const markNotificationRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Notification ID required', details: [] },
      });
      return;
    }

    await notificationRepository.markNotificationRead(id, req.user!);
    res.json({ success: true, data: { id, read: true } });
  } catch (error) {
    next(error);
  }
};

export const markAllNotificationsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await notificationRepository.markAllNotificationsRead(req.user!);
    res.json({ success: true, data: { count, read: true } });
  } catch (error) {
    next(error);
  }
};

export const markActionHandled = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const moduleName = String(req.params.module || '').trim();
    const recordId = String(req.params.recordId || '').trim();

    if (!moduleName || !recordId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Module and Record ID are required', details: [] },
      });
      return;
    }

    const count = await notificationRepository.markActionHandled(moduleName, recordId, req.user!.id);
    res.json({ success: true, data: { module: moduleName, recordId, handledCount: count } });
  } catch (error) {
    next(error);
  }
};

export const getUnreadCount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await notificationRepository.getNotificationsForUser(req.user!, {
      filter: 'unread',
      limit: 1,
    });
    res.json({
      success: true,
      data: {
        unread: result.meta.unread,
        actionRequired: result.meta.actionRequired,
      },
    });
  } catch (error) {
    next(error);
  }
};
