import React, { useState } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { Role } from '../../types/hrms';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { 
  User, 
  Bell, 
  Power,
  Camera, 
  Mail, 
  Phone, 
  MapPin, 
  Building2, 
  Briefcase, 
  Calendar, 
  CheckCircle2, 
  Save, 
  Smartphone, 
  CreditCard, 
  FileText, 
  AlertTriangle,
  RefreshCw,
  LogOut,
  Lock,
  Eye,
  EyeOff,
  Copy,
  Check,
  KeyRound
} from 'lucide-react';

export type ProfileTab = 
  | 'profile' 
  | 'notifications' 
  | 'logout';

const DEFAULT_NOTIFICATION_PREFERENCES = {
  emailLeaveAlerts: true,
  emailPayrollSlips: true,
  emailTaskAssignments: true,
  emailAnnouncements: true,
  pushDailyPunchReminder: true,
  pushShiftChanges: true,
  smsEmergencyAlerts: true,
  smsOtpVerification: true
};

type NotificationPreferences = typeof DEFAULT_NOTIFICATION_PREFERENCES;

interface UserProfileProps {
  onLogout?: () => void;
  isEmbedded?: boolean;
}

export const UserProfile: React.FC<UserProfileProps> = ({ onLogout, isEmbedded = false }) => {
  const { 
    currentUser, 
    updateCurrentUser, 
    switchRole, 
    businessSettings,
    employees,
    designations,
    changeEmployeePassword,
    updateEmployee
  } = useHRMS();

  const [activeTab, setActiveTab] = useState<ProfileTab>('profile');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showPortalPassword, setShowPortalPassword] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const matchingEmp = employees.find(
    e => e.id === currentUser.id || 
         e.employeeId === currentUser.employeeId || 
         (e.email && currentUser.email && e.email.toLowerCase() === currentUser.email.toLowerCase())
  );
  const userPassword = matchingEmp?.password || (currentUser as any).password || 'Password@123';

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(userPassword);
    setCopiedPass(true);
    setTimeout(() => setCopiedPass(false), 2000);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const sanitizePhone = (value: string) => {
    if (!value) return '';
    const clean = value.toString().replace(/^\+91\s*/, '').replace(/^91(?=\d{10})/, '');
    return clean.replace(/\D/g, '').slice(0, 10);
  };

  const sanitizeName = (value: string) => {
    if (!value) return '';
    return value.replace(/[^A-Za-z\s.'-]/g, '').replace(/\s{2,}/g, ' ');
  };

  const assignedRole = (matchingEmp as any)?.role || currentUser.role || 'Employee';
  const assignedDesignation = matchingEmp?.designation || currentUser.designation || (assignedRole === 'CEO' ? 'CEO' : 'Employee');
  const assignedDepartment = matchingEmp?.department || currentUser.department || 'General';
  const assignedEmployeeId = matchingEmp?.employeeId || currentUser.employeeId || 'EMP-000';
  const assignedLocation = (matchingEmp as any)?.branch || (matchingEmp as any)?.workLocation || (currentUser as any).location || 'Headquarters';
  const assignedJoiningDate = matchingEmp?.joiningDate || (currentUser as any).joiningDate || '01 Jan 2020';
  const notificationStorageKey = `vrm_hrms_notification_preferences_${assignedEmployeeId || currentUser.id || currentUser.email || 'default'}`;

  // Profile Form State (Only editable personal contact details)
  const [profileForm, setProfileForm] = useState({
    name: sanitizeName(currentUser.name || (matchingEmp ? `${matchingEmp.firstName} ${matchingEmp.lastName}`.trim() : 'User')).slice(0, 80),
    email: currentUser.email || matchingEmp?.email || '',
    phone: sanitizePhone((matchingEmp?.phone || (currentUser as any).phone || '').toString()),
    bio: (matchingEmp as any)?.bio || 'Overseeing corporate operations, business strategy, and enterprise digital workforce management across company facilities.'
  });

  // Sync profile form if current user or matching employee updates and user has not typed
  React.useEffect(() => {
    if (!isDirty) {
      setProfileForm({
        name: sanitizeName(currentUser.name || (matchingEmp ? `${matchingEmp.firstName} ${matchingEmp.lastName}`.trim() : 'User')).slice(0, 80),
        email: currentUser.email || matchingEmp?.email || '',
        phone: sanitizePhone((matchingEmp?.phone || (currentUser as any).phone || '').toString()),
        bio: (matchingEmp as any)?.bio || 'Overseeing corporate operations, business strategy, and enterprise digital workforce management across company facilities.'
      });
    }
  }, [currentUser.name, currentUser.email, matchingEmp?.phone, isDirty]);

  const handleProfileSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = sanitizeName(profileForm.name).trim();
    if (!cleanName) {
      showToast('Full name is mandatory.');
      return;
    }
    if (/\d/.test(profileForm.name)) {
      showToast('Full name cannot contain numeric digits.');
      return;
    }
    if (!profileForm.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileForm.email.trim())) {
      showToast('Please enter a valid corporate email address.');
      return;
    }
    if (profileForm.phone && profileForm.phone.length !== 10) {
      showToast('Phone number must be exactly 10 digits.');
      return;
    }
    if (profileForm.phone && !/^\d{10}$/.test(profileForm.phone)) {
      showToast('Phone number must contain only numeric digits (0-9).');
      return;
    }

    // Role, designation, and department are fixed corporate assignments configured by HR/CEO upon onboarding
    updateCurrentUser({
      name: cleanName,
      email: profileForm.email.trim().toLowerCase(),
      phone: profileForm.phone,
      department: assignedDepartment,
      designation: assignedDesignation,
      employeeId: assignedEmployeeId
    } as any);

    if (matchingEmp?.id && updateEmployee) {
      updateEmployee(matchingEmp.id, {
        firstName: cleanName.split(' ')[0] || cleanName,
        lastName: cleanName.split(' ').slice(1).join(' ') || '',
        phone: profileForm.phone,
        department: assignedDepartment,
        designation: assignedDesignation
      });
    }

    setIsDirty(false);
    showToast('Profile information updated successfully!');
  };

  // Notification Preferences State
  const readNotificationPreferences = (storageKey: string): NotificationPreferences => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return DEFAULT_NOTIFICATION_PREFERENCES;
      return {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        ...JSON.parse(saved)
      };
    } catch {
      return DEFAULT_NOTIFICATION_PREFERENCES;
    }
  };

  const [notifPreferences, setNotifPreferences] = useState<NotificationPreferences>(() => readNotificationPreferences(notificationStorageKey));

  React.useEffect(() => {
    setNotifPreferences(readNotificationPreferences(notificationStorageKey));
  }, [notificationStorageKey]);

  const updateNotificationPreference = (key: keyof NotificationPreferences, value: boolean) => {
    setNotifPreferences(prev => {
      const updated = { ...prev, [key]: value };
      localStorage.setItem(notificationStorageKey, JSON.stringify(updated));
      return updated;
    });
    showToast('Notification preference updated.');
  };

  // Navigation Items
  const menuItems: { id: ProfileTab; label: string; icon: React.ElementType }[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notification Settings', icon: Bell },
    { id: 'logout', label: 'Log Out', icon: Power }
  ];

  return (
    <div style={{ 
      width: '100%', 
      maxWidth: isEmbedded ? '100%' : '1200px', 
      margin: isEmbedded ? '0' : '0 auto', 
      padding: isEmbedded ? '0' : '12px 16px 60px', 
      fontFamily: 'var(--font-primary)' 
    }}>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          color: '#1e40af',
          padding: '12px 20px',
          borderRadius: '12px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.12)',
          fontWeight: 700,
          zIndex: 1300,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={18} color="#0E7490" /> {toastMessage}
        </div>
      )}

      {/* Page Title & Breadcrumb - shown when standalone */}
      {!isEmbedded && (
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
            Account & Profile
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#64748b', margin: 0 }}>
            Manage your personal credentials, enterprise security, notifications, and platform access
          </p>
        </div>
      )}

      {/* Sub-tabs for Embedded Mode in Settings */}
      {isEmbedded && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '14px',
          marginBottom: '20px',
          borderBottom: '1px solid #E2E8F0'
        }}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const isLogout = item.id === 'logout';

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (isLogout && onLogout) {
                    setActiveTab('logout');
                  } else {
                    setActiveTab(item.id);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '10px',
                  border: isActive ? '1px solid #0E7490' : '1px solid #CBD5E1',
                  backgroundColor: isActive ? '#0E7490' : isLogout ? '#FEF2F2' : '#FFFFFF',
                  color: isActive ? '#FFFFFF' : isLogout ? '#DC2626' : '#334155',
                  fontWeight: isActive ? 750 : 600,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                  boxShadow: isActive ? '0 2px 6px rgba(14, 116, 144, 0.2)' : 'none'
                }}
              >
                <Icon size={16} color={isActive ? '#FFFFFF' : isLogout ? '#DC2626' : '#0E7490'} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Container */}
      <div style={isEmbedded ? { display: 'block' } : {
        display: 'grid',
        gridTemplateColumns: '250px 1fr',
        gap: '24px',
        alignItems: 'start'
      }}>

        {/* Vertical Navigation Menu - shown only when standalone */}
        {!isEmbedded && (
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            padding: '12px 8px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}>
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              const isLogout = item.id === 'logout';

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (isLogout && onLogout) {
                      setActiveTab('logout');
                    } else {
                      setActiveTab(item.id);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    width: '100%',
                    padding: '11px 16px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: isActive ? '#ECFEFF' : 'transparent',
                    color: isActive ? '#0E7490' : isLogout ? '#dc2626' : '#334155',
                    fontWeight: isActive ? 700 : 500,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = isLogout ? '#fef2f2' : '#f8fafc';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <Icon size={18} color={isActive ? '#0E7490' : isLogout ? '#dc2626' : '#475569'} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ACTIVE PANEL CONTENT */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '28px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
          minHeight: '480px'
        }}>

          {/* ---------------- 1. TAB: PROFILE ---------------- */}
          {activeTab === 'profile' && (
            <div>
              <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '16px', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Personal Profile
                </h2>
                <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '4px 0 0 0' }}>
                  Manage your personal contact details, designation, and enterprise work profile
                </p>
              </div>

              {/* Profile Header Card */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
                padding: '18px 20px',
                backgroundColor: '#f8fafc',
                borderRadius: '14px',
                border: '1px solid #e2e8f0',
                marginBottom: '24px'
              }}>
                <div style={{ position: 'relative' }}>
                  <div style={{
                    width: '74px',
                    height: '74px',
                    borderRadius: '50%',
                    backgroundColor: '#0E7490',
                    color: '#ffffff',
                    fontSize: '1.6rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(14, 116, 144, 0.2)'
                  }}>
                    {currentUser.name ? currentUser.name.split(' ').map(p => p[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() : 'VM'}
                  </div>
                  <button
                    type="button"
                    title="Change Avatar"
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      backgroundColor: '#ffffff',
                      border: '1px solid #cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                    }}
                    onClick={() => showToast('Avatar upload dialog opened.')}
                  >
                    <Camera size={14} color="#0E7490" />
                  </button>
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                      {profileForm.name || currentUser.name}
                    </h3>
                    <span style={{
                      backgroundColor: '#ECFEFF',
                      color: '#0E7490',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '999px'
                    }}>
                      {assignedRole}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.84rem', color: '#64748b', marginTop: '4px' }}>
                    {assignedDesignation} • {assignedDepartment}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>
                    Employee Code: <strong>{assignedEmployeeId}</strong> • Member since {formatDateDDMMYYYY(assignedJoiningDate)}
                  </div>
                </div>
              </div>

              {/* Profile Details Form */}
              <form onSubmit={handleProfileSave}>
                {/* Row 1: Full Name * | Official Corporate Email * */}
                <div className="user-profile-grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={labelStyle}>Full Name <span style={{ color: '#EF4444' }}>*</span></label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      placeholder="e.g. John Doe"
                      value={profileForm.name}
                      onKeyDown={(e) => {
                        if (/[0-9]/.test(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      onChange={(e) => {
                        setIsDirty(true);
                        setProfileForm({ ...profileForm, name: sanitizeName(e.target.value).slice(0, 80) });
                      }}
                      style={inputStyle}
                    />
                    <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '3px', display: 'block' }}>
                      Alphabetic characters only (letters and spaces)
                    </span>
                  </div>
                  <div>
                    <label style={labelStyle}>Official Corporate Email <span style={{ color: '#EF4444' }}>*</span></label>
                    <input
                      type="email"
                      required
                      maxLength={120}
                      placeholder="name@company.com"
                      value={profileForm.email}
                      onChange={(e) => {
                        setIsDirty(true);
                        setProfileForm({ ...profileForm, email: e.target.value.slice(0, 120) });
                      }}
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Row 2: Phone Number | System Role (Fixed by HR/CEO) */}
                <div className="user-profile-grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={labelStyle}>Phone Number</label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      maxLength={10}
                      pattern="[0-9]{10}"
                      title="Phone number must be exactly 10 digits."
                      placeholder="Enter 10-digit phone number"
                      value={profileForm.phone}
                      onKeyDown={(e) => {
                        if (
                          !/^[0-9]$/.test(e.key) &&
                          !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key) &&
                          !e.ctrlKey &&
                          !e.metaKey
                        ) {
                          e.preventDefault();
                        }
                      }}
                      onPaste={(e) => {
                        e.preventDefault();
                        const pasteText = e.clipboardData.getData('text');
                        const sanitized = sanitizePhone(pasteText);
                        setIsDirty(true);
                        setProfileForm(prev => ({ ...prev, phone: sanitized }));
                      }}
                      onChange={(e) => {
                        setIsDirty(true);
                        setProfileForm({ ...profileForm, phone: sanitizePhone(e.target.value) });
                      }}
                      style={inputStyle}
                    />
                    <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '3px', display: 'block' }}>
                      10-digit numeric numbers only (0-9)
                    </span>
                  </div>

                  <div>
                    <label style={labelStyle}>System Role</label>
                    <input
                      type="text"
                      value={assignedRole}
                      disabled
                      readOnly
                      style={fixedInputStyle}
                    />
                  </div>
                </div>

                {/* Row 3: Designation / Job Title | Department */}
                <div className="user-profile-grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={labelStyle}>Designation / Job Title</label>
                    <input
                      type="text"
                      value={assignedDesignation}
                      disabled
                      readOnly
                      style={fixedInputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Department</label>
                    <input
                      type="text"
                      value={assignedDepartment}
                      disabled
                      readOnly
                      style={fixedInputStyle}
                    />
                  </div>
                </div>

                {/* Row 4: Primary Work Location | Employee Code / ID */}
                <div className="user-profile-grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={labelStyle}>Primary Work Location</label>
                    <input
                      type="text"
                      value={assignedLocation}
                      disabled
                      readOnly
                      style={fixedInputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Employee Code / ID</label>
                    <input
                      type="text"
                      value={assignedEmployeeId}
                      disabled
                      readOnly
                      style={fixedInputStyle}
                    />
                  </div>
                </div>

                {/* Row 5: Professional Bio / About */}
                <div style={{ marginBottom: '24px' }}>
                  <label style={labelStyle}>Professional Bio / About</label>
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={profileForm.bio}
                    onChange={(e) => {
                      setIsDirty(true);
                      setProfileForm({ ...profileForm, bio: e.target.value.slice(0, 500) });
                    }}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>

                {/* Portal Login Credentials & Password Section */}
                <div style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  padding: '18px 20px',
                  marginBottom: '24px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <KeyRound size={18} color="#0E7490" />
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0F172A' }}>
                          Portal Login Credentials
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                          Your official login credentials for Businz Enterprise HRMS
                        </div>
                      </div>
                    </div>
                    <span style={{
                      backgroundColor: '#DCFCE7',
                      color: '#15803D',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '6px',
                      border: '1px solid #BBF7D0'
                    }}>
                      Account Active
                    </span>
                  </div>

                  <div className="user-profile-grid-2col portal-credentials-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label style={labelStyle}>Portal Login User ID / Code</label>
                      <div style={{
                        ...inputStyle,
                        backgroundColor: '#FFFFFF',
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        fontWeight: 700,
                        color: '#0E7490',
                        display: 'flex',
                        alignItems: 'center'
                      }}>
                        {assignedEmployeeId || currentUser.employeeId || 'EMP-000'}
                      </div>
                    </div>

                    <div>
                      <label style={labelStyle}>Portal Login Password</label>
                      <div style={{
                        ...inputStyle,
                        backgroundColor: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px'
                      }}>
                        <span style={{
                          fontFamily: showPortalPassword ? "'JetBrains Mono', 'Fira Code', monospace" : 'inherit',
                          fontWeight: 700,
                          fontSize: '0.86rem',
                          color: '#0F172A',
                          letterSpacing: showPortalPassword ? '0.04em' : '0.15em'
                        }}>
                          {showPortalPassword ? userPassword : '••••••••••••'}
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => setShowPortalPassword(!showPortalPassword)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 7px',
                              borderRadius: '6px',
                              border: '1px solid #E2E8F0',
                              backgroundColor: '#F8FAFC',
                              color: '#475569',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                            title={showPortalPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPortalPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                            <span>{showPortalPassword ? 'Hide' : 'Show'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleCopyPassword}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 7px',
                              borderRadius: '6px',
                              border: '1px solid #A5F3FC',
                              backgroundColor: copiedPass ? '#DCFCE7' : '#ECFEFF',
                              color: copiedPass ? '#15803D' : '#0E7490',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                            title="Copy Password"
                          >
                            {copiedPass ? <Check size={13} /> : <Copy size={13} />}
                            <span>{copiedPass ? 'Copied!' : 'Copy'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="submit"
                    style={primaryBtnStyle}
                  >
                    <Save size={16} /> Save Profile Changes
                  </button>
                </div>
              </form>
            </div>
          )}





          {/* ---------------- 4. TAB: NOTIFICATION SETTINGS ---------------- */}
          {activeTab === 'notifications' && (
            <div>
              <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '16px', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Notification Preferences
                </h2>
                <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '4px 0 0 0' }}>
                  Choose which alerts and digests you receive via Email, Mobile SMS, and Browser Push
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0E7490', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Email Notifications
                </div>

                <div style={toggleRowStyle}>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e293b' }}>Leave & Regularization Approvals</div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Receive instant email when your subordinates submit leaves or attendance corrections</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifPreferences.emailLeaveAlerts}
                    onChange={(e) => updateNotificationPreference('emailLeaveAlerts', e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: '#0E7490', cursor: 'pointer' }}
                  />
                </div>

                <div style={toggleRowStyle}>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e293b' }}>Monthly Payslip & Tax Form 16</div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Get notified as soon as monthly payroll disbursement is published</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifPreferences.emailPayrollSlips}
                    onChange={(e) => updateNotificationPreference('emailPayrollSlips', e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: '#0E7490', cursor: 'pointer' }}
                  />
                </div>

                <div style={toggleRowStyle}>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e293b' }}>Task Assignments & Due Dates</div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Alerts for critical engineering tasks and milestone dead-lines</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifPreferences.emailTaskAssignments}
                    onChange={(e) => updateNotificationPreference('emailTaskAssignments', e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: '#0E7490', cursor: 'pointer' }}
                  />
                </div>

                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0E7490', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '12px' }}>
                  Mobile & Push Alerts
                </div>

                <div style={toggleRowStyle}>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e293b' }}>Daily Clock-In / Punch Reminder</div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Browser notification 10 minutes prior to scheduled shift start</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifPreferences.pushDailyPunchReminder}
                    onChange={(e) => updateNotificationPreference('pushDailyPunchReminder', e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: '#0E7490', cursor: 'pointer' }}
                  />
                </div>

                <div style={toggleRowStyle}>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e293b' }}>Critical Site Safety & Emergency SMS</div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Direct SMS broadcasts during severe weather or site safety protocols</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifPreferences.smsEmergencyAlerts}
                    onChange={(e) => updateNotificationPreference('smsEmergencyAlerts', e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: '#0E7490', cursor: 'pointer' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ---------------- 5. TAB: LOG OUT ---------------- */}
          {activeTab === 'logout' && (
            <div>
              <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '16px', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#dc2626', margin: 0 }}>
                  Log Out of Session
                </h2>
                <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '4px 0 0 0' }}>
                  Safely end your current session and sign out of the Businz Portal
                </p>
              </div>

              <div style={{
                maxWidth: '520px',
                padding: '24px',
                backgroundColor: '#fef2f2',
                borderRadius: '16px',
                border: '1.5px solid #fecaca',
                textAlign: 'center'
              }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: '#fee2e2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px auto'
                }}>
                  <Power size={28} />
                </div>

                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#991b1b', margin: '0 0 8px 0' }}>
                  Are you sure you want to sign out?
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#7f1d1d', margin: '0 0 20px 0', lineHeight: 1.5 }}>
                  You will be logged out of <strong>{currentUser.name}</strong> ({currentUser.role}). Any unsaved form drafts will be discarded.
                </p>

                <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setActiveTab('profile')}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '10px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      color: '#475569',
                      fontWeight: 700,
                      fontSize: '0.88rem',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel / Return
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (onLogout) {
                        onLogout();
                      } else {
                        window.location.reload();
                      }
                    }}
                    style={{
                      padding: '10px 24px',
                      borderRadius: '10px',
                      border: 'none',
                      backgroundColor: '#dc2626',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)'
                    }}
                  >
                    <LogOut size={16} /> Sign Out Now
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

// Styling Constants
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.82rem',
  fontWeight: 700,
  color: '#334155',
  marginBottom: '6px'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: '10px',
  border: '1.5px solid #cbd5e1',
  fontSize: '0.9rem',
  outline: 'none',
  boxSizing: 'border-box',
  backgroundColor: '#ffffff'
};

const fixedInputStyle: React.CSSProperties = {
  ...inputStyle,
  backgroundColor: '#F8FAFC',
  color: '#475569',
  border: '1.5px solid #E2E8F0',
  cursor: 'not-allowed',
  fontWeight: 600,
  userSelect: 'none'
};

const primaryBtnStyle: React.CSSProperties = {
  backgroundColor: '#0E7490',
  color: '#ffffff',
  padding: '10px 20px',
  borderRadius: '10px',
  border: 'none',
  fontSize: '0.88rem',
  fontWeight: 700,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  boxShadow: '0 2px 8px rgba(14, 116, 144, 0.25)'
};

const toggleRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '14px 16px',
  backgroundColor: '#f8fafc',
  borderRadius: '10px',
  border: '1px solid #e2e8f0'
};
