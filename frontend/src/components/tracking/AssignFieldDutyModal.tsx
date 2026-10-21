import React, { useState } from 'react';
import { X, Calendar, Clock, MapPin, Building, ShieldCheck, Check, Navigation, AlertCircle } from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { DutyType, ScheduleType, AttendanceType, FieldAssignment } from '../../types/tracking';
import { TrackingMap } from './TrackingMap';
import { 
  getTodayKolkata, 
  validateDateRange, 
  checkDuplicateFieldAssignment, 
  PAST_DATE_ERROR_MESSAGE, 
  DUPLICATE_REQUEST_ERROR_MESSAGE 
} from '../../utils/requestValidation';
import { handleFormKeyDown, preventSpaceEnterPropagation } from '../../utils/keyboardUtils';
import { DateInput } from '../common/DateInput';

export interface AssignFieldDutyModalProps {
  onClose: () => void;
  initialData?: FieldAssignment;
}

export const AssignFieldDutyModal: React.FC<AssignFieldDutyModalProps> = ({
  onClose,
  initialData
}) => {
  const { employees, fieldAssignments, createFieldAssignment, updateFieldAssignment, currentUser, departments } = useHRMS();

  const todayStr = getTodayKolkata();

  // Form states
  const [selectedEmpId, setSelectedEmpId] = useState<string>(initialData?.employeeId || employees[0]?.employeeId || employees[0]?.id || '');
  const selectedEmp = employees.find(e => e.employeeId === selectedEmpId || e.id === selectedEmpId);

  const [dutyType, setDutyType] = useState<DutyType>(initialData?.dutyType || 'Site Visit');
  const [scheduleType, setScheduleType] = useState<ScheduleType>(initialData?.scheduleType || 'One Day');
  const [startDate, setStartDate] = useState<string>(initialData?.startDate || todayStr);
  const [endDate, setEndDate] = useState<string>(initialData?.endDate || todayStr);
  const [startTime, setStartTime] = useState<string>(initialData?.startTime || '09:00');
  const [endTime, setEndTime] = useState<string>(initialData?.endTime || '18:00');
  const [customerSiteName, setCustomerSiteName] = useState<string>(initialData?.customerSiteName || '');
  const [siteAddress, setSiteAddress] = useState<string>(initialData?.siteAddress || '');
  const [purpose, setPurpose] = useState<string>(initialData?.purpose || '');
  const [trackingRequired, setTrackingRequired] = useState<boolean>(initialData ? initialData.trackingRequired : true);
  const [travelKmRequired, setTravelKmRequired] = useState<boolean>(initialData ? initialData.travelKmRequired : true);
  const [attendanceType, setAttendanceType] = useState<AttendanceType>(initialData?.attendanceType || 'Site Geofence');
  
  // Geofence coordinates & radius
  const [siteLat, setSiteLat] = useState<number>(initialData?.siteLat || 12.9675);
  const [siteLng, setSiteLng] = useState<number>(initialData?.siteLng || 79.9416);
  const [allowedRadiusMeters, setAllowedRadiusMeters] = useState<number>(initialData?.allowedRadiusMeters || 200);
  const [notes, setNotes] = useState<string>(initialData?.notes || '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const getEmployeeDepartmentDisplay = (emp?: typeof employees[number]): string => {
    if (!emp) return '';

    const dept = (emp.department || '').trim();
    if (dept && dept.toLowerCase() !== 'general') return dept;

    const designation = (emp.designation || '').trim().toLowerCase();
    const inferred =
      designation === 'ceo' || designation.includes('chief executive') || designation.includes('owner') ? 'CEO' :
      designation.includes('sales') ? 'Sales' :
      designation.includes('hr') || designation.includes('human resource') ? 'HR' :
      designation.includes('account') || designation.includes('finance') ? 'Accounts' :
      '';

    if (inferred) {
      return departments.find(d => d.name.toLowerCase() === inferred.toLowerCase())?.name || inferred;
    }

    return dept || 'General';
  };

  const handleMapPinSelect = (lat: number, lng: number) => {
    setSiteLat(lat);
    setSiteLng(lng);
  };

  // Quick preset locations for VRM factories & customer sites
  const handlePresetSelect = (preset: 'plant1' | 'plant2' | 'sriperumbudur' | 'gummidipoondi') => {
    if (preset === 'plant1') {
      setCustomerSiteName('VRM Manufacturing Plant 1');
      setSiteAddress('Plot 14, SIDCO Industrial Estate, Ambattur, Chennai 600058');
      setSiteLat(13.0898);
      setSiteLng(80.1612);
      setAllowedRadiusMeters(200);
    } else if (preset === 'plant2') {
      setCustomerSiteName('VRM Manufacturing Plant 2');
      setSiteAddress('Oragadam Industrial Corridor, Sriperumbudur, Tamil Nadu 602105');
      setSiteLat(12.8398);
      setSiteLng(79.9538);
      setAllowedRadiusMeters(250);
    } else if (preset === 'sriperumbudur') {
      setCustomerSiteName('ABC Solar EPC Pvt Ltd - Site');
      setSiteAddress('SIPCOT Industrial Park Phase 2, Sriperumbudur, Tamil Nadu 602105');
      setSiteLat(12.9675);
      setSiteLng(79.9416);
      setAllowedRadiusMeters(200);
    } else if (preset === 'gummidipoondi') {
      setCustomerSiteName('Gummidipoondi Solar Array Project');
      setSiteAddress('GNT Road, Gummidipoondi Industrial Complex, Tamil Nadu 601201');
      setSiteLat(13.4072);
      setSiteLng(80.1284);
      setAllowedRadiusMeters(250);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp) {
      setErrorMessage('Please select an employee.');
      return;
    }
    if (!customerSiteName.trim()) {
      setErrorMessage('Customer / Site Name is required.');
      return;
    }
    if (!purpose.trim()) {
      setErrorMessage('Purpose / Reason is required.');
      return;
    }

    const effectiveEndDate = scheduleType === 'One Day' ? startDate : endDate;
    const rangeVal = validateDateRange(startDate, effectiveEndDate);
    if (!rangeVal.valid) {
      setErrorMessage(rangeVal.error || PAST_DATE_ERROR_MESSAGE);
      return;
    }

    const dupCheck = checkDuplicateFieldAssignment(
      fieldAssignments,
      selectedEmp.employeeId || selectedEmp.id,
      startDate,
      effectiveEndDate,
      initialData?.id
    );
    if (dupCheck.hasDuplicate) {
      setErrorMessage(dupCheck.error || DUPLICATE_REQUEST_ERROR_MESSAGE);
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      if (initialData) {
        updateFieldAssignment(initialData.id, {
          employeeId: selectedEmp.employeeId || selectedEmp.id,
          employeeName: `${selectedEmp.firstName} ${selectedEmp.lastName}`,
          employeeAvatar: selectedEmp.avatar,
          department: selectedEmp.department,
          dutyType,
          scheduleType,
          startDate,
          endDate: scheduleType === 'One Day' ? startDate : endDate,
          startTime,
          endTime,
          customerSiteName: customerSiteName.trim(),
          siteAddress: siteAddress.trim(),
          purpose: purpose.trim(),
          trackingRequired,
          travelKmRequired,
          attendanceType,
          siteLat: attendanceType === 'Site Geofence' ? siteLat : undefined,
          siteLng: attendanceType === 'Site Geofence' ? siteLng : undefined,
          allowedRadiusMeters,
          notes: notes.trim()
        });
      } else {
        createFieldAssignment({
          employeeId: selectedEmp.employeeId || selectedEmp.id,
          employeeName: `${selectedEmp.firstName} ${selectedEmp.lastName}`,
          employeeAvatar: selectedEmp.avatar,
          department: selectedEmp.department,
          dutyType,
          scheduleType,
          startDate,
          endDate: scheduleType === 'One Day' ? startDate : endDate,
          startTime,
          endTime,
          customerSiteName: customerSiteName.trim(),
          siteAddress: siteAddress.trim(),
          purpose: purpose.trim(),
          trackingRequired,
          travelKmRequired,
          attendanceType,
          siteLat: attendanceType === 'Site Geofence' ? siteLat : undefined,
          siteLng: attendanceType === 'Site Geofence' ? siteLng : undefined,
          allowedRadiusMeters,
          notes: notes.trim(),
          status: 'Scheduled',
          createdBy: currentUser.employeeId || currentUser.id
        });
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save field assignment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '820px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#FAFCFE'
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0B1A2D', margin: 0 }}>
              {initialData ? 'Edit Field Duty Assignment' : 'Assign Field Duty'}
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '2px 0 0 0' }}>
              Configure authorized travel window, site geofence, and tracking schedule for field personnel.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '50%',
              width: '34px',
              height: '34px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#64748B'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {errorMessage && (
              <div
                style={{
                  backgroundColor: '#FEE2E2',
                  border: '1px solid #F87171',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#B91C1C',
                  fontSize: '0.85rem',
                  fontWeight: 600
                }}
              >
                <AlertCircle size={16} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Row 1: Employee & Department */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Employee <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <select
                  className="vrm-input-select"
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.88rem',
                    color: '#0F172A',
                    backgroundColor: '#FFFFFF',
                    outline: 'none'
                  }}
                  required
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.employeeId || emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.employeeId || emp.id}) — {emp.department}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Department
                </label>
                <input
                  type="text"
                  value={selectedEmp?.department || ''}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    backgroundColor: '#F8FAFC',
                    fontSize: '0.88rem',
                    color: '#64748B',
                    fontWeight: 600
                  }}
                />
              </div>
            </div>

            {/* Row 2: Duty Type & Schedule Type */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Duty Type <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <select
                  value={dutyType}
                  onChange={(e) => setDutyType(e.target.value as DutyType)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.88rem',
                    color: '#0F172A',
                    backgroundColor: '#FFFFFF',
                    outline: 'none'
                  }}
                >
                  <option value="Site Visit">Site Visit</option>
                  <option value="Customer Visit">Customer Visit</option>
                  <option value="Vendor Visit">Vendor Visit</option>
                  <option value="Travel">Travel</option>
                  <option value="Field Work">Field Work</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Schedule Type <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <select
                  value={scheduleType}
                  onChange={(e) => setScheduleType(e.target.value as ScheduleType)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.88rem',
                    color: '#0F172A',
                    backgroundColor: '#FFFFFF',
                    outline: 'none'
                  }}
                >
                  <option value="One Day">One Day</option>
                  <option value="Date Range">Date Range</option>
                  <option value="Weekly">Weekly (Recurring on Start Day)</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Custom Dates">Custom Dates</option>
                </select>
              </div>
            </div>

            {/* Row 3: Date and Time Schedule */}
            <div style={{ display: 'grid', gridTemplateColumns: scheduleType === 'One Day' ? '1fr 1fr 1fr' : '1fr 1fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  {scheduleType === 'One Day' ? 'Date *' : 'Start Date *'}
                </label>
                <DateInput
                  value={startDate}
                  min={getTodayKolkata()}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.85rem'
                  }}
                  required
                />
              </div>

              {scheduleType !== 'One Day' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    End Date <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <DateInput
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate || getTodayKolkata()}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.85rem'
                    }}
                    required
                  />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Start Time <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.85rem'
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  End Time <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.85rem'
                  }}
                  required
                />
              </div>
            </div>

            {/* Row 4: Customer / Site Name & Site Address */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Customer / Site Name <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. ABC Solar EPC / Sriperumbudur Solar Plant"
                  value={customerSiteName}
                  onChange={(e) => setCustomerSiteName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.88rem'
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Site Address
                </label>
                <input
                  type="text"
                  placeholder="e.g. SIPCOT Industrial Park, Phase 2"
                  value={siteAddress}
                  onChange={(e) => setSiteAddress(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.88rem'
                  }}
                />
              </div>
            </div>

            {/* Row 5: Purpose / Reason */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Purpose / Reason <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <textarea
                placeholder="Detail the work or site inspection objective..."
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                onKeyDown={preventSpaceEnterPropagation}
                rows={2}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.88rem',
                  resize: 'vertical'
                }}
                required
              />
            </div>

            {/* Row 6: Toggles: Tracking Required, Travel KM Required, Attendance Type */}
            <div
              style={{
                backgroundColor: '#F8FAFC',
                padding: '16px',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px'
              }}
            >
              {/* Tracking Required Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>Tracking Required</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Activate GPS during approved hours</div>
                </div>
                <button
                  type="button"
                  onClick={() => setTrackingRequired(!trackingRequired)}
                  style={{
                    width: '46px',
                    height: '24px',
                    borderRadius: '12px',
                    backgroundColor: trackingRequired ? '#0E7490' : '#CBD5E1',
                    position: 'relative',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s'
                  }}
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      backgroundColor: '#FFFFFF',
                      position: 'absolute',
                      top: '3px',
                      left: trackingRequired ? '25px' : '3px',
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }}
                  />
                </button>
              </div>

              {/* Travel KM Required Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>Travel KM Required</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Log distance for reimbursement</div>
                </div>
                <button
                  type="button"
                  onClick={() => setTravelKmRequired(!travelKmRequired)}
                  style={{
                    width: '46px',
                    height: '24px',
                    borderRadius: '12px',
                    backgroundColor: travelKmRequired ? '#0E7490' : '#CBD5E1',
                    position: 'relative',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s'
                  }}
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      backgroundColor: '#FFFFFF',
                      position: 'absolute',
                      top: '3px',
                      left: travelKmRequired ? '25px' : '3px',
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }}
                  />
                </button>
              </div>

              {/* Attendance Type Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                  Attendance Type <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <select
                  value={attendanceType}
                  onChange={(e) => setAttendanceType(e.target.value as AttendanceType)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.82rem',
                    backgroundColor: '#FFFFFF'
                  }}
                >
                  <option value="Site Geofence">Site Geofence (Restricted Radius)</option>
                  <option value="Flexible Field Check-in">Flexible Field Check-in</option>
                </select>
              </div>
            </div>

            {/* Geofence Configuration & Map Pin Picker (Shown when Site Geofence is selected) */}
            {attendanceType === 'Site Geofence' && (
              <div
                style={{
                  border: '1px solid #A5F3FC',
                  borderRadius: '14px',
                  backgroundColor: '#ECFEFF',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0E7490', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <MapPin size={16} /> Site Geofence Boundary Pin
                    </h4>
                    <p style={{ fontSize: '0.74rem', color: '#155E75', margin: '2px 0 0 0' }}>
                      Click on the map below or pick a preset to pin the exact site location coordinates.
                    </p>
                  </div>

                  {/* Preset quick buttons */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handlePresetSelect('sriperumbudur')}
                      style={{ padding: '3px 8px', fontSize: '0.72rem', borderRadius: '6px', border: '1px solid #0E7490', background: '#FFFFFF', color: '#0E7490', cursor: 'pointer', fontWeight: 700 }}
                    >
                      Sriperumbudur Site
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePresetSelect('gummidipoondi')}
                      style={{ padding: '3px 8px', fontSize: '0.72rem', borderRadius: '6px', border: '1px solid #0E7490', background: '#FFFFFF', color: '#0E7490', cursor: 'pointer', fontWeight: 700 }}
                    >
                      Gummidipoondi
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePresetSelect('plant2')}
                      style={{ padding: '3px 8px', fontSize: '0.72rem', borderRadius: '6px', border: '1px solid #0E7490', background: '#FFFFFF', color: '#0E7490', cursor: 'pointer', fontWeight: 700 }}
                    >
                      VRM Plant 2
                    </button>
                  </div>
                </div>

                {/* Map Pin Picker */}
                <TrackingMap
                  center={[siteLat, siteLng]}
                  zoom={14}
                  height="220px"
                  clickable={true}
                  onMapClick={handleMapPinSelect}
                  markers={[
                    {
                      id: 'selected-site-pin',
                      lat: siteLat,
                      lng: siteLng,
                      title: customerSiteName || 'Site Center',
                      iconType: 'site'
                    }
                  ]}
                  circle={{
                    lat: siteLat,
                    lng: siteLng,
                    radiusMeters: allowedRadiusMeters,
                    color: '#0E7490',
                    fillColor: '#CFFAFE'
                  }}
                />

                {/* Coordinates & Radius Controls */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#155E75', marginBottom: '4px' }}>
                      Site Latitude
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      value={siteLat}
                      onChange={(e) => setSiteLat(parseFloat(e.target.value) || 0)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.82rem', backgroundColor: '#FFFFFF' }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#155E75', marginBottom: '4px' }}>
                      Site Longitude
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      value={siteLng}
                      onChange={(e) => setSiteLng(parseFloat(e.target.value) || 0)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.82rem', backgroundColor: '#FFFFFF' }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#155E75', marginBottom: '4px' }}>
                      Allowed Radius (Meters)
                    </label>
                    <input
                      type="number"
                      min="50"
                      max="5000"
                      step="50"
                      value={allowedRadiusMeters}
                      onChange={(e) => setAllowedRadiusMeters(parseInt(e.target.value, 10) || 200)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.82rem', backgroundColor: '#FFFFFF' }}
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Internal Notes / Instructions
              </label>
              <input
                type="text"
                placeholder="Optional instructions for field personnel..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onKeyDown={preventSpaceEnterPropagation}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.88rem'
                }}
              />
            </div>
          </div>

          {/* Modal Footer */}
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '12px',
              backgroundColor: '#FAFCFE'
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 18px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#475569',
                fontWeight: 600,
                fontSize: '0.88rem',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '9px 22px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: '#0E7490',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 6px rgba(14, 116, 144, 0.3)'
              }}
            >
              <Check size={16} />
              <span>{isSubmitting ? 'Saving...' : (initialData ? 'Update Assignment' : 'Create Assignment')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
