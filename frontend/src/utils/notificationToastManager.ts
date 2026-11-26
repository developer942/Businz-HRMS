// VRM Enterprise HRMS - Notification & Toast Manager
// Provides cross-tab deduplication, session suppression of backlog toasts,
// and coordination across browser windows via BroadcastChannel.

import { NotificationItem } from '../types/hrms';

export interface ToastMessage {
  id: string;
  title: string;
  message: string;
  priority?: 'Urgent' | 'Important' | 'Normal';
  category?: string;
  link?: string;
  timestamp?: string;
  durationMs?: number;
  onAction?: () => void;
}

type ToastListener = (toasts: ToastMessage[]) => void;

class NotificationToastManager {
  private listeners: Set<ToastListener> = new Set();
  private activeToasts: ToastMessage[] = [];
  private seenToastIds: Set<string> = new Set();
  private channel: BroadcastChannel | null = null;
  private isBacklogSuppressed: boolean = false;
  private sessionStartTime: number = Date.now();

  constructor() {
    this.restoreSeenIds();
    this.initBroadcastChannel();
  }

  private restoreSeenIds() {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const raw = window.sessionStorage.getItem('vrm_seen_toast_ids');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            parsed.forEach(id => this.seenToastIds.add(String(id)));
          }
        }
      }
    } catch {
      // Ignore sessionStorage errors
    }
  }

  private saveSeenIds() {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const arr = Array.from(this.seenToastIds).slice(-500);
        window.sessionStorage.setItem('vrm_seen_toast_ids', JSON.stringify(arr));
      }
    } catch {
      // Ignore
    }
  }

  private initBroadcastChannel() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('businz_notifications_coordination');
        this.channel.onmessage = (event) => {
          if (event.data?.type === 'TOAST_SHOWN' && event.data?.id) {
            // Another tab already showed this toast: suppress here
            this.seenToastIds.add(event.data.id);
            this.saveSeenIds();
          } else if (event.data?.type === 'TOAST_DISMISSED' && event.data?.id) {
            this.dismissToast(event.data.id, false);
          }
        };
      } catch {
        this.channel = null;
      }
    }
  }

  /**
   * Prime the backlog on initial app boot or login.
   * Prevents any existing unread notifications from popping up toasts.
   */
  public primeBacklog(existingNotifications: { id: string }[]) {
    if (!existingNotifications || !Array.isArray(existingNotifications)) return;
    existingNotifications.forEach(n => {
      if (n.id) {
        this.seenToastIds.add(String(n.id));
      }
    });
    this.isBacklogSuppressed = true;
    this.saveSeenIds();
  }

  /**
   * Subscribe a React component to active toasts
   */
  public subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    listener([...this.activeToasts]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    const copy = [...this.activeToasts];
    this.listeners.forEach(fn => {
      try { fn(copy); } catch {}
    });
  }

  /**
   * Attempt to display a toast for an incoming notification.
   * Strictly enforces deduplication across session, tabs, and time.
   */
  public handleIncomingNotification(
    notification: NotificationItem,
    currentUserId?: string,
    onNavigate?: (link?: string) => void
  ): boolean {
    if (!notification || !notification.id) return false;

    const id = String(notification.id);

    // 1. Check if already seen in this session or other tabs
    if (this.seenToastIds.has(id)) {
      return false;
    }

    // 2. Suppress historical backlog items created before this session
    if (notification.createdAt) {
      const createdTime = new Date(notification.createdAt).getTime();
      // If notification is older than 45 seconds or before session boot, don't toast
      if (!isNaN(createdTime) && (Date.now() - createdTime > 45000 || createdTime < this.sessionStartTime - 5000)) {
        this.seenToastIds.add(id);
        this.saveSeenIds();
        return false;
      }
    }

    // 3. Mark as seen locally and broadcast to other tabs immediately
    this.seenToastIds.add(id);
    this.saveSeenIds();

    if (this.channel) {
      try {
        this.channel.postMessage({ type: 'TOAST_SHOWN', id });
      } catch {}
    }

    // 4. Display the toast
    this.showToast({
      id,
      title: (notification.title || 'Notification').replace(/⚠️\s*/g, '').trim(),
      message: (notification.message || '').replace(/⚠️\s*/g, '').trim(),
      priority: notification.priority || 'Normal',
      category: notification.category,
      link: notification.link,
      durationMs: notification.priority === 'Urgent' ? 7000 : 4500,
      onAction: onNavigate ? () => onNavigate(notification.link) : undefined
    });

    return true;
  }

  /**
   * Display a direct ephemeral toast message (e.g. action success, policy feedback)
   */
  public showToast(toast: ToastMessage) {
    // Avoid duplicate active toasts
    if (this.activeToasts.some(t => t.id === toast.id)) {
      return;
    }

    // Maximum 3 simultaneous toasts
    if (this.activeToasts.length >= 3) {
      this.activeToasts.shift();
    }

    this.activeToasts.push(toast);
    this.notifyListeners();

    // Auto-dismiss after duration
    const duration = toast.durationMs || 4500;
    setTimeout(() => {
      this.dismissToast(toast.id, true);
    }, duration);
  }

  /**
   * Dismiss a toast
   */
  public dismissToast(id: string, broadcast: boolean = true) {
    this.activeToasts = this.activeToasts.filter(t => t.id !== id);
    this.notifyListeners();

    if (broadcast && this.channel) {
      try {
        this.channel.postMessage({ type: 'TOAST_DISMISSED', id });
      } catch {}
    }
  }

  /**
   * Clear all active toasts
   */
  public clearAll() {
    this.activeToasts = [];
    this.notifyListeners();
  }
}

export const notificationToastManager = new NotificationToastManager();
