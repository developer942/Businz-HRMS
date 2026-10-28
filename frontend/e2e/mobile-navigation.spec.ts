import { expect, test } from '@playwright/test';

const DEVICE_PROFILES = [
  {
    name: 'Android Chrome (Pixel 7 / Galaxy S24)',
    viewport: { width: 412, height: 915 },
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
  },
  {
    name: 'iPhone Safari (iPhone 15 Pro)',
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
  }
];

const ROLES_MATRIX = [
  {
    roleKey: 'Employee',
    user: {
      id: 'USR-EMP-001',
      name: 'Karthik R',
      email: 'employee@businz.com',
      role: 'Employee',
      employeeId: 'EMP-001',
      department: 'Engineering',
      designation: 'Software Engineer'
    },
    expectedLabels: ['Home', 'Attendance', 'Leave', 'Tasks', 'Attendance Log']
  },
  {
    roleKey: 'HR',
    user: {
      id: 'USR-HR-001',
      name: 'Pavithra S',
      email: 'hr@businz.com',
      role: 'HR Manager',
      employeeId: 'EMP-006',
      department: 'HR',
      designation: 'HR Manager'
    },
    expectedLabels: ['Home', 'Employees', 'Attendance', 'Leave', 'Chat Bot']
  },
  {
    roleKey: 'CEO',
    user: {
      id: 'USR-CEO-001',
      name: 'Velmurugan',
      email: 'ceo@businz.com',
      role: 'CEO',
      employeeId: 'EMP-000',
      department: 'Management',
      designation: 'CEO'
    },
    expectedLabels: ['Home', 'Approvals', 'Employees', 'Reports', 'Chat Bot']
  },
  {
    roleKey: 'Accounts',
    user: {
      id: 'USR-ACC-001',
      name: 'Suresh M',
      email: 'accounts@businz.com',
      role: 'Finance Manager',
      employeeId: 'EMP-009',
      department: 'Accounts',
      designation: 'Finance Manager'
    },
    expectedLabels: ['Home', 'Attendance', 'Payments', 'Claims', 'Tasks']
  }
];

for (const device of DEVICE_PROFILES) {
  test.describe(`Mobile Bottom Navigation - ${device.name}`, () => {
    for (const roleCfg of ROLES_MATRIX) {
      test(`${roleCfg.roleKey} role displays exact ${roleCfg.expectedLabels.length} tabs and navigates cleanly`, async ({ page }) => {
        await page.setViewportSize(device.viewport);

        // Mock /auth/me to return the authenticated role user
        await page.route('**/api/v1/auth/me', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: roleCfg.user
            })
          });
        });

        const token = 'vrm_session_' + Buffer.from(JSON.stringify(roleCfg.user)).toString('base64');
        await page.addInitScript(({ token, user }) => {
          localStorage.setItem('vrm_auth_token', token);
          sessionStorage.setItem('vrm_auth_token', token);
          localStorage.setItem('vrm_hrms_current_user', JSON.stringify(user));
        }, { token, user: roleCfg.user });

        await page.goto('/');

        const bottomNav = page.locator('nav.mobile-bottom-nav');
        await expect(bottomNav).toBeVisible({ timeout: 15000 });
        await expect(bottomNav).toHaveAttribute('data-role', roleCfg.roleKey);

        const navButtons = bottomNav.locator('button.mobile-bottom-nav-item');
        await expect(navButtons).toHaveCount(roleCfg.expectedLabels.length);

        const actualLabels = await bottomNav.locator('.mobile-bottom-nav-label').allTextContents();
        expect(actualLabels).toEqual(roleCfg.expectedLabels);

        // Verify Home is initially active
        await expect(navButtons.nth(0)).toHaveClass(/active/);
        await expect(navButtons.nth(0)).toHaveAttribute('aria-current', 'page');

        // Verify touch-friendly dimensions, no label truncation, and no horizontal overflow
        for (let i = 0; i < roleCfg.expectedLabels.length; i++) {
          const box = await navButtons.nth(i).boundingBox();
          expect(box).not.toBeNull();
          expect(box!.height).toBeGreaterThanOrEqual(44);
          expect(box!.width).toBeGreaterThanOrEqual(55);

          const isTruncated = await navButtons.nth(i).locator('.mobile-bottom-nav-label').evaluate((el) => {
            return el.scrollWidth > el.clientWidth + 1;
          });
          expect(isTruncated).toBe(false);
        }

        // Test clicking each navigation item
        for (let i = 0; i < roleCfg.expectedLabels.length; i++) {
          const label = roleCfg.expectedLabels[i];
          const btn = navButtons.nth(i);
          await btn.click();

          // Bottom nav must remain visible and highlight the active item
          await expect(bottomNav).toBeVisible();
          await expect(btn).toHaveClass(/active/);
          await expect(btn).toHaveAttribute('aria-current', 'page');

          if (roleCfg.roleKey === 'Employee' && label === 'Attendance') {
            await expect(page.getByRole('heading', { name: 'Face Attendance' })).toBeVisible();
            await expect(page.getByTestId('monthly-activity-card')).toHaveCount(0);
          }

          if (roleCfg.roleKey === 'Employee' && label === 'Attendance Log') {
            await expect(page.getByRole('heading', { name: 'Attendance Log' })).toBeVisible();
            await expect(page.getByTestId('attendance-log-card')).toBeVisible();
            await expect(page.getByTestId('face-camera-preview')).toHaveCount(0);
          }

          if (label === 'Chat Bot') {
            await expect(btn).toHaveAttribute('title', 'BUSINZ Chat Bot');
            const chatPanel = page.locator('.vrm-ai-panel');
            await expect(chatPanel).toBeVisible();
            await expect(chatPanel.locator('.vrm-ai-header-title')).toHaveText('BUSINZ Chat Bot');
          } else {
            await expect(page.locator('.vrm-ai-panel')).toHaveCount(0);
          }
        }

        // Verify clicking Home returns to dashboard and closes Chat Bot if open
        await navButtons.nth(0).click();
        await expect(navButtons.nth(0)).toHaveClass(/active/);
        await expect(page.locator('.vrm-ai-panel')).toHaveCount(0);

        // Verify Accounts role cannot access HR/CEO modules via Sidebar
        if (roleCfg.roleKey === 'Accounts') {
          const toggleBtn = page.locator('button.sidebar-toggle-btn');
          await toggleBtn.click();
          const mobileSidebar = page.locator('aside.hrms-sidebar.mobile-open');
          await expect(mobileSidebar).toBeVisible();
          const sidebarText = await mobileSidebar.textContent();
          expect(sidebarText).not.toContain('Employee Directory');
          expect(sidebarText).not.toContain('Attendance Management');
          expect(sidebarText).not.toContain('Settings');
        }
      });
    }
  });
}

