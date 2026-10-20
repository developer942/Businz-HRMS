import React, { useState } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { DepartmentItem, DesignationItem } from '../../types/hrms';
import { 
  Building2, 
  Briefcase, 
  Plus, 
  Search, 
  RotateCcw, 
  Users, 
  UserCheck, 
  Check, 
  ChevronRight, 
  ChevronDown,
  X, 
  Edit2, 
  Trash2, 
  CheckCircle2, 
  MapPin,
  Layers,
  ArrowRight,
  ExternalLink,
  AlertCircle
} from 'lucide-react';

// Reusable EmpAvatar component with robust fallback
const EmpAvatar: React.FC<{ 
  emp: { firstName?: string; lastName?: string; avatar?: string; designation?: string }; 
  size?: number 
}> = ({ emp, size = 26 }) => {
  const [hasError, setHasError] = useState(false);
  const isValid = Boolean(
    emp.avatar && 
    (emp.avatar.startsWith('http') || emp.avatar.startsWith('/') || emp.avatar.startsWith('data:image'))
  );
  const initials = `${emp.firstName?.[0] || ''}${emp.lastName?.[0] || ''}`.toUpperCase() || 'EM';

  if (isValid && !hasError) {
    return (
      <img
        src={emp.avatar}
        alt={emp.firstName || 'Employee'}
        onError={() => setHasError(true)}
        title={`${emp.firstName} ${emp.lastName} (${emp.designation || 'Staff'})`}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          objectFit: 'cover',
          border: '2px solid #ffffff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
          flexShrink: 0
        }}
      />
    );
  }

  return (
    <div
      title={`${emp.firstName} ${emp.lastName} (${emp.designation || 'Staff'})`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #155DFC 0%, #3b82f6 100%)',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size > 32 ? '0.9rem' : '0.65rem',
        fontWeight: 800,
        border: '2px solid #ffffff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
        flexShrink: 0,
        letterSpacing: '0.02em'
      }}
    >
      {initials}
    </div>
  );
};

