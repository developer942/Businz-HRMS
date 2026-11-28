import { describe, expect, it } from 'vitest';
import {
  isForbiddenMetaCdnUrl,
  resolveSafeTemplateHeaderUrl,
} from '../src/services/whatsapp/crmMessageSender.js';
import {
  parsePayrollMonthYear,
  mapSettingsPayrollRecord,
} from '../src/repositories/payrollRepository.js';
import {
  isCompanyWideGatewayRole,
  isAssetVisibleToCaller,
  isTaskVisibleToCaller,
  isTaskCreatorCaller,
  mergeStandardTaskUpdate,
} from '../src/controllers/dataGatewayController.js';
import { rbacRepository } from '../src/repositories/rbacRepository.js';
import { createLeaveSchema } from '../src/validators/leaveValidators.js';

describe('Issue 1: WhatsApp CRM 403 media URL sanitization & bulk campaign RBAC', () => {
  it('flags Meta scontent/fbcdn URLs that cause HTTP 403 Forbidden (131053)', () => {
    expect(isForbiddenMetaCdnUrl('https://scontent.whatsapp.net/v/t61.29466-34/banner.png')).toBe(true);
    expect(isForbiddenMetaCdnUrl('https://scontent.xx.fbcdn.net/img.jpg')).toBe(true);
    expect(isForbiddenMetaCdnUrl('https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=123')).toBe(true);
    expect(isForbiddenMetaCdnUrl('https://hrms.businz.com/brand-logo.png')).toBe(true);
    expect(isForbiddenMetaCdnUrl('')).toBe(true);
    expect(isForbiddenMetaCdnUrl('https://hrms.businz.com/vrm-banner.png')).toBe(false);
  });

  it('replaces Meta CDN scontent URLs with public template headerContent or fallback banner', () => {
    expect(
      resolveSafeTemplateHeaderUrl({
        requestedUrl: 'https://scontent.whatsapp.net/v/t61.29466-34/expired.png',
        templateHeaderType: 'IMAGE',
        templateHeaderContent: 'https://hrms.businz.com/vrm-banner.png',
        templateHeaderExample: ['https://scontent.whatsapp.net/v/t61.29466-34/expired.png'],
      })
    ).toBe('https://hrms.businz.com/vrm-banner.png');

    expect(
      resolveSafeTemplateHeaderUrl({
        requestedUrl: 'https://scontent.whatsapp.net/v/expired.png',
        templateHeaderType: 'IMAGE',
        templateHeaderContent: null,
        templateHeaderExample: ['https://scontent.whatsapp.net/v/expired.png'],
      })
    ).toBe('https://hrms.businz.com/vrm-banner.png');
  });

  it('grants employees WhatsApp CRM create/edit permission for templates and bulk campaigns', () => {
    const empPerms = rbacRepository.getRolePermissions('Employee');
    expect(empPerms?.modulePermissions.whatsapp_crm).toContain('edit');
    expect(empPerms?.modulePermissions.whatsapp_crm).toContain('create');
  });
});