test('Desktop viewport (> 1024px) hides mobile bottom navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const ceoUser = ROLES_MATRIX[2].user;
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: ceoUser })
    });
  });

  const token = 'vrm_session_' + Buffer.from(JSON.stringify(ceoUser)).toString('base64');
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('vrm_auth_token', token);
    sessionStorage.setItem('vrm_auth_token', token);
    localStorage.setItem('vrm_hrms_current_user', JSON.stringify(user));
  }, { token, user: ceoUser });

  await page.goto('/');
  await expect(page.locator('aside.hrms-sidebar')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('nav.mobile-bottom-nav')).toBeHidden();
});


test('Minimal Mobile Face Attendance UI: Live Front Camera, Side-by-Side Punch In & Punch Out, 1-Hour Delay & Fresh Selfie', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const empUser = ROLES_MATRIX[0].user;

  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: empUser })
    });
  });

  await page.route('**/api/v1/attendance/verify-face', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { verified: true, confidence: 0.99 } })
    });
  });

  let checkInPhoto = '';
  let checkOutPhoto = '';
  await page.route('**/api/v1/attendance/punch', async (route) => {
    const request = route.request().postDataJSON();
    const isIn = request.type === 'IN';
    if (isIn) {
      checkInPhoto = request.photoBase64;
    } else {
      checkOutPhoto = request.photoBase64;
    }
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          id: '00000000-0000-4000-8000-000000000001',
          employeeId: empUser.employeeId,
          date: new Date().toISOString().slice(0, 10),
          shiftDate: new Date().toISOString().slice(0, 10),
          checkIn: '09:00 AM',
          checkOut: isIn ? null : '10:01 AM',
          checkInPhoto,
          checkOutPhoto: isIn ? null : request.photoBase64,
          workingHours: isIn ? 0 : 1.02,
          status: 'Present',
          lateStatus: 'On Time',
          method: 'Face Scan',
          inGeofence: true,
          locationLat: request.locationLat,
          locationLng: request.locationLng,
          locationAddress: request.locationAddress,
          createdAt: isIn ? new Date().toISOString() : new Date(Date.now() + 61 * 60 * 1000).toISOString()
        }
      })
    });
  });

  const token = 'vrm_session_' + Buffer.from(JSON.stringify(empUser)).toString('base64');
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('vrm_auth_token', token);
    sessionStorage.setItem('vrm_auth_token', token);
    localStorage.setItem('vrm_hrms_current_user', JSON.stringify(user));

    // Mock Camera with a fresh stream/frame for every Punch In and Punch Out capture.
    if (!navigator.mediaDevices) {
      (navigator as any).mediaDevices = {};
    }
    let captureNumber = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      captureNumber += 1;
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = captureNumber === 1 ? '#38bdf8' : '#10b981';
        ctx.fillRect(0, 0, 640, 480);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px sans-serif';
        ctx.fillText(`LIVE SELFIE ${captureNumber}`, 180, 240);
      }
      return (canvas as any).captureStream ? (canvas as any).captureStream(15) : new MediaStream();
    };

    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (success: any) => {
          success({
            coords: {
              latitude: 13.151968,
              longitude: 80.2086053,
              accuracy: 8
            },
            timestamp: Date.now()
          });
        },
        watchPosition: (success: any) => {
          success({
            coords: {
              latitude: 13.151968,
              longitude: 80.2086053,
              accuracy: 8
            },
            timestamp: Date.now()
          });
          return 1;
        },
        clearWatch: () => {}
      },
      configurable: true
    });
  }, { token, user: empUser });

  await page.goto('/');

  // 1. Navigate to Attendance tab via mobile bottom navigation
  const bottomNav = page.locator('nav.mobile-bottom-nav');
  await expect(bottomNav).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: 'audit_screenshots/phase8-employee-home-5tabs-390.png' });

  await bottomNav.locator('button.mobile-bottom-nav-item').nth(1).click();

  // 2. Verify minimal screen elements: Heading "Face Attendance", Live Camera Preview, Face-Guidance Frame, Side-by-Side Punch In & Punch Out, NO Monthly Activity on mobile
  await expect(page.getByRole('heading', { name: 'Face Attendance' })).toBeVisible();
  await expect(page.getByTestId('face-camera-preview')).toBeVisible();
  await expect(page.getByTestId('face-guidance-frame')).toBeVisible();
  await expect(page.getByTestId('monthly-activity-card')).toHaveCount(0);

  const hasHorizontalOverflowDaily = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasHorizontalOverflowDaily).toBe(false);

  const punchInBtn = page.getByRole('button', { name: /^Punch In$/i });
  const punchOutBtn = page.getByRole('button', { name: /^Punch Out$/i });
  await expect(punchInBtn).toBeVisible();
  await expect(punchOutBtn).toBeVisible();
  await expect(punchInBtn).toBeEnabled();
  await expect(punchOutBtn).toBeDisabled();

  // Verify Punch In and Punch Out are positioned side by side
  const inBox = await punchInBtn.boundingBox();
  const outBox = await punchOutBtn.boundingBox();
  expect(inBox).not.toBeNull();
  expect(outBox).not.toBeNull();
  expect(Math.abs((inBox?.y || 0) - (outBox?.y || 0))).toBeLessThanOrEqual(4);

  await page.screenshot({ path: 'audit_screenshots/phase8-daily-attendance-clean-390.png' });

  // 3. Tap "Punch In" -> captures fresh selfie, verifies face & GPS, saves only Punch In
  await punchInBtn.click();

  const statusText = page.getByTestId('face-attendance-status');
  await expect(statusText).toContainText(/Punch In successful/i, { timeout: 10000 });
  await expect(statusText).toContainText(/Punch Out available in \d+ min/i);
  await expect(page.getByTestId('today-punch-in-summary')).toContainText('Punch In: 09:00 AM');
  await expect(punchInBtn).toBeDisabled();
  await expect(punchOutBtn).toBeDisabled();
  await page.screenshot({ path: 'audit_screenshots/phase8-daily-attendance-punched-in-390.png' });

  // Verify shared state: switch to Attendance Log (5th tab) right after Punch In
  await bottomNav.locator('button.mobile-bottom-nav-item').nth(4).click();
  await expect(page.getByRole('heading', { name: 'Attendance Log' })).toBeVisible();
  await expect(page.getByTestId('attendance-log-record').first()).toContainText('09:00 AM');
  await expect(page.getByTestId('checkin-photo-thumb').first()).toBeVisible();

  // Return to Daily Attendance (2nd tab)
  await bottomNav.locator('button.mobile-bottom-nav-item').nth(1).click();

  // 4. Simulate 61 minutes passing to unlock Punch Out
  await page.evaluate(() => {
    const sixtyOneMinsAgo = String(Date.now() - 61 * 60 * 1000);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('vrm_punch_in_epoch_')) {
        localStorage.setItem(k, sixtyOneMinsAgo);
      }
    }
  });

  // Switch to Home and back to Attendance to re-evaluate cooldown immediately
  await bottomNav.locator('button.mobile-bottom-nav-item').nth(0).click();
  await bottomNav.locator('button.mobile-bottom-nav-item').nth(1).click();

  // 5. After 1 hour, "Punch Out" is enabled! Tap "Punch Out" -> captures a NEW selfie and saves only Punch Out
  await expect(punchOutBtn).toBeEnabled();
  await punchOutBtn.click();

  await expect(statusText).toContainText(/Punch Out successful/i, { timeout: 10000 });
  await expect(punchInBtn).toBeDisabled();
  await expect(punchOutBtn).toBeDisabled();

  // Verify "Today's Attendance Completed" banner with Punch In and Punch Out times
  const completedCard = page.getByTestId('today-attendance-completed');
  await expect(completedCard).toBeVisible();
  await expect(completedCard).toContainText("Today's Attendance Completed");
  await expect(completedCard).toContainText('Punch In: 09:00 AM');
  await expect(completedCard).toContainText('Punch Out: 10:01 AM');
  await page.screenshot({ path: 'audit_screenshots/phase8-daily-attendance-completed-390.png' });

  expect(checkInPhoto.length).toBeGreaterThan(50);
  expect(checkOutPhoto.length).toBeGreaterThan(50);
  expect(checkOutPhoto).not.toBe(checkInPhoto);

  // 6. Navigate to "Attendance Log" (5th item in Employee bottom navigation)
  await bottomNav.locator('button.mobile-bottom-nav-item').nth(4).click();
  await expect(page.getByRole('heading', { name: 'Attendance Log' })).toBeVisible();
  await expect(page.getByTestId('attendance-log-card')).toBeVisible();

  const hasHorizontalOverflowLog = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasHorizontalOverflowLog).toBe(false);

  const firstRecord = page.getByTestId('attendance-log-record').first();
  await expect(firstRecord).toBeVisible();
  await expect(firstRecord).toContainText('Present');
  await expect(firstRecord).toContainText('09:00 AM');
  await expect(firstRecord).toContainText('10:01 AM');
  await expect(firstRecord).toContainText('1.02 hrs');

  const inThumb = firstRecord.getByTestId('checkin-photo-thumb');
  const outThumb = firstRecord.getByTestId('checkout-photo-thumb');
  await expect(inThumb).toBeVisible();
  await expect(outThumb).toBeVisible();
  const inSrc = await inThumb.locator('img').getAttribute('src');
  const outSrc = await outThumb.locator('img').getAttribute('src');
  expect(inSrc).toBeTruthy();
  expect(outSrc).toBeTruthy();
  expect(inSrc).not.toBe(outSrc);

  await page.screenshot({ path: 'audit_screenshots/phase8-attendance-log-page-390.png' });

  // Tap record to expand full details
  await firstRecord.click();
  await expect(firstRecord.getByTestId('attendance-log-expanded-details')).toBeVisible();
  await page.screenshot({ path: 'audit_screenshots/phase8-attendance-log-expanded-390.png' });

  // Navigate to a previous month with no records and verify empty state
  await page.getByTestId('month-prev-btn').click();
  await page.getByTestId('month-prev-btn').click();
  await expect(page.getByTestId('attendance-log-empty')).toBeVisible();
  await page.screenshot({ path: 'audit_screenshots/phase8-attendance-log-empty-month-390.png' });
});

test('Desktop Attendance regression check: Desktop view (> 768px) retains both Face Attendance and Monthly Activity side by side', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const empUser = ROLES_MATRIX[0].user;

  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: empUser })
    });
  });

  const token = 'vrm_session_' + Buffer.from(JSON.stringify(empUser)).toString('base64');
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('vrm_auth_token', token);
    sessionStorage.setItem('vrm_auth_token', token);
    localStorage.setItem('vrm_hrms_current_user', JSON.stringify(user));
  }, { token, user: empUser });

  await page.goto('/');
  const sidebar = page.locator('aside.hrms-sidebar');
  await expect(sidebar).toBeVisible({ timeout: 15000 });
  await sidebar.hover();
  await sidebar.locator('a.nav-item:has-text("Live Face Attendance"), a.nav-item[title="Live Face Attendance"]').first().click();

  await expect(page.getByRole('heading', { name: 'Face Attendance' })).toBeVisible();
  await expect(page.getByTestId('face-camera-preview')).toBeVisible();
  await expect(page.getByTestId('monthly-activity-card')).toBeVisible();
  await page.screenshot({ path: 'audit_screenshots/phase8-desktop-attendance-regression-1280.png' });
});
