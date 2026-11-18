import React, { useState, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import {
  calculateCompanyPerformance,
  calculateSingleEmployeePerformance,
} from './performanceEngine';
import { PerformanceDashboardView } from './PerformanceDashboardView';
import { EmployeeDetailPerformanceView } from './EmployeeDetailPerformanceView';
import { getMonthInfo } from '../../utils/monthUtils';
import { Employee } from '../../types/hrms';

export const PerformanceTracking: React.FC = () => {
  const { currentUser, employees, attendanceRecords, enhancedTasks, orgStructure } = useHRMS();

  // Filters State
  const currentMonthInfo = useMemo(() => getMonthInfo(), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => currentMonthInfo.fullLabel);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('ALL');

  // CEO drilldown view state
  const [viewingEmpDetailId, setViewingEmpDetailId] = useState<string | null>(null);

  // Strict Role Rule: ONLY CEO (and Super Admin) can view full company-wide / all-employee performance.
  // All other roles (Employee, HR Manager, HR Admin, Finance Manager / Accounts, Department Manager, etc.)
  // must see ONLY their own personal performance.
  const isCeoFullAccess = useMemo(() => {
    const role = (currentUser?.role || '').trim();
    const desig = (currentUser?.designation || '').trim().toLowerCase();

    if (
      role === 'HR Manager' ||
      role === 'HR Admin' ||
      role === 'HR' ||
      role === 'Finance Manager' ||
      role === 'Department Manager' ||
      role === 'Department Head' ||
      role === 'Manager' ||
      role === 'Employee'
    ) {
      return false;
    }

    return (
      role === 'CEO' ||
      role === 'Super Admin' ||
      desig === 'ceo' ||
      desig.includes('chief executive') ||
      desig.includes('managing director')
    );
  }, [currentUser]);

  // Compute real data profiles
  const { employeeProfiles, companySummary } = useMemo(() => {
    return calculateCompanyPerformance(
      employees,
      attendanceRecords,
      enhancedTasks,
      orgStructure?.departments || []
    );
  }, [employees, attendanceRecords, enhancedTasks, orgStructure?.departments]);

  // Resolve target employee profile for personal view (Employee / HR / Accounts / Manager) or CEO drilldown
  const currentEmpProfile = useMemo(() => {
    if (!isCeoFullAccess) {
      const cleanEmpId = (currentUser?.employeeId || '').trim().toLowerCase();
      const cleanEmail = (currentUser?.email || '').trim().toLowerCase();
      const cleanUserId = (currentUser?.id || '').trim().toLowerCase();
      const cleanName = (currentUser?.name || '').trim().toLowerCase();

      // 1. Match in computed active employee profiles
      if (cleanEmpId) {
        const byEmpId = employeeProfiles.find(
          (e) => (e.employeeId || '').trim().toLowerCase() === cleanEmpId
        );
        if (byEmpId) return byEmpId;
      }

      // 2. Match in full employees list by employeeId, email, id, or full name
      const matchedEmp = (employees || []).find((e) => {
        if (cleanEmpId && (e.employeeId || '').trim().toLowerCase() === cleanEmpId) return true;
        if (cleanEmail && (e.email || '').trim().toLowerCase() === cleanEmail) return true;
        if (cleanUserId && (e.id || '').trim().toLowerCase() === cleanUserId) return true;
        const fullName = `${e.firstName || ''} ${e.lastName || ''}`.trim().toLowerCase();
        if (cleanName && fullName && fullName === cleanName) return true;
        return false;
      });

      if (matchedEmp) {
        const fromProfiles = employeeProfiles.find(
          (p) => (p.employeeId || '').trim().toLowerCase() === (matchedEmp.employeeId || '').trim().toLowerCase()
        );
        if (fromProfiles) return fromProfiles;
        return calculateSingleEmployeePerformance(matchedEmp, attendanceRecords, enhancedTasks);
      }

      // 3. Safe self-profile fallback (never falls back to another employee's record)
      const selfFallbackEmp: Employee = {
        id: currentUser?.id || currentUser?.employeeId || 'SELF',
        employeeId: currentUser?.employeeId || 'SELF',
        firstName: currentUser?.name || 'Employee',
        lastName: '',
        email: currentUser?.email || '',
        phone: '',
        dob: '',
        gender: 'Male',
        address: '',
        department: currentUser?.department || 'General',
        designation: currentUser?.designation || currentUser?.role || 'Staff',
        reportingManagerId: '',
        reportingManagerName: '',
        joiningDate: '',
        employmentType: 'Full-Time',
        status: 'Active',
        avatar: currentUser?.avatar || '',
        basicSalary: 0,
        allowances: { hra: 0, transport: 0, medical: 0, special: 0 },
        bankDetails: { bankName: '', accountNumber: '', ifscCode: '', branch: '' },
        attendanceMethod: 'Face Scan',
        gpsAllowed: true,
        faceRegistered: false,
        documents: [],
      };
      return calculateSingleEmployeePerformance(selfFallbackEmp, attendanceRecords, enhancedTasks);
    }

    if (viewingEmpDetailId) {
      return (
        employeeProfiles.find(
          (e) => (e.employeeId || '').trim().toLowerCase() === viewingEmpDetailId.trim().toLowerCase()
        ) || null
      );
    }

    return null;
  }, [
    isCeoFullAccess,
    currentUser,
    viewingEmpDetailId,
    employeeProfiles,
    employees,
    attendanceRecords,
    enhancedTasks,
  ]);

  // ========================================================
  // 1. STRICT ROLE ISOLATION: NON-CEO ROLES (EMPLOYEE, HR, ACCOUNTS, MANAGERS) SEE ONLY OWN PERFORMANCE
  // ========================================================
  if (!isCeoFullAccess) {
    if (!currentEmpProfile) {
      return (
        <div style={{ padding: '32px', textAlign: 'center', color: '#64748B' }}>
          No performance record found for your employee profile.
        </div>
      );
    }

    return (
      <EmployeeDetailPerformanceView
        performance={currentEmpProfile}
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
        isDrilldownView={false}
      />
    );
  }

  // ========================================================
  // 2. CEO DRILLDOWN DETAIL VIEW FOR A SELECTED EMPLOYEE
  // ========================================================
  if (viewingEmpDetailId && currentEmpProfile) {
    return (
      <EmployeeDetailPerformanceView
        performance={currentEmpProfile}
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
        isDrilldownView={true}
        onBackToDashboard={() => {
          setViewingEmpDetailId(null);
          setSelectedEmployeeId('ALL');
        }}
      />
    );
  }

  // ========================================================
  // 3. CEO FULL COMPANY PERFORMANCE DASHBOARD VIEW
  // ========================================================
  return (
    <PerformanceDashboardView
      companySummary={companySummary}
      employeeProfiles={employeeProfiles}
      selectedMonth={selectedMonth}
      onMonthChange={setSelectedMonth}
      selectedDepartment={selectedDepartment}
      onDepartmentChange={setSelectedDepartment}
      selectedEmployeeId={selectedEmployeeId}
      onEmployeeChange={setSelectedEmployeeId}
      onViewEmployeeDetail={(empId) => setViewingEmpDetailId(empId)}
    />
  );
};
export default PerformanceTracking;
