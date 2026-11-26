// VRM Enterprise HRMS - Notification API Service
// Communicates with backend /api/v1/notifications with PostgreSQL persistence,
// deduplication, and resilient fallback to company_settings.

import { authService } from './authService';
import { NotificationItem } from '../types/hrms';

export interface NotificationFilterOptions {
  filter?: 'all' | 'unread' | 'action_required' | 'urgent' | 'important' | 'normal';
  module?: string;
  limit?: number;
  offset?: number;
}

export interface NotificationResponse {
  data: NotificationItem[];
  meta: {
    total: number;
    unread: number;
    actionRequired?: number;
    limit: number;
    offset: number;
  };
}

class NotificationService {
  private getHeaders(): HeadersInit {
    const token = authService.getToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  async getNotifications(options: NotificationFilterOptions = {}): Promise<NotificationResponse | null> {
    try {
      const params = new URLSearchParams();
      if (options.filter) params.append('filter', options.filter);
      if (options.module) params.append('module', options.module);
      if (options.limit) params.append('limit', String(options.limit));
      if (options.offset) params.append('offset', String(options.offset));

      const res = await fetch(`/api/v1/notifications?${params.toString()}`, {
        headers: this.getHeaders(),
      });

      if (!res.ok) {
        return null;
      }

      const json = await res.json();
      if (json.success && json.data) {
        return {
          data: json.data,
          meta: json.meta || { total: json.data.length, unread: 0, limit: 50, offset: 0 },
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async createNotification(payload: {
    title: string;
    message: string;
    priority?: 'Urgent' | 'Important' | 'Normal';
    category?: string;
    link?: string;
    module?: string;
    recordId?: string;
    eventType?: string;
    dedupKey?: string;
    actionRequired?: boolean;
    targetRoles?: string[];
    targetEmployeeIds?: string[];
    metadata?: Record<string, any>;
  }): Promise<{ id: string; isNew: boolean } | null> {
    try {
      const res = await fetch('/api/v1/notifications', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) return null;
      const json = await res.json();
      return json.data || null;
    } catch {
      return null;
    }
  }

  async markAsRead(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/v1/notifications/${encodeURIComponent(id)}/read`, {
        method: 'PATCH',
        headers: this.getHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async markAllAsRead(): Promise<boolean> {
    try {
      const res = await fetch('/api/v1/notifications/read-all', {
        method: 'PATCH',
        headers: this.getHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async markActionHandled(moduleName: string, recordId: string): Promise<boolean> {
    try {
      const res = await fetch(
        `/api/v1/notifications/actions/${encodeURIComponent(moduleName)}/${encodeURIComponent(recordId)}/handle`,
        {
          method: 'PATCH',
          headers: this.getHeaders(),
        }
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  async getUnreadCount(): Promise<{ unread: number; actionRequired: number } | null> {
    try {
      const res = await fetch('/api/v1/notifications/unread-count', {
        headers: this.getHeaders(),
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.data || null;
    } catch {
      return null;
    }
  }
}

export const notificationService = new NotificationService();
