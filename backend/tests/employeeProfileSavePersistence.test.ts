import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import { app } from '../src/app.js';
import * as dbModule from '../src/config/database.js';
import { employeeRepository } from '../src/repositories/employeeRepository.js';

describe('BUSINZ HRMS — Employee Profile Save & PostgreSQL Persistence Suite', () => {
  const hrToken = jwt.sign(
    {
      id: 'usr-001',
      email: 'hr@vrmstructures.com',
      role: 'HR Manager',
      employeeId: 'EMP-001',
      name: 'Pavithra HR',
      company_id: 'company-a',
    },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const employeeToken = jwt.sign(
    {
      id: 'usr-004',
      email: 'field@vrmstructures.com',
      role: 'Employee',
      employeeId: 'EMP-004',
      name: 'Karthik Rajan',
      company_id: 'company-a',
    },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Simulated PostgreSQL in-memory state to verify real parameterized SQL queries & transaction commits
  let dbEmployeeRow: Record<string, any>;
  let dbShifts: Record<string, any>[];
  let dbShiftAssignments: Record<string, any>[];
  let dbWeeklyOffAssignments: Record<string, any>[];
  let dbSalaryStructures: Record<string, any>[];
  let dbPayrollRecords: Record<string, any>[];
  let dbAttendanceRecords: Record<string, any>[];
  let dbDocuments: Record<string, any>[];
  let dbAuditLogs: Record<string, any>[];
  let dbCompanySettings: Record<string, any>;

  beforeEach(() => {
    vi.restoreAllMocks();

    dbEmployeeRow = {
      id: 'e01a1111-0000-0000-0000-000000000004',
      company_id: 'company-a',
      employee_id: 'EMP-004',
      first_name: 'Karthik',
      last_name: 'Rajan',
      email: 'field@vrmstructures.com',
      phone: '9876543210',
      dob: '1996-05-14',
      gender: 'Male',
      address: 'No. 10, Anna Salai, Chennai',
      department_id: 'dept-ops-001',
      department_name: 'Operations',
      designation: 'Site Engineer',
      reporting_manager_id: 'e01a1111-0000-0000-0000-000000000001',
      reporting_manager_name: 'Pavithra HR',
      joining_date: '2025-01-15',
      employment_type: 'Full-Time',
      status: 'Active',
      avatar_url: '',
      basic_salary: 18000,
      allowances_hra: 9000,
      allowances_transport: 1500,
      allowances_medical: 1250,
      allowances_special: 250,
      bank_name: 'State Bank of India',
      account_number: '001122334455',
      ifsc_code: 'SBIN0001234',
      branch: 'Chennai Mount Road',
      attendance_method: 'Face Scan',
      gps_allowed: true,
      work_shift: 'General Shift',
      pan_number: 'ABCDE1234F',
      uan_number: '100200300400',
      address_line1: 'No. 10, Anna Salai',
      address_line2: 'Floor 2',
      city: 'Chennai',
      state: 'Tamil Nadu',
      country: 'India',
      pincode: '600002',
      highest_qualification: 'B.E / B.Tech',
      degree_name: 'B.E Civil',
      specialization: 'Civil Engineering',
      university: 'Anna University',
      year_of_passing: 2018,
      grade_percentage: 82.5,
      experience_profile: 'Fresher',
      total_experience: 0,
      previous_company: null,
      previous_designation: null,
      previous_department: null,
      employment_start_date: null,
      employment_end_date: null,
      last_drawn_salary: null,
      previous_company_location: null,
      password: '$2b$10$originalHashedPasswordValueDoNotChange123456',
      must_change_password: false,
      account_status: 'ACTIVE',
      payroll_eligible: true,
      row_version: 1,
      profile_data: {
        firstName: 'Karthik',
        lastName: 'Rajan',
        department: 'Operations',
        designation: 'Site Engineer',
        workShift: 'General Shift',
        shiftDetails: { assignedShift: 'General Shift', weeklyOff: 'Sunday Only' },
        salaryDetails: {
          monthlyCtc: 30000,
          basicSalary: 12000,
          da: 6000,
          conveyance: 1500,
          hra: 10500,
          withPf: true,
          panNumber: 'ABCDE1234F',
          uanNumber: '100200300400',
        },
      },
    };

    dbShifts = [
      { id: 'shift-gen-01', company_id: 'company-a', shift_name: 'General Shift', start_time: '09:30:00', end_time: '18:30:00', grace_period_mins: 15 },
      { id: 'shift-night-02', company_id: 'company-a', shift_name: 'Night Shift', start_time: '21:00:00', end_time: '06:00:00', grace_period_mins: 15 },
    ];
    dbShiftAssignments = [
      { id: 'sa-1', company_id: 'company-a', employee_id: dbEmployeeRow.id, shift_id: 'shift-gen-01', effective_from: '2026-01-01', effective_to: null },
    ];
    dbWeeklyOffAssignments = [];
    dbSalaryStructures = [];
    dbPayrollRecords = [
      {
        id: 'pr-draft-1',
        employee_id: dbEmployeeRow.id,
        payroll_run_id: 'run-draft-1',
        payroll_month: 10,
        payroll_year: 2026,
        status: 'DRAFT',
        working_days: 26,
        present_days: 26,
        basic_salary: 12000,
        gross_salary: 30000,
        net_salary: 28000,
      },
      {
        id: 'pr-paid-1',
        employee_id: dbEmployeeRow.id,
        payroll_run_id: 'run-paid-1',
        payroll_month: 9,
        payroll_year: 2026,
        status: 'PAID',
        working_days: 26,
        present_days: 26,
        basic_salary: 12000,
        gross_salary: 30000,
        net_salary: 28000,
      },
    ];
    dbAttendanceRecords = [
      { id: 'att-future', employee_id: dbEmployeeRow.id, shift_id: 'shift-gen-01', shift_date: '2026-10-29', is_finalized: false, late_status: 'On Time' },
      { id: 'att-finalized', employee_id: dbEmployeeRow.id, shift_id: 'shift-gen-01', shift_date: '2026-10-01', is_finalized: true, late_status: 'On Time' },
    ];
    dbDocuments = [];
    dbAuditLogs = [];
    dbCompanySettings = {
      'EMP-004': {
        firstName: 'Karthik',
        lastName: 'Rajan',
        department: 'Operations',
        designation: 'Site Engineer',
        password: 'OriginalPlainPassword@123',
        mustChangePassword: false,
      },
    };

    vi.spyOn(employeeRepository, 'findByEmail').mockResolvedValue(null);

    vi.spyOn(dbModule, 'withTransaction').mockImplementation(async (work: any) => {
      const mockClient: any = {
        query: async (sql: string, params: any[] = []) => {
          const norm = sql.replace(/\s+/g, ' ').trim();
          if (norm.startsWith('ALTER TABLE') || norm.startsWith('CREATE TABLE')) {
            return { rows: [], rowCount: 0 };
          }
          if (norm.includes('FROM public.employees e') && norm.includes('FOR UPDATE OF e')) {
            const targetId = params[params.length - 1];
            if (targetId === dbEmployeeRow.id || String(targetId).toLowerCase() === dbEmployeeRow.employee_id.toLowerCase()) {
              return { rows: [{ ...dbEmployeeRow }], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
          }
          if (norm.includes('FROM public.departments')) {
            const nameOrId = String(params[0] || '').toLowerCase();
            if (nameOrId === 'engineering' || nameOrId === 'dept-eng-002') {
              return { rows: [{ id: 'dept-eng-002', name: 'Engineering' }], rowCount: 1 };
            }
            if (nameOrId === 'operations' || nameOrId === 'dept-ops-001') {
              return { rows: [{ id: 'dept-ops-001', name: 'Operations' }], rowCount: 1 };
            }
            if (nameOrId === 'hr' || nameOrId === 'human resources') {
              return { rows: [{ id: 'dept-hr-001', name: 'Human Resources' }], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
          }
          if (norm.startsWith('INSERT INTO public.departments')) {
            return { rows: [{ id: 'dept-new-999', name: params[0] }], rowCount: 1 };
          }
          if (norm.includes('FROM public.employees WHERE (id::text = $1')) {
            return { rows: [{ id: 'e01a1111-0000-0000-0000-000000000001', first_name: 'Pavithra', last_name: 'HR' }], rowCount: 1 };
          }
          if (norm.startsWith('UPDATE public.employees SET')) {
            dbEmployeeRow = {
              ...dbEmployeeRow,
              first_name: params[1],
              last_name: params[2],
              email: params[3],
              phone: params[4],
              dob: params[5],
              gender: params[6],
              address: params[7],
              department_id: params[8],
              designation: params[9],
              reporting_manager_id: params[10],
              reporting_manager_name: params[11],
              joining_date: params[12],
              employment_type: params[13],
              status: params[14],
              avatar_url: params[15],
              basic_salary: params[16],
              allowances_hra: params[17],
              allowances_transport: params[18],
              allowances_medical: params[19],
              allowances_special: params[20],
              bank_name: params[21],
              account_number: params[22],
              ifsc_code: params[23],
              branch: params[24],
              attendance_method: params[25],
              gps_allowed: params[26],
              work_shift: params[27],
              pan_number: params[28],
              uan_number: params[29],
              address_line1: params[30],
              address_line2: params[31],
              city: params[32],
              state: params[33],
              country: params[34],
              pincode: params[35],
              highest_qualification: params[36],
              degree_name: params[37],
              specialization: params[38],
              university: params[39],
              year_of_passing: params[40],
              grade_percentage: params[41],
              experience_profile: params[42],
              total_experience: params[43],
              previous_company: params[44],
              previous_designation: params[45],
              previous_department: params[46],
              employment_start_date: params[47],
              employment_end_date: params[48],
              last_drawn_salary: params[49],
              previous_company_location: params[50],
              profile_data: JSON.parse(params[51]),
              account_status: params[52],
              payroll_eligible: params[53],
              row_version: Number(dbEmployeeRow.row_version) + 1,
            };
            return { rows: [{ ...dbEmployeeRow }], rowCount: 1 };
          }
          if (norm.includes('FROM public.shifts')) {
            const match = dbShifts.find(
              s => s.id === params[1] || s.shift_name.toLowerCase() === String(params[1] || '').toLowerCase() || s.shift_name.toLowerCase() === String(params[2] || '').toLowerCase()
            );
            return { rows: match ? [match] : [], rowCount: match ? 1 : 0 };
          }
          if (norm.includes('FROM public.shift_assignments WHERE employee_id=$1 AND effective_from<=$2')) {
            return { rows: dbShiftAssignments, rowCount: dbShiftAssignments.length };
          }
          if (norm.startsWith('UPDATE public.shift_assignments SET effective_to=')) {
            return { rows: [], rowCount: 1 };
          }
          if (norm.includes('SELECT min(effective_from) AS next_date FROM public.shift_assignments')) {
            return { rows: [{ next_date: null }], rowCount: 1 };
          }
          if (norm.startsWith('INSERT INTO public.shift_assignments')) {
            dbShiftAssignments.push({
              company_id: params[0],
              employee_id: params[1],
              shift_id: params[2],
              effective_from: params[3],
              effective_to: params[4],
            });
            return { rows: [], rowCount: 1 };
          }
          if (norm.startsWith('UPDATE public.attendance_records SET shift_id=$2')) {
            for (const att of dbAttendanceRecords) {
              if (att.employee_id === params[0] && att.shift_date >= params[6] && !att.is_finalized) {
                att.shift_id = params[1];
                att.shift_policy_snapshot = { shiftId: params[1], shiftName: params[2] };
              }
            }
            return { rows: [], rowCount: 1 };
          }
          if (norm.startsWith('UPDATE public.employee_weekly_off_assignments')) {
            return { rows: [], rowCount: 0 };
          }
          if (norm.includes('FROM public.employee_weekly_off_assignments')) {
            return { rows: [{ next_date: null }], rowCount: 1 };
          }
          if (norm.startsWith('INSERT INTO public.employee_weekly_off_assignments')) {
            dbWeeklyOffAssignments.push({
              company_id: params[0],
              employee_id: params[1],
              schedule_name: params[2],
              effective_from: params[3],
            });
            return { rows: [], rowCount: 1 };
          }
          if (norm.startsWith('UPDATE public.salary_structures SET effective_to=')) {
            return { rows: [], rowCount: 0 };
          }
          if (norm.includes('SELECT min(effective_from) next_date FROM public.salary_structures')) {
            return { rows: [{ next_date: null }], rowCount: 1 };
          }
          if (norm.includes('SELECT id FROM public.salary_structures')) {
            return { rows: [], rowCount: 0 };
          }
          if (norm.startsWith('INSERT INTO public.salary_structures')) {
            const newStruct = {
              id: 'ss-new-001',
              employee_id: params[0],
              company_id: params[1],
              monthly_salary: params[2],
              basic_percentage: params[3],
              da_percentage: params[4],
              conveyance_percentage: params[5],
              hra_percentage: params[6],
              effective_from: params[7],
              component_values: JSON.parse(params[9]),
              salary_scheme: params[10],
              with_pf: params[11],
            };
            dbSalaryStructures.push(newStruct);
            return { rows: [{ id: newStruct.id }], rowCount: 1 };
          }
          if (norm.includes('FROM public.payroll_settings')) {
            return {
              rows: [{
                id: 'ps-1',
                org_key: 'global',
                pf_enabled: true,
                pf_rate: 12,
                pf_wage_ceiling: 15000,
                pf_wage_components: { basic: true, da: true, conveyance: false, hra: false },
                esic_enabled: false,
                esic_rate: 0.75,
                esic_salary_threshold: 21000,
                esic_wage_components: { basic: true, da: true, conveyance: true, hra: true },
                professional_tax_enabled: true,
                professional_tax_amount: 200,
                lop_enabled: true,
                attendance_bonus_enabled: false,
                overtime_enabled: false,
                standard_working_days: 26,
                payroll_cycle_day: 1,
              }],
              rowCount: 1,
            };
          }
          if (norm.includes("setting_key = 'payroll_settings_config'")) {
            return { rows: [], rowCount: 0 };
          }
          if (norm.includes('FROM public.payroll_records pr')) {
            const draftRows = dbPayrollRecords.filter(r => r.status === 'DRAFT');
            return { rows: draftRows, rowCount: draftRows.length };
          }
          if (norm.startsWith('UPDATE public.payroll_records SET')) {
            const rec = dbPayrollRecords.find(r => r.id === params[0] && r.status === 'DRAFT');
            if (rec) {
              rec.salary_structure_id = params[1];
              rec.basic_salary = params[2];
              rec.gross_salary = params[6];
              rec.net_salary = params[16];
            }
            return { rows: [], rowCount: rec ? 1 : 0 };
          }
          if (norm.startsWith('INSERT INTO public.employee_documents')) {
            dbDocuments.push({ employee_id: params[0], name: params[1], type: params[2], url: params[3], upload_date: params[4] });
            return { rows: [], rowCount: 1 };
          }
          if (norm.includes("setting_key = 'employee_profiles_data' FOR UPDATE")) {
            return { rows: [{ setting_val: dbCompanySettings }], rowCount: 1 };
          }
          if (norm.startsWith("UPDATE public.company_settings SET setting_val = $1::jsonb")) {
            dbCompanySettings = JSON.parse(params[0]);
            return { rows: [], rowCount: 1 };
          }
          if (norm.startsWith('INSERT INTO public.employee_profile_audit_logs')) {
            dbAuditLogs.push({
              company_id: params[0],
              employee_id: params[1],
              performed_by: params[2],
              changed_fields: params[3],
              old_values: JSON.parse(params[4]),
              new_values: JSON.parse(params[5]),
              effective_dates: JSON.parse(params[6]),
            });
            return { rows: [], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        },
      };
      return work(mockClient);
    });
  });

  it('1-9 & 13: saves all editable profile fields (name, phone, department, designation, shift, weekly off, salary, bank, address, education, experience, documents) into PostgreSQL and synchronizes company_settings', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    try {
      const res = await fetch(`http://localhost:${port}/api/v1/employees/EMP-004/profile-sync`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${hrToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employee: {
            firstName: 'Karthik',
            lastName: 'Subramanian',
            phone: '9840123456',
            email: 'karthik.subramanian@vrmstructures.com',
            department: 'Engineering',
            designation: 'Senior Structural Engineer',
            employmentType: 'Full-Time',
            status: 'Active',
            joiningDate: '2025-02-01',
            workShift: 'Night Shift',
            attendanceMethod: 'Face Scan',
            gpsAllowed: false,
            shiftDetails: {
              shiftType: 'Night Shift',
              weeklyOff: 'Saturday & Sunday',
            },
            currentAddress: {
              line1: 'Plot 88, OMR Tech Park',
              line2: '',
              city: 'Chennai',
              state: 'Tamil Nadu',
              country: 'India',
              pincode: '600119',
            },
            educationalDetails: {
              highestQualification: 'M.E / M.Tech',
              degreeName: 'M.Tech Structural',
              specialization: 'Structural Engineering',
              university: 'IIT Madras',
              yearOfPassing: '2020',
              gradePercentage: '89.5',
            },
            experienceDetails: {
              experienceType: 'Fresher',
              totalExperience: '0',
              previousCompany: '',
              previousDesignation: '',
              previousDepartment: '',
              startDate: '',
              endDate: '',
              lastDrawnSalary: '',
              companyLocation: '',
            },
            bankDetails: {
              bankName: 'HDFC Bank',
              accountNumber: '50100234567890',
              ifscCode: 'hdfc0000123',
              branch: 'Adyar',
            },
            basicSalary: 20000,
            salaryDetails: {
              monthlyCtc: 50000,
              basicSalary: 20000,
              da: 10000,
              conveyance: 2500,
              hra: 17500,
              withPf: true,
              panNumber: 'abcde9876k',
              uanNumber: '101234567890',
            },
            documents: [
              { name: 'Degree_Certificate.pdf', type: 'PDF', url: 'https://example.com/degree.pdf', uploadDate: '2026-10-28' },
            ],
            // Attempting to pass a password in profile payload must be ignored (Phase 6)
            password: 'HackedPassword@999',
            mustChangePassword: true,
          },
          options: {
            expectedVersion: 1,
            shiftEffectiveFrom: '2026-10-28',
            weeklyOffEffectiveFrom: '2026-10-28',
            salaryEffectiveFrom: '2026-10-01',
            revisionReason: 'Annual promotion and shift transfer',
          },
        }),
      });

      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);

      // Verify returned employee record
      expect(body.data.firstName).toBe('Karthik');
      expect(body.data.lastName).toBe('Subramanian');
      expect(body.data.phone).toBe('9840123456');
      expect(body.data.department).toBe('Engineering');
      expect(body.data.designation).toBe('Senior Structural Engineer');
      expect(body.data.workShift).toBe('Night Shift');
      expect(body.data.gpsAllowed).toBe(false);
      expect(body.data.rowVersion).toBe(2);
      expect(body.data.bankDetails.bankName).toBe('HDFC Bank');
      expect(body.data.bankDetails.accountNumber).toBe('50100234567890');
      expect(body.data.bankDetails.ifscCode).toBe('HDFC0000123');

      // Verify PostgreSQL employees row persistence
      expect(dbEmployeeRow.last_name).toBe('Subramanian');
      expect(dbEmployeeRow.phone).toBe('9840123456');
      expect(dbEmployeeRow.department_id).toBe('dept-eng-002');
      expect(dbEmployeeRow.designation).toBe('Senior Structural Engineer');
      expect(dbEmployeeRow.work_shift).toBe('Night Shift');
      expect(dbEmployeeRow.bank_name).toBe('HDFC Bank');
      expect(dbEmployeeRow.account_number).toBe('50100234567890');
      expect(dbEmployeeRow.ifsc_code).toBe('HDFC0000123');
      expect(dbEmployeeRow.pan_number).toBe('ABCDE9876K');
      expect(dbEmployeeRow.uan_number).toBe('101234567890');
      expect(dbEmployeeRow.pincode).toBe('600119');

      // Verify Phase 5: Shift, Weekly Off, Salary Structure & Draft Payroll synchronization
      expect(body.dependencies.shiftChanged).toBe(true);
      expect(body.dependencies.weeklyOffChanged).toBe(true);
      expect(body.dependencies.salaryChanged).toBe(true);
      expect(body.dependencies.draftPayrollRecalculated).toBe(1);

      // Future unfinalized attendance updated to Night Shift, historical finalized attendance untouched
      const futureAtt = dbAttendanceRecords.find(a => a.id === 'att-future');
      const finalizedAtt = dbAttendanceRecords.find(a => a.id === 'att-finalized');
      expect(futureAtt?.shift_id).toBe('shift-night-02');
      expect(finalizedAtt?.shift_id).toBe('shift-gen-01');

      // Draft payroll recalculated to 50,000 gross, Paid historical payroll untouched at 30,000
      const draftPayroll = dbPayrollRecords.find(p => p.id === 'pr-draft-1');
      const paidPayroll = dbPayrollRecords.find(p => p.id === 'pr-paid-1');
      expect(draftPayroll?.gross_salary).toBe(50000);
      expect(paidPayroll?.gross_salary).toBe(30000);

      // Verify salary_structures percentages sum to 100.00
      expect(dbSalaryStructures).toHaveLength(1);
      const ss = dbSalaryStructures[0];
      expect(ss.basic_percentage + ss.da_percentage + ss.conveyance_percentage + ss.hra_percentage).toBe(100);

      // Verify company_settings.employee_profiles_data was synchronized in-transaction
      expect(dbCompanySettings['EMP-004'].lastName).toBe('Subramanian');
      expect(dbCompanySettings['EMP-004'].department).toBe('Engineering');
      expect(dbCompanySettings['EMP-004'].designation).toBe('Senior Structural Engineer');

      // Verify Phase 6: Password was NOT modified in PostgreSQL or company_settings or profile_data
      expect(dbEmployeeRow.password).toBe('$2b$10$originalHashedPasswordValueDoNotChange123456');
      expect(dbEmployeeRow.must_change_password).toBe(false);
      expect(dbEmployeeRow.profile_data.password).toBeUndefined();
      expect(dbCompanySettings['EMP-004'].password).toBe('OriginalPlainPassword@123');

      // Verify Audit Log recorded without secrets
      expect(dbAuditLogs).toHaveLength(1);
      expect(['hr@vrmstructures.com', 'pavithra@gmail.com']).toContain(dbAuditLogs[0].performed_by);
      expect(dbAuditLogs[0].new_values.password).toBeUndefined();
    } finally {
      server.close();
    }
  });

  it('Phase 2: partial field update does NOT overwrite unrelated fields with null', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    try {
      const res = await fetch(`http://localhost:${port}/api/v1/employees/EMP-004/profile-sync`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${hrToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employee: {
            designation: 'Lead Civil Engineer',
          },
        }),
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(dbEmployeeRow.designation).toBe('Lead Civil Engineer');
      // Unrelated columns must remain intact
      expect(dbEmployeeRow.phone).toBe('9876543210');
      expect(dbEmployeeRow.bank_name).toBe('State Bank of India');
      expect(dbEmployeeRow.account_number).toBe('001122334455');
      expect(dbEmployeeRow.ifsc_code).toBe('SBIN0001234');
      expect(dbEmployeeRow.pan_number).toBe('ABCDE1234F');
      expect(dbEmployeeRow.city).toBe('Chennai');
    } finally {
      server.close();
    }
  });

  it('Test 15: rejects invalid input (invalid mobile number or PAN) with 422 VALIDATION_ERROR and does not modify DB', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    try {
      const res = await fetch(`http://localhost:${port}/api/v1/employees/EMP-004/profile-sync`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${hrToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employee: {
            firstName: 'Karthik',
            phone: '12345', // Invalid phone
          },
        }),
      });
      const body = await res.json();
      expect(res.status).toBe(422);
      expect(body.success).toBe(false);
      expect(dbEmployeeRow.phone).toBe('9876543210');
    } finally {
      server.close();
    }
  });

  it('Test 16: blocks unauthorized Employee role from editing employee profiles with 403 FORBIDDEN', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    try {
      const res = await fetch(`http://localhost:${port}/api/v1/employees/EMP-004/profile-sync`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${employeeToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employee: {
            designation: 'Unauthorized Promotion',
          },
        }),
      });
      expect(res.status).toBe(403);
      expect(dbEmployeeRow.designation).toBe('Site Engineer');
    } finally {
      server.close();
    }
  });

  it('Phase 3: rejects conflicting concurrent edits when expectedVersion does not match row_version (409 STALE_EMPLOYEE_VERSION)', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    try {
      const res = await fetch(`http://localhost:${port}/api/v1/employees/EMP-004/profile-sync`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${hrToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employee: {
            designation: 'Stale Edit',
          },
          options: {
            expectedVersion: 99,
          },
        }),
      });
      const body = await res.json();
      expect(res.status).toBe(409);
      expect(body.error.code).toBe('STALE_EMPLOYEE_VERSION');
      expect(body.error.currentVersion).toBe(1);
    } finally {
      server.close();
    }
  });

  it('VRM-044 Scenario: saves shift change from Morning 2 to NORMAL SHIFT with DD/MM/YYYY dates and synchronizes rowVersion', async () => {
    dbEmployeeRow.work_shift = 'Morning 2';
    dbEmployeeRow.profile_data = { workShift: 'Morning 2', rowVersion: 1 };
    dbShifts.push({
      id: 'shift-normal-03',
      company_id: 'company-a',
      shift_name: 'NORMAL SHIFT',
      start_time: '09:30',
      end_time: '18:30',
      grace_period_mins: 15,
    });

    const server = app.listen(0);
    const port = (server.address() as any).port;
    try {
      const res = await fetch(`http://localhost:${port}/api/v1/employees/EMP-004/profile-sync`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${hrToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employee: {
            firstName: 'Shinodh G',
            lastName: 'kurup',
            dob: '30/01/2004',
            joiningDate: '27/10/2026',
            department: 'DESIGN',
            designation: 'JUNIOR',
            employmentType: 'Full-Time',
            workShift: 'NORMAL SHIFT',
            shiftDetails: {
              shiftType: 'NORMAL SHIFT',
              weeklyOff: 'Sunday',
            },
          },
          options: {
            expectedVersion: 1,
            shiftEffectiveFrom: '27/10/2026',
          },
        }),
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.workShift).toBe('NORMAL SHIFT');
      expect(body.data.upcomingShift).toBeNull();
      expect(body.data.dob).toBe('2004-01-30');
      expect(body.data.joiningDate).toBe('2026-10-27');
      expect(body.data.rowVersion).toBe(2);
      expect(dbEmployeeRow.work_shift).toBe('NORMAL SHIFT');
      expect(dbCompanySettings['EMP-004'].workShift).toBe('NORMAL SHIFT');
      expect(dbCompanySettings['EMP-004'].rowVersion).toBe(2);
    } finally {
      server.close();
    }
  });

  it('Phase 2 Future Shift Scenario: preserves current active shift today while scheduling upcomingShift for future effective date', async () => {
    dbEmployeeRow.work_shift = 'Morning 2';
    dbEmployeeRow.profile_data = { workShift: 'Morning 2', rowVersion: 1 };
    dbShifts.push({
      id: 'shift-normal-03',
      company_id: 'company-a',
      shift_name: 'NORMAL SHIFT',
      start_time: '09:30',
      end_time: '18:30',
      grace_period_mins: 15,
    });

    const server = app.listen(0);
    const port = (server.address() as any).port;
    try {
      const res = await fetch(`http://localhost:${port}/api/v1/employees/EMP-004/profile-sync`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${hrToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employee: {
            workShift: 'NORMAL SHIFT',
            shiftDetails: {
              shiftType: 'NORMAL SHIFT',
              weeklyOff: 'Sunday',
            },
          },
          options: {
            expectedVersion: 1,
            shiftEffectiveFrom: '2099-12-01',
          },
        }),
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      // Active shift today remains Morning 2, while upcomingShift is scheduled for 2099-12-01
      expect(body.data.workShift).toBe('Morning 2');
      expect(body.data.upcomingShift).toBe('NORMAL SHIFT');
      expect(body.data.upcomingShiftEffectiveFrom).toBe('2099-12-01');
      expect(dbEmployeeRow.work_shift).toBe('Morning 2');
      expect(dbEmployeeRow.profile_data.upcomingShift).toBe('NORMAL SHIFT');
      expect(dbEmployeeRow.profile_data.upcomingShiftEffectiveFrom).toBe('2099-12-01');
      expect(body.dependencies.shiftChanged).toBe(true);
      expect(dbShiftAssignments.some(a => a.shift_id === 'shift-normal-03' && a.effective_from === '2099-12-01')).toBe(true);
    } finally {
      server.close();
    }
  });

  it('Scenario 7: Two administrators editing DIFFERENT fields concurrently with same initial expectedVersion both succeed and merge cleanly', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    try {
      // Admin 1 and Admin 2 both loaded EMP-004 at rowVersion = 1.
      // Admin 1 edits phone and saves with expectedVersion: 1
      const resAdmin1 = await fetch(`http://localhost:${port}/api/v1/employees/EMP-004/profile-sync`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${hrToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employee: {
            phone: '9876500001',
          },
          options: {
            expectedVersion: 1,
            changedFields: ['phone'],
            baseValues: { phone: '9876543210', designation: 'Site Engineer' },
          },
        }),
      });
      const bodyAdmin1 = await resAdmin1.json();
      expect(resAdmin1.status).toBe(200);
      expect(bodyAdmin1.data.phone).toBe('9876500001');
      expect(bodyAdmin1.data.rowVersion).toBe(2);

      // Admin 2 still has expectedVersion: 1, and edits designation (a different field)
      const resAdmin2 = await fetch(`http://localhost:${port}/api/v1/employees/EMP-004/profile-sync`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${hrToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employee: {
            phone: '9876543210', // Admin 2's form still had the old phone
            designation: 'Principal Structural Engineer',
          },
          options: {
            expectedVersion: 1,
            changedFields: ['designation'],
            baseValues: { phone: '9876543210', designation: 'Site Engineer' },
          },
        }),
      });
      const bodyAdmin2 = await resAdmin2.json();
      expect(resAdmin2.status).toBe(200);
      expect(bodyAdmin2.success).toBe(true);
      // Both Admin 1's phone edit AND Admin 2's designation edit are preserved!
      expect(bodyAdmin2.data.phone).toBe('9876500001');
      expect(bodyAdmin2.data.designation).toBe('Principal Structural Engineer');
      expect(bodyAdmin2.data.rowVersion).toBe(3);
      expect(dbEmployeeRow.phone).toBe('9876500001');
      expect(dbEmployeeRow.designation).toBe('Principal Structural Engineer');
    } finally {
      server.close();
    }
  });

  it('Scenario 8 & 10: Two administrators editing the SAME field concurrently triggers 409 STALE_EMPLOYEE_VERSION with conflict details, then allows safe review & reapplication', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    try {
      // Admin 1 updates designation from Site Engineer -> Lead Engineer (rowVersion 1 -> 2)
      const resAdmin1 = await fetch(`http://localhost:${port}/api/v1/employees/EMP-004/profile-sync`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${hrToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employee: {
            designation: 'Lead Engineer',
          },
          options: {
            expectedVersion: 1,
            changedFields: ['designation'],
            baseValues: { designation: 'Site Engineer' },
          },
        }),
      });
      expect(resAdmin1.status).toBe(200);
      expect(dbEmployeeRow.row_version).toBe(2);

      // Admin 2 concurrently tries to update the SAME field (designation -> Chief Engineer) from stale expectedVersion: 1
      const resAdmin2Conflict = await fetch(`http://localhost:${port}/api/v1/employees/EMP-004/profile-sync`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${hrToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employee: {
            designation: 'Chief Engineer',
          },
          options: {
            expectedVersion: 1,
            changedFields: ['designation'],
            baseValues: { designation: 'Site Engineer' },
          },
        }),
      });
      const conflictBody = await resAdmin2Conflict.json();
      expect(resAdmin2Conflict.status).toBe(409);
      expect(conflictBody.error.code).toBe('STALE_EMPLOYEE_VERSION');
      expect(conflictBody.error.currentVersion).toBe(2);
      expect(Array.isArray(conflictBody.error.conflictingFields)).toBe(true);
      expect(conflictBody.error.conflictingFields[0].field).toBe('designation');
      expect(conflictBody.error.conflictingFields[0].serverValue).toBe('Lead Engineer');
      expect(conflictBody.error.conflictingFields[0].incomingValue).toBe('Chief Engineer');
      // Admin 1's value is protected and not overwritten
      expect(dbEmployeeRow.designation).toBe('Lead Engineer');

      // Admin 2 reviews the conflict and explicitly reapplies against currentVersion: 2
      const resAdmin2Reapply = await fetch(`http://localhost:${port}/api/v1/employees/EMP-004/profile-sync`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${hrToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employee: {
            designation: 'Chief Engineer',
          },
          options: {
            expectedVersion: 2,
            forceReapplyVersion: 2,
            changedFields: ['designation'],
            baseValues: { designation: 'Site Engineer' },
          },
        }),
      });
      const reapplyBody = await resAdmin2Reapply.json();
      expect(resAdmin2Reapply.status).toBe(200);
      expect(reapplyBody.data.designation).toBe('Chief Engineer');
      expect(reapplyBody.data.rowVersion).toBe(3);
    } finally {
      server.close();
    }
  });

  it('Scenario 9 & 12: Prevents false-concurrency conflict when row_version was undefined/null after a rolled-back transaction (VRM-042 / VRM-044 root cause regression)', async () => {
    // Simulate a database row where row_version was missing/undefined after a prior transaction rollback
    delete dbEmployeeRow.row_version;

    const server = app.listen(0);
    const port = (server.address() as any).port;
    try {
      const res = await fetch(`http://localhost:${port}/api/v1/employees/EMP-004/profile-sync`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${hrToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employee: {
            designation: 'SENIOR',
            employmentType: 'FULL TIME',
            address: ', ,  - ', // Blank address template must not wipe existing address
          },
          options: {
            expectedVersion: 1,
          },
        }),
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.designation).toBe('SENIOR');
      expect(body.data.rowVersion).toBe(2);
      // Existing address was preserved instead of being overwritten by ', ,  - '
      expect(dbEmployeeRow.address).toBe('No. 10, Anna Salai, Chennai');
      // Password remains completely untouched
      expect(dbEmployeeRow.password).toBe('$2b$10$originalHashedPasswordValueDoNotChange123456');
    } finally {
      server.close();
    }
  });
});
