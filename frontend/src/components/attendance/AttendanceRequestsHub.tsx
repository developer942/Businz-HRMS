import React, { useState } from 'react';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Edit3,
  Search,
  Filter,
  AlertCircle,
  FileText,
  Calendar,
  Timer,
  DollarSign,
  ChevronRight,
  UserCheck,
  ShieldCheck,
  Paperclip,
  Check,
  X,
  Sliders
} from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { MissedPunchRequest, OvertimeRequest } from '../../types/attendanceEnterprise';
import { EditAndApproveModal } from './EditAndApproveModal';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/numbers';

export const AttendanceRequestsHub: React.FC = () => {
  const {
    missedPunchRequests,
    overtimeRequests,
    approveMissedPunchRequest,
    rejectMissedPunchRequest,
    approveOtRequest,
    rejectOtRequest,
    currentUser,
    shifts
  } = useHRMS();

  // Section 26: Separate Attendance Requests & OT Requests
  const [mainRequestType, setMainRequestType] = useState<'attendance' | 'overtime'>('attendance');

  // Attendance sub-tabs: Pending | Approved | Rejected
  const [attStatusTab, setAttStatusTab] = useState<'Pending' | 'Approved' | 'Rejected'>('Pending');

  // OT sub-tabs: Pending | Approved | Rejected | Partially Approved | Manual OT
  const [otStatusTab, setOtStatusTab] = useState<'Pending' | 'Approved' | 'Rejected' | 'Partially Approved' | 'Manual OT'>('Pending');

  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modals
  const [activeMissedRequest, setActiveMissedRequest] = useState<MissedPunchRequest | null>(null);
  const [activeOtRequest, setActiveOtRequest] = useState<OvertimeRequest | null>(null);

  const isHrOrCeo =
    currentUser?.role === 'CEO' ||
    currentUser?.role === 'HR Manager' ||
    currentUser?.role === 'HR Admin' ||
    currentUser?.role === 'Super Admin' ||
    currentUser?.role === 'Management' ||
    currentUser?.role === 'ERP Administrator';
  const isCEO =
    currentUser?.role === 'CEO' ||
    currentUser?.role === 'Super Admin' ||
    (currentUser as any)?.designation?.toLowerCase?.().includes('ceo') ||
    currentUser?.employeeId === 'EMP-000';

  const currentEmpId = currentUser?.employeeId || currentUser?.id;

  // Filter attendance requests based on role and tab
  const displayedMissed = missedPunchRequests.filter(r => {
    // If regular employee, only show their own
    if (!isHrOrCeo && r.employeeId !== currentEmpId) return false;

    if (r.status !== attStatusTab) return false;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        r.employeeName.toLowerCase().includes(q) ||
        r.employeeId.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Filter OT requests based on role and tab
  const displayedOt = overtimeRequests.filter(r => {
    if (!isHrOrCeo && r.employeeId !== currentEmpId) return false;

    if (otStatusTab === 'Manual OT') {
      if (r.source !== 'Manual OT') return false;
    } else if (otStatusTab === 'Pending') {
      if (r.status !== 'Pending Approval') return false;
    } else {
      if (r.status !== otStatusTab) return false;
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        r.employeeName.toLowerCase().includes(q) ||
        r.employeeId.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Counts for tabs
  const pendingAttCount = missedPunchRequests.filter(r => (isHrOrCeo ? true : r.employeeId === currentEmpId) && r.status === 'Pending').length;
  const pendingOtCount = overtimeRequests.filter(r => (isHrOrCeo ? true : r.employeeId === currentEmpId) && r.status === 'Pending Approval').length;

  return (
    <div className="vrm-req-hub">
      {/* ── HEADER & PRIMARY MODULE TOGGLE (Section 26) ── */}
      <div className="vrm-req-header">
        <div className="vrm-req-header-left">
          <div className="vrm-req-header-icon">
            <UserCheck size={22} />
          </div>
          <div>
            <h3 className="vrm-req-header-title">
              Requests & Approvals Workflow Hub
            </h3>
            <p className="vrm-req-header-subtitle">
              {isHrOrCeo
                ? 'Review, approve, reject, or edit-and-approve attendance corrections and overtime claims'
                : 'Track your submitted attendance correction requests and overtime claims'}
            </p>
          </div>
        </div>

        {/* Top Segmented Control: Attendance Requests vs OT Requests */}
        <div className="vrm-req-type-toggle">
          <button
            type="button"
            onClick={() => setMainRequestType('attendance')}
            className={`vrm-req-type-btn ${mainRequestType === 'attendance' ? 'active' : ''}`}
          >
            <Clock size={16} />
            <span>Attendance Requests</span>
            {pendingAttCount > 0 && (
              <span className="vrm-req-badge" style={{ background: '#0E7490' }}>
                {pendingAttCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMainRequestType('overtime')}
            className={`vrm-req-type-btn ${mainRequestType === 'overtime' ? 'active' : ''}`}
          >
            <Timer size={16} />
            <span>Overtime (OT) Requests</span>
            {pendingOtCount > 0 && (
              <span className="vrm-req-badge" style={{ background: '#7C3AED' }}>
                {pendingOtCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── SUB-TABS & SEARCH BAR ── */}
      <div className="vrm-req-filter-bar">
        {/* Status Sub-tabs */}
        {mainRequestType === 'attendance' ? (
          <div className="vrm-req-status-tabs">
            {(['Pending', 'Approved', 'Rejected'] as const).map(tab => {
              const count = missedPunchRequests.filter(r => (isHrOrCeo ? true : r.employeeId === currentEmpId) && r.status === tab).length;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setAttStatusTab(tab)}
                  className={`vrm-req-status-btn ${attStatusTab === tab ? 'active' : ''}`}
                >
                  {tab} ({count})
                </button>
              );
            })}
          </div>
        ) : (
          <div className="vrm-req-status-tabs">
            {(['Pending', 'Approved', 'Partially Approved', 'Rejected', 'Manual OT'] as const).map(tab => {
              const count = overtimeRequests.filter(r => {
                if (!isHrOrCeo && r.employeeId !== currentEmpId) return false;
                if (tab === 'Manual OT') return r.source === 'Manual OT';
                if (tab === 'Pending') return r.status === 'Pending Approval';
                return r.status === tab;
              }).length;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setOtStatusTab(tab)}
                  className={`vrm-req-status-btn ${otStatusTab === tab ? 'active' : ''}`}
                >
                  {tab} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Search Input */}
        <div className="vrm-search-box" style={{ width: '280px' }}>
          <Search size={15} className="vrm-search-icon" />
          <input
            type="text"
            placeholder="Search by name, ID or reason..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* ── REQUESTS LIST (Section 4: Request Cards) ── */}
      {mainRequestType === 'attendance' ? (
        <div className="vrm-req-list">
          {displayedMissed.length === 0 ? (
            <div className="vrm-empty-state" style={{ padding: '40px 20px', textAlign: 'center', border: '1px dashed #E2E8F0', borderRadius: '14px', background: '#F8FAFC' }}>
              <Clock size={32} color="#94A3B8" style={{ margin: '0 auto 8px' }} />
              <p style={{ fontSize: '14px', fontWeight: 700, color: '#334155', margin: '0 0 4px' }}>No attendance requests found</p>
              <p style={{ fontSize: '12px', color: '#64748B', margin: 0 }}>
                There are no {attStatusTab.toLowerCase()} attendance correction requests matching your filters.
              </p>
            </div>
          ) : (
            displayedMissed.map(item => (
              <div key={item.id} className="vrm-req-card">
                {/* Top Row: Employee Profile + Status Badge */}
                <div className="vrm-req-card-top">
                  <div className="vrm-req-card-emp">
                    <div className="vrm-req-avatar">
                      {item.employeeName.charAt(0)}
                    </div>
                    <div className="vrm-req-emp-info">
                      <div className="vrm-req-emp-row">
                        <span className="vrm-req-emp-name">{item.employeeName}</span>
                        <span className="vrm-req-emp-id">{item.employeeId}</span>
                        <span className="vrm-req-type-pill">{item.requestType}</span>
                      </div>
                      <div className="vrm-req-meta-row">
                        <span>Dept: <strong className="vrm-req-meta-item">{item.department}</strong></span>
                        <span>•</span>
                        <span>Shift: <strong className="vrm-req-meta-item">{item.shiftName || shifts[0]?.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)'}</strong></span>
                        <span>•</span>
                        <span>Date: <strong className="vrm-req-meta-item" style={{ color: '#0E7490' }}>{formatDateDDMMYYYY(item.date)}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <span className={`vrm-req-status-pill ${
                      item.status === 'Approved'
                        ? 'vrm-req-status-approved'
                        : item.status === 'Rejected'
                        ? 'vrm-req-status-rejected'
                        : 'vrm-req-status-pending'
                    }`}>
                      {item.status === 'Pending' ? 'PENDING HR/CEO REVIEW' : item.status}
                    </span>
                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                      Submitted: {item.submittedAt}
                    </span>
                  </div>
                </div>

                {/* Middle Grid: Existing Punch vs Requested Punch */}
                <div className="vrm-req-comparison-grid">
                  <div className="vrm-req-box">
                    <div className="vrm-req-box-label">Recorded Punch in System</div>
                    <div className="vrm-req-box-val">
                      In: <strong>{item.existingCheckIn || 'Missing Punch'}</strong> | Out: <strong>{item.existingCheckOut || 'Missing Punch'}</strong>
                    </div>
                  </div>

                  <div className="vrm-req-box highlight">
                    <div className="vrm-req-box-label">Requested Correction Punch</div>
                    <div className="vrm-req-box-val">
                      In: <strong>{item.requestedCheckIn || 'None'}</strong> | Out: <strong>{item.requestedCheckOut || 'None'}</strong>
                    </div>
                  </div>
                </div>

                {/* Reason & Description */}
                <div className="vrm-req-reason-box">
                  <strong style={{ color: '#0E7490', display: 'block', fontSize: '11px', textTransform: 'uppercase', marginBottom: '2px' }}>
                    Stated Reason & Description
                  </strong>
                  <em>"{item.reason}"</em>
                  {item.description && ` — ${item.description}`}
                </div>

                {item.attachmentUrl && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#0E7490', marginBottom: '10px' }}>
                    <Paperclip size={14} />
                    <span>Attachment: <strong>{item.attachmentUrl}</strong></span>
                  </div>
                )}

                {item.hrRemarks && (
                  <div style={{ background: '#F8FAFC', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px', color: '#475569', marginBottom: '10px' }}>
                    <strong>HR Review Remarks:</strong> {item.hrRemarks} ({item.reviewedBy} at {item.reviewedAt})
                  </div>
                )}

                {/* Bottom Action Strip (Section 4: [Approve], [Reject], [Edit & Approve]) */}
                {isHrOrCeo && item.status === 'Pending' && (
                  <div className="vrm-req-actions">
                    <button
                      type="button"
                      onClick={() => rejectMissedPunchRequest(item.id, currentUser.name, 'Rejected by CEO')}
                      className="vrm-btn vrm-btn-secondary"
                      style={{ color: '#DC2626', borderColor: '#FECACA' }}
                    >
                      <X size={14} /> Reject
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveMissedRequest(item)}
                      className="vrm-btn vrm-btn-secondary"
                      style={{ color: '#0E7490', borderColor: '#0E7490' }}
                    >
                      <Edit3 size={14} /> Edit & Approve
                    </button>

                    <button
                      type="button"
                      onClick={() => approveMissedPunchRequest(item.id, currentUser.name, 'Approved as requested')}
                      className="vrm-btn vrm-btn-primary"
                    >
                      <Check size={14} /> Approve
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        /* ── OVERTIME REQUESTS LIST (Section 15, 26) ── */
        <div className="vrm-req-list">
          {displayedOt.length === 0 ? (
            <div className="vrm-empty-state" style={{ padding: '40px 20px', textAlign: 'center', border: '1px dashed #E2E8F0', borderRadius: '14px', background: '#F8FAFC' }}>
              <Timer size={32} color="#94A3B8" style={{ margin: '0 auto 8px' }} />
              <p style={{ fontSize: '14px', fontWeight: 700, color: '#334155', margin: '0 0 4px' }}>No overtime requests found</p>
              <p style={{ fontSize: '12px', color: '#64748B', margin: 0 }}>
                There are no {otStatusTab.toLowerCase()} overtime claims matching your filters.
              </p>
            </div>
          ) : (
            displayedOt.map(ot => (
              <div key={ot.id} className="vrm-req-card">
                {/* Header Row */}
                <div className="vrm-req-card-top">
                  <div className="vrm-req-card-emp">
                    <div className="vrm-req-avatar" style={{ background: '#EDE9FE', color: '#7C3AED' }}>
                      {ot.employeeName.charAt(0)}
                    </div>
                    <div className="vrm-req-emp-info">
                      <div className="vrm-req-emp-row">
                        <span className="vrm-req-emp-name">{ot.employeeName}</span>
                        <span className="vrm-req-emp-id">{ot.employeeId}</span>
                        <span className="vrm-req-type-pill" style={{ background: '#EDE9FE', color: '#7C3AED', borderColor: '#DDD6FE' }}>
                          OT Claim: {ot.requestedOtHours} hrs
                        </span>
                        {ot.source === 'Manual OT' && (
                          <span className="vrm-req-emp-id" style={{ background: '#FEF3C7', color: '#B45309' }}>
                            Manual OT
                          </span>
                        )}
                      </div>
                      <div className="vrm-req-meta-row">
                        <span>Dept: <strong className="vrm-req-meta-item">{ot.department}</strong></span>
                        <span>•</span>
                        <span>Date: <strong className="vrm-req-meta-item" style={{ color: '#0E7490' }}>{formatDateDDMMYYYY(ot.date)}</strong></span>
                        <span>•</span>
                        <span>Rate: <strong className="vrm-req-meta-item font-mono">₹{ot.hourlyRate}/hr</strong></span>
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <span className={`vrm-req-status-pill ${
                      ot.status === 'Approved'
                        ? 'vrm-req-status-approved'
                        : ot.status === 'Partially Approved'
                        ? 'vrm-req-status-approved'
                        : ot.status === 'Rejected'
                        ? 'vrm-req-status-rejected'
                        : 'vrm-req-status-pending'
                    }`}>
                      {ot.status}
                    </span>
                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                      Submitted: {ot.submittedAt}
                    </span>
                  </div>
                </div>

                {/* Details breakdown */}
                <div className="vrm-req-comparison-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                  <div className="vrm-req-box">
                    <div className="vrm-req-box-label">Shift End vs Actual Out</div>
                    <div className="vrm-req-box-val">
                      End: <strong>{ot.shiftEnd}</strong> | Out: <strong>{ot.actualCheckOut}</strong>
                    </div>
                  </div>

                  <div className="vrm-req-box" style={{ background: '#EDE9FE', borderColor: '#DDD6FE' }}>
                    <div className="vrm-req-box-label" style={{ color: '#7C3AED' }}>Hours Claimed vs Approved</div>
                    <div className="vrm-req-box-val" style={{ color: '#6D28D9' }}>
                      Claimed: <strong>{ot.requestedOtHours} hrs</strong> | Approved: <strong>{ot.approvedOtHours} hrs</strong>
                    </div>
                  </div>

                  <div className="vrm-req-box" style={{ background: '#DCFCE7', borderColor: '#BBF7D0' }}>
                    <div className="vrm-req-box-label" style={{ color: '#15803D' }}>Calculated OT Payout</div>
                    <div className="vrm-req-box-val" style={{ color: '#15803D' }}>
                      {formatCurrency(ot.calculatedAmount)} ({ot.multiplier})
                    </div>
                  </div>
                </div>

                {/* Reason & Description */}
                <div className="vrm-req-reason-box" style={{ borderLeftColor: '#7C3AED' }}>
                  <strong style={{ color: '#7C3AED', display: 'block', fontSize: '11px', textTransform: 'uppercase', marginBottom: '2px' }}>
                    Reason & Work Description
                  </strong>
                  <em>"{ot.reason}"</em>
                  {ot.workDescription && ` — ${ot.workDescription}`}
                </div>

                {ot.reviewRemarks && (
                  <div style={{ background: '#F8FAFC', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px', color: '#475569', marginBottom: '10px' }}>
                    <strong>HR Review Remarks:</strong> {ot.reviewRemarks} ({ot.reviewedBy} at {ot.reviewedAt})
                  </div>
                )}

                {/* Action Buttons for HR/CEO */}
                {isHrOrCeo && ot.status === 'Pending Approval' && (
                  <div className="vrm-req-actions">
                    <button
                      type="button"
                      onClick={() => rejectOtRequest(ot.id, currentUser.name, 'Rejected by CEO')}
                      className="vrm-btn vrm-btn-secondary"
                      style={{ color: '#DC2626', borderColor: '#FECACA' }}
                    >
                      <X size={14} /> Reject OT
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveOtRequest(ot)}
                      className="vrm-btn vrm-btn-secondary"
                      style={{ color: '#0E7490', borderColor: '#0E7490' }}
                    >
                      <Edit3 size={14} /> Adjust & Approve
                    </button>

                    <button
                      type="button"
                      onClick={() => approveOtRequest(ot.id, ot.requestedOtHours, currentUser.name, 'Approved full hours as requested')}
                      className="vrm-btn vrm-btn-primary"
                    >
                      <Check size={14} /> Approve Full ({ot.requestedOtHours}h)
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Edit & Approve Modal for both Attendance and OT */}
      {(activeMissedRequest || activeOtRequest) && (
        <EditAndApproveModal
          isOpen={true}
          onClose={() => {
            setActiveMissedRequest(null);
            setActiveOtRequest(null);
          }}
          missedPunchRequest={activeMissedRequest}
          overtimeRequest={activeOtRequest}
        />
      )}
    </div>
  );
};
