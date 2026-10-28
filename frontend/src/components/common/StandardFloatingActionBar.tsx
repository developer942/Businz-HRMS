import React, { useState, useEffect } from 'react';
import { Edit2, Trash2, MoreHorizontal, X } from 'lucide-react';

export interface StandardFloatingActionBarProps {
  selectedCount: number;
  onEdit?: () => void;
  onDelete?: () => void;
  onMore?: () => void;
  onClearSelection: () => void;
  customActions?: React.ReactNode;
}

export const StandardFloatingActionBar: React.FC<StandardFloatingActionBarProps> = ({
  selectedCount,
  onEdit,
  onDelete,
  onMore,
  onClearSelection,
  customActions
}) => {
  const [isMobile, setIsMobile] = useState<boolean>(() => 
    typeof window !== 'undefined' ? window.innerWidth <= 1024 : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (selectedCount <= 0 || isMobile) return null;

  return (
    <div className="floating-action-bar" role="toolbar" aria-label="Bulk actions">
      <div className="action-bar-counter">
        <span>{selectedCount} Selected</span>
      </div>

      {onEdit && (
        <button className="action-bar-btn" onClick={onEdit} title="Edit Info">
          <Edit2 size={14} />
          <span>Edit Info</span>
        </button>
      )}

      {onDelete && (
        <button className="action-bar-btn danger" onClick={onDelete} title="Delete selected">
          <Trash2 size={14} />
          <span>Delete</span>
        </button>
      )}

      {customActions}

      {onMore && (
        <button className="action-bar-btn" onClick={onMore} title="More actions">
          <MoreHorizontal size={16} />
        </button>
      )}

      <button
        className="action-bar-close"
        onClick={onClearSelection}
        title="Clear selection"
        aria-label="Clear selection"
      >
        <X size={15} />
      </button>
    </div>
  );
};
