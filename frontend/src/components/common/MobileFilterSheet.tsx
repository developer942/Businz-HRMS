import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface MobileFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  onReset?: () => void;
  onApply?: () => void;
  children: React.ReactNode;
}

export const MobileFilterSheet: React.FC<MobileFilterSheetProps> = ({
  isOpen,
  onClose,
  title,
  onReset,
  onApply,
  children,
}) => {
  // Prevent background scrolling when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="mobile-bottom-sheet-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-sheet-title"
    >
      <div
        className="mobile-bottom-sheet-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mobile-bottom-sheet-handle" />

        <div className="mobile-bottom-sheet-header">
          <div id="mobile-sheet-title" className="mobile-bottom-sheet-title">
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            style={{
              background: 'none',
              border: 'none',
              padding: '4px',
              color: '#64748B',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="mobile-bottom-sheet-body">{children}</div>

        <div className="mobile-bottom-sheet-footer">
          {onReset && (
            <button
              type="button"
              className="mobile-sheet-btn-reset"
              onClick={() => {
                onReset();
                onClose();
              }}
            >
              Reset
            </button>
          )}
          <button
            type="button"
            className="mobile-sheet-btn-apply"
            onClick={() => {
              if (onApply) onApply();
              onClose();
            }}
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
};

