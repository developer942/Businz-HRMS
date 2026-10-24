// VRM Enterprise HRMS - Secure Proof Viewer Modal
import React from 'react';
import { X, ExternalLink, Download, FileText, Image as ImageIcon } from 'lucide-react';

interface ProofViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  fileUrl: string;
  fileName?: string;
}

export const ProofViewerModal: React.FC<ProofViewerModalProps> = ({
  isOpen,
  onClose,
  title,
  fileUrl,
  fileName = 'Proof Document',
}) => {
  if (!isOpen || !fileUrl) return null;

  const isPdf = fileUrl.toLowerCase().endsWith('.pdf') || fileUrl.includes('application/pdf');

  return (
    <div className="petty-cash-modal-overlay" onClick={onClose}>
      <div
        className="petty-cash-modal"
        style={{ maxWidth: '720px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">
            {isPdf ? <FileText size={20} color="var(--color-primary-blue)" /> : <ImageIcon size={20} color="var(--color-primary-blue)" />}
            {title}
          </h3>
          <button className="modal-close-btn" onClick={onClose} title="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body" style={{ textAlign: 'center', background: '#F8FAFC', padding: '20px' }}>
          {isPdf ? (
            <div style={{ height: '480px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
              <FileText size={64} color="var(--color-primary-blue)" />
              <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text-primary)' }}>{fileName}</p>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>PDF document is ready to view or download.</p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                  style={{ textDecoration: 'none' }}
                >
                  <ExternalLink size={16} /> Open in New Tab
                </a>
                <a
                  href={fileUrl}
                  download={fileName}
                  className="btn-secondary"
                  style={{ textDecoration: 'none' }}
                >
                  <Download size={16} /> Download PDF
                </a>
              </div>
            </div>
          ) : (
            <div style={{ maxHeight: '520px', overflow: 'auto', display: 'flex', justifyContent: 'center' }}>
              <img
                src={fileUrl}
                alt={title}
                style={{
                  maxWidth: '100%',
                  maxHeight: '500px',
                  borderRadius: '12px',
                  objectFit: 'contain',
                  boxShadow: 'var(--shadow-sm)',
                }}
              />
            </div>
          )}
        </div>

        <div className="modal-footer">
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary btn-sm"
            style={{ textDecoration: 'none', marginRight: 'auto' }}
          >
            <ExternalLink size={14} /> Open Full Size
          </a>
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
