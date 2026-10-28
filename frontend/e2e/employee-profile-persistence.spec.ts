import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  {
    name: 'Desktop Browser (1440x900)',
    viewport: { width: 1440, height: 900 },
    isMobile: false,
  },
  {
    name: 'Android Chrome Mobile (360x800)',
    viewport: { width: 360, height: 800 },
    isMobile: true,
  },
  {
    name: 'iPhone Safari Mobile (390x844)',
    viewport: { width: 390, height: 844 },
    isMobile: true,
  },
];

const HR_USER = {
  id: 'USR-HR-001',
  name: 'Pavithra S',
  email: 'hr@businz.com',
  role: 'HR Manager',
  employeeId: 'EMP-006',
  department: 'HR',
  designation: 'HR Manager',
};

test.describe('Employee Profile Save & PostgreSQL Persistence E2E', () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.name}: edits profile fields, persists across reopen & page refresh, and never sends password`, async ({ page }) => {
      await page.setViewportSize(vp.viewport);

      // Authoritative PostgreSQL state in test memory
      let pgEmployee: Record<string, any> = {
        id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        employee_id: 'EMP-004',
        employeeId: 'EMP-004',
        first_name: 'Karthik',
        firstName: 'Karthik',
        last_name: 'R',
        lastName: 'R',
        email: 'karthik@businz.com',
        personalEmail: 'karthik@businz.com',
        phone: '9876543210',
        department_id: 'dept-sales',
        department_name: 'Sales',
        department: 'Sales',
        departments: { name: 'Sales' },
        designation: 'Sales Executive',
        employment_type: 'Full-Time',
        employmentType: 'Full-Time',
        joining_date: '2025-01-15',
        joiningDate: '2025-01-15',
        status: 'Active',
        work_location: 'Chennai HQ',
        workLocation: 'Chennai HQ',
        basic_salary: 12000,
        basicSalary: 12000,
        allowances: { da: 6000, conveyance: 1500, hra: 10500 },
        work_shift: 'General Shift (09:00 - 18:00)',
        workShift: 'General Shift (09:00 - 18:00)',
        attendance_method: 'Face Scan',
        attendanceMethod: 'Face Scan',
        bank_details: {
          bankName: 'State Bank of India',
          accountNumber: '123456789012',
          ifscCode: 'SBIN0001234',
          branchName: 'Chennai Main',
          panNumber: 'ABCDE1234F',
          uanNumber: '100200300400',
        },
        bankDetails: {
          bankName: 'State Bank of India',
          accountNumber: '123456789012',
          ifscCode: 'SBIN0001234',
          branchName: 'Chennai Main',
          panNumber: 'ABCDE1234F',
          uanNumber: '100200300400',
        },
        row_version: 1,
        rowVersion: 1,
        profile_data: {
          department: 'Sales',
          designation: 'Sales Executive',
          shiftDetails: {
            shiftName: 'General Shift (09:00 - 18:00)',
            weeklyOff: 'Sunday Only',
          },
          salaryDetails: {
            monthlyCtc: 30000,
            basicSalary: 12000,
            da: 6000,
            conveyance: 1500,
            hra: 10500,
            salaryScheme: 'WITHOUT_PF',
          },
        },
      };

      const capturedSyncPayloads: any[] = [];

      // Default JSON fallbacks so Vite never returns text/html for REST/API calls
      await page.route('**/rest/v1/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.route('**/api/v1/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: [] }),
        });
      });

      await page.route('**/api/v1/auth/me', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: HR_USER }),
        });
      });

      await page.route('**/rest/v1/departments**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 'dept-sales', name: 'Sales', code: 'SALE' },
            { id: 'dept-eng', name: 'Engineering', code: 'ENG' },
            { id: 'dept-hr', name: 'HR', code: 'HR' },
          ]),
        });
      });

      // Simulate stale company_settings snapshot on reload to verify PostgreSQL rows win
      await page.route('**/rest/v1/company_settings**', async (route) => {
        if (route.request().method() !== 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([]),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              setting_key: 'employee_profiles_data',
              setting_val: {
                'EMP-004': {
                  employeeId: 'EMP-004',
                  firstName: 'Karthik',
                  lastName: 'R',
                  department: 'Sales',
                  designation: 'Sales Executive',
                  password: 'PreservedPortalPassword@2026',
                },
              },
            },
          ]),
        });
      });

      await page.route('**/rest/v1/employees**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([pgEmployee]),
        });
      });

      await page.route('**/api/v1/employees**', async (route) => {
        const url = route.request().url();
        const method = route.request().method();

        if (method === 'PUT' && url.includes('/profile-sync')) {
          const payload = route.request().postDataJSON();
          capturedSyncPayloads.push(payload);
          const empUpdate = payload?.employee || payload || {};

          pgEmployee = {
            ...pgEmployee,
            first_name: empUpdate.firstName ?? pgEmployee.first_name,
            firstName: empUpdate.firstName ?? pgEmployee.firstName,
            last_name: empUpdate.lastName ?? pgEmployee.last_name,
            lastName: empUpdate.lastName ?? pgEmployee.lastName,
            phone: empUpdate.phone ?? pgEmployee.phone,
            department_id: empUpdate.department === 'Engineering' ? 'dept-eng' : pgEmployee.department_id,
            department_name: empUpdate.department ?? pgEmployee.department_name,
            department: empUpdate.department ?? pgEmployee.department,
            departments: { name: empUpdate.department ?? pgEmployee.department },
            designation: empUpdate.designation ?? pgEmployee.designation,
            work_shift: empUpdate.workShift ?? pgEmployee.work_shift,
            workShift: empUpdate.workShift ?? pgEmployee.workShift,
            basic_salary: empUpdate.basicSalary ?? pgEmployee.basic_salary,
            basicSalary: empUpdate.basicSalary ?? pgEmployee.basicSalary,
            allowances: empUpdate.allowances ?? pgEmployee.allowances,
            bank_details: empUpdate.bankDetails ?? pgEmployee.bank_details,
            bankDetails: empUpdate.bankDetails ?? pgEmployee.bankDetails,
            row_version: (pgEmployee.row_version || 1) + 1,
            rowVersion: (pgEmployee.rowVersion || 1) + 1,
            profile_data: {
              ...pgEmployee.profile_data,
              department: empUpdate.department ?? pgEmployee.department,
              designation: empUpdate.designation ?? pgEmployee.designation,
              shiftDetails: empUpdate.shiftDetails ?? pgEmployee.profile_data.shiftDetails,
              salaryDetails: empUpdate.salaryDetails ?? pgEmployee.profile_data.salaryDetails,
              bankDetails: empUpdate.bankDetails ?? pgEmployee.bankDetails,
            },
          };

          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: {
                employee: pgEmployee,
                syncSummary: {
                  updatedAttendanceRows: 2,
                  recalculatedDraftPayrolls: 1,
                  rowVersion: pgEmployee.rowVersion,
                },
              },
            }),
          });
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [pgEmployee],
          }),
        });
      });

      const token = 'vrm_session_' + Buffer.from(JSON.stringify(HR_USER)).toString('base64');
      await page.addInitScript(
        ({ token, user }) => {
          localStorage.setItem('vrm_auth_token', token);
          sessionStorage.setItem('vrm_auth_token', token);
          localStorage.setItem('vrm_hrms_current_user', JSON.stringify(user));
        },
        { token, user: HR_USER }
      );

      await page.goto('/');

      // Navigate to Employees module
      if (vp.isMobile) {
        const bottomNavEmp = page.locator('nav.mobile-bottom-nav button.mobile-bottom-nav-item', { hasText: 'Employees' });
        await expect(bottomNavEmp).toBeVisible({ timeout: 15000 });
        await bottomNavEmp.click();
      } else {
        const sidebarEmp = page.locator('.sidebar-nav .nav-item[title="Employee Directory"], .sidebar-nav .nav-item:has-text("Employee Directory")').first();
        await expect(sidebarEmp).toBeVisible({ timeout: 15000 });
        await sidebarEmp.click();
      }

      // Open EMP-004 profile
      if (vp.isMobile) {
        const mobileCard = page.locator('.employee-mobile-card', { hasText: 'EMP-004' }).first();
        await expect(mobileCard).toBeVisible({ timeout: 10000 });
        await mobileCard.click();
      } else {
        const viewBtn = page.locator('tr', { hasText: 'EMP-004' }).locator('button[title="View Profile"]').first();
        await expect(viewBtn).toBeVisible({ timeout: 10000 });
        await viewBtn.click();
      }

      // Click Edit Profile
      const editBtn = page.locator('button[title="Edit Employee Profile"]');
      await expect(editBtn).toBeVisible({ timeout: 10000 });
      await editBtn.click();

      // Modify Personal, Employment, Salary & Bank fields
      await page.locator('input[placeholder="First name"]').fill('Karthikeyan');
      await page.locator('input[placeholder="Last name"]').fill('Subramanian');
      await page.locator('input[placeholder="9876543210"]').first().fill('9840123456');

      const deptSelect = page.locator('.modal-body select', { has: page.locator('option', { hasText: 'Engineering' }) }).first();
      await deptSelect.selectOption({ label: 'Engineering' });

      const ctcInput = page.locator('input[placeholder="Monthly CTC"]');
      await ctcInput.fill('50000');

      await page.locator('input[placeholder="e.g. HDFC Bank (Letters only)"]').fill('HDFC Bank');
      await page.locator('input[placeholder="9 to 18 digit Account Number"]').fill('50100234567890');
      await page.locator('input[placeholder="11-character IFSC (e.g. SBIN0001234)"]').fill('HDFC0000240');

      // Click Save Changes
      const saveBtn = page.locator('button', { hasText: 'Save Changes' }).first();
      await saveBtn.click();

      // Verify Save Notice
      await expect(page.getByText(/Employee profile updated successfully and persisted to database/i)).toBeVisible({ timeout: 10000 });

      // Verify API payload was sent and NEVER included password or mustChangePassword
      expect(capturedSyncPayloads.length).toBeGreaterThanOrEqual(1);
      const sentEmp = capturedSyncPayloads[0].employee || capturedSyncPayloads[0];
      expect(sentEmp.firstName).toBe('Karthikeyan');
      expect(sentEmp.lastName).toBe('Subramanian');
      expect(sentEmp.department).toBe('Engineering');
      expect(sentEmp.bankDetails.bankName).toBe('HDFC Bank');
      expect(sentEmp.bankDetails.accountNumber).toBe('50100234567890');
      expect(sentEmp.bankDetails.ifscCode).toBe('HDFC0000240');
      expect(sentEmp.password).toBeUndefined();
      expect(sentEmp.mustChangePassword).toBeUndefined();

      // Close profile modal and reopen to verify immediate UI persistence
      await page.locator('button[aria-label="Close"]').click();

      if (vp.isMobile) {
        const updatedCard = page.locator('.employee-mobile-card', { hasText: 'Karthikeyan Subramanian' }).first();
        await expect(updatedCard).toBeVisible();
        await expect(updatedCard).toContainText('Engineering');
        await updatedCard.click();
      } else {
        const updatedRow = page.locator('tr', { hasText: 'Karthikeyan Subramanian' }).first();
        await expect(updatedRow).toBeVisible();
        await expect(updatedRow).toContainText('Engineering');
        await updatedRow.locator('button[title="View Profile"]').click();
      }

      await expect(page.getByText('HDFC Bank')).toBeVisible();
      await expect(page.getByText('50100234567890')).toBeVisible();
      await expect(page.getByText('HDFC0000240')).toBeVisible();

      // Reload page to verify persistence across full browser refresh (PostgreSQL authoritative over stale company_settings)
      await page.reload();

      if (vp.isMobile) {
        const bottomNavEmp = page.locator('nav.mobile-bottom-nav button.mobile-bottom-nav-item', { hasText: 'Employees' });
        await expect(bottomNavEmp).toBeVisible({ timeout: 15000 });
        await bottomNavEmp.click();
        const reloadedCard = page.locator('.employee-mobile-card', { hasText: 'Karthikeyan Subramanian' }).first();
        await expect(reloadedCard).toBeVisible({ timeout: 10000 });
        await expect(reloadedCard).toContainText('Engineering');
      } else {
        const sidebarEmp = page.locator('.sidebar-nav .nav-item[title="Employee Directory"], .sidebar-nav .nav-item:has-text("Employee Directory")').first();
        await expect(sidebarEmp).toBeVisible({ timeout: 15000 });
        await sidebarEmp.click();
        const reloadedRow = page.locator('tr', { hasText: 'Karthikeyan Subramanian' }).first();
        await expect(reloadedRow).toBeVisible({ timeout: 10000 });
        await expect(reloadedRow).toContainText('Engineering');
      }
    });
  }

  test('Phase 8 Error Handling: preserves unsaved inputs, shows Retry Save button on failure, and never shows false success', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const empRecord = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      employee_id: 'EMP-004',
      employeeId: 'EMP-004',
      first_name: 'Karthik',
      firstName: 'Karthik',
      last_name: 'R',
      lastName: 'R',
      email: 'karthik@businz.com',
      phone: '9876543210',
      department_id: 'dept-sales',
      department_name: 'Sales',
      department: 'Sales',
      departments: { name: 'Sales' },
      designation: 'Sales Executive',
      status: 'Active',
      basic_salary: 12000,
      basicSalary: 12000,
      row_version: 1,
      rowVersion: 1,
    };

    let syncAttempts = 0;

    await page.route('**/rest/v1/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/api/v1/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    });

    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: HR_USER }),
      });
    });

    await page.route('**/rest/v1/employees**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([empRecord]),
      });
    });

    await page.route('**/api/v1/employees**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (method === 'PUT' && url.includes('/profile-sync')) {
        syncAttempts += 1;
        if (syncAttempts === 1) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              success: false,
              message: 'PostgreSQL transaction rolled back due to temporary connection error.',
            }),
          });
          return;
        }

        const payload = route.request().postDataJSON();
        const empUpdate = payload?.employee || payload || {};
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              employee: {
                ...empRecord,
                first_name: empUpdate.firstName,
                firstName: empUpdate.firstName,
                row_version: 2,
                rowVersion: 2,
              },
              syncSummary: { updatedAttendanceRows: 0, recalculatedDraftPayrolls: 0, rowVersion: 2 },
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [empRecord] }),
      });
    });

    const token = 'vrm_session_' + Buffer.from(JSON.stringify(HR_USER)).toString('base64');
    await page.addInitScript(
      ({ token, user }) => {
        localStorage.setItem('vrm_auth_token', token);
        sessionStorage.setItem('vrm_auth_token', token);
        localStorage.setItem('vrm_hrms_current_user', JSON.stringify(user));
      },
      { token, user: HR_USER }
    );

    await page.goto('/');
    const sidebarEmp = page.locator('.sidebar-nav .nav-item[title="Employee Directory"], .sidebar-nav .nav-item:has-text("Employee Directory")').first();
    await expect(sidebarEmp).toBeVisible({ timeout: 15000 });
    await sidebarEmp.click();
    await page.locator('tr', { hasText: 'EMP-004' }).locator('button[title="View Profile"]').first().click();
    await page.locator('button[title="Edit Employee Profile"]').click();

    const firstNameInput = page.locator('input[placeholder="First name"]');
    await firstNameInput.fill('Karthikeyan');

    // First attempt fails with 500
    await page.locator('button', { hasText: 'Save Changes' }).first().click();

    // Must NOT show Saved Successfully; must show error banner + Retry Save + keep input value
    await expect(page.getByText(/Employee profile updated successfully and persisted to database/i)).toHaveCount(0);
    await expect(page.getByText(/PostgreSQL transaction rolled back/i)).toBeVisible();
    const retryBtn = page.getByRole('button', { name: 'Retry Save' });
    await expect(retryBtn).toBeVisible();
    await expect(firstNameInput).toHaveValue('Karthikeyan');

    // Click Retry Save -> second attempt succeeds
    await retryBtn.click();
    await expect(page.getByText(/Employee profile updated successfully and persisted to database/i)).toBeVisible({ timeout: 10000 });
  });
});
