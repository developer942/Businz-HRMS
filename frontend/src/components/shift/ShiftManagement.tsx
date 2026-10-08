import React, { useState } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { Shift, ShiftRequest } from '../../types/hrms';
import { 
  Plus, 
  CheckCircle2, 
  ArrowRightLeft, 
  Trash2, 
  Edit3, 
  Clock, 
  ShieldAlert, 
  X, 
  Check, 
  UserCheck, 
  Calendar,
  AlertCircle
} from 'lucide-react';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

interface ShiftManagementProps {
  openAddModal?: boolean;
  onCloseQuickAdd?: () => void;
}

export const ShiftManagement: React.FC<ShiftManagementProps> = ({
  openAddModal = false,
  onCloseQuickAdd
}) => {
  const { 
    shifts, 
    addShift, 
    updateShift, 
    deleteShift, 
    shiftRequests, 
    requestShiftChange, 
    approveShiftRequest, 
    rejectShiftRequest, 
    employees, 
    currentUser 
  } = useHRMS();

  // Role permissions: CEO and HR are managers
  const userRole = (currentUser?.role as string) || '';
  const isCEO = userRole === 'CEO' || 
    userRole === 'Super Admin' || 
    userRole === 'Management' || 
    currentUser?.designation === 'CEO' || 
    currentUser?.employeeId === 'EMP-000' ||
    (currentUser?.designation && currentUser.designation.toLowerCase().includes('ceo')) || 
    (currentUser?.designation && currentUser.designation.toLowerCase().includes('director')) || 
    userRole === 'ERP Administrator' ||
    userRole.toLowerCase().includes('ceo');

  const isHR = userRole === 'HR Admin' || 
    userRole === 'HR Manager' || 
    userRole === 'HR' || 
    userRole.toLowerCase().includes('hr') ||
    (currentUser?.department && currentUser.department.toLowerCase().includes('hr')) || 
    (currentUser?.department && currentUser.department.toLowerCase().includes('human resource')) || 
    (currentUser?.designation && currentUser.designation.toLowerCase().includes('hr'));

  const canManageShifts = isCEO || isHR || userRole === 'Management' || userRole === 'Super Admin' || userRole === 'Admin' || userRole !== 'Employee';
  const isEmployee = !canManageShifts;

  // Modal states
  const [showAddShiftModal, setShowAddShiftModal] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{ shiftId: string; shiftName: string } | null>(null);
  const [rejectModal, setRejectModal] = useState<{ requestId: string; employeeName: string } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync quick add modal trigger from header
  React.useEffect(() => {
    if (openAddModal) {
      if (canManageShifts) {
        setShowAddShiftModal(true);
      } else {
        setShowSwapModal(true);
      }
    }
  }, [openAddModal, canManageShifts]);

  // Identify current employee record
  const currentEmp = employees.find(e => 
    (currentUser.employeeId && e.employeeId === currentUser.employeeId) ||
    (currentUser.id && (e.id === currentUser.id || e.employeeId === currentUser.id)) ||
    (currentUser.name && `${e.firstName} ${e.lastName}`.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
  );

  const userEmpId = (currentUser.employeeId || currentEmp?.employeeId || currentEmp?.id || 'EMP-008').trim().toLowerCase();
  const userName = (currentUser.name || (currentEmp ? `${currentEmp.firstName} ${currentEmp.lastName}`.trim() : 'Staff Member')).trim().toLowerCase();
  const myAssignedShiftName = currentEmp?.workShift || (shifts[0]?.shiftName || 'Not Assigned');

  // Find employee's assigned shift object
  const myShift = shifts.find(s => 
    s.shiftName.toLowerCase() === myAssignedShiftName.toLowerCase() ||
    myAssignedShiftName.toLowerCase().includes(s.shiftName.toLowerCase()) ||
    s.shiftName.toLowerCase().includes(myAssignedShiftName.toLowerCase())
  ) || shifts[0] || null;

  // Scoped shift swap requests: Employee sees only their own requests; HR/CEO sees all
  const myShiftRequests = shiftRequests.filter(r => {
    const reqEmpId = (r.employeeId || '').trim().toLowerCase();
    const reqEmpName = (r.employeeName || '').trim().toLowerCase();

    if (userEmpId && reqEmpId && userEmpId === reqEmpId) return true;
    if (userName && reqEmpName && (reqEmpName === userName || reqEmpName.includes(userName) || userName.includes(reqEmpName))) return true;
    return false;
  });

  const displayedShiftRequests = isEmployee ? myShiftRequests : shiftRequests;

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Add Shift Form State
  const [shiftForm, setShiftForm] = useState({
    shiftName: '',
    startTime: '09:00',
    endTime: '18:00',
    breakDurationMins: 45,
    workingHours: 8.25,
    gracePeriodMins: 15,
    color: '#0E7490'
  });

  // Edit Shift Form State
  const [editShiftForm, setEditShiftForm] = useState({
    shiftName: '',
    startTime: '09:00',
    endTime: '18:00',
    breakDurationMins: 45,
    workingHours: 8.25,
    gracePeriodMins: 15,
    color: '#0E7490'
  });

  // Shift Swap Request Form State
  const [swapForm, setSwapForm] = useState({
    currentShift: myAssignedShiftName,
    requestedShift: shifts.find(s => s.shiftName !== myAssignedShiftName)?.shiftName || (shifts[1]?.shiftName || 'Shift 2 (09:30 AM - 06:30 PM)'),
    requestedDate: new Date().toISOString().split('T')[0],
    reason: 'Personal schedule adjustment'
  });

  React.useEffect(() => {
    if (myAssignedShiftName) {
      setSwapForm(prev => ({
        ...prev,
        currentShift: myAssignedShiftName,
        requestedShift: shifts.find(s => s.shiftName !== myAssignedShiftName)?.shiftName || shifts[0]?.shiftName || ''
      }));
    }
  }, [myAssignedShiftName, shifts]);

  // Handle Add Shift
  const handleAddShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shiftForm.shiftName.trim()) return;

    const [startH, startM] = shiftForm.startTime.split(':').map(Number);
    const [endH, endM] = shiftForm.endTime.split(':').map(Number);
    let totalMins = (endH * 60 + endM) - (startH * 60 + startM);
    if (totalMins < 0) totalMins += 24 * 60;
    const computedHours = Math.max(0, Math.round(((totalMins - shiftForm.breakDurationMins) / 60) * 100) / 100);

    addShift({
      shiftName: shiftForm.shiftName.trim(),
      startTime: shiftForm.startTime,
      endTime: shiftForm.endTime,
      breakDurationMins: Number(shiftForm.breakDurationMins),
      workingHours: Number(shiftForm.workingHours) || computedHours,
      gracePeriodMins: Number(shiftForm.gracePeriodMins),
      assignments: [],
      color: shiftForm.color
    });

    setShowAddShiftModal(false);
    if (onCloseQuickAdd) onCloseQuickAdd();
    setShiftForm({
      shiftName: '',
      startTime: '09:00',
      endTime: '18:00',
      breakDurationMins: 45,
      workingHours: 8.25,
      gracePeriodMins: 15,
      color: '#0E7490'
    });
    triggerToast(`Added new shift "${shiftForm.shiftName}" successfully!`);
  };

  // Open Edit Shift Modal
  const handleOpenEditShift = (s: Shift) => {
    setEditingShift(s);
    setEditShiftForm({
      shiftName: s.shiftName,
      startTime: s.startTime,
      endTime: s.endTime,
      breakDurationMins: s.breakDurationMins,
      workingHours: s.workingHours,
      gracePeriodMins: s.gracePeriodMins,
      color: s.color || '#0E7490'
    });
  };

  // Handle Save Edit Shift
  const handleSaveEditShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShift || !editShiftForm.shiftName.trim()) return;

    const [startH, startM] = editShiftForm.startTime.split(':').map(Number);
    const [endH, endM] = editShiftForm.endTime.split(':').map(Number);
    let totalMins = (endH * 60 + endM) - (startH * 60 + startM);
    if (totalMins < 0) totalMins += 24 * 60;
    const computedHours = Math.max(0, Math.round(((totalMins - editShiftForm.breakDurationMins) / 60) * 100) / 100);

    updateShift(editingShift.id, {
      shiftName: editShiftForm.shiftName.trim(),
      startTime: editShiftForm.startTime,
      endTime: editShiftForm.endTime,
      breakDurationMins: Number(editShiftForm.breakDurationMins),
      workingHours: Number(editShiftForm.workingHours) || computedHours,
      gracePeriodMins: Number(editShiftForm.gracePeriodMins),
      color: editShiftForm.color
    });

    setEditingShift(null);
    triggerToast(`Shift "${editShiftForm.shiftName}" updated successfully!`);
  };

  // Handle Delete Shift
  const handleConfirmDelete = () => {
    if (!deleteConfirmModal || !canManageShifts) return;
    deleteShift(deleteConfirmModal.shiftId);
    triggerToast(`Deleted shift "${deleteConfirmModal.shiftName}" successfully!`);
    setDeleteConfirmModal(null);
  };

  // Handle Employee Shift Swap Request
  const handleRequestSwap = (e: React.FormEvent) => {
    e.preventDefault();
    requestShiftChange({
      employeeId: currentUser.employeeId || currentEmp?.employeeId || currentEmp?.id || userEmpId || 'EMP-008',
      employeeName: currentUser.name || (currentEmp ? `${currentEmp.firstName} ${currentEmp.lastName}`.trim() : 'Staff Member'),
      currentShift: swapForm.currentShift || myAssignedShiftName,
      requestedShift: swapForm.requestedShift,
      requestedDate: swapForm.requestedDate,
      reason: swapForm.reason
    });
    setShowSwapModal(false);
    if (onCloseQuickAdd) onCloseQuickAdd();
    triggerToast('Shift change swap request submitted successfully! Pending HR / CEO approval.');
  };

  // Handle CEO / HR Approval
  const handleApproveRequest = (req: ShiftRequest) => {
    const approverLabel = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : 'HR'})`;
    approveShiftRequest(req.id, approverLabel);
    triggerToast(`Accepted shift request for ${req.employeeName}! Shift switched to ${req.requestedShift}.`);
  };

  // Handle CEO / HR Rejection
  const handleConfirmReject = () => {
    if (!rejectModal) return;
    const rejecterLabel = `${currentUser.name} (${currentUser.role === 'Super Admin' ? 'CEO' : 'HR'})`;
    rejectShiftRequest(rejectModal.requestId, rejecterLabel, rejectionReason || 'Declined by management.');
    triggerToast(`Rejected shift swap request for ${rejectModal.employeeName}.`);
    setRejectModal(null);
    setRejectionReason('');
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1>{isEmployee ? 'My Shift & Schedule' : 'Shift Management'}</h1>
          <p className="page-subtitle">
            {isEmployee 
              ? 'View your assigned shift timetable, working hours, and request a shift swap with HR & CEO approval.' 
              : 'Configure system shifts, working hours, grace periods, and review employee shift change requests.'}
          </p>
        </div>
        <div className="header-actions">
          {canManageShifts && (
            <button 
              type="button" 
              onClick={() => setShowAddShiftModal(true)}
              style={{
                backgroundColor: '#0E7490',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 13px',
                fontWeight: 650,
                fontSize: '0.80rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: '0 2px 6px rgba(14, 116, 144, 0.2)',
                transition: 'background-color 0.15s'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0891B2')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0E7490')}
            >
              <Plus size={14} strokeWidth={2.2} />
              <span>Add Shift</span>
            </button>
          )}
          {isEmployee && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowSwapModal(true)}>
              <ArrowRightLeft size={16} /> Request Shift Swap
            </button>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: '#ECFDF5',
          border: '1px solid #10B981',
          color: '#065F46',
          padding: '12px 20px',
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          fontWeight: 700,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={18} /> {toastMessage}
        </div>
      )}

      {/* Assigned Shift Card for Employee */}
      {isEmployee && (
        <div style={{ marginBottom: '28px' }}>
          <div className="card" style={{ borderLeft: '6px solid #0E7490', padding: '20px', backgroundColor: '#FFFFFF', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0E7490', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Your Assigned Shift
                </span>
                <h4 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '4px 0 2px 0', color: '#0F172A' }}>
                  {myShift?.shiftName || 'Not Assigned'}
                </h4>
                <p style={{ margin: 0, fontSize: '0.84rem', color: '#64748B' }}>
                  Your official rostered timings for workdays
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', padding: '16px', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
              <div>
                <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Shift Timing</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                  {myShift ? `${myShift.startTime} - ${myShift.endTime}` : '--:--'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Working Hours</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                  {myShift ? (myShift.workingHours === 8.25 ? '8h 15m' : `${myShift.workingHours} Hours`) : '--'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Meal / Break</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                  {myShift ? `${myShift.breakDurationMins} Mins` : '--'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Grace Period</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                  {myShift ? `${myShift.gracePeriodMins} Mins` : '--'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active System Shifts Section */}
      {!isEmployee && (
        <div style={{ marginBottom: '28px' }}>
          {shifts.length > 0 ? (
          <div className="shift-cards-grid">
            {shifts.map(s => (
              <div 
                key={s.id} 
                className="card" 
                style={{ 
                  borderLeft: `4px solid ${s.color || '#0E7490'}`, 
                  marginBottom: 0, 
                  position: 'relative',
                  transition: 'box-shadow 0.2s',
                  borderRadius: '14px',
                  padding: '16px 18px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <h4 style={{ fontSize: '0.98rem', fontWeight: 700, margin: 0, color: '#0F172A' }}>
                    {s.shiftName}
                  </h4>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="status-pill active" style={{ fontSize: '0.65rem' }}>Active</span>

                    {/* CEO and HR Edit & Delete Controls */}
                    {canManageShifts ? (
                      <>
                        {/* EDIT SHIFT BUTTON */}
                        <button
                          type="button"
                          onClick={() => handleOpenEditShift(s)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            color: '#0E7490',
                            backgroundColor: '#ECFEFF',
                            border: '1px solid #CFFAFE',
                            cursor: 'pointer'
                          }}
                          title="Edit Shift (CEO & HR Only)"
                        >
                          <Edit3 size={12} /> Edit
                        </button>

                        {/* DELETE SHIFT BUTTON */}
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmModal({ shiftId: s.id, shiftName: s.shiftName })}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            color: '#DC2626',
                            backgroundColor: '#FEF2F2',
                            border: '1px solid #FEE2E2',
                            cursor: 'pointer'
                          }}
                          title="Delete Shift (CEO & HR Only)"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: '0.68rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Clock size={11} /> Standard
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '0.82rem', color: '#475569' }}>
                  <div><strong>Timing:</strong> {s.startTime} - {s.endTime}</div>
                  <div><strong>Working:</strong> {s.workingHours === 8.25 ? '8h 15m' : `${s.workingHours} Hours`}</div>
                  <div><strong>Break:</strong> {s.breakDurationMins} Mins</div>
                  <div><strong>Grace Period:</strong> {s.gracePeriodMins} Mins</div>
                  <div style={{ gridColumn: 'span 2', paddingTop: '4px', borderTop: '1px dashed #E2E8F0', color: '#64748B' }}>
                    <strong>Assigned Staff:</strong> {employees.filter(e => 
                      (e.workShift && (e.workShift === s.shiftName || e.workShift.toLowerCase().includes(s.shiftName.toLowerCase()))) ||
                      (s.assignments && s.assignments.some(a => a.employeeId === e.employeeId || a.employeeId === e.id))
                    ).length} Employees
                  </div>
                </div>
              </div>
            ))}
          </div>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: '#64748B' }}>
              <Clock size={36} style={{ margin: '0 auto 12px', color: '#94A3B8' }} />
              <h4 style={{ margin: '0 0 6px', color: '#1E293B', fontWeight: 600 }}>No Shifts Configured</h4>
              <p style={{ margin: 0, fontSize: '0.88rem' }}>Click "+ Add New Shift" above to manually define your company working shifts.</p>
            </div>
          )}
        </div>
      )}

      {/* Shift Swap Requests Section */}
      <div className="card" style={{ marginTop: '28px', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 className="card-title" style={{ margin: 0, fontSize: '1.05rem' }}>
              {isEmployee ? `My Shift Swap Requests (${displayedShiftRequests.length})` : `Employee Shift Swap Requests (${displayedShiftRequests.length})`}
            </h3>
            <p style={{ margin: '3px 0 0 0', fontSize: '0.82rem', color: '#64748B' }}>
              {canManageShifts 
                ? 'Review employee shift requests. Accept to automatically update employee roster, or reject with a reason.' 
                : 'Track the status of your submitted shift swap requests.'}
            </p>
          </div>
        </div>

        {displayedShiftRequests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 20px', color: '#64748B' }}>
            <Calendar size={32} style={{ color: '#94A3B8', marginBottom: '8px' }} />
            <p style={{ fontSize: '0.9rem', margin: 0 }}>
              {isEmployee ? 'You have not submitted any shift change requests yet.' : 'No pending shift swap requests.'}
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="hrms-table" style={{ width: '100%', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748B', padding: '12px 16px' }}>Employee</th>
                  <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748B', padding: '12px 16px', whiteSpace: 'nowrap' }}>Current Shift</th>
                  <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748B', padding: '12px 16px', whiteSpace: 'nowrap' }}>Requested Shift</th>
                  <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748B', padding: '12px 16px', whiteSpace: 'nowrap' }}>Effective Date</th>
                  <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748B', padding: '12px 16px' }}>Reason</th>
                  <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748B', padding: '12px 16px' }}>Status</th>
                  <th style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748B', padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedShiftRequests.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '13px' }}>
                        {isEmployee ? (
                          <span>You ({r.employeeName})</span>
                        ) : (
                          r.employeeName
                        )}
                      </div>
                      {r.employeeId && (
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500, marginTop: '2px' }}>
                          {r.employeeId}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '12.5px', color: '#475569', fontWeight: 500 }}>
                        {r.currentShift}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{ 
                        fontSize: '12px', 
                        color: '#0E7490', 
                        fontWeight: 600, 
                        background: '#ECFEFF', 
                        border: '1px solid #CFFAFE', 
                        padding: '3px 8px', 
                        borderRadius: '6px',
                        display: 'inline-block'
                      }}>
                        {r.requestedShift}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 600, color: '#475569' }}>
                        {formatDateDDMMYYYY(r.requestedDate)}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', maxWidth: '300px' }}>
                      <span style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.45, display: 'block' }}>
                        {r.reason}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <span className={`status-pill ${r.status.toLowerCase()}`} style={{ fontSize: '11.5px', fontWeight: 700 }}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {r.status === 'Pending' ? (
                        (isCEO || isHR) ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            {/* ACCEPT BUTTON */}
                            <button 
                              type="button"
                              onClick={() => handleApproveRequest(r)}
                              style={{ 
                                fontSize: '11.5px', 
                                fontWeight: 700, 
                                padding: '5px 12px', 
                                borderRadius: '8px',
                                backgroundColor: '#22C55E',
                                border: 'none',
                                color: '#FFFFFF',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title="Accept & Change Employee Shift"
                            >
                              <Check size={13} /> Accept
                            </button>

                            {/* REJECT BUTTON */}
                            <button 
                              type="button"
                              onClick={() => setRejectModal({ requestId: r.id, employeeName: r.employeeName })}
                              style={{ 
                                fontSize: '11.5px', 
                                fontWeight: 700, 
                                padding: '5px 12px', 
                                borderRadius: '8px',
                                backgroundColor: '#EF4444',
                                border: 'none',
                                color: '#FFFFFF',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title="Reject Shift Request"
                            >
                              <X size={13} /> Reject
                            </button>
                          </div>
                        ) : (
                          <span className="status-pill pending" style={{ fontSize: '11px', fontWeight: 600 }}>
                            Pending Approval
                          </span>
                        )
                      ) : r.status === 'Approved' ? (
                        <span style={{ fontSize: '11.5px', color: '#15803D', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={13} color="#22C55E" /> Approved by {r.approvedBy || 'CEO / HR'}
                        </span>
                      ) : (
                        <span style={{ fontSize: '11.5px', color: '#B91C1C', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <X size={13} color="#EF4444" /> Rejected
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Shift Modal */}
      {showAddShiftModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h2>Add New Shift Schedule</h2>
              <button onClick={() => { setShowAddShiftModal(false); if (onCloseQuickAdd) onCloseQuickAdd(); }}>✕</button>
            </div>
            <form onSubmit={handleAddShift}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Shift Title / Name <span style={{ color: '#EF4444' }}>*</span></label>
                  <input 
                    className="form-control" 
                    value={shiftForm.shiftName} 
                    onChange={e => setShiftForm({ ...shiftForm, shiftName: e.target.value })} 
                    placeholder="e.g. Shift 4 (08:00 AM - 05:00 PM)" 
                    required 
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Start Time</label>
                    <input className="form-control" type="time" value={shiftForm.startTime} onChange={e => setShiftForm({ ...shiftForm, startTime: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">End Time</label>
                    <input className="form-control" type="time" value={shiftForm.endTime} onChange={e => setShiftForm({ ...shiftForm, endTime: e.target.value })} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Grace Period (Minutes)</label>
                    <input className="form-control" type="number" min="0" max="60" value={shiftForm.gracePeriodMins} onChange={e => setShiftForm({ ...shiftForm, gracePeriodMins: Number(e.target.value) })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Break Duration (Minutes)</label>
                    <input className="form-control" type="number" min="0" max="120" value={shiftForm.breakDurationMins} onChange={e => setShiftForm({ ...shiftForm, breakDurationMins: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Working Hours (Net)</label>
                    <input className="form-control" type="number" step="0.25" value={shiftForm.workingHours} onChange={e => setShiftForm({ ...shiftForm, workingHours: Number(e.target.value) })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Shift Accent Color</label>
                    <input className="form-control" type="color" value={shiftForm.color} onChange={e => setShiftForm({ ...shiftForm, color: e.target.value })} style={{ height: '38px', padding: '2px 4px' }} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowAddShiftModal(false); if (onCloseQuickAdd) onCloseQuickAdd(); }}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm">Create Shift</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT SHIFT MODAL FOR CEO & HR */}
      {editingShift && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit3 size={18} color="#0E7490" /> Edit Shift: {editingShift.shiftName}
              </h2>
              <button onClick={() => setEditingShift(null)}>✕</button>
            </div>
            <form onSubmit={handleSaveEditShift}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Shift Title / Name <span style={{ color: '#EF4444' }}>*</span></label>
                  <input 
                    className="form-control" 
                    value={editShiftForm.shiftName} 
                    onChange={e => setEditShiftForm({ ...editShiftForm, shiftName: e.target.value })} 
                    placeholder="e.g. Shift 1 (09:00 AM - 06:00 PM)" 
                    required 
                  />
                  <small style={{ color: '#64748B', fontSize: '0.74rem' }}>
                    Renaming this shift will automatically update all assigned employees.
                  </small>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Start Time</label>
                    <input className="form-control" type="time" value={editShiftForm.startTime} onChange={e => setEditShiftForm({ ...editShiftForm, startTime: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">End Time</label>
                    <input className="form-control" type="time" value={editShiftForm.endTime} onChange={e => setEditShiftForm({ ...editShiftForm, endTime: e.target.value })} required />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Grace Period (Minutes)</label>
                    <input className="form-control" type="number" min="0" max="60" value={editShiftForm.gracePeriodMins} onChange={e => setEditShiftForm({ ...editShiftForm, gracePeriodMins: Number(e.target.value) })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Break Duration (Minutes)</label>
                    <input className="form-control" type="number" min="0" max="120" value={editShiftForm.breakDurationMins} onChange={e => setEditShiftForm({ ...editShiftForm, breakDurationMins: Number(e.target.value) })} required />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Working Hours (Net)</label>
                    <input className="form-control" type="number" step="0.25" value={editShiftForm.workingHours} onChange={e => setEditShiftForm({ ...editShiftForm, workingHours: Number(e.target.value) })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Shift Color</label>
                    <input className="form-control" type="color" value={editShiftForm.color} onChange={e => setEditShiftForm({ ...editShiftForm, color: e.target.value })} style={{ height: '38px', padding: '2px 4px' }} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingShift(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Request Swap Modal */}
      {showSwapModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2>Request Shift Swap / Change</h2>
              <button onClick={() => { setShowSwapModal(false); if (onCloseQuickAdd) onCloseQuickAdd(); }}>✕</button>
            </div>
            <form onSubmit={handleRequestSwap}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Current Shift</label>
                  <input className="form-control" value={swapForm.currentShift} readOnly style={{ backgroundColor: '#F8FAFC' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Target Shift Requested <span style={{ color: '#EF4444' }}>*</span></label>
                  <select className="form-control" value={swapForm.requestedShift} onChange={e => setSwapForm({ ...swapForm, requestedShift: e.target.value })} required>
                    {shifts.map(s => <option key={s.id} value={s.shiftName}>{s.shiftName} ({s.startTime} - {s.endTime})</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Effective Date <span style={{ color: '#EF4444' }}>*</span></label>
                  <input className="form-control" type="date" value={swapForm.requestedDate} onChange={e => setSwapForm({ ...swapForm, requestedDate: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Reason for Request <span style={{ color: '#EF4444' }}>*</span></label>
                  <textarea className="form-control" rows={3} value={swapForm.reason} onChange={e => setSwapForm({ ...swapForm, reason: e.target.value })} placeholder="State the reason for this shift change (e.g. personal commute, family necessity, exam)..." required />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowSwapModal(false); if (onCloseQuickAdd) onCloseQuickAdd(); }}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm">Submit Request</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Reason Modal for CEO / HR */}
      {rejectModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h2 style={{ color: '#DC2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={20} /> Decline Shift Request
              </h2>
              <button onClick={() => setRejectModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.88rem', color: '#475569', marginBottom: '14px' }}>
                You are declining the shift swap request for <strong>{rejectModal.employeeName}</strong>.
              </p>
              <div className="form-group">
                <label className="form-label">Rejection Reason / Note</label>
                <textarea 
                  className="form-control" 
                  rows={3} 
                  value={rejectionReason} 
                  onChange={e => setRejectionReason(e.target.value)} 
                  placeholder="e.g. Shift is at full staff capacity for that day..."
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRejectModal(null)}>Cancel</button>
              <button type="button" className="btn btn-danger btn-sm" onClick={handleConfirmReject}>Confirm Decline</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#DC2626' }}>
                <ShieldAlert size={20} /> Delete Shift Confirmation
              </h2>
              <button onClick={() => setDeleteConfirmModal(null)}><X size={18} /></button>
            </div>
            
            <div className="modal-body" style={{ textAlign: 'center', padding: '24px 16px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: '#FEF2F2',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <Trash2 size={24} />
              </div>

              <h4 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '8px' }}>
                Delete "{deleteConfirmModal.shiftName}"?
              </h4>
              
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                Are you sure you want to remove this shift schedule? Any assigned employees will need to be reallocated.
              </p>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'center', gap: '12px' }}>
              <button 
                type="button" 
                className="btn btn-secondary btn-sm" 
                onClick={() => setDeleteConfirmModal(null)}
              >
                Cancel
              </button>
              
              <button 
                type="button" 
                className="btn btn-danger btn-sm" 
                onClick={handleConfirmDelete}
                style={{ padding: '8px 20px', fontWeight: 700 }}
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
