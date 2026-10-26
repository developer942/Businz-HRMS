import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const AUDIT_DIR = path.resolve('audit_screenshots');
if (!fs.existsSync(AUDIT_DIR)) {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
}

const modules = [
  'dashboard',
  'employees',
  'face_attendance',
  'attendance',
  'leaves',
  'shifts',
  'overtime',
  'performance',
  'tasks',
  'tracking',
  'customer_data',
  'whatsapp_crm',
  'finance',
  'payroll',
  'advance_salary',
  'petty_cash',
  'reports',
  'organization',
  'assets',
  'settings'
];

const viewports = [
  { name: 'mobile-320', width: 320, height: 568 },
  { name: 'mobile-375', width: 375, height: 667 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1280', width: 1280, height: 800 }
];

async function runAudit() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(2000);

  // Login as Super Admin if login form present
  const isLoginPage = await page.$('#hrms-user-identifier');
  if (isLoginPage) {
    console.log('Logging in...');
    await page.fill('#hrms-user-identifier', 'developer@businz.com');
    await page.fill('#hrms-user-password', 'developer@2026');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
  }

  const results = [];

  for (const vp of viewports) {
    console.log(`\n=== Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ===`);
    await page.setViewportSize({ width: vp.width, height: vp.height });

    for (const mod of modules) {
      try {
        await page.evaluate((m) => {
          if (window.__setModule) window.__setModule(m);
        }, mod);
        await page.waitForTimeout(1000);

        const metrics = await page.evaluate(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const scrollW = Math.max(docEl.scrollWidth, body.scrollWidth);
          const clientW = docEl.clientWidth;
          const hasOverflow = scrollW > clientW + 2; // tolerance

          // Find elements extending outside viewport
          const wideElements = [];
          const allEls = document.querySelectorAll('.hrms-content *');
          allEls.forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.right > clientW + 3 && rect.width > 20) {
              wideElements.push({
                tag: el.tagName,
                className: el.className?.toString?.() || '',
                right: Math.round(rect.right),
                width: Math.round(rect.width)
              });
            }
          });

          return {
            scrollWidth: scrollW,
            clientWidth: clientW,
            hasOverflow,
            overflowPixels: hasOverflow ? scrollW - clientW : 0,
            wideElementsCount: wideElements.length,
            sampleWideElements: wideElements.slice(0, 3)
          };
        });

        const bottomNavMetrics = await page.evaluate(() => {
          const nav = document.querySelector('.mobile-bottom-nav');
          if (!nav) return { exists: false, visible: false, items: [] };
          const style = window.getComputedStyle(nav);
          const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
          const items = Array.from(nav.querySelectorAll('.mobile-bottom-nav-item')).map(el => el.textContent?.trim());
          return {
            exists: true,
            visible,
            height: nav.offsetHeight,
            items
          };
        });

        const screenshotFile = `${vp.name}_${mod}.png`;
        const screenshotPath = path.join(AUDIT_DIR, screenshotFile);
        await page.screenshot({ path: screenshotPath, fullPage: false });

        results.push({
          viewport: vp.name,
          module: mod,
          width: vp.width,
          hasOverflow: metrics.hasOverflow,
          overflowPixels: metrics.overflowPixels,
          wideElementsCount: metrics.wideElementsCount,
          sampleWide: metrics.sampleWideElements,
          bottomNav: bottomNavMetrics,
          screenshot: screenshotFile
        });

        const statusIcon = metrics.hasOverflow ? '❌ OVERFLOW' : '✅ OK';
        console.log(`[${vp.name}] ${mod.padEnd(18)}: ${statusIcon} (overflow: ${metrics.overflowPixels}px, btmNav: ${bottomNavMetrics.visible ? 'visible' : 'hidden'})`);
      } catch (err) {
        console.error(`Error auditing ${mod} at ${vp.name}:`, err.message);
      }
    }
  }

  // Role-Specific Navigation Verification at Mobile Viewport (375px)
  console.log('\n=== Testing Role-Based Mobile Navigation & Permissions (375px) ===');
  await page.setViewportSize({ width: 375, height: 667 });

  const roleTests = [
    {
      role: 'Super Admin',
      expectedTabs: ['Home', 'Users', 'Modules', 'Settings', 'Profile']
    },
    {
      role: 'CEO',
      expectedTabs: ['Home', 'Approvals', 'Employees', 'Reports', 'Profile']
    },
    {
      role: 'Employee',
      expectedTabs: ['Home', 'Attendance', 'Leave', 'Tasks', 'Profile']
    },
    {
      role: 'HR Admin',
      expectedTabs: ['Home', 'Attendance', 'Leave', 'Tasks', 'Profile']
    },
    {
      role: 'Finance Manager',
      expectedTabs: ['Home', 'Attendance', 'Leave', 'Tasks', 'Profile']
    }
  ];

  const roleResults = [];

  for (const test of roleTests) {
    try {
      await page.evaluate((r) => {
        if (window.__switchRole) window.__switchRole(r);
      }, test.role);
      await page.waitForTimeout(1000);

      const navDetails = await page.evaluate(() => {
        const nav = document.querySelector('.mobile-bottom-nav');
        if (!nav) return { visible: false, items: [] };
        const style = window.getComputedStyle(nav);
        const visible = style.display !== 'none';
        const items = Array.from(nav.querySelectorAll('.mobile-bottom-nav-item .mobile-bottom-nav-label'))
          .map(el => el.textContent?.trim());
        return { visible, items };
      });

      const roleScreenshot = path.join(AUDIT_DIR, `role_nav_${test.role.toLowerCase().replace(/\s+/g, '_')}.png`);
      await page.screenshot({ path: roleScreenshot });

      const matches = JSON.stringify(navDetails.items) === JSON.stringify(test.expectedTabs);
      console.log(`Role [${test.role}]: ${matches ? '✅ PASS' : '❌ FAIL'} -> [${navDetails.items.join(' | ')}]`);

      roleResults.push({
        role: test.role,
        expected: test.expectedTabs,
        actual: navDetails.items,
        pass: matches,
        screenshot: `role_nav_${test.role.toLowerCase().replace(/\s+/g, '_')}.png`
      });
    } catch (err) {
      console.error(`Role test error for ${test.role}:`, err.message);
    }
  }

  // Switch back to Super Admin for normal operation
  await page.evaluate(() => {
    if (window.__switchRole) window.__switchRole('Super Admin');
  });

  await browser.close();

  fs.writeFileSync(path.join(AUDIT_DIR, 'audit_results.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(AUDIT_DIR, 'role_nav_results.json'), JSON.stringify(roleResults, null, 2));
  console.log(`\nAudit completed! Results saved to ${AUDIT_DIR}/audit_results.json and role_nav_results.json`);
}

runAudit().catch(console.error);

