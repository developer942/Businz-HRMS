import React, { useState } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { 
  Building2, 
  Briefcase, 
  Layers, 
  Users, 
  MapPin, 
  GitFork, 
  Plus, 
  Edit2, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  X, 
  Save, 
  ShieldCheck,
  ChevronRight,
  UserCheck
} from 'lucide-react';
import { DepartmentItem, DesignationItem, BranchItem, GradeItem, EmploymentTypeItem, EmployeeCategoryItem } from '../../types/hrms';

export const OrganizationSettings: React.FC = () => {
  const { 
    departments, 
    addDepartment, 
    updateDepartment, 
    deleteDepartment,
    designations, 
    addDesignation, 
    updateDesignation, 
    deleteDesignation,
    branches, 
    addBranch, 
    updateBranch, 
    deleteBranch,
    grades, 
    addGrade, 
    updateGrade, 
    deleteGrade,
    employmentTypes, 
    addEmploymentType, 
    updateEmploymentType, 
    deleteEmploymentType,
    employeeCategories, 
    addEmployeeCategory, 
    updateEmployeeCategory, 
    deleteEmployeeCategory,
    employees
  } = useHRMS();

  const [activeSubSection, setActiveSubSection] = useState<'departments' | 'designations' | 'grades' | 'types' | 'categories' | 'branches' | 'hierarchy'>('departments');
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals state
  const [modalType, setModalType] = useState<null | 'dept' | 'desig' | 'grade' | 'type' | 'cat' | 'branch'>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Forms
  const [deptForm, setDeptForm] = useState({ name: '', code: '', headName: '', headId: '', budget: 500000 });
  const [desigForm, setDesigForm] = useState({ title: '', department: departments[0]?.name || '', level: 'L2 Executive' });
  const [gradeForm, setGradeForm] = useState({ code: '', title: '', description: '', level: 1 });
  const [typeForm, setTypeForm] = useState({ name: '', code: '', status: 'Active' as 'Active' | 'Inactive' });
  const [catForm, setCatForm] = useState({ name: '', code: '', status: 'Active' as 'Active' | 'Inactive' });
  const [branchForm, setBranchForm] = useState({ name: '', code: '', location: '', departments: [] as string[] });

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const triggerError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(null), 5000);
  };

  const openAddModal = (type: 'dept' | 'desig' | 'grade' | 'type' | 'cat' | 'branch') => {
    setEditingId(null);
    setModalType(type);
    if (type === 'dept') setDeptForm({ name: '', code: '', headName: '', headId: '', budget: 500000 });
    if (type === 'desig') setDesigForm({ title: '', department: departments[0]?.name || '', level: 'L2 Executive' });
    if (type === 'grade') setGradeForm({ code: `L${grades.length + 1}`, title: '', description: '', level: grades.length + 1 });
    if (type === 'type') setTypeForm({ name: '', code: '', status: 'Active' });
    if (type === 'cat') setCatForm({ name: '', code: '', status: 'Active' });
    if (type === 'branch') setBranchForm({ name: '', code: '', location: '', departments: [] });
  };

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptForm.name.trim()) return;
    if (editingId) {
      const res: any = await updateDepartment(editingId, deptForm);
      if (res && res.success === false) {
        triggerError(res.message || `Failed to update department "${deptForm.name}"`);
        return;
      }
      triggerToast(`Department "${deptForm.name}" updated successfully`);
    } else {
      const res: any = await addDepartment(deptForm);
      if (res && res.success === false) {
        triggerError(res.message || `Failed to create department "${deptForm.name}"`);
        return;
      }
      triggerToast(`Department "${deptForm.name}" created successfully`);
    }
    setModalType(null);
  };

  const handleDeleteDept = async (id: string, name: string) => {
    const res: any = await deleteDepartment(id);
    if (res && !res.success) {
      triggerError(res.message || `Cannot delete department: In use by employees`);
    } else {
      triggerToast(`Department "${name}" deleted`);
    }
  };

  const handleSaveDesig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!desigForm.title.trim()) return;
    if (editingId) {
      updateDesignation(editingId, desigForm);
      triggerToast(`Designation "${desigForm.title}" updated successfully`);
    } else {
      addDesignation(desigForm);
      triggerToast(`Designation "${desigForm.title}" created successfully`);
    }
    setModalType(null);
  };

  const handleDeleteDesig = (id: string, title: string) => {
    const res = deleteDesignation(id);
    if (!res.success) {
      triggerError(res.message || `Cannot delete designation: In use by employees`);
    } else {
      triggerToast(`Designation "${title}" deleted`);
    }
  };

  const handleSaveBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchForm.name.trim()) return;
    if (editingId) {
      updateBranch(editingId, branchForm);
      triggerToast(`Branch "${branchForm.name}" updated successfully`);
    } else {
      addBranch(branchForm);
      triggerToast(`Branch "${branchForm.name}" registered successfully`);
    }
    setModalType(null);
  };

  const handleDeleteBranch = (id: string, name: string) => {
    deleteBranch(id);
    triggerToast(`Branch "${name}" deleted`);
  };

  const handleSaveGrade = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradeForm.title.trim()) return;
    if (editingId) {
      updateGrade(editingId, gradeForm);
      triggerToast(`Grade "${gradeForm.code}" updated`);
    } else {
      addGrade(gradeForm);
      triggerToast(`Grade "${gradeForm.code}" created`);
    }
    setModalType(null);
  };

  const handleSaveType = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeForm.name.trim()) return;
    if (editingId) {
      updateEmploymentType(editingId, typeForm);
      triggerToast(`Employment Type "${typeForm.name}" updated`);
    } else {
      addEmploymentType(typeForm);
      triggerToast(`Employment Type "${typeForm.name}" created`);
    }
    setModalType(null);
  };

  const handleSaveCat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catForm.name.trim()) return;
    if (editingId) {
      updateEmployeeCategory(editingId, catForm);
      triggerToast(`Category "${catForm.name}" updated`);
    } else {
      addEmployeeCategory(catForm);
      triggerToast(`Category "${catForm.name}" created`);
    }
    setModalType(null);
  };

  return (
    <div style={{ padding: '0 4px' }}>
      {/* Toast & Error Alerts */}
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

      {errorMessage && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 9999,
          backgroundColor: '#EF4444',
          color: '#ffffff',
          padding: '14px 20px',
          borderRadius: '12px',
          boxShadow: '0 8px 24px rgba(239, 68, 68, 0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontWeight: 600,
          fontSize: '0.9rem',
          maxWidth: '450px'
        }}>
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', marginLeft: 'auto' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Sub-navigation Pills */}
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
          { id: 'departments', label: `Departments (${departments.length})`, icon: Building2 },
          { id: 'designations', label: `Designations (${designations.length})`, icon: Briefcase },
          { id: 'grades', label: `Grades & Levels (${grades.length})`, icon: Layers },
          { id: 'types', label: `Employment Types (${employmentTypes.length})`, icon: Users },
          { id: 'categories', label: `Employee Categories (${employeeCategories.length})`, icon: UserCheck },
          { id: 'branches', label: `Branches & Locations (${branches.length})`, icon: MapPin },
          { id: 'hierarchy', label: 'Organization Hierarchy', icon: GitFork }
        ].map(item => {
          const Icon = item.icon;
          const isActive = activeSubSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => { setActiveSubSection(item.id as any); setSearchQuery(''); }}
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

      {/* SECTION: DEPARTMENTS */}
      {activeSubSection === 'departments' && (
        <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #E7ECF3', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1E293B', margin: 0 }}>Corporate Departments</h2>
              <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '4px 0 0' }}>Master functional units linked to employee profiles, tasks, and reports</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search department..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    padding: '8px 12px 8px 36px',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    fontSize: '0.85rem',
                    outline: 'none',
                    width: '200px'
                  }}
                />
              </div>
              <button
                onClick={() => openAddModal('dept')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#0E7490',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '9px 18px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                <Plus size={16} />
                <span>Add Department</span>
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                  <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Department Name</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Code</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Department Head</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Employees Assigned</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {departments.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()) || d.code.toLowerCase().includes(searchQuery.toLowerCase())).map(dept => {
                  const assignedCount = employees.filter(e => (e.department || '').toLowerCase() === dept.name.toLowerCase()).length;
                  return (
                    <tr key={dept.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '14px 16px', fontWeight: 700, color: '#1E293B', fontSize: '0.88rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#ECFEFF', color: '#0E7490', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                            {dept.name.charAt(0)}
                          </div>
                          <span>{dept.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '0.85rem', color: '#64748B' }}>
                        <span style={{ backgroundColor: '#F1F5F9', padding: '4px 8px', borderRadius: '6px', fontWeight: 600 }}>{dept.code}</span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '0.85rem', color: '#1E293B', fontWeight: 500 }}>
                        {dept.headName || 'Not Assigned'}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '0.85rem' }}>
                        <span style={{ 
                          backgroundColor: assignedCount > 0 ? '#DCFCE7' : '#F1F5F9', 
                          color: assignedCount > 0 ? '#166534' : '#64748B',
                          padding: '4px 10px', 
                          borderRadius: '9999px', 
                          fontWeight: 700, 
                          fontSize: '0.78rem' 
                        }}>
                          {assignedCount} Members
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => {
                              setEditingId(dept.id);
                              setDeptForm({ name: dept.name, code: dept.code, headName: dept.headName || '', headId: dept.headId || '', budget: dept.budget || 500000 });
                              setModalType('dept');
                            }}
                            title="Edit Department"
                            style={{ background: 'none', border: 'none', color: '#0E7490', cursor: 'pointer', padding: '4px' }}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteDept(dept.id, dept.name)}
                            title="Delete Department"
                            style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '4px' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION: DESIGNATIONS */}
      {activeSubSection === 'designations' && (
        <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #E7ECF3', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1E293B', margin: 0 }}>Designations & Job Titles</h2>
              <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '4px 0 0' }}>Job roles assigned to employees and associated with operational grades</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search designation..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  fontSize: '0.85rem',
                  outline: 'none',
                  width: '200px'
                }}
              />
              <button
                onClick={() => openAddModal('desig')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#0E7490',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '9px 18px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                <Plus size={16} />
                <span>Add Designation</span>
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                  <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Designation Title</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Department</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Grade / Level</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Staff Holding</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {designations.filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase()) || d.department.toLowerCase().includes(searchQuery.toLowerCase())).map(desig => {
                  const staffCount = employees.filter(e => (e.designation || '').toLowerCase() === desig.title.toLowerCase()).length;
                  return (
                    <tr key={desig.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '14px 16px', fontWeight: 700, color: '#1E293B', fontSize: '0.88rem' }}>{desig.title}</td>
                      <td style={{ padding: '14px 16px', fontSize: '0.85rem', color: '#64748B' }}>{desig.department}</td>
                      <td style={{ padding: '14px 16px', fontSize: '0.85rem' }}>
                        <span style={{ backgroundColor: '#ECFEFF', color: '#0E7490', padding: '4px 8px', borderRadius: '6px', fontWeight: 700, fontSize: '0.78rem' }}>
                          {desig.level}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '0.85rem' }}>
                        <span style={{ backgroundColor: staffCount > 0 ? '#DCFCE7' : '#F1F5F9', color: staffCount > 0 ? '#166534' : '#64748B', padding: '4px 10px', borderRadius: '9999px', fontWeight: 700, fontSize: '0.78rem' }}>
                          {staffCount} Staff
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => {
                              setEditingId(desig.id);
                              setDesigForm({ title: desig.title, department: desig.department, level: desig.level });
                              setModalType('desig');
                            }}
                            style={{ background: 'none', border: 'none', color: '#0E7490', cursor: 'pointer', padding: '4px' }}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteDesig(desig.id, desig.title)}
                            style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '4px' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION: GRADES & LEVELS */}
      {activeSubSection === 'grades' && (
        <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #E7ECF3', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1E293B', margin: 0 }}>Grades & Executive Levels</h2>
              <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '4px 0 0' }}>Hierarchical bands for compensation, approval limits, and reporting ranks</p>
            </div>
            <button
              onClick={() => openAddModal('grade')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#0E7490',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                padding: '9px 18px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              <Plus size={16} />
              <span>Add Grade</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {grades.map(grade => (
              <div key={grade.id} style={{ border: '1px solid #E2E8F0', borderRadius: '14px', padding: '16px', backgroundColor: '#F8FAFC' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <span style={{ backgroundColor: '#0E7490', color: '#ffffff', padding: '4px 10px', borderRadius: '8px', fontWeight: 800, fontSize: '0.85rem' }}>
                    {grade.code}
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => { setEditingId(grade.id); setGradeForm(grade); setModalType('grade'); }} style={{ background: 'none', border: 'none', color: '#0E7490', cursor: 'pointer' }}>
                      <Edit2 size={15} />
                    </button>
                    <button onClick={() => deleteGrade(grade.id)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1E293B', margin: '0 0 4px' }}>{grade.title}</h3>
                <p style={{ fontSize: '0.82rem', color: '#64748B', margin: 0 }}>{grade.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION: EMPLOYMENT TYPES */}
      {activeSubSection === 'types' && (
        <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #E7ECF3', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1E293B', margin: 0 }}>Employment Types</h2>
              <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '4px 0 0' }}>Contractual terms governing employee tenure, benefits, and tax rules</p>
            </div>
            <button
              onClick={() => openAddModal('type')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#0E7490',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                padding: '9px 18px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              <Plus size={16} />
              <span>Add Type</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {employmentTypes.map(t => (
              <div key={t.id} style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ margin: '0 0 4px', fontSize: '0.95rem', fontWeight: 700, color: '#1E293B' }}>{t.name}</h4>
                  <span style={{ backgroundColor: '#F1F5F9', color: '#64748B', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>{t.code}</span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => { setEditingId(t.id); setTypeForm(t); setModalType('type'); }} style={{ background: 'none', border: 'none', color: '#0E7490', cursor: 'pointer' }}>
                    <Edit2 size={15} />
                  </button>
                  <button onClick={() => deleteEmploymentType(t.id)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION: EMPLOYEE CATEGORIES */}
      {activeSubSection === 'categories' && (
        <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #E7ECF3', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1E293B', margin: 0 }}>Employee Categories</h2>
              <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '4px 0 0' }}>White collar, blue collar, factory crew, and operational groupings</p>
            </div>
            <button
              onClick={() => openAddModal('cat')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#0E7490',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                padding: '9px 18px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              <Plus size={16} />
              <span>Add Category</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {employeeCategories.map(c => (
              <div key={c.id} style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ margin: '0 0 4px', fontSize: '0.95rem', fontWeight: 700, color: '#1E293B' }}>{c.name}</h4>
                  <span style={{ backgroundColor: '#ECFEFF', color: '#0E7490', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>{c.code}</span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => { setEditingId(c.id); setCatForm(c); setModalType('cat'); }} style={{ background: 'none', border: 'none', color: '#0E7490', cursor: 'pointer' }}>
                    <Edit2 size={15} />
                  </button>
                  <button onClick={() => deleteEmployeeCategory(c.id)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION: BRANCHES & LOCATIONS */}
      {activeSubSection === 'branches' && (
        <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #E7ECF3', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1E293B', margin: 0 }}>Branches, Sites & Fabrication Yards</h2>
              <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '4px 0 0' }}>Physical operational facilities for staff stationing and geofenced attendance</p>
            </div>
            <button
              onClick={() => openAddModal('branch')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#0E7490',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                padding: '9px 18px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              <Plus size={16} />
              <span>Add Location</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {branches.map(b => {
              const staffCount = employees.filter(e => (e.workLocation || '').toLowerCase().includes(b.name.toLowerCase()) || b.name.toLowerCase().includes((e.workLocation || '').toLowerCase())).length;
              return (
                <div key={b.id} style={{ border: '1px solid #E2E8F0', borderRadius: '14px', padding: '18px', backgroundColor: '#F8FAFC' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <MapPin size={18} color="#0E7490" />
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#1E293B' }}>{b.name}</h4>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => { setEditingId(b.id); setBranchForm({ name: b.name, code: b.code, location: b.location, departments: b.departments || [] }); setModalType('branch'); }} style={{ background: 'none', border: 'none', color: '#0E7490', cursor: 'pointer' }}>
                        <Edit2 size={15} />
                      </button>
                      <button onClick={() => handleDeleteBranch(b.id, b.name)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: '#64748B', margin: '0 0 10px' }}>{b.location}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: '#475569', borderTop: '1px solid #E2E8F0', paddingTop: '10px' }}>
                    <span>Code: <b>{b.code}</b></span>
                    <span style={{ backgroundColor: staffCount > 0 ? '#DCFCE7' : '#E2E8F0', color: staffCount > 0 ? '#166534' : '#475569', padding: '2px 8px', borderRadius: '9999px', fontWeight: 700 }}>
                      {staffCount} Assigned
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION: ORGANIZATION HIERARCHY */}
      {activeSubSection === 'hierarchy' && (
        <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #E7ECF3', padding: '24px' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1E293B', margin: '0 0 4px' }}>Enterprise Hierarchy Tree</h2>
          <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '0 0 24px' }}>Live reporting hierarchy from Executive Leadership down to Department Teams</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '800px' }}>
            <div style={{ padding: '16px', backgroundColor: '#0E7490', color: '#ffffff', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Building2 size={24} />
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Executive Leadership (Level 1)</h4>
                <p style={{ margin: '2px 0 0', fontSize: '0.82rem', opacity: 0.9 }}>CEO & Managing Director | Velmurugan</p>
              </div>
            </div>

            <div style={{ marginLeft: '32px', borderLeft: '2px dashed #CBD5E1', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {departments.map((dept, idx) => (
                <div key={dept.id} style={{ padding: '12px 16px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0E7490' }}>DEPT {dept.code}</span>
                      <h4 style={{ margin: '2px 0 0', fontSize: '0.92rem', fontWeight: 700, color: '#1E293B' }}>{dept.name}</h4>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: '#64748B' }}>Head: <b>{dept.headName || 'Not Appointed'}</b></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD/EDIT FORM */}
      {modalType && (
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
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '500px',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#1E293B' }}>
                {editingId ? 'Edit' : 'Create New'} {modalType === 'dept' ? 'Department' : modalType === 'desig' ? 'Designation' : modalType === 'grade' ? 'Grade' : modalType === 'type' ? 'Employment Type' : modalType === 'cat' ? 'Category' : 'Branch'}
              </h3>
              <button onClick={() => setModalType(null)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {/* Department Form */}
            {modalType === 'dept' && (
              <form onSubmit={handleSaveDept} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Department Name <span style={{ color: '#EF4444' }}>*</span></label>
                  <input
                    type="text"
                    required
                    value={deptForm.name}
                    onChange={e => setDeptForm({ ...deptForm, name: e.target.value })}
                    placeholder="e.g. Quality Assurance & Testing"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Department Code <span style={{ color: '#EF4444' }}>*</span></label>
                  <input
                    type="text"
                    required
                    value={deptForm.code}
                    onChange={e => setDeptForm({ ...deptForm, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. QA"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Department Head Name</label>
                  <input
                    type="text"
                    value={deptForm.headName}
                    onChange={e => setDeptForm({ ...deptForm, headName: e.target.value })}
                    placeholder="e.g. Er. Sundararajan"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
                  <button type="button" onClick={() => setModalType(null)} style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #CBD5E1', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#0E7490', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Save Department</button>
                </div>
              </form>
            )}

            {/* Designation Form */}
            {modalType === 'desig' && (
              <form onSubmit={handleSaveDesig} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Designation Title <span style={{ color: '#EF4444' }}>*</span></label>
                  <input
                    type="text"
                    required
                    value={desigForm.title.replace(/[0-9]/g, '')}
                    onChange={e => setDesigForm({ ...desigForm, title: e.target.value.replace(/[0-9]/g, '') })}
                    onKeyDown={e => {
                      if (/^[0-9]$/.test(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    placeholder="e.g. Senior Project Manager"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Department</label>
                  <select
                    value={desigForm.department}
                    onChange={e => setDesigForm({ ...desigForm, department: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem' }}
                  >
                    {departments.map(d => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Grade / Level</label>
                  <select
                    value={desigForm.level}
                    onChange={e => setDesigForm({ ...desigForm, level: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem' }}
                  >
                    {grades.map(g => (
                      <option key={g.id} value={`${g.code} ${g.title}`}>{g.code} - {g.title}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
                  <button type="button" onClick={() => setModalType(null)} style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #CBD5E1', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#0E7490', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Save Designation</button>
                </div>
              </form>
            )}

            {/* Branch Form */}
            {modalType === 'branch' && (
              <form onSubmit={handleSaveBranch} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Branch / Location Name <span style={{ color: '#EF4444' }}>*</span></label>
                  <input
                    type="text"
                    required
                    value={branchForm.name}
                    onChange={e => setBranchForm({ ...branchForm, name: e.target.value })}
                    placeholder="e.g. Coimbatore Regional Fabrication Unit"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Branch Code <span style={{ color: '#EF4444' }}>*</span></label>
                  <input
                    type="text"
                    required
                    value={branchForm.code}
                    onChange={e => setBranchForm({ ...branchForm, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. CJB-01"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>City, State <span style={{ color: '#EF4444' }}>*</span></label>
                  <input
                    type="text"
                    required
                    value={branchForm.location}
                    onChange={e => setBranchForm({ ...branchForm, location: e.target.value })}
                    placeholder="e.g. Coimbatore, Tamil Nadu"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
                  <button type="button" onClick={() => setModalType(null)} style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #CBD5E1', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#0E7490', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Save Location</button>
                </div>
              </form>
            )}

            {/* Grade Form */}
            {modalType === 'grade' && (
              <form onSubmit={handleSaveGrade} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Grade Code <span style={{ color: '#EF4444' }}>*</span></label>
                  <input
                    type="text"
                    required
                    value={gradeForm.code}
                    onChange={e => setGradeForm({ ...gradeForm, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. L1"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Grade Title <span style={{ color: '#EF4444' }}>*</span></label>
                  <input
                    type="text"
                    required
                    value={gradeForm.title}
                    onChange={e => setGradeForm({ ...gradeForm, title: e.target.value })}
                    placeholder="e.g. Senior Project Management"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Description</label>
                  <input
                    type="text"
                    value={gradeForm.description}
                    onChange={e => setGradeForm({ ...gradeForm, description: e.target.value })}
                    placeholder="e.g. Chief Engineer, Project Director"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
                  <button type="button" onClick={() => setModalType(null)} style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #CBD5E1', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#0E7490', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Save Grade</button>
                </div>
              </form>
            )}

            {/* Employment Type Form */}
            {modalType === 'type' && (
              <form onSubmit={handleSaveType} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Employment Type Name <span style={{ color: '#EF4444' }}>*</span></label>
                  <input
                    type="text"
                    required
                    value={typeForm.name}
                    onChange={e => setTypeForm({ ...typeForm, name: e.target.value })}
                    placeholder="e.g. Contractual Staff"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Code <span style={{ color: '#EF4444' }}>*</span></label>
                  <input
                    type="text"
                    required
                    value={typeForm.code}
                    onChange={e => setTypeForm({ ...typeForm, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. CONT"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
                  <button type="button" onClick={() => setModalType(null)} style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #CBD5E1', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#0E7490', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Save Type</button>
                </div>
              </form>
            )}

            {/* Employee Category Form */}
            {modalType === 'cat' && (
              <form onSubmit={handleSaveCat} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Category Name <span style={{ color: '#EF4444' }}>*</span></label>
                  <input
                    type="text"
                    required
                    value={catForm.name}
                    onChange={e => setCatForm({ ...catForm, name: e.target.value })}
                    placeholder="e.g. Fabrication Workshop Staff"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Category Code <span style={{ color: '#EF4444' }}>*</span></label>
                  <input
                    type="text"
                    required
                    value={catForm.code}
                    onChange={e => setCatForm({ ...catForm, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. FAB-CREW"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.88rem' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
                  <button type="button" onClick={() => setModalType(null)} style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #CBD5E1', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#0E7490', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Save Category</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
export default OrganizationSettings;
