import React, { useState, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { BarChart3, Download, FileText, Filter, Sliders, CalendarDays, CheckCircle2, ShieldAlert } from 'lucide-react';
import { toNum, formatCurrency } from '../../utils/numbers';
import { downloadCSV, downloadExcel, downloadPDF } from '../../utils/exportUtils';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { ExportDropdown } from '../common/ExportDropdown';
import { DateInput } from '../common/DateInput';

export const ReportsAnalytics: React.FC = () => {
  const { 
    employees, 
    attendanceRecords, 
    payrollRecords, 
    leaveRequests, 
    departments, 
    branches,
    sandwichPolicies 
  } = useHRMS();

  const [activeReportTab, setActiveReportTab] = useState<'attendance' | 'salary' | 'leave' | 'sandwich'>('attendance');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [selectedBranch, setSelectedBranch] = useState<string>('All');
  const [selectedLeaveType, setSelectedLeaveType] = useState<string>('All');
  const [selectedPolicy, setSelectedPolicy] = useState<string>('All');
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    return {
      start: `${y}-${m}-01`,
      end: `${y}-${m}-${String(lastDay).padStart(2, '0')}`
    };
  });

  const filteredAttendance = useMemo(() => {
    return attendanceRecords.filter(a => {
      const matchesDept = selectedDept === 'All' || a.department === selectedDept;
      const matchesDate = (!dateRange.start || a.date >= dateRange.start) && (!dateRange.end || a.date <= dateRange.end);
      return matchesDept && matchesDate;
    });
  }, [attendanceRecords, selectedDept, dateRange]);

  const filteredPayroll = useMemo(() => {
    return payrollRecords.filter(p => {
      const matchesDept = selectedDept === 'All' || p.department === selectedDept;
      return matchesDept;
    });
  }, [payrollRecords, selectedDept]);

  const filteredLeaves = useMemo(() => {
    return leaveRequests.filter(l => {
      const matchesDept = selectedDept === 'All' || l.department === selectedDept;
      const matchesDate = (!dateRange.start || l.endDate >= dateRange.start) && (!dateRange.end || l.startDate <= dateRange.end);
      return matchesDept && matchesDate;
    });
  }, [leaveRequests, selectedDept, dateRange]);

  // Filtered Sandwich Leave Applications
  const filteredSandwichLeaves = useMemo(() => {
    return leaveRequests.filter(l => {
      const emp = employees.find(e => e.employeeId === l.employeeId);
      const matchesDept = selectedDept === 'All' || l.department === selectedDept;
      const matchesBranch = selectedBranch === 'All' || !emp || (emp.workLocation || '').includes(selectedBranch);
      const matchesType = selectedLeaveType === 'All' || l.leaveType === selectedLeaveType;
      const matchesPolicy = selectedPolicy === 'All' || l.sandwichDetails?.appliedPolicyId === selectedPolicy;
      const matchesDate = (!dateRange.start || l.endDate >= dateRange.start) && (!dateRange.end || l.startDate <= dateRange.end);

      return matchesDept && matchesBranch && matchesType && matchesPolicy && matchesDate;
    });
  }, [leaveRequests, employees, selectedDept, selectedBranch, selectedLeaveType, selectedPolicy, dateRange]);

  const getStructuredAnalyticsData = () => {
    let columns: { key: string; label: string }[] = [];
    let data: Record<string, any>[] = [];

    if (activeReportTab === 'attendance') {
      columns = [
        { key: 'date', label: 'Date' },
        { key: 'employee', label: 'Employee' },
        { key: 'department', label: 'Department' },
        { key: 'status', label: 'Status' },
        { key: 'hours', label: 'Working Hours' }
      ];
      data = filteredAttendance.map(a => ({
        date: a.date,
        employee: a.employeeName,
        department: a.department,
        status: a.status,
        hours: toNum(a.workingHours)
      }));
    } else if (activeReportTab === 'salary') {
      columns = [
        { key: 'month', label: 'Month' },
        { key: 'employee', label: 'Employee' },
        { key: 'department', label: 'Department' },
        { key: 'basic', label: 'Basic Salary' },
        { key: 'net', label: 'Net Payout' }
      ];
      data = filteredPayroll.map(p => ({
        month: `${p.month} ${p.year}`,
        employee: p.employeeName,
        department: p.department,
        basic: toNum(p.basicSalary),
        net: toNum(p.netSalary)
      }));
    } else if (activeReportTab === 'sandwich') {
      columns = [
        { key: 'employee', label: 'Employee Name' },
        { key: 'employeeId', label: 'Employee ID' },
        { key: 'department', label: 'Department' },
        { key: 'leaveType', label: 'Leave Type' },
        { key: 'dates', label: 'Leave Dates' },
        { key: 'appliedDays', label: 'Applied Days' },
        { key: 'sandwichDays', label: 'Sandwich Days' },
        { key: 'totalDays', label: 'Total Leave Days' },
        { key: 'paidDays', label: 'Paid Days' },
        { key: 'unpaidDays', label: 'Unpaid Days' },
        { key: 'deductionAmount', label: 'Deduction Amount (₹)' },
        { key: 'policyApplied', label: 'Policy Applied' },
        { key: 'overrideStatus', label: 'HR Override' }
      ];
      data = filteredSandwichLeaves.map(l => {
        const emp = employees.find(e => e.employeeId === l.employeeId);
        const dailySalary = toNum(emp?.basicSalary || 30000) / 26;
        const unpaidDays = l.unpaidSandwichDays || (l.unpaidDaysCount ?? 0);
        const deduct = Math.round(unpaidDays * dailySalary);

        return {
          employee: l.employeeName,
          employeeId: l.employeeId,
          department: l.department,
          leaveType: l.leaveType,
          dates: `${formatDateDDMMYYYY(l.startDate)} to ${formatDateDDMMYYYY(l.endDate)}`,
          appliedDays: toNum(l.daysCount) - (l.sandwichDays || 0),
          sandwichDays: l.sandwichDays || 0,
          totalDays: l.daysCount,
          paidDays: l.paidDaysCount ?? (toNum(l.daysCount) - unpaidDays),
          unpaidDays,
          deductionAmount: deduct > 0 ? formatCurrency(deduct) : '₹0.00',
          policyApplied: l.sandwichDetails?.appliedPolicyName || 'Standard Policy',
          overrideStatus: l.hrOverride?.isOverridden ? 'Overridden by HR' : 'Standard'
        };
      });
    } else {
      columns = [
        { key: 'employee', label: 'Employee' },
        { key: 'department', label: 'Department' },
        { key: 'leaveType', label: 'Leave Type' },
        { key: 'startDate', label: 'Start Date' },
        { key: 'endDate', label: 'End Date' },
        { key: 'status', label: 'Status' }
      ];
      data = filteredLeaves.map(l => ({
        employee: l.employeeName,
        department: l.department,
        leaveType: l.leaveType,
        startDate: l.startDate,
        endDate: l.endDate,
        status: l.status
      }));
    }

    return { columns, data };
  };

  const handleExportCSV = () => {
    const { columns, data } = getStructuredAnalyticsData();
    downloadCSV(data, `Analytics_${activeReportTab.toUpperCase()}_${selectedDept.replace(/\s+/g, '_')}`, columns);
  };

  const handleExportExcel = () => {
    const { columns, data } = getStructuredAnalyticsData();
    downloadExcel(data, `Analytics_${activeReportTab.toUpperCase()}_${selectedDept.replace(/\s+/g, '_')}`, columns);
  };

  const handleExportPDF = () => {
    const { columns, data } = getStructuredAnalyticsData();
    downloadPDF(data, `${activeReportTab.toUpperCase()} Analytics Report`, `Analytics_${activeReportTab.toUpperCase()}_${selectedDept.replace(/\s+/g, '_')}`, columns);
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title-group">
          <h1>Reports & Analytics Center</h1>
          <p className="page-subtitle">
            Exportable executive reports for attendance, salary payouts, sandwich leave deductions, and department metrics
          </p>
        </div>
        <div className="header-actions">
          <ExportDropdown 
            onExportExcel={handleExportExcel}
            onExportPDF={handleExportPDF}
            onExportCSV={handleExportCSV}
            label="Download"
          />
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={16} color="var(--primary-600)" />
            <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Department:</label>
            <select className="form-control" style={{ width: '150px', padding: '6px' }} value={selectedDept} onChange={e => setSelectedDept(e.target.value)}>
              <option value="All">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </div>

          {activeReportTab === 'sandwich' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Branch:</label>
                <select className="form-control" style={{ width: '140px', padding: '6px' }} value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}>
                  <option value="All">All Branches</option>
                  {branches.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Sandwich Policy:</label>
                <select className="form-control" style={{ width: '180px', padding: '6px' }} value={selectedPolicy} onChange={e => setSelectedPolicy(e.target.value)}>
                  <option value="All">All Policies</option>
                  {sandwichPolicies.map(p => <option key={p.id} value={p.id}>{p.policyName}</option>)}
                </select>
              </div>
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Start Date:</label>
            <DateInput className="form-control" style={{ width: '140px', padding: '6px' }} value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>End Date:</label>
            <DateInput className="form-control" style={{ width: '140px', padding: '6px' }} value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} />
          </div>
        </div>
      </div>

      {/* Report Type Tabs */}
      <div className="tab-container" style={{ marginBottom: '16px' }}>
        <button className={`tab-btn ${activeReportTab === 'attendance' ? 'active' : ''}`} onClick={() => setActiveReportTab('attendance')}>
          Attendance Summary Report
        </button>
        <button className={`tab-btn ${activeReportTab === 'salary' ? 'active' : ''}`} onClick={() => setActiveReportTab('salary')}>
          Salary & Payroll Report
        </button>
        <button className={`tab-btn ${activeReportTab === 'leave' ? 'active' : ''}`} onClick={() => setActiveReportTab('leave')}>
          Leave Usage Report
        </button>
        <button 
          className={`tab-btn ${activeReportTab === 'sandwich' ? 'active' : ''}`} 
          onClick={() => setActiveReportTab('sandwich')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Sliders size={14} />
          <span>Sandwich Leave Report</span>
        </button>
      </div>

      {/* Attendance Summary */}
      {activeReportTab === 'attendance' && (
        <div className="card">
          <h3 className="card-title">Attendance Executive Summary</h3>
          <div className="table-responsive">
            <table className="hrms-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Check In</th>
                  <th>Hours Worked</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttendance.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                      No attendance records found matching the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredAttendance.map(a => (
                    <tr key={a.id}>
                      <td>{formatDateDDMMYYYY(a.date)}</td>
                      <td>{a.employeeName}</td>
                      <td>{a.department}</td>
                      <td>{a.checkIn || '--'}</td>
                      <td>{a.workingHours} hrs</td>
                      <td><span className={`status-pill ${a.status.toLowerCase().replace(' ', '-')}`}>{a.status}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Salary & Payroll Summary */}
      {activeReportTab === 'salary' && (
        <div className="card">
          <h3 className="card-title">Salary & Payroll Payout Summary</h3>
          <div className="table-responsive">
            <table className="hrms-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Basic Salary</th>
                  <th>Allowances</th>
                  <th>Deductions</th>
                  <th>Net Payout</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayroll.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                      No payroll records found matching the selected department.
                    </td>
                  </tr>
                ) : (
                  filteredPayroll.map(p => (
                    <tr key={p.id}>
                      <td>{p.month} {p.year}</td>
                      <td>{p.employeeName}</td>
                      <td>{p.department}</td>
                      <td>{formatCurrency(p.basicSalary)}</td>
                      <td>{formatCurrency(p.allowances)}</td>
                      <td style={{ color: '#EF4444' }}>
                        -{formatCurrency(toNum(p.taxDeduction) + toNum(p.leaveDeduction) + toNum(p.advanceDeduction) + toNum(p.epfDeduction) + toNum(p.esiDeduction) + toNum(p.professionalTax))}
                      </td>
                      <td><strong>{formatCurrency(p.netSalary)}</strong></td>
                      <td><span className={`status-pill ${p.status.toLowerCase()}`}>{p.status}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Leave Usage Report */}
      {activeReportTab === 'leave' && (
        <div className="card">
          <h3 className="card-title">Leave Usage Summary</h3>
          <div className="table-responsive">
            <table className="hrms-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Leave Type</th>
                  <th>Duration</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeaves.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                      No leave requests found matching the selected department and dates.
                    </td>
                  </tr>
                ) : (
                  filteredLeaves.map(l => (
                    <tr key={l.id}>
                      <td>{l.employeeName}</td>
                      <td>{l.department}</td>
                      <td>{l.leaveType}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDateDDMMYYYY(l.startDate)} to {formatDateDDMMYYYY(l.endDate)} ({l.daysCount} days)</td>
                      <td>
                        <span 
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '3px 12px',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            borderRadius: '999px',
                            lineHeight: 1.3,
                            whiteSpace: 'nowrap',
                            backgroundColor: l.status === 'Approved' ? '#DCFCE7' : l.status === 'Rejected' ? '#FEE2E2' : '#EFF6FF',
                            color: l.status === 'Approved' ? '#166534' : l.status === 'Rejected' ? '#DC2626' : '#1E40AF'
                          }}
                        >
                          {l.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SANDWICH LEAVE REPORT */}
      {activeReportTab === 'sandwich' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div>
              <h3 className="card-title" style={{ margin: 0 }}>Sandwich Leave Analytics Report</h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                Itemized breakdown of sandwich days, paid vs unpaid allocations, payroll deductions, and override statuses
              </p>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#0E7490', fontWeight: 700 }}>
              {filteredSandwichLeaves.length} Records Found
            </div>
          </div>

          <div className="table-responsive">
            <table className="hrms-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Leave Type</th>
                  <th>Duration</th>
                  <th>Applied Days</th>
                  <th>Sandwich Days</th>
                  <th>Total Days</th>
                  <th>Paid Days</th>
                  <th>Unpaid Days</th>
                  <th>Est. Deduction</th>
                  <th>Policy Applied</th>
                  <th>Override Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredSandwichLeaves.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      No leave applications found matching the sandwich filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredSandwichLeaves.map(l => {
                    const emp = employees.find(e => e.employeeId === l.employeeId);
                    const dailySalary = toNum(emp?.basicSalary || 30000) / 26;
                    const unpaidDays = l.unpaidSandwichDays || (l.unpaidDaysCount ?? 0);
                    const deduct = Math.round(unpaidDays * dailySalary);

                    return (
                      <tr key={l.id}>
                        <td>
                          <strong>{l.employeeName}</strong>
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{l.employeeId}</div>
                        </td>
                        <td>{l.department}</td>
                        <td>{l.leaveType}</td>
                        <td>
                          <div style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{formatDateDDMMYYYY(l.startDate)} → {formatDateDDMMYYYY(l.endDate)}</div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {toNum(l.daysCount) - (l.sandwichDays || 0)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {l.sandwichDays && l.sandwichDays > 0 ? (
                            <span style={{
                              fontWeight: 800,
                              color: '#0E7490',
                              backgroundColor: '#ECFEFF',
                              padding: '2px 8px',
                              borderRadius: '999px',
                              fontSize: '0.75rem'
                            }}>
                              +{l.sandwichDays}
                            </span>
                          ) : (
                            <span style={{ color: '#94A3B8' }}>0</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 800 }}>
                          {l.daysCount}
                        </td>
                        <td style={{ textAlign: 'center', color: '#166534', fontWeight: 700 }}>
                          {l.paidDaysCount ?? (toNum(l.daysCount) - unpaidDays)}
                        </td>
                        <td style={{ textAlign: 'center', color: unpaidDays > 0 ? '#DC2626' : '#64748B', fontWeight: unpaidDays > 0 ? 800 : 500 }}>
                          {unpaidDays}
                        </td>
                        <td style={{ fontWeight: 700, color: deduct > 0 ? '#DC2626' : '#166534' }}>
                          {deduct > 0 ? formatCurrency(deduct) : '₹0.00'}
                        </td>
                        <td>
                          <span style={{ fontSize: '0.78rem', color: '#0E7490', fontWeight: 600 }}>
                            {l.sandwichDetails?.appliedPolicyName || 'Standard Corporate'}
                          </span>
                        </td>
                        <td>
                          {l.hrOverride?.isOverridden ? (
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              backgroundColor: '#FEF3C7',
                              color: '#D97706',
                              padding: '2px 8px',
                              borderRadius: '6px'
                            }}>
                              Overridden
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                              Standard
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
