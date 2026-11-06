import { expect, test } from '@playwright/test';

const trip = {
  id: 'trip-1', company_id: 'company-a', trip_code: 'FA-2026-0001', employee_id: 'EMP-101', employee_name: 'Test Employee',
  department_name: 'Sales', purpose: 'Customer site inspection', destination: 'Chennai', start_date: '2026-11-05', end_date: '2026-11-08',
  advance_required: true, requested_amount: 6000, approved_amount: 6000, allocated_amount: 6000, total_spent: 7000,
  balance: -1000, status: 'IN_PROGRESS', created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-05T10:00:00Z',
};

test('employee Field Allowance overview stays usable across target breakpoints', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vrm_auth_token', 'responsive-test-token');
    sessionStorage.setItem('vrm_auth_token', 'responsive-test-token');
  });
  await page.route('**/api/**', async route => {
    const url = route.request().url();
    if (url.includes('/auth/me')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { id: 'user-1', email: 'employee@test.com', name: 'Test Employee', role: 'Employee', employeeId: 'EMP-101', department: 'Sales', designation: 'Sales Executive', company_id: 'company-a' } }) });
      return;
    }
    if (url.includes('/field-allowance/requests')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [trip] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__setModule === 'function');
  await page.evaluate(() => (window as any).__setModule('field_allowance'));
  await expect(page.getByRole('heading', { name: 'My Field Allowance' })).toBeVisible();

  for (const width of [320, 360, 375, 390, 430, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: width < 600 ? 900 : 1000 });
    await expect(page.getByRole('button', { name: /New request/i })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
  }
});

test('Accounts department user sees approved Field Allowance in Payment Disbursement', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vrm_auth_token', 'accounts-test-token');
    sessionStorage.setItem('vrm_auth_token', 'accounts-test-token');
  });
  await page.route('**/api/**', async route => {
    const url = route.request().url();
    if (url.includes('/auth/me')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { id: 'accounts-1', email: 'accounts@test.com', name: 'Accounts User', role: 'Employee', employeeId: 'EMP-003', department: 'Accounts', designation: 'Accounts Executive', company_id: 'company-a' } }) });
      return;
    }
    if (url.includes('/field-allowance/requests')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [{ ...trip, status: 'APPROVED', allocated_amount: 0, total_spent: 0, balance: 0 }] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__setModule === 'function');
  await page.evaluate(() => (window as any).__setModule('accounts_payment'));
  await expect(page.getByRole('heading', { name: 'Accounts Payment Disbursement' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Field Allowance \(1\)/i })).toBeVisible();
  const distributeButton = page.getByRole('button', { name: /Distribute Payment/i }).first();
  await expect(distributeButton).toBeVisible();
  await distributeButton.click();
  await page.locator('form select').selectOption('Cash');
  await expect(page.getByText('Payment proof is not required for Cash Distribution.')).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await page.locator('form select').selectOption('Bank Transfer');
  await expect(page.locator('input[type="file"][required]')).toBeVisible();
});