describe('Issue 2 & 3: Asset Management & Task Management RBAC / visibility', () => {
  it('recognizes HR role as company-wide gateway administrator for assets', () => {
    expect(isCompanyWideGatewayRole('HR')).toBe(true);
    expect(isCompanyWideGatewayRole('HR Manager')).toBe(true);
    expect(isCompanyWideGatewayRole('CEO')).toBe(true);
  });

  it('matches assets by UUID, employee code, or embedded assigned_employee', () => {
    expect(
      isAssetVisibleToCaller(
        {
          assigned_employee_id: 'uuid-123',
          assigned_employee: { id: 'uuid-123', employee_id: 'VRM-027', first_name: 'Ahilesh', last_name: 'K' },
        },
        'vrm-027',
        'uuid-other',
        'ahilesh k'
      )
    ).toBe(true);
  });

  it('grants employees task create & assign permissions', () => {
    const empPerms = rbacRepository.getRolePermissions('Employee');
    expect(empPerms?.modulePermissions.tasks).toContain('create');
    expect(empPerms?.modulePermissions.tasks).toContain('assign');
    expect(empPerms?.specialPermissions).toContain('create_tasks');
    expect(empPerms?.specialPermissions).toContain('assign_tasks');
  });

  it('matches Web assigned_by format "First Last (Role)" for task visibility and creator checks', () => {
    const webTask = {
      assigned_by: 'Chagam Prashanth Reddy (Employee)',
      responsible_person_id: 'VRM-027',
    };
    expect(isTaskVisibleToCaller(webTask, 'vrm-018', 'uuid-18', 'chagam prashanth reddy')).toBe(true);
    expect(isTaskCreatorCaller(webTask, 'vrm-018', 'uuid-18', 'chagam prashanth reddy')).toBe(true);
    expect(isTaskVisibleToCaller(webTask, 'vrm-099', 'uuid-99', 'unrelated person')).toBe(false);
  });

  it('updates existing assignee progress without permitting tampered assignee identities', () => {
    const merged = mergeStandardTaskUpdate(
      {
        task_data: {
          title: 'Build API',
          assignees: [{ employeeId: 'VRM-027', individualStatus: 'ASSIGNED', progressPercentage: 0 }],
          dailyReports: [],
        },
      },
      {
        title: 'Tampered',
        assignees: [
          { employeeId: 'VRM-027', individualStatus: 'IN PROGRESS', progressPercentage: 70 },
          { employeeId: 'VRM-999', individualStatus: 'COMPLETED', progressPercentage: 100 },
        ],
        dailyReports: [{ id: 'r1', workDoneToday: 'Completed step 1' }],
      },
      'IN PROGRESS',
      70,
      '2026-11-26T10:00:00.000Z'
    );
    expect(merged.title).toBe('Build API');
    expect(merged.assignees).toHaveLength(1);
    expect(merged.assignees[0]).toMatchObject({
      employeeId: 'VRM-027',
      individualStatus: 'IN PROGRESS',
      progressPercentage: 70,
    });
  });
});

describe('Issue 4: Web HRMS payroll_records_data mapping parity', () => {
  it('parses "November 2026" month strings and preserves exact Web earnings/deductions', () => {
    expect(parsePayrollMonthYear({ month: 'November 2026' })).toEqual({
      payrollMonth: 11,
      payrollYear: 2026,
    });

    const mapped = mapSettingsPayrollRecord({
      id: 'PAY-2026-11-VRM-027',
      employeeId: 'VRM-027',
      employeeName: 'Ahilesh K',
      department: 'DEVELOPER',
      designation: 'JUNIOR',
      month: 'November 2026',
      calendarDays: 30,
      workingDays: 25,
      presentDays: 23.5,
      paidWeekOffDays: 4,
      paidHolidayDays: 1,
      paidLeaves: 1,
      lopDays: 0.5,
      totalPaidDays: 29.5,
      basicSalary: 7080,
      hra: 6195,
      da: 3540,
      conveyance: 885,
      grossSalary: 17700,
      lateAttendanceDeduction: 120,
      netSalary: 17580,
      status: 'Processed',
      earningsBreakdown: [
        { name: 'BASIC SALARY', category: 'EARNING', amount: 7080, description: '40% of CTC | Paid 29.5/30 days' },
      ],
      deductionsBreakdown: [
        { name: 'Late Attendance Deduction', category: 'DEDUCTION', amount: 120, description: 'Late penalty' },
      ],
    });

    expect(mapped.payrollMonth).toBe(11);
    expect(mapped.payrollYear).toBe(2026);
    expect(mapped.presentDays).toBe(23.5);
    expect(mapped.totalPaidDays).toBe(29.5);
    expect(mapped.basicSalary).toBe(7080);
    expect(mapped.hra).toBe(6195);
    expect(mapped.da).toBe(3540);
    expect(mapped.conveyance).toBe(885);
    expect(mapped.grossSalary).toBe(17700);
    expect(mapped.netSalary).toBe(17580);
    expect(mapped.earningsBreakdown).toHaveLength(1);
    expect(mapped.deductionsBreakdown).toHaveLength(1);
  });
});

describe('Issue 5: Web HRMS leave type validation parity', () => {
  it('accepts Web master leave policy labels like Earned Leave (EL) and Sick Leave (SL)', () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const leaveType of [
      'Earned Leave (EL)',
      'Sick Leave (SL)',
      'Unpaid Leave (LWP)',
      'Work From Home',
    ]) {
      const parsed = createLeaveSchema.safeParse({
        leaveType,
        startDate: today,
        endDate: today,
        reason: 'Medical appointment scheduled',
      });
      expect(parsed.success).toBe(true);
    }
  });
});
