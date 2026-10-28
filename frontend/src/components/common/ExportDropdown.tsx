import React, { useState, useRef, useEffect } from 'react';
import { Download, FileSpreadsheet, FileText, ChevronDown } from 'lucide-react';

export interface ExportDropdownProps {
  onExportExcel: () => void;
  onExportPDF: () => void;
  onExportCSV: () => void;
  label?: string;
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md';
  align?: 'left' | 'right';
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export const ExportDropdown: React.FC<ExportDropdownProps> = ({
  onExportExcel,
  onExportPDF,
  onExportCSV,
  label = 'Download',
  variant = 'secondary',
  size = 'sm',
  align = 'right',
  disabled = false,
  style,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking or tapping outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const isPrimary = variant === 'primary';
  const isSm = size === 'sm';

  const baseBtnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    height: isSm ? '36px' : '40px',
    padding: isSm ? '0 14px' : '0 18px',
    borderRadius: '10px',
    fontSize: isSm ? '0.82rem' : '0.88rem',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    transition: 'all 0.15s ease',
    userSelect: 'none',
    boxShadow: isPrimary 
      ? '0 2px 6px rgba(14, 116, 144, 0.25)' 
      : '0 1px 2px rgba(0, 0, 0, 0.04)',
    border: isPrimary ? 'none' : '1px solid #CBD5E1',
    backgroundColor: isPrimary ? '#0E7490' : '#FFFFFF',
    color: isPrimary ? '#FFFFFF' : '#0E7490',
    ...style
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }} className={className}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(prev => !prev)}
        style={baseBtnStyle}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Download size={isSm ? 14 : 16} />
        <span>{label}</span>
        <ChevronDown 
          size={14} 
          style={{ 
            transform: isOpen ? 'rotate(180deg)' : 'none', 
            transition: 'transform 0.18s ease' 
          }} 
        />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            [align]: 0,
            zIndex: 1050,
            minWidth: '190px',
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            animation: 'fadeIn 0.12s ease-out'
          }}
        >
          {/* Download Excel */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onExportExcel();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '9px 12px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: '#1E293B',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
              transition: 'background-color 0.12s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#ECFDF5';
              e.currentTarget.style.color = '#15803D';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#1E293B';
            }}
          >
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              backgroundColor: '#DCFCE7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <FileSpreadsheet size={14} color="#16A34A" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>Download Excel</div>
              <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 500 }}>.xls spreadsheet</div>
            </div>
          </button>

          {/* Download PDF */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onExportPDF();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '9px 12px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: '#1E293B',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
              transition: 'background-color 0.12s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#FEF2F2';
              e.currentTarget.style.color = '#B91C1C';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#1E293B';
            }}
          >
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              backgroundColor: '#FEE2E2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <FileText size={14} color="#DC2626" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>Download PDF</div>
              <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 500 }}>.pdf document</div>
            </div>
          </button>

          {/* Download CSV */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onExportCSV();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '9px 12px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: '#1E293B',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
              transition: 'background-color 0.12s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#ECFEFF';
              e.currentTarget.style.color = '#0E7490';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#1E293B';
            }}
          >
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              backgroundColor: '#CFFAFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Download size={14} color="#0E7490" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>Download CSV</div>
              <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 500 }}>.csv raw data</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
