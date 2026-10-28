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
    expectedLabels: ['Home', 'Attendance', 'Leave', 'Tasks']
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

        // Verify touch-friendly dimensions and no horizontal overflow
        for (let i = 0; i < roleCfg.expectedLabels.length; i++) {
          const box = await navButtons.nth(i).boundingBox();
          expect(box).not.toBeNull();
          expect(box!.height).toBeGreaterThanOrEqual(44);
          expect(box!.width).toBeGreaterThanOrEqual(55);
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


test('PagarBook-style Attendance: Click Punch In -> Allow Camera & GPS -> Take Picture & Punch In -> 1-Hour Delay before Punch Out', async ({ page }) => {
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
  await page.route('**/api/v1/attendance/punch', async (route) => {
    const request = route.request().postDataJSON();
    const isIn = request.type === 'IN';
    if (isIn) checkInPhoto = request.photoBase64;
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

  // 1. Verify Mobile Attendance Card is visible on mobile Home
  const quickBanner = page.locator('.mobile-attendance-card');
  await expect(quickBanner).toBeVisible({ timeout: 15000 });

  // 2. Navigate to Attendance tab
  const bottomNav = page.locator('nav.mobile-bottom-nav');
  await bottomNav.locator('button.mobile-bottom-nav-item').nth(1).click();

  await expect(page.getByRole('heading', { name: 'Daily Attendance' })).toBeVisible();
  await page.screenshot({ path: 'audit_screenshots/after-face-attendance-ready-390.png', fullPage: true });

  // 3. Step 1: Click "Punch In" -> asks Camera & GPS permission and opens live camera with "Take Picture & Punch In"
  const punchInBtn = page.getByRole('button', { name: /^Punch In$/i });
  await expect(punchInBtn).toBeVisible();
  await punchInBtn.click();

  await expect(page.getByText('Camera & GPS Ready')).toBeVisible({ timeout: 10000 });
  const takePicInBtn = page.getByRole('button', { name: 'Take Picture & Punch In' });
  await expect(takePicInBtn).toBeVisible();

  // 4. Step 2: Click "Take Picture & Punch In" -> captures photo and enforces 1-Hour Delay before Punch Out
  await takePicInBtn.click();

  await expect(page.getByText(/1-Hour Delay Active/i)).toBeVisible({ timeout: 10000 });
  const lockedOutBtn = page.getByRole('button', { name: /Punch Out in \d+ min \(1 Hr Delay\)/i });
  await expect(lockedOutBtn).toBeVisible();
  await expect(lockedOutBtn).toBeDisabled();
  await page.screenshot({ path: 'audit_screenshots/after-face-attendance-one-hour-lock-390.png', fullPage: true });

  // 5. Simulate 61 minutes passing to unlock Punch Out
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

  // 6. Now "Punch Out" button is enabled! Click "Punch Out" -> "Take Picture & Punch Out"
  const punchOutBtn = page.getByRole('button', { name: /^Punch Out$/i });
  await expect(punchOutBtn).toBeVisible();
  await expect(punchOutBtn).toBeEnabled();
  await punchOutBtn.click();

  const takePicOutBtn = page.getByRole('button', { name: 'Take Picture & Punch Out' });
  await expect(takePicOutBtn).toBeVisible({ timeout: 10000 });
  await takePicOutBtn.click();

  await expect(page.getByRole('button', { name: 'Attendance Completed Today' })).toBeVisible({ timeout: 10000 });
});
