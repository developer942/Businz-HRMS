import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots', 'dashboard-parity');

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
});

const MOBILE_VIEWPORTS = [
  { name: '320px', width: 320, height: 680 },
  { name: '360px', width: 360, height: 800 },
  { name: '375px', width: 375, height: 812 },
  { name: '390px (iPhone Safari)', width: 390, height: 844 },
  { name: '412px (Android Chrome)', width: 412, height: 915 },
  { name: '430px', width: 430, height: 932 }
];

const AHILESH_USER = {
  id: 'USR-EMP-016',
  name: 'Ahilesh K',
  email: 'ahilesh@businz.com',
  role: 'Employee',
  employeeId: 'EMP-016',
  department: 'Operations',
  designation: 'Junior Executive'
};

const KARTHIK_USER = {
  id: 'USR-EMP-001',
  name: 'Karthik R',
  email: 'karthik@businz.com',
  role: 'Employee',
  employeeId: 'EMP-001',
  department: 'Engineering',
  designation: 'Software Engineer'
};

test.describe('BUSINZ HRMS – Desktop vs Mobile Dashboard 100% Data Parity & Reference Data Removal', () => {
  test('1. Desktop and Mobile display 100% identical authoritative employee data across all 10 fields & resize cleanly', async ({ page }) => {
    const todayIso = new Date().toISOString().split('T')[0];
    const yesterdayDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    await page.route('**/api/v1/auth/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: AHILESH_USER
        })
      });
    });

    const token = 'vrm_session_' + Buffer.from(JSON.stringify(AHILESH_USER)).toString('base64');

    const seedRecords = [
      {
        id: 'att-ahilesh-today',
        employeeId: 'EMP-016',
        employeeName: 'Ahilesh K',
        department: 'Operations',
        date: todayIso,
        shiftDate: todayIso,
        checkIn: '09:49 AM',
        checkOut: '05:40 PM',
        workingHours: 7.84,
        status: 'Present',
        lateStatus: 'Late (<30m)',
        method: 'Face Scan'
      },
      {
        id: 'att-ahilesh-yesterday',
        employeeId: 'EMP-016',
        employeeName: 'Ahilesh K',
        department: 'Operations',
        date: yesterdayDate,
        shiftDate: yesterdayDate,
        checkIn: '09:30 AM',
        checkOut: '07:29 PM',
        workingHours: 10,
        status: 'Present',
        lateStatus: 'On Time',
        method: 'Face Scan'
      }
    ];

    const seedTasks = [
      {
        id: 'TSK-2026-101',
        taskId: 'TSK-2026-101',
        title: 'Verify Monthly Stock Inventory',
        description: 'Complete warehouse audit before EOD',
        category: 'Operations',
        priority: 'High',
        dueDate: todayIso,
        overallStatus: 'OPEN',
        createdBy: 'Velmurugan (CEO)',
        assignedBy: 'Velmurugan (CEO)',
        responsiblePersonId: 'EMP-016',
        responsiblePersonName: 'Ahilesh K',
        assignees: [
          {
            employeeId: 'EMP-016',
            employeeName: 'Ahilesh K',
            department: 'Operations',
            designation: 'Junior Executive',
            individualStatus: 'Pending',
            progressPercentage: 0
          }
        ],
        dailyReports: [],
        comments: [],
        attachments: [],
        links: [],
        createdAt: todayIso,
        updatedAt: todayIso
      }
    ];

    await page.addInitScript(
      ({ token, user, records, tasks }) => {
        localStorage.setItem('vrm_hrms_storage_mode', 'vrm_hrms_hostinger_vps_source_of_truth_v8');
        localStorage.setItem('vrm_auth_token', token);
        sessionStorage.setItem('vrm_auth_token', token);
        localStorage.setItem('vrm_hrms_current_user', JSON.stringify(user));
        localStorage.setItem('vrm_hrms_attendance_records_persistent', JSON.stringify(records));
        localStorage.setItem('vrm_hrms_enhanced_tasks', JSON.stringify(tasks));
      },
      { token, user: AHILESH_USER, records: seedRecords, tasks: seedTasks }
    );

    // Step A: Load Desktop Web (1280x800) and capture all 10 authoritative fields
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    const desktopView = page.locator('.dashboard-desktop-view');
    await expect(desktopView).toBeVisible({ timeout: 15000 });

    const desktopWelcome = await desktopView.locator('.welcome-banner-title').innerText();
    expect(desktopWelcome).toContain('Ahilesh K');

    const desktopTodayStatus = (await page.getByTestId('desktop-today-status').innerText()).trim();
    const desktopCheckInText = (await page.getByTestId('desktop-checkin-time').innerText()).trim();
    const desktopCheckOutText = (await page.getByTestId('desktop-checkout-time').innerText()).trim();
    const desktopMonthlyRate = (
      await page.getByTestId('desktop-kpi-monthly-attendance').locator('.kpi-value').innerText()
    ).trim();
    const desktopPresentDays = (
      await page.getByTestId('desktop-kpi-present-days').locator('.kpi-value').innerText()
    )
      .replace(/\s+/g, ' ')
      .trim();
    const desktopShiftTimes = (
      await page.getByTestId('desktop-kpi-shift-timings').locator('.kpi-value').innerText()
    ).trim();
    const desktopShiftName = (
      await page.getByTestId('desktop-kpi-shift-timings').locator('.kpi-trend-badge').innerText()
    ).trim();
    const desktopLeaveBalance = (
      await page.getByTestId('desktop-kpi-leave-balance').locator('.kpi-value').innerText()
    )
      .replace(/\s+/g, ' ')
      .trim();
    const desktopLeaveTaken = (
      await page.getByTestId('desktop-kpi-leave-balance').locator('.kpi-trend-badge').innerText()
    ).trim();
    const desktopTasksHeading = (
      await desktopView.locator('.dashboard-widget-title:has-text("My Tasks")').innerText()
    ).trim();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'desktop-employee-dashboard-ahilesh.png'),
      fullPage: false
    });

    // Step B: Resize live to every required Mobile Viewport and assert 100% parity + zero reference image values
    for (const vp of MOBILE_VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      const mobileDashboard = page.getByTestId('employee-mobile-dashboard');
      await expect(mobileDashboard).toBeVisible({ timeout: 10000 });

      // 1. Employee identity
      const mobileName = (await page.getByTestId('mobile-employee-name').innerText()).trim();
      expect(mobileName).toBe('Ahilesh K!');

      // 2. Today's Attendance Status
      const mobileTodayStatus = (await page.getByTestId('mobile-today-status').innerText()).trim();
      expect(mobileTodayStatus).toBe(desktopTodayStatus);

      // 3. Punch In timestamp
      const mobileCheckIn = (await page.getByTestId('mobile-checkin-time').innerText()).trim();
      expect(`In: ${mobileCheckIn}`).toBe(desktopCheckInText);
      expect(mobileCheckIn).toBe('09:49 AM');

      // 4. Punch Out timestamp
      const mobileCheckOut = (await page.getByTestId('mobile-checkout-time').innerText()).trim();
      expect(`Out: ${mobileCheckOut}`).toBe(desktopCheckOutText);
      expect(mobileCheckOut).toBe('05:40 PM');

      // 5. Monthly Attendance %
      const mobileMonthlyRate = (
        await page.getByTestId('mobile-kpi-monthly-attendance').locator('.mobile-kpi-value').innerText()
      ).trim();
      expect(mobileMonthlyRate).toBe(desktopMonthlyRate);

      // 6. Present Days
      const mobilePresentDays = (
        await page.getByTestId('mobile-kpi-present-days').locator('.mobile-kpi-value').innerText()
      )
        .replace(/\s+/g, ' ')
        .trim();
      expect(mobilePresentDays).toBe(desktopPresentDays);

      // 7. Assigned Shift
      const mobileShiftTimes = (
        await page.getByTestId('mobile-kpi-shift-timings').locator('.mobile-kpi-value').innerText()
      ).trim();
      const mobileShiftName = (
        await page.getByTestId('mobile-kpi-shift-timings').locator('.mobile-kpi-trend').innerText()
      ).trim();
      expect(mobileShiftTimes).toBe(desktopShiftTimes);
      expect(mobileShiftName).toBe(desktopShiftName);

      // 8. Leave Balance
      const mobileLeaveBalance = (
        await page.getByTestId('mobile-kpi-leave-balance').locator('.mobile-kpi-value').innerText()
      )
        .replace(/\s+/g, ' ')
        .trim();
      const mobileLeaveTaken = (
        await page.getByTestId('mobile-kpi-leave-balance').locator('.mobile-kpi-trend').innerText()
      ).trim();
      expect(mobileLeaveBalance).toBe(desktopLeaveBalance);
      expect(mobileLeaveTaken).toBe(desktopLeaveTaken);

      // 9. Tasks
      const mobileTasksCardText = await page.getByTestId('mobile-my-tasks-card').innerText();
      expect(desktopTasksHeading.toLowerCase()).toBe('my tasks (1)');
      expect(mobileTasksCardText.toLowerCase()).toContain(desktopTasksHeading.toLowerCase());
      expect(mobileTasksCardText).toContain('Verify Monthly Stock Inventory');

      // 10. Strictly verify ZERO reference-image / company-wide mock values appear on Employee Mobile Dashboard
      const fullMobileText = await mobileDashboard.innerText();
      expect(fullMobileText).not.toContain('Present Today');
      expect(fullMobileText).not.toContain('Absent Today');
      expect(fullMobileText).not.toContain('↑ 5%');
      expect(fullMobileText).not.toContain('↓ 2%');
      expect(fullMobileText).not.toContain('→ 0%');

      if (vp.width === 390 || vp.width === 412) {
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `mobile-employee-dashboard-${vp.width}px.png`),
          fullPage: false
        });
      }
    }

    // Step C: Resize back to Desktop (1280x800) and verify values remain unchanged
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(desktopView).toBeVisible();
    expect((await page.getByTestId('desktop-today-status').innerText()).trim()).toBe(desktopTodayStatus);
    expect((await page.getByTestId('desktop-checkin-time').innerText()).trim()).toBe(desktopCheckInText);
    expect(
      (await page.getByTestId('desktop-kpi-monthly-attendance').locator('.kpi-value').innerText()).trim()
    ).toBe(desktopMonthlyRate);
  });

  test('2. Unpunched employee shows Not Marked and --:-- (never shift start time 09:30 AM) and no cross-user cache leak on user switch', async ({
    page
  }) => {
    let activeUser = KARTHIK_USER;

    await page.route('**/api/v1/auth/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: activeUser
        })
      });
    });

    const token = 'vrm_session_' + Buffer.from(JSON.stringify(KARTHIK_USER)).toString('base64');

    // Seed attendance record ONLY for EMP-016 (Ahilesh K), NONE for EMP-001 (Karthik R)
    const todayIso = new Date().toISOString().split('T')[0];
    const otherUserRecords = [
      {
        id: 'att-other-emp',
        employeeId: 'EMP-016',
        employeeName: 'Ahilesh K',
        department: 'Operations',
        date: todayIso,
        shiftDate: todayIso,
        checkIn: '09:30 AM',
        checkOut: '06:30 PM',
        workingHours: 9,
        status: 'Present',
        lateStatus: 'On Time',
        method: 'Face Scan'
      }
    ];

    await page.addInitScript(
      ({ token, user, records }) => {
        localStorage.setItem('vrm_auth_token', token);
        sessionStorage.setItem('vrm_auth_token', token);
        localStorage.setItem('vrm_hrms_current_user', JSON.stringify(user));
        localStorage.setItem('vrm_hrms_attendance_records_persistent', JSON.stringify(records));
      },
      { token, user: KARTHIK_USER, records: otherUserRecords }
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const mobileDashboard = page.getByTestId('employee-mobile-dashboard');
    await expect(mobileDashboard).toBeVisible({ timeout: 15000 });

    // Verify Karthik R is shown, NOT Ahilesh K
    await expect(page.getByTestId('mobile-employee-name')).toHaveText('Karthik R!');

    // Verify Karthik R (who has not punched in today) shows Not Marked and --:-- (never 09:30 AM)
    await expect(page.getByTestId('mobile-today-status')).toHaveText('Not Marked');
    await expect(page.getByTestId('mobile-checkin-time')).toHaveText('--:--');
    await expect(page.getByTestId('mobile-checkout-time')).toHaveText('--:--');

    // Refresh the page and verify state remains consistent
    await page.reload();
    await expect(page.getByTestId('mobile-employee-name')).toHaveText('Karthik R!');
    await expect(page.getByTestId('mobile-today-status')).toHaveText('Not Marked');
    await expect(page.getByTestId('mobile-checkin-time')).toHaveText('--:--');

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'mobile-unpunched-employee-karthik.png'),
      fullPage: false
    });
  });
});

