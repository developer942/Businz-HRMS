import React, { useState } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { DateInput } from '../common/DateInput';
import { 
  Calendar, 
  Plus, 
  Edit2, 
  Trash2, 
  CheckCircle2, 
  Save, 
  X, 
  MapPin, 
  Sliders, 
  CalendarDays,
  Gift
} from 'lucide-react';
import { HolidayItem, WeeklyScheduleItem } from '../../types/hrms';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

export const HolidayCalendarSettings: React.FC = () => {
  const { 
    holidayPolicies, 
    addHolidayPolicy, 
    updateHolidayPolicy, 
    deleteHolidayPolicy,
    weeklySchedules, 
    addWeeklySchedule, 
    updateWeeklySchedule, 
    deleteWeeklySchedule,
    branches,
    companyBranches,
    orgStructure 
  } = useHRMS();

  const [activeTab, setActiveTab] = useState<'holidays' | 'weekly_offs' | 'location_holidays'>('holidays');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string>('All Sites');

  // Holiday Modal
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [editingHolidayId, setEditingHolidayId] = useState<string | null>(null);
  const [holidayForm, setHolidayForm] = useState<Omit<HolidayItem, 'id'>>({
    name: '',
    date: new Date().toISOString().split('T')[0],
    daysCount: 1,
    type: 'Mandatory',
    applicableLocation: 'All Sites & Corporate'
  });

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const openAddHoliday = () => {
    setEditingHolidayId(null);
    setHolidayForm({
      name: '',
      date: new Date().toISOString().split('T')[0],
      daysCount: 1,
      type: 'Mandatory',
      applicableLocation: 'All Sites & Corporate'
    });
    setIsHolidayModalOpen(true);
  };

  const handleSaveHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayForm.name.trim()) return;
    if (editingHolidayId) {
      updateHolidayPolicy(editingHolidayId, holidayForm);
      triggerToast(`Holiday "${holidayForm.name}" updated successfully`);
    } else {
      addHolidayPolicy(holidayForm);
      triggerToast(`Holiday "${holidayForm.name}" added to calendar`);
    }
    setIsHolidayModalOpen(false);
  };

  const handleDeleteHoliday = (id: string, name: string) => {
    deleteHolidayPolicy(id);
    triggerToast(`Holiday "${name}" removed`);
  };

  // User-configured branches from Settings > Company Details
  const configuredBranches = [
    ...(branches || []),
    ...((companyBranches || []).map(cb => ({
      id: cb.id,
      name: cb.branchName?.trim() || cb.branchCode?.trim() || 'Branch',
      location: cb.address?.city ? `${cb.address.city}, ${cb.address.state || ''}`.trim() : (cb.branchCode || 'Main Office')
    }))),
    ...((orgStructure?.workLocations || []).map((loc, idx) => ({
      id: `wl-${idx}`,
      name: loc.trim(),
      location: 'Site / Yard'
    })))
  ].filter((b, idx, arr) => arr.findIndex(x => x.name.toLowerCase() === b.name.toLowerCase()) === idx);

  const filteredHolidays = holidayPolicies.filter(h => {
    if (selectedLocation === 'All Sites') return true;
    return (h.applicableLocation || '').includes(selectedLocation) || (h.applicableLocation || '').includes('All Sites');
  });

  return (
    <div style={{ padding: '0 4px' }}>
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 9999,
          backgroundColor: '#0E7490',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: '12px',
          boxShadow: '0 8px 24px rgba(14, 116, 144, 0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontWeight: 600,
          fontSize: '0.9rem'
        }}>
          <CheckCircle2 size={18} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Sub-tabs Navigation */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        overflowX: 'auto',
        paddingBottom: '12px',
        marginBottom: '20px',
        borderBottom: '1px solid #E7ECF3'
      }}>
        {[
          { id: 'holidays', label: `Holiday Calendar (${holidayPolicies.length})`, icon: Gift },
          { id: 'weekly_offs', label: `Weekly Off Rosters (${weeklySchedules.length})`, icon: CalendarDays },
          { id: 'location_holidays', label: 'Branch-Wise Holidays', icon: MapPin }
        ].map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '9999px',
                border: isActive ? '1px solid #0E7490' : '1px solid #E2E8F0',
                backgroundColor: isActive ? '#ECFEFF' : '#ffffff',
                color: isActive ? '#0E7490' : '#64748B',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.85rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              <Icon size={15} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB: HOLIDAY CALENDAR */}
      {activeTab === 'holidays' && (
        <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #E7ECF3', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1E293B', margin: 0 }}>Corporate & Site Holiday List (FY 2026 - 2027)</h2>
              <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '4px 0 0' }}>Official declared holidays for site workers and administrative headquarters</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <select
                value={selectedLocation}
                onChange={e => setSelectedLocation(e.target.value)}
                style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '0.85rem', fontWeight: 600, color: '#1E293B' }}
              >
                <option value="All Sites">All Sites & HQ</option>
                {branches.map(b => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={openAddHoliday}
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
                <span>Add Holiday</span>
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                  <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Holiday Name</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Date</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Days</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Type</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Applicable Facility</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHolidays.map(hol => (
                  <tr key={hol.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 700, color: '#1E293B', fontSize: '0.88rem' }}>{hol.name}</td>
                    <td style={{ padding: '14px 16px', fontSize: '0.85rem', color: '#1E293B', fontWeight: 600 }}>{formatDateDDMMYYYY(hol.date)}</td>
                    <td style={{ padding: '14px 16px', fontSize: '0.85rem', color: '#64748B' }}>{hol.daysCount} Day</td>
                    <td style={{ padding: '14px 16px', fontSize: '0.85rem' }}>
                      <span style={{ 
                        backgroundColor: hol.type === 'Mandatory' || hol.type === 'Compulsory' ? '#FEE2E2' : '#ECFEFF', 
                        color: hol.type === 'Mandatory' || hol.type === 'Compulsory' ? '#DC2626' : '#0E7490', 
                        padding: '4px 8px', 
                        borderRadius: '4px', 
                        fontWeight: 700, 
                        fontSize: '0.75rem' 
                      }}>
                        {hol.type}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '0.85rem', color: '#64748B' }}>{hol.applicableLocation || 'All Sites & Corporate'}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => {
                            setEditingHolidayId(hol.id);
                            setHolidayForm({
                              name: hol.name,
                              date: hol.date,
                              daysCount: hol.daysCount,
                              type: hol.type,
                              applicableLocation: hol.applicableLocation || 'All Sites & Corporate'
                            });
                            setIsHolidayModalOpen(true);
                          }}
                          style={{ background: 'none', border: 'none', color: '#0E7490', cursor: 'pointer', padding: '4px' }}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteHoliday(hol.id, hol.name)}
                          style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '4px' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: WEEKLY OFF ROSTERS */}
      {activeTab === 'weekly_offs' && (
        <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #E7ECF3', padding: '24px' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1E293B', margin: '0 0 6px' }}>Weekly Off Schedules & Work Weeks</h2>
          <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '0 0 20px' }}>Standard working day rhythms assigned across factory crews, engineers and office staff</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            {weeklySchedules.map(ws => (
              <div key={ws.id} style={{ border: '1px solid #E2E8F0', borderRadius: '14px', padding: '18px', backgroundColor: '#F8FAFC' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ backgroundColor: ws.isDefault ? '#DCFCE7' : '#F1F5F9', color: ws.isDefault ? '#166534' : '#64748B', padding: '3px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                    {ws.isDefault ? 'SYSTEM DEFAULT' : 'CUSTOM ROSTER'}
                  </span>
                </div>
                <h4 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 800, color: '#1E293B' }}>{ws.name}</h4>
                <div style={{ fontSize: '0.82rem', color: '#475569', marginBottom: '6px' }}>Working Days: <b>{ws.workingDays}</b></div>
                <div style={{ fontSize: '0.82rem', color: '#0E7490', fontWeight: 700 }}>Off Days: {ws.offDays}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: BRANCH-WISE HOLIDAYS */}
      {activeTab === 'location_holidays' && (
        <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #E7ECF3', padding: '24px' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1E293B', margin: '0 0 6px' }}>State & Regional Holiday Lists</h2>
          <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '0 0 20px' }}>Specific state festival holidays (Tamil Nadu vs Andhra Pradesh vs West Bengal)</p>

          {configuredBranches.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#64748B', backgroundColor: '#F8FAFC', borderRadius: '12px' }}>
              No branches configured yet. Configure your company branches under <strong>Settings &gt; Company Details &gt; Address &amp; Branches</strong>.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
              {configuredBranches.map(b => {
                const count = holidayPolicies.filter(h => (h.applicableLocation || '').includes(b.name) || (h.applicableLocation || '').includes('All Sites')).length;
                return (
                  <div key={b.id} style={{ border: '1px solid #E2E8F0', borderRadius: '14px', padding: '18px', backgroundColor: '#F8FAFC' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <MapPin size={18} color="#0E7490" />
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#1E293B' }}>{b.name}</h4>
                    </div>
                    <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: '#64748B' }}>{b.location}</p>
                    <div style={{ padding: '8px 12px', backgroundColor: '#ECFEFF', borderRadius: '8px', color: '#0E7490', fontWeight: 700, fontSize: '0.82rem' }}>
                      {count} Total Holidays in Calendar Year
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* HOLIDAY MODAL */}
      {isHolidayModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', width: '100%', maxWidth: '480px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#1E293B' }}>
                {editingHolidayId ? 'Edit Holiday' : 'Add Holiday to Calendar'}
              </h3>
              <button onClick={() => setIsHolidayModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveHoliday} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Holiday Name <span style={{ color: '#EF4444' }}>*</span></label>
                <input
                  type="text"
                  required
                  value={holidayForm.name}
                  onChange={e => setHolidayForm({ ...holidayForm, name: e.target.value })}
                  placeholder="e.g. Tamil New Year / Chithirai Thirunal"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Date <span style={{ color: '#EF4444' }}>*</span></label>
                  <DateInput
                    required
                    value={holidayForm.date}
                    onChange={e => setHolidayForm({ ...holidayForm, date: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Type</label>
                  <select
                    value={holidayForm.type}
                    onChange={e => setHolidayForm({ ...holidayForm, type: e.target.value as any })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem' }}
                  >
                    <option value="Mandatory">Mandatory National</option>
                    <option value="Compulsory">Compulsory State</option>
                    <option value="Festival">Festival Celebration</option>
                    <option value="Optional">Optional / Restricted</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Applicable Facility</label>
                <select
                  value={holidayForm.applicableLocation}
                  onChange={e => setHolidayForm({ ...holidayForm, applicableLocation: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem' }}
                >
                  <option value="All Sites & Corporate">All Sites & Corporate HQ</option>
                  {configuredBranches.map(b => (
                    <option key={b.id} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button type="button" onClick={() => setIsHolidayModalOpen(false)} style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #CBD5E1', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#0E7490', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Save Holiday</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default HolidayCalendarSettings;