export const Organization: React.FC = () => {
  const { 
    departments, 
    addDepartment, 
    updateDepartment,
    deleteDepartment,
    designations,
    addDesignation,
    updateDesignation,
    deleteDesignation,
    canDeleteDepartment,
    canDeleteBranch,
    canDeleteDesignation,
    employees, 
    currentUser, 
    branches, 
    addBranch, 
    updateBranch, 
    deleteBranch, 
    addDepartmentToBranch, 
    removeDepartmentFromBranch 
  } = useHRMS();

  // Active Tab: 'departments' | 'branches' | 'designations'
  const [activeTab, setActiveTab] = useState<'departments' | 'branches' | 'designations'>('departments');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [showAddBranchModal, setShowAddBranchModal] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [branchForm, setBranchForm] = useState<{
    name: string;
    code: string;
    location: string;
    selectedDepartments: string[];
  }>({
    name: '',
    code: '',
    location: '',
    selectedDepartments: ['HR', 'Sales', 'Accounts', 'Procurement', 'Dispatch', 'Design', 'Finance', 'Technical Support']
  });
  const [customDeptList, setCustomDeptList] = useState<string[]>([]);
  const [newCustomDeptInput, setNewCustomDeptInput] = useState<string>('');
  const [quickDeptInput, setQuickDeptInput] = useState<{ [branchId: string]: string }>({});

  // Modals
  const [showAddDeptModal, setShowAddDeptModal] = useState(false);
  const [showAddDesigModal, setShowAddDesigModal] = useState(false);
  const [selectedDeptStaffModal, setSelectedDeptStaffModal] = useState<{
    deptName: string;
    description: string;
    headName: string;
    members: typeof employees;
  } | null>(null);
  const [modalStaffSearch, setModalStaffSearch] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Deletion modals & warnings state
  const [deleteBlockWarning, setDeleteBlockWarning] = useState<{ title: string; reason: string } | null>(null);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{ title: string; subtitle: string; onConfirm: () => void } | null>(null);

  // Unified Department list from Context
  const deptList = departments.map(d => ({
    ...d,
    description: `${d.name} Department`
  }));

  // Unified Designation list from Context
  const desigList = designations;

  // Forms
  const defaultHeadName = employees[0] ? `${employees[0].firstName} ${employees[0].lastName}`.trim() : 'Velmurugan';
  const [deptForm, setDeptForm] = useState({
    name: '',
    code: '',
    description: '',
    headName: defaultHeadName,
    budget: 300000
  });

  const [desigForm, setDesigForm] = useState({
    title: '',
    department: 'HR',
    level: 'L3 Senior'
  });

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleAddDept = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptForm.name) return;

    const resolvedHeadName = deptForm.headName || defaultHeadName;
    const matchedEmp = employees.find(emp => `${emp.firstName} ${emp.lastName}`.trim() === resolvedHeadName);

    addDepartment({
      name: deptForm.name.trim(),
      code: deptForm.code?.trim() || deptForm.name.substring(0, 3).toUpperCase(),
      headName: resolvedHeadName,
      headId: matchedEmp?.employeeId || employees[0]?.employeeId || 'EMP-000',
      budget: Number(deptForm.budget) || 300000
    });

    setShowAddDeptModal(false);
    setDeptForm({ name: '', code: '', description: '', headName: defaultHeadName, budget: 300000 });
    triggerToast(`Added ${deptForm.name.trim()} Department!`);
  };

  const handleAddDesignation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!desigForm.title.trim()) return;

    const newDesig: DesignationItem = {
      id: `DSG-${String(designations.length + 1).padStart(2, '0')}`,
      title: desigForm.title.trim(),
      department: desigForm.department,
      level: desigForm.level
    };

    addDesignation(newDesig);
    setShowAddDesigModal(false);
    setDesigForm({ title: '', department: departments[0]?.name || 'Production Head', level: 'L3 Senior' });
    triggerToast(`Added Designation: ${newDesig.title}!`);
  };

  const handleDeleteBranchClick = (b: { id: string; name: string }) => {
    const check = canDeleteBranch(b.name);
    if (!check.canDelete) {
      setDeleteBlockWarning({
        title: `Cannot Delete Branch "${b.name}"`,
        reason: check.reason || 'This branch is currently referenced by active workforce members.'
      });
      return;
    }
    setDeleteConfirmModal({
      title: `Delete Branch "${b.name}"`,
      subtitle: `Are you sure you want to permanently delete the ${b.name} branch? This action cannot be undone.`,
      onConfirm: () => {
        deleteBranch(b.id);
        triggerToast(`Deleted ${b.name} Branch`);
        setDeleteConfirmModal(null);
      }
    });
  };

  const handleDeleteDeptClick = (d: { id: string; name: string }) => {
    const check = canDeleteDepartment(d.name);
    if (!check.canDelete) {
      setDeleteBlockWarning({
        title: `Cannot Delete Department "${d.name}"`,
        reason: check.reason || 'This department has active employees or branch associations.'
      });
      return;
    }
    setDeleteConfirmModal({
      title: `Delete Department "${d.name}"`,
      subtitle: `Are you sure you want to permanently delete the ${d.name} department? This action cannot be undone.`,
      onConfirm: () => {
        deleteDepartment(d.id);
        triggerToast(`Deleted ${d.name} Department`);
        setDeleteConfirmModal(null);
      }
    });
  };

  const handleDeleteDesigClick = (desig: { id: string; title: string }) => {
    const check = canDeleteDesignation(desig.title);
    if (!check.canDelete) {
      setDeleteBlockWarning({
        title: `Cannot Delete Designation "${desig.title}"`,
        reason: check.reason || 'This designation is currently assigned to workforce members.'
      });
      return;
    }
    setDeleteConfirmModal({
      title: `Delete Designation "${desig.title}"`,
      subtitle: `Are you sure you want to permanently delete the "${desig.title}" designation?`,
      onConfirm: () => {
        deleteDesignation(desig.id);
        triggerToast(`Deleted Designation: ${desig.title}`);
        setDeleteConfirmModal(null);
      }
    });
  };

  // Dynamic real employee lookup by department name
  const getEmployeesInDepartment = (deptName: string) => {
    const target = (deptName || '').trim().toLowerCase();
    return employees.filter(emp => {
      const empDept = (emp.department || '').trim().toLowerCase();
      if (target === 'hr' || target === 'human resources') {
        return empDept === 'hr' || empDept === 'human resources';
      }
      if (target === 'it' || target === 'engineering' || target === 'information technology') {
        return empDept === 'it' || empDept === 'engineering' || empDept === 'information technology';
      }
      if (target === 'sales') {
        return empDept === 'sales';
      }
      if (target === 'marketing') {
        return empDept === 'marketing';
      }
      if (target === 'finance') {
        return empDept === 'finance';
      }
      if (target === 'recruitment') {
        return empDept === 'recruitment';
      }
      return empDept === target;
    });
  };

  // Filtered lists
  const filteredBranches = branches.filter(b => 
    b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.departments.some(d => d.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredDepts = deptList.filter(d => 
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDesigs = desigList.filter(d => 
    d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.level.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const defaultDepartmentOptions = [
    'HR',
    'Sales',
    'Accounts',
    'Procurement',
    'Dispatch',
    'Design',
    'Finance',
    'Technical Support'
  ];

  const allAvailableDepts = Array.from(new Set([
    ...defaultDepartmentOptions,
    ...deptList.map(d => d.name),
    ...branches.flatMap(b => b.departments),
    ...customDeptList
  ]));

  const handleCreateBranchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchForm.name.trim()) return;

    if (branchForm.selectedDepartments.length === 0) {
      alert('Please select at least one department for this branch.');
      return;
    }

    const branchPayload = {
      name: branchForm.name.trim(),
      code: branchForm.code.trim().toUpperCase() || branchForm.name.substring(0, 3).toUpperCase(),
      location: branchForm.location.trim() || `${branchForm.name} Office`,
      departments: branchForm.selectedDepartments
    };

    if (editingBranchId) {
      updateBranch(editingBranchId, branchPayload);
      triggerToast(`Updated ${branchPayload.name} Branch successfully!`);
    } else {
      addBranch(branchPayload);
      triggerToast(`Created ${branchPayload.name} Branch with ${branchPayload.departments.length} department(s)!`);
    }

    setShowAddBranchModal(false);
    setEditingBranchId(null);
    setBranchForm({ 
      name: '', 
      code: '', 
      location: '', 
      selectedDepartments: ['HR', 'Sales', 'Accounts', 'Procurement', 'Dispatch', 'Design', 'Finance', 'Technical Support'] 
    });
  };

  return (
    <div style={{ fontFamily: 'var(--font-primary)' }}>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: '#ecfeff',
          border: '1px solid #a5f3fc',
          color: '#0891b2',
          padding: '12px 20px',
          borderRadius: '12px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
          fontWeight: 700,
          zIndex: 1200,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={18} color="#155DFC" /> {toastMessage}
        </div>
      )}

      {/* 1. PAGE HEADER */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        marginBottom: '24px', 
        flexWrap: 'wrap', 
        gap: '16px' 
      }}>
        <div>
          <h1 style={{ 
            fontSize: '1.35rem', 
            fontWeight: 800, 
            color: '#0f172a', 
            letterSpacing: '-0.02em', 
            margin: 0 
          }}>
            Organization Structure
          </h1>
          <p style={{ fontSize: '0.86rem', color: '#64748b', marginTop: '4px', margin: 0 }}>
            Manage organizational branches, corporate departments, hierarchy, and career designations.
          </p>
        </div>

        {/* Action Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            type="button" 
            className="btn btn-primary"
            onClick={() => {
              if (activeTab === 'branches') {
                setEditingBranchId(null);
                setBranchForm({
                  name: '',
                  code: '',
                  location: '',
                  selectedDepartments: ['HR', 'Sales', 'Accounts', 'Procurement', 'Dispatch', 'Design', 'Finance', 'Technical Support']
                });
                setShowAddBranchModal(true);
              } else if (activeTab === 'departments') {
                setShowAddDeptModal(true);
              } else {
                setShowAddDesigModal(true);
              }
            }}
            style={{
              borderRadius: '10px',
              padding: '10px 22px',
              background: 'linear-gradient(135deg, #155DFC, #1d4ed8)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.86rem',
              boxShadow: '0 4px 14px rgba(21, 93, 252, 0.35)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <Plus size={16} />
            <span>
              {activeTab === 'branches' ? 'Add Branch' : activeTab === 'departments' ? 'Add Department' : 'Add Designation'}
            </span>
          </button>
        </div>
      </div>

      {/* 2. TOP OVERVIEW METRICS GRID */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', 
        gap: '16px', 
        marginBottom: '24px' 
      }}>
        
        {/* Metric 1 */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: '#ecfeff',
            color: '#0891b2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Building2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              DEPARTMENTS
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
              {deptList.length} Units
            </div>
          </div>
        </div>

        {/* Metric 2 */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: '#eff6ff',
            color: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Users size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              TOTAL WORKFORCE
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
              {employees.length} Staff Mapped
            </div>
          </div>
        </div>

        {/* Metric 3 */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: '#ecfdf5',
            color: '#059669',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <MapPin size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              CORPORATE SITES
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
              {branches.length} Location(s)
            </div>
          </div>
        </div>

        {/* Metric 4 */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: '#f5f3ff',
            color: '#7c3aed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Briefcase size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              JOB DESIGNATIONS
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
              {desigList.length} Tracks
            </div>
          </div>
        </div>

      </div>

      {/* 3. MAIN SECTION CONTAINER */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
        padding: '24px'
      }}>
        
        {/* MODERN SEGMENTED CONTROLS & SEARCH BAR STRIP */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '24px',
          paddingBottom: '20px',
          borderBottom: '1px solid #f1f5f9'
        }}>
          
          {/* Modern Segmented Tab Pills (Replaces ugly dropdown) */}
          <div style={{ 
            display: 'inline-flex', 
            padding: '4px', 
            backgroundColor: '#f1f5f9', 
            borderRadius: '12px', 
            gap: '4px',
            border: '1px solid #e2e8f0'
          }}>
            <button
              type="button"
              onClick={() => setActiveTab('departments')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '9px',
                border: 'none',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                backgroundColor: activeTab === 'departments' ? '#ffffff' : 'transparent',
                color: activeTab === 'departments' ? '#0891b2' : '#64748b',
                boxShadow: activeTab === 'departments' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              <Building2 size={16} color={activeTab === 'departments' ? '#0891b2' : '#64748b'} />
              <span>All Departments</span>
              <span style={{
                backgroundColor: activeTab === 'departments' ? '#ecfeff' : '#e2e8f0',
                color: activeTab === 'departments' ? '#0891b2' : '#64748b',
                padding: '2px 8px',
                borderRadius: '99px',
                fontSize: '0.72rem',
                fontWeight: 800
              }}>
                {deptList.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('branches')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '9px',
                border: 'none',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                backgroundColor: activeTab === 'branches' ? '#ffffff' : 'transparent',
                color: activeTab === 'branches' ? '#0891b2' : '#64748b',
                boxShadow: activeTab === 'branches' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              <MapPin size={16} color={activeTab === 'branches' ? '#0891b2' : '#64748b'} />
              <span>Corporate Branches</span>
              <span style={{
                backgroundColor: activeTab === 'branches' ? '#ecfeff' : '#e2e8f0',
                color: activeTab === 'branches' ? '#0891b2' : '#64748b',
                padding: '2px 8px',
                borderRadius: '99px',
                fontSize: '0.72rem',
                fontWeight: 800
              }}>
                {branches.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('designations')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '9px',
                border: 'none',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                backgroundColor: activeTab === 'designations' ? '#ffffff' : 'transparent',
                color: activeTab === 'designations' ? '#0891b2' : '#64748b',
                boxShadow: activeTab === 'designations' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              <Briefcase size={16} color={activeTab === 'designations' ? '#0891b2' : '#64748b'} />
              <span>Job Designations</span>
              <span style={{
                backgroundColor: activeTab === 'designations' ? '#ecfeff' : '#e2e8f0',
                color: activeTab === 'designations' ? '#0891b2' : '#64748b',
                padding: '2px 8px',
                borderRadius: '99px',
                fontSize: '0.72rem',
                fontWeight: 800
              }}>
                {desigList.length}
              </span>
            </button>
          </div>

          {/* Integrated Modern Search Input */}
          <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
            <input
              type="text"
              className="form-control"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'branches' 
                  ? 'Search branches or locations...' 
                  : activeTab === 'departments' 
                  ? 'Search departments, code...' 
                  : 'Search job designations...'
              }
              style={{
                width: '100%',
                padding: '10px 16px 10px 38px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#f8fafc',
                fontSize: '0.84rem',
                boxSizing: 'border-box'
              }}
            />
            <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#0891b2' }} />
            
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={15} />
              </button>
            )}
          </div>

        </div>

        {/* =========================================================================
            VIEW 1: DEPARTMENTS GRID VIEW
            ========================================================================= */}
        {activeTab === 'departments' && (
          <div>
            {filteredDepts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                No departments found matching "{searchQuery}". Click "+ Add Department" to create one.
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '20px'
              }}>
                {filteredDepts.map((dept) => {
                  const deptEmps = getEmployeesInDepartment(dept.name);
                  const empCount = deptEmps.length;
                  const deptHead = deptEmps.find(e => 
                    e.designation.toLowerCase().includes('director') || 
                    e.designation.toLowerCase().includes('lead') || 
                    e.designation.toLowerCase().includes('manager')
                  )?.firstName 
                    ? `${deptEmps[0].firstName} ${deptEmps[0].lastName}` 
                    : dept.headName;

                  return (
                    <div
                      key={dept.id}
                      onClick={() => {
                        setSelectedDeptStaffModal({
                          deptName: dept.name,
                          description: dept.description,
                          headName: deptHead,
                          members: deptEmps
                        });
                        setModalStaffSearch('');
                      }}
                      style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '16px',
                        padding: '22px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
                        cursor: 'pointer',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        position: 'relative'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-3px)';
                        e.currentTarget.style.boxShadow = '0 12px 24px -4px rgba(39, 211, 245, 0.15)';
                        e.currentTarget.style.borderColor = '#a5f3fc';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.02)';
                        e.currentTarget.style.borderColor = '#e2e8f0';
                      }}
                      title={`Click to view all employees in ${dept.name}`}
                    >
                      <div>
                        {/* Top Icon Badge & Code Chip */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                          <div style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '12px',
                            backgroundColor: '#ecfeff',
                            color: '#0891b2',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 6px rgba(39, 211, 245, 0.2)'
                          }}>
                            <Building2 size={22} />
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              padding: '3px 8px',
                              borderRadius: '6px',
                              backgroundColor: '#f1f5f9',
                              color: '#475569',
                              letterSpacing: '0.04em'
                            }}>
                              {dept.code}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteDeptClick(dept);
                              }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#94a3b8', borderRadius: '4px' }}
                              title={`Delete ${dept.name}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Title & Description */}
                        <h3 style={{ 
                          fontSize: '1.2rem', 
                          fontWeight: 800, 
                          color: '#0f172a', 
                          margin: '0 0 6px 0', 
                          letterSpacing: '-0.02em' 
                        }}>
                          {dept.name}
                        </h3>
                        <p style={{ 
                          fontSize: '0.8rem', 
                          color: '#64748b', 
                          margin: 0, 
                          lineHeight: 1.4,
                          minHeight: '34px'
                        }}>
                          {dept.description}
                        </p>
                      </div>

                      {/* Card Details Footer */}
                      <div style={{ 
                        borderTop: '1px solid #f1f5f9', 
                        paddingTop: '14px', 
                        marginTop: '18px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                      }}>
                        {/* Head of Department */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                          <span style={{ color: '#64748b', fontWeight: 600 }}>Head:</span>
                          <span style={{ 
                            fontWeight: 700, 
                            color: '#0f172a', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap',
                            maxWidth: '150px'
                          }}>
                            {deptHead}
                          </span>
                        </div>

                        {/* Staff Count Pill & Overlapping Stacked Avatars */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                          <span style={{
                            backgroundColor: empCount > 0 ? '#ecfeff' : '#f1f5f9',
                            color: empCount > 0 ? '#0891b2' : '#64748b',
                            border: `1px solid ${empCount > 0 ? '#a5f3fc' : '#e2e8f0'}`,
                            padding: '3px 10px',
                            borderRadius: '99px',
                            fontWeight: 700,
                            fontSize: '0.72rem'
                          }}>
                            {empCount} {empCount === 1 ? 'Member' : 'Members'}
                          </span>

                          {/* Overlapping Avatars with NO broken image icon */}
                          {empCount > 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              {deptEmps.slice(0, 3).map((emp, idx) => (
                                <div key={emp.id} style={{ marginLeft: idx > 0 ? '-8px' : 0 }}>
                                  <EmpAvatar emp={emp} size={28} />
                                </div>
                              ))}
                              {empCount > 3 && (
                                <span style={{ 
                                  marginLeft: '-6px',
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '50%',
                                  backgroundColor: '#f1f5f9',
                                  color: '#475569',
                                  border: '2px solid #ffffff',
                                  fontSize: '0.65rem',
                                  fontWeight: 800,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                }}>
                                  +{empCount - 3}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Unassigned</span>
                          )}
                        </div>

                        {/* Hover Action prompt */}
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'flex-end', 
                          gap: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: '#0891b2',
                          marginTop: '4px'
                        }}>
                          <span>View Roster</span>
                          <ChevronRight size={14} />
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            VIEW 2: CORPORATE BRANCHES & LOCATIONS
            ========================================================================= */}
        {activeTab === 'branches' && (
          <div>
            {filteredBranches.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                No branches found matching "{searchQuery}". Click "+ Add Branch" to create a new location.
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                gap: '20px'
              }}>
                {filteredBranches.map((b) => (
                  <div
                    key={b.id}
                    style={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '16px',
                      padding: '22px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div>
                      {/* Branch Card Header */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '12px',
                            backgroundColor: '#ecfdf5',
                            color: '#059669',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 6px rgba(5, 150, 105, 0.15)'
                          }}>
                            <MapPin size={22} />
                          </div>
                          <div>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                              {b.name}
                            </h3>
                            <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                              Code: <strong style={{ color: '#0f172a' }}>{b.code}</strong> &bull; {b.location}
                            </span>
                          </div>
                        </div>

                        {/* Edit / Delete Buttons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingBranchId(b.id);
                              setBranchForm({
                                name: b.name,
                                code: b.code,
                                location: b.location,
                                selectedDepartments: [...b.departments]
                              });
                              setShowAddBranchModal(true);
                            }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: '#64748b', borderRadius: '6px' }}
                            title="Edit Branch"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteBranchClick(b)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: '#ef4444', borderRadius: '6px' }}
                            title="Delete Branch"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Associated Departments Section */}
                      <div style={{ marginTop: '14px' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
                          ACTIVE DEPARTMENTS ({b.departments.length}):
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '60px' }}>
                          {b.departments.map((dept) => (
                            <span
                              key={dept}
                              style={{
                                fontSize: '0.76rem',
                                fontWeight: 700,
                                backgroundColor: '#f8fafc',
                                color: '#334155',
                                border: '1px solid #e2e8f0',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              {dept}
                              <span 
                                title={`Remove ${dept} from ${b.name}`}
                                onClick={() => {
                                  removeDepartmentFromBranch(b.id, dept);
                                  triggerToast(`Removed ${dept} from ${b.name}`);
                                }}
                                style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                              >
                                <X size={12} style={{ color: '#94a3b8' }} />
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Quick Add Department to this Branch */}
                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px', marginTop: '16px', display: 'flex', gap: '8px' }}>
                      <input 
                        type="text"
                        placeholder="Add dept (e.g. Accounts)..."
                        value={quickDeptInput[b.id] || ''}
                        onChange={(e) => setQuickDeptInput(prev => ({ ...prev, [b.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (quickDeptInput[b.id] || '').trim()) {
                            const val = quickDeptInput[b.id].trim();
                            addDepartmentToBranch(b.id, val);
                            setQuickDeptInput(prev => ({ ...prev, [b.id]: '' }));
                            triggerToast(`Added ${val} to ${b.name}!`);
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: '7px 12px',
                          fontSize: '0.8rem',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          backgroundColor: '#f8fafc'
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '6px 14px', fontSize: '0.76rem', fontWeight: 700, borderRadius: '8px' }}
                        onClick={() => {
                          const val = (quickDeptInput[b.id] || '').trim();
                          if (val) {
                            addDepartmentToBranch(b.id, val);
                            setQuickDeptInput(prev => ({ ...prev, [b.id]: '' }));
                            triggerToast(`Added ${val} to ${b.name}!`);
                          }
                        }}
                      >
                        + Add
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            VIEW 3: JOB DESIGNATIONS
            ========================================================================= */}
        {activeTab === 'designations' && (
          <div>
            {filteredDesigs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                No designations found matching "{searchQuery}". Click "+ Add Designation" to create a new role.
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '20px'
              }}>
                {filteredDesigs.map((desig) => (
                  <div
                    key={desig.id}
                    style={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '16px',
                      padding: '22px 20px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 10px 20px -4px rgba(0,0,0,0.06)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)';
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '12px',
                          backgroundColor: '#f5f3ff',
                          color: '#7c3aed',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 2px 6px rgba(124, 58, 237, 0.15)'
                        }}>
                          <Briefcase size={20} />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{
                            fontSize: '0.72rem',
                            padding: '3px 10px',
                            borderRadius: '99px',
                            backgroundColor: desig.level.includes('Lead') ? '#fef3c7' : desig.level.includes('Senior') ? '#ecfeff' : '#f1f5f9',
                            color: desig.level.includes('Lead') ? '#b45309' : desig.level.includes('Senior') ? '#0891b2' : '#475569',
                            fontWeight: 800
                          }}>
                            {desig.level}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteDesigClick(desig)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#94a3b8', borderRadius: '4px' }}
                            title={`Delete ${desig.title}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
                        {desig.title}
                      </h3>
                    </div>

                    <div style={{ 
                      borderTop: '1px solid #f1f5f9', 
                      paddingTop: '12px', 
                      marginTop: '16px', 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      fontSize: '0.78rem' 
                    }}>
                      <span style={{ color: '#64748b' }}>Department:</span>
                      <span style={{ fontWeight: 700, color: '#0891b2' }}>{desig.department}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* =========================================================================
          MODAL 1: ADD DEPARTMENT
          ========================================================================= */}
      {showAddDeptModal && (
        <div className="modal-overlay" onClick={() => setShowAddDeptModal(false)}>
          <div 
            className="modal-content" 
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '480px', borderRadius: '16px', overflow: 'hidden' }}
          >
            <div className="modal-header" style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>Add New Department</h2>
              <button onClick={() => setShowAddDeptModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddDept}>
              <div className="modal-body" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.82rem', color: '#334155', marginBottom: '6px', display: 'block' }}>Department Name <span style={{ color: '#EF4444' }}>*</span></label>
                  <input
                    className="form-control"
                    value={deptForm.name}
                    onChange={e => setDeptForm({ ...deptForm, name: e.target.value })}
                    placeholder="e.g. Marketing, Engineering, Operations"
                    required
                    style={{ borderRadius: '8px' }}
                  />
                </div>
                
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.82rem', color: '#334155', marginBottom: '6px', display: 'block' }}>Description / Focus</label>
                  <input
                    className="form-control"
                    value={deptForm.description}
                    onChange={e => setDeptForm({ ...deptForm, description: e.target.value })}
                    placeholder="e.g. Infrastructure & Platform Engineering"
                    style={{ borderRadius: '8px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: '0.82rem', color: '#334155', marginBottom: '6px', display: 'block' }}>Dept Code</label>
                    <input
                      className="form-control"
                      value={deptForm.code}
                      onChange={e => setDeptForm({ ...deptForm, code: e.target.value })}
                      placeholder="ENG"
                      style={{ borderRadius: '8px' }}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: '0.82rem', color: '#334155', marginBottom: '6px', display: 'block' }}>Department Head</label>
                    <input
                      className="form-control"
                      value={deptForm.headName}
                      onChange={e => setDeptForm({ ...deptForm, headName: e.target.value })}
                      placeholder="Sarah Jenkins"
                      style={{ borderRadius: '8px' }}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', backgroundColor: '#ffffff', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddDeptModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" style={{ background: 'linear-gradient(135deg, #155DFC, #1d4ed8)', color: '#ffffff', fontWeight: 700, border: 'none', boxShadow: '0 4px 12px rgba(21, 93, 252, 0.35)' }}>
                  Create Department
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: ADD DESIGNATION
          ========================================================================= */}
      {showAddDesigModal && (
        <div className="modal-overlay" onClick={() => setShowAddDesigModal(false)}>
          <div 
            className="modal-content" 
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '460px', borderRadius: '16px', overflow: 'hidden' }}
          >
            <div className="modal-header" style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>Add New Designation</h2>
              <button onClick={() => setShowAddDesigModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddDesignation}>
              <div className="modal-body" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.82rem', color: '#334155', marginBottom: '6px', display: 'block' }}>Job Title / Designation <span style={{ color: '#EF4444' }}>*</span></label>
                  <input
                    className="form-control"
                    value={desigForm.title}
                    onChange={e => setDesigForm({ ...desigForm, title: e.target.value })}
                    placeholder="e.g. Lead Structural Engineer"
                    required
                    style={{ borderRadius: '8px' }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.82rem', color: '#334155', marginBottom: '6px', display: 'block' }}>Department</label>
                  <select
                    className="form-control"
                    value={desigForm.department}
                    onChange={e => setDesigForm({ ...desigForm, department: e.target.value })}
                    style={{ borderRadius: '8px' }}
                  >
                    {deptList.map(d => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.82rem', color: '#334155', marginBottom: '6px', display: 'block' }}>Career Level Tag</label>
                  <input
                    className="form-control"
                    value={desigForm.level}
                    onChange={e => setDesigForm({ ...desigForm, level: e.target.value })}
                    placeholder="e.g. L3 Senior, L4 Lead, L2 Associate"
                    style={{ borderRadius: '8px' }}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', backgroundColor: '#ffffff', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddDesigModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" style={{ background: 'linear-gradient(135deg, #155DFC, #1d4ed8)', color: '#ffffff', fontWeight: 700, border: 'none', boxShadow: '0 4px 12px rgba(21, 93, 252, 0.35)' }}>
                  Create Designation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: DEPARTMENT STAFF MEMBERS (VIEW ROSTER)
          ========================================================================= */}
      {selectedDeptStaffModal && (
        <div className="modal-overlay" onClick={() => setSelectedDeptStaffModal(null)}>
          <div 
            className="modal-content" 
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '680px', width: '92%', borderRadius: '16px', overflow: 'hidden' }}
          >
            
            {/* Modal Header */}
            <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '18px 24px', backgroundColor: '#ffffff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  backgroundColor: '#ecfeff',
                  color: '#0891b2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Building2 size={22} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                    {selectedDeptStaffModal.deptName} Department
                  </h2>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Head: <strong>{selectedDeptStaffModal.headName}</strong> &bull; {selectedDeptStaffModal.members.length} Active Personnel
                  </span>
                </div>
              </div>
              
              <button 
                onClick={() => setSelectedDeptStaffModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '20px 24px', backgroundColor: '#ffffff' }}>
              
              {/* Inner Search Bar */}
              <div style={{ position: 'relative', marginBottom: '16px' }}>
                <input
                  type="text"
                  className="form-control"
                  value={modalStaffSearch}
                  onChange={(e) => setModalStaffSearch(e.target.value)}
                  placeholder={`Search staff in ${selectedDeptStaffModal.deptName}...`}
                  style={{
                    paddingLeft: '38px',
                    borderRadius: '10px',
                    fontSize: '0.84rem'
                  }}
                />
                <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#0891b2' }} />
              </div>

              {/* Employees List */}
              {selectedDeptStaffModal.members.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px', color: '#94a3b8', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                  No personnel are currently assigned to the {selectedDeptStaffModal.deptName} department.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '380px', overflowY: 'auto' }}>
                  {selectedDeptStaffModal.members
                    .filter(m => 
                      `${m.firstName} ${m.lastName}`.toLowerCase().includes(modalStaffSearch.toLowerCase()) ||
                      m.employeeId.toLowerCase().includes(modalStaffSearch.toLowerCase()) ||
                      m.designation.toLowerCase().includes(modalStaffSearch.toLowerCase())
                    )
                    .map((emp) => (
                      <div
                        key={emp.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          borderRadius: '12px',
                          border: '1px solid #e2e8f0',
                          backgroundColor: '#f8fafc'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <EmpAvatar emp={emp} size={42} />
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#0f172a' }}>
                              {emp.firstName} {emp.lastName}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                              <span>ID: <strong>{emp.employeeId}</strong></span>
                              <span>&bull;</span>
                              <span style={{ color: '#0891b2', fontWeight: 600 }}>{emp.designation}</span>
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#64748b' }}>
                          <div>{emp.email}</div>
                          <div style={{ marginTop: '2px' }}>
                            <span className="status-pill present" style={{ fontSize: '0.65rem' }}>Active</span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid #e2e8f0', padding: '16px 24px', backgroundColor: '#ffffff', display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                className="btn btn-secondary btn-sm" 
                onClick={() => setSelectedDeptStaffModal(null)}
              >
                Close Roster
              </button>
            </div>

          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 4: ADD / EDIT BRANCH
          ========================================================================= */}
      {showAddBranchModal && (
        <div className="modal-overlay" onClick={() => setShowAddBranchModal(false)}>
          <div 
            className="modal-content" 
            onClick={(e) => e.stopPropagation()} 
            style={{ 
              maxWidth: '560px', 
              backgroundColor: '#ffffff', 
              borderRadius: '16px', 
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e2e8f0'
            }}
          >
            <div className="modal-header" style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ffffff' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                {editingBranchId ? 'Edit Corporate Branch' : 'Create Corporate Branch'}
              </h2>
              <button 
                onClick={() => setShowAddBranchModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateBranchSubmit}>
              <div className="modal-body" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px', backgroundColor: '#ffffff', maxHeight: 'calc(85vh - 130px)', overflowY: 'auto' }}>
                
                {/* Branch Name */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                    Branch Name <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kolkata Headquarters, Mumbai Hub, Delhi Site"
                    className="form-control"
                    value={branchForm.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBranchForm(s => ({ 
                        ...s, 
                        name: val,
                        code: s.code ? s.code : (val.length >= 3 ? val.substring(0, 3).toUpperCase() : '')
                      }));
                    }}
                    style={{ borderRadius: '8px' }}
                  />
                </div>

                {/* Code and Location */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '14px' }}>
                  <div>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                      Branch Code <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. KOL"
                      className="form-control"
                      value={branchForm.code}
                      onChange={(e) => setBranchForm(s => ({ ...s, code: e.target.value.toUpperCase() }))}
                      style={{ borderRadius: '8px' }}
                    />
                  </div>

                  <div>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                      City / Location Address <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Salt Lake Sector V, Kolkata"
                      className="form-control"
                      value={branchForm.location}
                      onChange={(e) => setBranchForm(s => ({ ...s, location: e.target.value }))}
                      style={{ borderRadius: '8px' }}
                    />
                  </div>
                </div>

                {/* Department Selection */}
                <div>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                    Assign Operational Departments ({branchForm.selectedDepartments.length} Selected) <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '180px', overflowY: 'auto', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#f8fafc' }}>
                    {allAvailableDepts.map((dept) => {
                      const isChecked = branchForm.selectedDepartments.includes(dept);
                      return (
                        <button
                          key={dept}
                          type="button"
                          onClick={() => {
                            setBranchForm(s => ({
                              ...s,
                              selectedDepartments: isChecked 
                                ? s.selectedDepartments.filter(d => d !== dept)
                                : [...s.selectedDepartments, dept]
                            }));
                          }}
                          style={{
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: isChecked ? '1.5px solid #155DFC' : '1px solid #cbd5e1',
                            backgroundColor: isChecked ? '#eff6ff' : '#ffffff',
                            color: isChecked ? '#1d4ed8' : '#475569',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {isChecked && <Check size={14} color="#1d4ed8" />}
                          <span>{dept}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

              </div>

              <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px', backgroundColor: '#ffffff' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary btn-sm" 
                  onClick={() => setShowAddBranchModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary btn-sm"
                  style={{ background: 'linear-gradient(135deg, #155DFC, #1d4ed8)', color: '#ffffff', fontWeight: 700, border: 'none', boxShadow: '0 4px 12px rgba(21, 93, 252, 0.35)' }}
                >
                  {editingBranchId ? 'Update Branch' : 'Create Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deletion Blocked Warning Modal */}
      {deleteBlockWarning && (
        <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={() => setDeleteBlockWarning(null)}>
          <div 
            className="modal-content" 
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '480px', borderRadius: '16px', overflow: 'hidden' }}
          >
            <div className="modal-header" style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#b45309' }}>
                <AlertCircle size={22} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>{deleteBlockWarning.title}</h3>
              </div>
              <button onClick={() => setDeleteBlockWarning(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ padding: '24px' }}>
              <div style={{
                backgroundColor: '#fffbeb',
                border: '1px solid #fef3c7',
                color: '#92400e',
                padding: '16px',
                borderRadius: '12px',
                fontSize: '0.88rem',
                lineHeight: 1.5,
                marginBottom: '16px'
              }}>
                {deleteBlockWarning.reason}
              </div>
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0 }}>
                To maintain database integrity, records with active employee mappings cannot be removed. Reassign existing staff members before deletion.
              </p>
            </div>
            <div className="modal-footer" style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', backgroundColor: '#f8fafc' }}>
              <button 
                type="button" 
                className="btn btn-primary btn-sm"
                onClick={() => setDeleteBlockWarning(null)}
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmModal && (
        <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={() => setDeleteConfirmModal(null)}>
          <div 
            className="modal-content" 
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '480px', borderRadius: '16px', overflow: 'hidden' }}
          >
            <div className="modal-header" style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ef4444' }}>
                <Trash2 size={20} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>{deleteConfirmModal.title}</h3>
              </div>
              <button onClick={() => setDeleteConfirmModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ padding: '24px' }}>
              <p style={{ fontSize: '0.9rem', color: '#334155', lineHeight: 1.5, margin: 0 }}>
                {deleteConfirmModal.subtitle}
              </p>
            </div>
            <div className="modal-footer" style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px', backgroundColor: '#f8fafc' }}>
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
                onClick={deleteConfirmModal.onConfirm}
              >
                Delete Record
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
