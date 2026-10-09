import React, { useState } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { Employee } from '../../types/hrms';
import { AddEmployeeModal } from './AddEmployeeModal';
import { EmployeeProfile } from './EmployeeProfile';
import { OfferLetterModal } from './OfferLetterModal';
import { downloadCSV, downloadExcel, downloadPDF } from '../../utils/exportUtils';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { ExportDropdown } from '../common/ExportDropdown';
import { 
  Users, 
  UserCheck, 
  UserX, 
  Plus, 
  Search, 
  Download, 
  FileSpreadsheet,
  Eye, 
  Trash2, 
  Building,
  FileText,
  AlertCircle,
  Briefcase,
  MapPin,
  X,
  RotateCcw,
  Filter
} from 'lucide-react';
import { StandardFloatingActionBar } from '../common/StandardFloatingActionBar';

interface EmployeeListProps {
  openAddModal?: boolean;
  onCloseQuickAdd?: () => void;
}

export const EmployeeList: React.FC<EmployeeListProps> = ({ openAddModal, onCloseQuickAdd }) => {
  const { 
    employees, 
    deleteEmployee, 
    deleteMultipleEmployees,
    refreshEmployees,
    canDeleteEmployee, 
    searchQuery, 
    setSearchQuery, 
    departments, 
    designations, 
    branches, 
    currentUser 
  } = useHRMS();
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  const [selectedDesignation, setSelectedDesignation] = useState<string>('All');
  const [selectedLocation, setSelectedLocation] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');

  // Multi-row selection state
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);

  const handleToggleEmp = (id: string) => {
    setSelectedEmpIds(prev => 
      prev.includes(id) ? prev.filter(eId => eId !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (filteredEmployees.length > 0 && filteredEmployees.every(e => selectedEmpIds.includes(e.id))) {
      setSelectedEmpIds(prev => prev.filter(id => !filteredEmployees.some(e => e.id === id)));
    } else {
      const pageIds = filteredEmployees.map(e => e.id);
      setSelectedEmpIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(openAddModal || false);
  const [activeProfileEmp, setActiveProfileEmp] = useState<Employee | null>(null);
  const [showOfferLetterModal, setShowOfferLetterModal] = useState<boolean>(false);
  const [offerLetterEmp, setOfferLetterEmp] = useState<Employee | null>(null);

  // Delete modal state (supports single and multiple employees)
  const [deleteTargetEmps, setDeleteTargetEmps] = useState<Employee[]>([]);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const isEmployeeRole = currentUser.role === 'Employee';
  const isManagerRole = currentUser.role === 'Department Manager';
  const isCEO = 
    currentUser.role === 'CEO' || 
    currentUser.role === 'Super Admin' || 
    currentUser.role === 'HR Admin' || 
    currentUser.role === 'HR Manager' || 
    currentUser.designation === 'CEO' || 
    currentUser.employeeId === 'EMP-000';

  // Workforce Directory Scoping:
  // All authenticated company staff can browse company colleagues in the directory
  // Management actions (Add, Delete, Offer Letter, Checkboxes) are guarded by isCEO
  const roleScopedEmployees = employees.filter(e => 
    e.employeeId !== 'EMP-000' && 
    e.email?.toLowerCase() !== 'admin@businz.com' && 
    e.email?.toLowerCase() !== 'developer@businz.com' && 
    e.designation !== 'Super Administrator'
  );

  const getEmployeeDepartmentDisplay = (emp: Employee): string => {
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

  const getReportingManagerDisplay = (emp: Employee): string => {
    if (emp.reportingManagerName?.trim()) return emp.reportingManagerName;

    const designation = (emp.designation || '').trim().toLowerCase();
    if (designation === 'ceo' || designation.includes('chief executive') || designation.includes('owner')) {
      return 'Self / Board of Directors';
    }

    const owner = roleScopedEmployees.find(e => {
      const ownerDesignation = (e.designation || '').trim().toLowerCase();
      return ownerDesignation === 'ceo' || ownerDesignation.includes('chief executive') || ownerDesignation.includes('owner');
    });

    return owner ? `${owner.firstName} ${owner.lastName}`.trim() : currentUser.name || '-';
  };

  // Sync quick add trigger from layout header
  React.useEffect(() => {
    if (openAddModal) {
      setIsAddModalOpen(true);
    }
  }, [openAddModal]);

  // Filter scoped employees by search, dept, designation, location, status
  const filteredEmployees = roleScopedEmployees.filter(emp => {
    const matchesSearch = 
      emp.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.employeeId.toLowerCase().includes(searchQuery.toLowerCase());

    const departmentDisplay = getEmployeeDepartmentDisplay(emp);
    const matchesDept = (isManagerRole || selectedDepartment === 'All') 
      ? true 
      : departmentDisplay.toLowerCase() === selectedDepartment.toLowerCase();
    const matchesDesignation = selectedDesignation === 'All' || emp.designation === selectedDesignation;
    const matchesLocation = selectedLocation === 'All' || 
      (emp.workLocation && emp.workLocation.toLowerCase().includes(selectedLocation.toLowerCase())) ||
      (emp.address && emp.address.toLowerCase().includes(selectedLocation.toLowerCase()));
    const matchesStatus = selectedStatus === 'All' || emp.status === selectedStatus;

    return matchesSearch && matchesDept && matchesDesignation && matchesLocation && matchesStatus;
  });

  const exportColumns = [
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'firstName', label: 'First Name' },
    { key: 'lastName', label: 'Last Name' },
    { key: 'email', label: 'Email' },
    { key: 'department', label: 'Department' },
    { key: 'designation', label: 'Designation' },
    { key: 'joiningDate', label: 'Date of Joining' },
    { key: 'workLocation', label: 'Location' },
    { key: 'status', label: 'Status' }
  ];

  const getExportData = () => filteredEmployees.map(e => ({
    employeeId: e.employeeId,
    firstName: e.firstName,
    lastName: e.lastName,
    email: e.email,
    department: getEmployeeDepartmentDisplay(e),
    designation: e.designation,
    joiningDate: formatDateDDMMYYYY(e.joiningDate),
    workLocation: e.workLocation || 'Chennai HQ',
    status: e.status
  }));

  const handleExportCSV = () => {
    downloadCSV(getExportData(), `Employee_Directory_${new Date().toISOString().split('T')[0]}`, exportColumns);
  };

  const handleExportExcel = () => {
    downloadExcel(getExportData(), `Employee_Directory_${new Date().toISOString().split('T')[0]}`, exportColumns);
  };

  const handleExportPDF = () => {
    downloadPDF(getExportData(), 'Employee Directory Master Register', `Employee_Directory_${new Date().toISOString().split('T')[0]}`, exportColumns);
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1>Employee Directory{isEmployeeRole ? ' (My Profile)' : isManagerRole ? ` (${currentUser.department} Department)` : ''}</h1>
          <p className="page-subtitle">
            {isEmployeeRole 
              ? 'View and manage your personal employee profile details' 
              : isManagerRole 
              ? `Manage workforce records and profiles for the ${currentUser.department} department` 
              : 'Manage company-wide workforce records, department assignments, and employee profiles'}
          </p>
        </div>
        <div className="header-actions">
          {isCEO && (
            <button 
              type="button"
              className="btn btn-secondary btn-sm" 
              onClick={() => {
                setOfferLetterEmp(filteredEmployees[0] || null);
                setShowOfferLetterModal(true);
              }}
              title="Offer Letter Templates"
              aria-label="Offer Letter Templates"
              style={{ 
                width: '36px', 
                height: '36px', 
                padding: 0, 
                display: 'inline-flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                borderRadius: '10px'
              }}
            >
              <FileText size={16} color="#0E7490" />
            </button>
          )}
          <ExportDropdown 
            onExportExcel={handleExportExcel}
            onExportPDF={handleExportPDF}
            onExportCSV={handleExportCSV}
            label="Download"
          />
          {isCEO && (
            <button 
              type="button"
              id="add-employee-btn"
              className="btn btn-primary btn-sm" 
              onClick={() => setIsAddModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 16px',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.84rem'
              }}
            >
              <Plus size={16} /> Add Employee
            </button>
          )}
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="kpi-grid compact">
        <div className="kpi-card compact">
          <div className="kpi-card-header">
            <span>{isEmployeeRole ? 'My Profile Status' : isManagerRole ? 'Department Staff' : 'Total Employees'}</span>
            <div className="kpi-icon-wrapper blue"><Users size={16} /></div>
          </div>
          <div className="kpi-card-body">
            <div className="kpi-value">{roleScopedEmployees.length}</div>
          </div>
        </div>

        <div className="kpi-card compact">
          <div className="kpi-card-header">
            <span>Active Workforce</span>
            <div className="kpi-icon-wrapper emerald"><UserCheck size={16} /></div>
          </div>
          <div className="kpi-card-body">
            <div className="kpi-value">{roleScopedEmployees.filter(e => e.status === 'Active').length}</div>
          </div>
        </div>

        <div className="kpi-card compact">
          <div className="kpi-card-header">
            <span>On Leave</span>
            <div className="kpi-icon-wrapper rose"><UserX size={16} /></div>
          </div>
          <div className="kpi-card-body">
            <div className="kpi-value">{roleScopedEmployees.filter(e => e.status === 'On Leave').length}</div>
          </div>
        </div>

        <div className="kpi-card compact">
          <div className="kpi-card-header">
            <span>{isManagerRole ? 'Assigned Department' : 'Departments'}</span>
            <div className="kpi-icon-wrapper purple"><Building size={16} /></div>
          </div>
          <div className="kpi-card-body">
            <div className="kpi-value">{isManagerRole ? 1 : departments.length}</div>
          </div>
        </div>
      </div>

      {/* Unified Single-Line Filter Bar */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: '20px' }}>
        <div className="employee-filters-bar" style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '12px',
          flexWrap: 'wrap'
        }}>
          {/* Search by Employee ID / Name / Email */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1.4 1 240px', minWidth: '220px' }}>
            <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Search Employee
            </label>
            <div style={{ position: 'relative' }}>
              <Search 
                size={16} 
                style={{ 
                  position: 'absolute', 
                  left: '12px', 
                  top: '50%', 
                  transform: 'translateY(-50%)', 
                  color: '#64748B',
                  pointerEvents: 'none' 
                }} 
              />
              <input 
                type="text"
                id="employee-search-input"
                placeholder="Search by Employee ID (e.g. EMP-001), Name, or Email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="form-control"
                style={{
                  width: '100%',
                  height: '40px',
                  paddingLeft: '38px',
                  paddingRight: searchQuery ? '36px' : '12px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.84rem',
                  backgroundColor: '#FFFFFF',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94A3B8',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: '6px'
                  }}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>

          {/* Department */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 160px', minWidth: '150px' }}>
            <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Department
            </label>
            <select 
              className="form-control" 
              style={{ width: '100%', height: '40px', padding: '6px 12px', fontSize: '0.84rem', borderRadius: '10px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF' }}
              value={isManagerRole ? currentUser.department : selectedDepartment} 
              onChange={e => setSelectedDepartment(e.target.value)}
              disabled={isManagerRole || isEmployeeRole}
            >
              <option value="All">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.name}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Designation */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 160px', minWidth: '150px' }}>
            <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Designation
            </label>
            <select 
              className="form-control" 
              style={{ width: '100%', height: '40px', padding: '6px 12px', fontSize: '0.84rem', borderRadius: '10px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF' }}
              value={selectedDesignation} 
              onChange={e => setSelectedDesignation(e.target.value)}
            >
              <option value="All">All Designations</option>
              {designations.map(des => (
                <option key={des.id} value={des.title}>{des.title}</option>
              ))}
            </select>
          </div>

          {/* Location */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 150px', minWidth: '140px' }}>
            <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Location
            </label>
            <select 
              className="form-control" 
              style={{ width: '100%', height: '40px', padding: '6px 12px', fontSize: '0.84rem', borderRadius: '10px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF' }}
              value={selectedLocation} 
              onChange={e => setSelectedLocation(e.target.value)}
            >
              <option value="All">All Locations</option>
              {branches.map(b => (
                <option key={b.id} value={b.name}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 140px', minWidth: '130px' }}>
            <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Status
            </label>
            <select 
              className="form-control" 
              style={{ width: '100%', height: '40px', padding: '6px 12px', fontSize: '0.84rem', borderRadius: '10px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF' }}
              value={selectedStatus} 
              onChange={e => setSelectedStatus(e.target.value)}
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="On Leave">On Leave</option>
              <option value="Terminated">Terminated</option>
            </select>
          </div>

          {/* Reset Filters */}
          {(searchQuery || selectedDepartment !== 'All' || selectedDesignation !== 'All' || selectedLocation !== 'All' || selectedStatus !== 'All') && (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', flex: '0 0 auto' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedDepartment('All');
                  setSelectedDesignation('All');
                  setSelectedLocation('All');
                  setSelectedStatus('All');
                }}
                style={{
                  height: '40px',
                  padding: '0 14px',
                  borderRadius: '10px',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: '#64748B'
                }}
                title="Reset all filters"
              >
                <RotateCcw size={14} /> Reset
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="table-responsive">
        <table className="hrms-table" style={{ width: '100%', minWidth: '1000px' }}>
          <thead>
            <tr>
              <th style={{ width: '40px', minWidth: '40px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={filteredEmployees.length > 0 && filteredEmployees.every(e => selectedEmpIds.includes(e.id))}
                  onChange={handleToggleSelectAll}
                  style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                  aria-label="Select all employees"
                />
              </th>
              <th>Employee</th>
              <th>Department</th>
              <th>Designation</th>
              <th>Reporting Manager</th>
              <th>Type</th>
              <th>Join Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No employees matched your criteria.
                </td>
              </tr>
            ) : (
              filteredEmployees.map(emp => {
                const isSelected = selectedEmpIds.includes(emp.id);

                return (
                  <tr 
                    key={emp.id}
                    style={{
                      backgroundColor: isSelected ? '#ECFEFF' : undefined,
                      borderLeft: isSelected ? '4px solid #0E7490' : undefined,
                      transition: 'background-color 0.15s ease'
                    }}
                  >
                    <td style={{ textAlign: 'center', verticalAlign: 'middle', width: '40px' }} onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleEmp(emp.id)}
                        style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                        aria-label={`Select employee ${emp.firstName}`}
                      />
                    </td>
                    <td>
                      <div className="user-cell">
                        {emp.avatar ? (
                          <img src={emp.avatar} alt={emp.firstName} className="user-cell-img" />
                        ) : (
                          <div 
                            className="user-cell-img"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: 'var(--color-primary-light)',
                              color: 'var(--color-primary-blue)',
                              fontWeight: 700,
                              fontSize: '0.78rem',
                              border: '1px solid #cffafe',
                              borderRadius: '9999px',
                              flexShrink: 0
                            }}
                          >
                            {emp.firstName?.[0] || ''}{emp.lastName?.[0] || ''}
                          </div>
                        )}
                        <div className="user-cell-info">
                          <span className="user-cell-name">{emp.firstName} {emp.lastName}</span>
                          <span className="user-cell-sub">{emp.employeeId} • {emp.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>{getEmployeeDepartmentDisplay(emp)}</td>
                    <td>{emp.designation}</td>
                    <td>{getReportingManagerDisplay(emp)}</td>
                    <td>{emp.employmentType}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateDDMMYYYY(emp.joiningDate)}</td>
                    <td>
                      <span className={`status-pill ${emp.status.toLowerCase().replace(' ', '-')}`}>
                        {emp.status}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', width: '80px' }}>
                      <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                        <button 
                          type="button"
                          title="View Profile"
                          aria-label="View Profile"
                          onClick={() => setActiveProfileEmp(emp)}
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            border: '1px solid #E2E8F0',
                            background: '#F8FAFC',
                            color: '#0E7490',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            padding: 0,
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#ECFEFF';
                            e.currentTarget.style.borderColor = '#A5F3FC';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#F8FAFC';
                            e.currentTarget.style.borderColor = '#E2E8F0';
                          }}
                        >
                          <Eye size={14} />
                        </button>

                        {isCEO && (
                          <button 
                            type="button"
                            title="Generate / View Offer Letter"
                            aria-label="Generate / View Offer Letter"
                            onClick={() => {
                              setOfferLetterEmp(emp);
                              setShowOfferLetterModal(true);
                            }}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              border: '1px solid #E2E8F0',
                              background: '#F8FAFC',
                              color: '#64748B',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              padding: 0,
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#ECFEFF';
                              e.currentTarget.style.borderColor = '#A5F3FC';
                              e.currentTarget.style.color = '#0E7490';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#F8FAFC';
                              e.currentTarget.style.borderColor = '#E2E8F0';
                              e.currentTarget.style.color = '#64748B';
                            }}
                          >
                            <FileText size={14} />
                          </button>
                        )}

                        {isCEO && (
                          <button 
                            type="button"
                            title="Delete Employee"
                            aria-label="Delete Employee"
                            onClick={() => setDeleteTargetEmps([emp])}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              border: '1px solid #FEE2E2',
                              background: '#FEF2F2',
                              color: '#EF4444',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              padding: 0,
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#FEE2E2';
                              e.currentTarget.style.borderColor = '#FCA5A5';
                              e.currentTarget.style.color = '#DC2626';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#FEF2F2';
                              e.currentTarget.style.borderColor = '#FEE2E2';
                              e.currentTarget.style.color = '#EF4444';
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Floating Action Bar per AGENTS.md */}
      <StandardFloatingActionBar
        selectedCount={selectedEmpIds.length}
        onClearSelection={() => setSelectedEmpIds([])}
        onEdit={selectedEmpIds.length === 1 ? () => {
          const emp = filteredEmployees.find(e => e.id === selectedEmpIds[0]);
          if (emp) setActiveProfileEmp(emp);
        } : undefined}
        onDelete={() => {
          if (selectedEmpIds.length > 0) {
            const emps = filteredEmployees.filter(e => selectedEmpIds.includes(e.id));
            setDeleteTargetEmps(emps);
          }
        }}
        customActions={
          isCEO && selectedEmpIds.length === 1 ? (
            <button
              type="button"
              className="action-bar-btn"
              onClick={() => {
                const emp = filteredEmployees.find(e => e.id === selectedEmpIds[0]);
                if (emp) {
                  setOfferLetterEmp(emp);
                  setShowOfferLetterModal(true);
                }
              }}
            >
              <FileText size={14} />
              <span>Offer Letter</span>
            </button>
          ) : undefined
        }
      />

      {/* Add Employee Modal */}
      {isAddModalOpen && (
        <AddEmployeeModal 
          isOpen={isAddModalOpen} 
          onClose={() => {
            setIsAddModalOpen(false);
            if (onCloseQuickAdd) onCloseQuickAdd();
          }} 
          onGenerateOfferLetter={(newEmp) => {
            setIsAddModalOpen(false);
            if (onCloseQuickAdd) onCloseQuickAdd();
            setOfferLetterEmp(newEmp);
            setShowOfferLetterModal(true);
          }}
        />
      )}

      {/* Employee Connected Profile Modal */}
      {activeProfileEmp && (() => {
        const liveEmp = employees.find(e => (e.id && (e.id === activeProfileEmp.id || e.id === activeProfileEmp.employeeId)) || (e.employeeId && (e.employeeId === activeProfileEmp.employeeId || e.employeeId === activeProfileEmp.id))) || activeProfileEmp;
        return (
          <EmployeeProfile 
            employee={liveEmp} 
            onClose={() => setActiveProfileEmp(null)} 
          />
        );
      })()}

      {/* Offer Letter Generator & Preview Modal */}
      {showOfferLetterModal && (
        <OfferLetterModal
          isOpen={showOfferLetterModal}
          onClose={() => setShowOfferLetterModal(false)}
          initialEmployee={offerLetterEmp}
        />
      )}

      {/* Delete Employee Confirmation & Dependency Check Modal (Single and Multi) */}
      {deleteTargetEmps.length > 0 && (() => {
        const deleteResults = deleteTargetEmps.map(emp => ({
          emp,
          ...canDeleteEmployee(emp.employeeId)
        }));
        const eligibleEmps = deleteResults.filter(r => r.canDelete).map(r => r.emp);
        const blockedEmps = deleteResults.filter(r => !r.canDelete);
        const isSingle = deleteTargetEmps.length === 1;

        const handleConfirmDeletion = async () => {
          if (eligibleEmps.length === 0 || isDeleting) return;
          setIsDeleting(true);
          try {
            const idsToDelete = eligibleEmps.map(e => e.id || e.employeeId);
            let res: any;
            if (idsToDelete.length === 1) {
              res = await deleteEmployee(idsToDelete[0]);
            } else {
              res = await deleteMultipleEmployees(idsToDelete);
            }
            if (res && res.success === false) {
              return;
            }
            setSelectedEmpIds(prev => prev.filter(id => !idsToDelete.includes(id)));
            setDeleteTargetEmps([]);
          } catch (delErr) {
            console.error('Delete action failed:', delErr);
          } finally {
            setIsDeleting(false);
          }
        };

        return (
          <div className="modal-overlay" style={{ zIndex: 1100 }}>
            <div className="modal-content" style={{ maxWidth: '520px', borderRadius: 'var(--radius-dialog)' }}>
              <div className="modal-header" style={{ alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    backgroundColor: eligibleEmps.length > 0 ? '#FEE2E2' : '#FEF3C7',
                    color: eligibleEmps.length > 0 ? '#EF4444' : '#F59E0B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {eligibleEmps.length > 0 ? <Trash2 size={20} /> : <AlertCircle size={20} />}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                      {isSingle
                        ? (eligibleEmps.length > 0 ? 'Delete Employee Record' : 'Deletion Blocked by System')
                        : `Delete ${deleteTargetEmps.length} Selected Employees`}
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                      {isSingle 
                        ? `User ID: ${deleteTargetEmps[0].employeeId}`
                        : `${eligibleEmps.length} eligible, ${blockedEmps.length} blocked`}
                    </p>
                  </div>
                </div>
                <button 
                  className="btn-icon" 
                  disabled={isDeleting}
                  onClick={() => setDeleteTargetEmps([])}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="modal-body" style={{ padding: '20px 24px' }}>
                {eligibleEmps.length > 0 && (
                  <div style={{ marginBottom: blockedEmps.length > 0 ? '16px' : '0' }}>
                    <p style={{ fontSize: '0.92rem', color: 'var(--color-text-primary)', marginBottom: '10px' }}>
                      {isSingle ? (
                        <>Are you sure you want to permanently delete <strong>{eligibleEmps[0].firstName} {eligibleEmps[0].lastName}</strong> ({eligibleEmps[0].employeeId})?</>
                      ) : (
                        <>Are you sure you want to delete the following <strong>{eligibleEmps.length}</strong> employee(s)?</>
                      )}
                    </p>

                    {!isSingle && (
                      <div style={{
                        maxHeight: '120px',
                        overflowY: 'auto',
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '10px',
                        padding: '8px 12px',
                        marginBottom: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}>
                        {eligibleEmps.map(e => (
                          <div key={e.id} style={{ fontSize: '0.84rem', display: 'flex', justifyContent: 'space-between' }}>
                            <span><strong>{e.firstName} {e.lastName}</strong> ({e.department})</span>
                            <span style={{ fontFamily: 'monospace', color: '#64748B' }}>{e.employeeId}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{
                      backgroundColor: '#FEF2F2',
                      border: '1px solid #FEE2E2',
                      color: '#991B1B',
                      padding: '12px',
                      borderRadius: 'var(--radius-input)',
                      fontSize: '0.82rem'
                    }}>
                      ⚠️ This will permanently remove the record from VPS database, attendance logs, and auth credentials.
                    </div>
                  </div>
                )}

                {blockedEmps.length > 0 && (
                  <div style={{
                    backgroundColor: '#FFFBEB',
                    border: '1px solid #FEF3C7',
                    color: '#92400E',
                    padding: '14px',
                    borderRadius: 'var(--radius-input)',
                    fontSize: '0.86rem',
                    lineHeight: '1.5'
                  }}>
                    <strong style={{ display: 'block', marginBottom: '6px' }}>
                      ⚠️ {blockedEmps.length} employee(s) cannot be deleted due to active enterprise dependencies:
                    </strong>
                    <ul style={{ margin: '0 0 0 18px', padding: 0, fontSize: '0.82rem' }}>
                      {blockedEmps.map(b => (
                        <li key={b.emp.id} style={{ marginBottom: '4px' }}>
                          <strong>{b.emp.firstName} {b.emp.lastName}</strong>: {b.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="modal-footer" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  disabled={isDeleting}
                  onClick={() => setDeleteTargetEmps([])}
                >
                  Cancel
                </button>
                {eligibleEmps.length > 0 && (
                  <button 
                    type="button" 
                    className="btn btn-danger" 
                    disabled={isDeleting}
                    onClick={handleConfirmDeletion}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Trash2 size={16} />
                    {isDeleting 
                      ? 'Deleting from Cloud...' 
                      : (isSingle ? 'Confirm Deletion' : `Delete ${eligibleEmps.length} Selected`)}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

