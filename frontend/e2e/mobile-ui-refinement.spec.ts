import { expect, test, type Page } from '@playwright/test';

const employee = {
  id: 'USR-EMP-UI',
  name: 'Mobile Employee',
  email: 'mobile.employee@businz.com',
  role: 'Employee',
  employeeId: 'EMP-UI-01',
  department: 'Engineering',
  designation: 'Developer'
};

async function authenticate(page: Page, user = employee) {
  await page.route('**/api/v1/auth/me', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: user })
    });
  });
  const token = `mobile-ui-${user.employeeId}`;
  await page.addInitScript(({ token: authToken, authUser }) => {
    localStorage.setItem('vrm_auth_token', authToken);
    sessionStorage.setItem('vrm_auth_token', authToken);
    localStorage.setItem('vrm_hrms_current_user', JSON.stringify(authUser));
  }, { token, authUser: user });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__setModule === 'function');
}

test('employee mobile Tasks uses one compact filter toolbar and no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(page);
  await expect(page.getByText('My Task', { exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).__setModule('tasks'));

  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
  await expect(page.locator('.my-tasks-filters-bar')).toBeHidden();
  await expect(page.locator('.mobile-search-filter-bar')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('Task Register mobile keeps Department, Priority and Status only inside Filter Tasks', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(page, {
    ...employee,
    id: 'USR-CEO-FILTER',
    employeeId: 'EMP-000',
    role: 'CEO',
    department: 'Management',
    designation: 'CEO'
  });
  await page.evaluate(() => (window as any).__setModule('tasks'));

  await expect(page.locator('.task-register-command-card')).toBeVisible();
  await expect(page.locator('.task-register-inline-filter')).toHaveCount(3);
  await expect(page.locator('.task-register-inline-filter').first()).toBeHidden();

  const filterButton = page.locator('.task-register-filter-actions').getByRole('button', { name: /Filter/i }).first();
  await expect(filterButton).toBeVisible();
  await filterButton.click();
  await expect(page.getByRole('heading', { name: 'Filter Tasks' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Department' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Priority' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Status' })).toBeVisible();
});

test('manager Task sub-pages use one mobile control set and responsive analytics cards', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(page, {
    ...employee,
    id: 'USR-CEO-TASK-UI',
    employeeId: 'EMP-000',
    role: 'CEO',
    department: 'Management',
    designation: 'CEO'
  });
  await page.evaluate(() => (window as any).__setModule('tasks'));

  const managerTabs = page.locator('.manager-task-mobile-tabs');
  await expect(managerTabs).toBeVisible();
  await expect(managerTabs.locator('.mobile-segmented-tab-btn')).toHaveCount(6);

  await managerTabs.getByRole('button', { name: /Assigned/ }).click();
  await expect(page.locator('.assigned-tasks-container > .task-desktop-filter-bar')).toBeHidden();
  await expect(page.locator('.assigned-tasks-container .mobile-search-filter-bar')).toBeVisible();

  await managerTabs.getByRole('button', { name: /^Team/ }).click();
  await expect(page.locator('.team-tasks-container .task-desktop-filter-bar')).toBeHidden();
  await expect(page.locator('.team-tasks-container .mobile-search-filter-bar')).toBeVisible();

  await managerTabs.getByRole('button', { name: /^Reports/ }).click();
  await expect(page.locator('.daily-report-filter-card')).toBeVisible();
  await expect(page.locator('.daily-report-desktop-only-filter').first()).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open report filters' })).toBeVisible();

  await managerTabs.getByRole('button', { name: 'Analytics' }).click();
  await expect(page.locator('.task-report-tabs')).toBeVisible();
  await expect(page.locator('.task-analytics-mobile-list').first()).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('Contact Directory mobile toolbar follows tabs without a large blank section', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(page);
  await page.evaluate(() => (window as any).__setModule('customer_data'));

  await expect(page.getByRole('heading', { name: 'Contact Card Scanner' })).toBeVisible();
  await expect(page.locator('.customer-search-input')).toBeVisible();

  const verticalGap = await page.evaluate(() => {
    const tabs = document.querySelector('.customer-segmented-tabs')?.getBoundingClientRect();
    const toolbar = document.querySelector('.customer-card-toolbar')?.getBoundingClientRect();
    return tabs && toolbar ? toolbar.top - tabs.bottom : 9999;
  });
  expect(verticalGap).toBeLessThan(80);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('Attendance Log is employee-only in role-based mobile navigation', async ({ browser }) => {
  const users = [
    employee,
    { ...employee, id: 'USR-HR-UI', employeeId: 'EMP-HR-UI', role: 'HR Manager', department: 'HR', designation: 'HR Manager' },
    { ...employee, id: 'USR-CEO-UI', employeeId: 'EMP-000', role: 'CEO', department: 'Management', designation: 'CEO' },
    { ...employee, id: 'USR-ACC-UI', employeeId: 'EMP-ACC-UI', role: 'Finance Manager', department: 'Accounts', designation: 'Finance Manager' }
  ];

  for (const user of users) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await authenticate(page, user);
    const labels = await page.locator('.mobile-bottom-nav-label').allTextContents();
    if (user.role === 'Employee') {
      expect(labels).toContain('Attendance Log');
    } else {
      expect(labels).not.toContain('Attendance Log');
    }
    await context.close();
  }
});

test('overnight checkout produces positive overtime and never early-checkout minutes', async ({ page }) => {
  await authenticate(page);
  const result = await page.evaluate(async () => {
    const modulePath = '/src/services/attendanceCalculationEngine.ts';
    const engine = await import(/* @vite-ignore */ modulePath);
    return engine.calculateAttendanceHoursAndStatus({
      checkIn: '09:30 AM',
      checkOut: '01:00 AM',
      shift: {
        id: 'DAY-01',
        name: 'Day Shift',
        startTime: '09:30 AM',
        endTime: '06:30 PM',
        requiredWorkingHours: 8,
        breakDurationMinutes: 60
      },
      otPolicy: { enabled: true },
      isOtEligible: true
    });
  });

  expect(result.workedHours).toBe(14.5);
  // Default daily policy caps payable OT at 4 hours even though 6.5 hours
  // elapsed after shift end.
  expect(result.potentialOtHours).toBe(4);
  expect(result.earlyCheckoutMinutes).toBe(0);
});
