import React, { useEffect, useState } from 'react';
import { notificationToastManager, ToastMessage } from '../../utils/notificationToastManager';
import { AlertTriangle, Bell, CheckCircle2, X, ArrowUpRight } from 'lucide-react';

interface GlobalToastContainerProps {
  onNavigate?: (moduleName: string) => void;
}

export const GlobalToastContainer: React.FC<GlobalToastContainerProps> = ({ onNavigate }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const unsubscribe = notificationToastManager.subscribe((active) => {
      setToasts(active);
    });
    return () => unsubscribe();
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxWidth: '380px',
        width: 'calc(100vw - 32px)',
        pointerEvents: 'none',
      }}
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => {
        const isUrgent = toast.priority === 'Urgent';
        const isImportant = toast.priority === 'Important';
        const borderColor = isUrgent ? '#EF4444' : isImportant ? '#F59E0B' : '#0E7490';
        const iconColor = isUrgent ? '#EF4444' : isImportant ? '#F59E0B' : '#0E7490';
        const bgTint = isUrgent ? '#FEF2F2' : isImportant ? '#FFFBEB' : '#FFFFFF';

        return (
          <div
            key={toast.id}
            role="status"
            style={{
              pointerEvents: 'auto',
              backgroundColor: bgTint,
              borderRadius: '12px',
              border: `1px solid #E2E8F0`,
              borderLeft: `4px solid ${borderColor}`,
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ flexShrink: 0, marginTop: '2px' }}>
              {isUrgent ? (
                <AlertTriangle size={19} color={iconColor} />
              ) : isImportant ? (
                <Bell size={19} color={iconColor} />
              ) : (
                <CheckCircle2 size={19} color={iconColor} />
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '2px' }}>
                <h4
                  style={{
                    fontSize: '0.86rem',
                    fontWeight: 750,
                    color: '#0F172A',
                    margin: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {toast.title}
                </h4>
                {toast.category && (
                  <span
                    style={{
                      fontSize: '0.66rem',
                      fontWeight: 650,
                      padding: '1px 6px',
                      borderRadius: '4px',
                      backgroundColor: '#F1F5F9',
                      color: '#475569',
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                    }}
                  >
                    {toast.category}
                  </span>
                )}
              </div>

              <p
                style={{
                  fontSize: '0.8rem',
                  color: '#475569',
                  margin: '0 0 6px 0',
                  lineHeight: 1.35,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {toast.message}
              </p>

              {toast.link && onNavigate && (
                <button
                  type="button"
                  onClick={() => {
                    notificationToastManager.dismissToast(toast.id);
                    onNavigate(toast.link!);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    color: '#0E7490',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                >
                  View Details <ArrowUpRight size={12} />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => notificationToastManager.dismissToast(toast.id)}
              style={{
                background: 'none',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                padding: '2px',
                borderRadius: '4px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
              title="Dismiss"
              aria-label="Dismiss notification"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
