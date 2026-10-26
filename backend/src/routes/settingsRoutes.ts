import { Router } from 'express';
import {
  getCompanySettings,
  updateCompanySettings,
  getGeofenceSettings,
  updateGeofenceSettings,
  getCompanySmtpConfig,
  saveCompanySmtpConfig,
  testCompanySmtpConnection,
  getMetaAdsConfig,
  saveMetaAdsConfig,
  testMetaAdsConnection,
  getBiometricsConfig,
  saveBiometricsConfig,
  testBiometricsConnection,
  getAccountingConfig,
  saveAccountingConfig,
  testAccountingConnection,
} from '../controllers/settingsController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireRoles } from '../middleware/rbacMiddleware.js';

export const settingsRouter = Router();

// Resolve Google Maps link (including short links like maps.app.goo.gl and extract coords)
settingsRouter.post('/resolve-map-link', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string' || !url.trim()) {
      res.status(400).json({ success: false, message: 'URL is required' });
      return;
    }
    const cleanUrl = url.trim();

    // Direct Regex Check on input URL
    let foundLat: number | null = null;
    let foundLng: number | null = null;

    const atMatch = cleanUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      foundLat = parseFloat(atMatch[1]);
      foundLng = parseFloat(atMatch[2]);
    }
    if (!foundLat) {
      const dataMatch = cleanUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
      if (dataMatch) {
        foundLat = parseFloat(dataMatch[1]);
        foundLng = parseFloat(dataMatch[2]);
      }
    }
    if (!foundLat) {
      const qMatch = cleanUrl.match(/[?&](?:q|query|loc|center|destination)=(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/i);
      if (qMatch) {
        foundLat = parseFloat(qMatch[1]);
        foundLng = parseFloat(qMatch[2]);
      }
    }
    if (!foundLat) {
      const rawMatch = cleanUrl.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (rawMatch) {
        foundLat = parseFloat(rawMatch[1]);
        foundLng = parseFloat(rawMatch[2]);
      }
    }

    if (foundLat && foundLng) {
      res.json({ success: true, lat: foundLat, lng: foundLng, resolvedUrl: cleanUrl });
      return;
    }

    // If it's a web URL (like short links maps.app.goo.gl or goo.gl/maps), follow redirects
    if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
      const resp = await fetch(cleanUrl, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      const finalUrl = resp.url || cleanUrl;

      const atMatch2 = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (atMatch2) {
        foundLat = parseFloat(atMatch2[1]);
        foundLng = parseFloat(atMatch2[2]);
      }
      if (!foundLat) {
        const dataMatch2 = finalUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
        if (dataMatch2) {
          foundLat = parseFloat(dataMatch2[1]);
          foundLng = parseFloat(dataMatch2[2]);
        }
      }
      if (!foundLat) {
        const qMatch2 = finalUrl.match(/[?&](?:q|query|loc|center|destination)=(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/i);
        if (qMatch2) {
          foundLat = parseFloat(qMatch2[1]);
          foundLng = parseFloat(qMatch2[2]);
        }
      }

      // Check HTML content
      if (!foundLat) {
        const html = await resp.text().catch(() => '');
        const bodyAt = html.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
                       html.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ||
                       html.match(/\[(-?\d+\.\d+),(-?\d+\.\d+)\]/);
        if (bodyAt) {
          foundLat = parseFloat(bodyAt[1]);
          foundLng = parseFloat(bodyAt[2]);
        }
      }

      if (foundLat && foundLng) {
        res.json({ success: true, lat: foundLat, lng: foundLng, resolvedUrl: finalUrl });
        return;
      }
    }

    res.json({ success: false, message: 'Could not extract coordinates from link or text' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Error resolving map link' });
  }
});

settingsRouter.use(authenticateToken);

// Company Profile Settings
settingsRouter.get('/company', getCompanySettings);
settingsRouter.put('/company', requireRoles(['Super Admin', 'CEO', 'HR Manager']), updateCompanySettings);

// Geofence Attendance Settings
settingsRouter.get('/geofence', getGeofenceSettings);
settingsRouter.put('/geofence', requireRoles(['Super Admin', 'CEO', 'HR Manager']), updateGeofenceSettings);

// Company SMTP Relay Configuration (Google Workspace / Gmail / Custom SMTP)
settingsRouter.get('/smtp/config', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin']), getCompanySmtpConfig);
settingsRouter.post('/smtp/config', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin']), saveCompanySmtpConfig);
settingsRouter.post('/smtp/test-connection', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin']), testCompanySmtpConnection);

// Meta Ads (Facebook & Instagram Lead Sync)
settingsRouter.get('/meta-ads/config', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin']), getMetaAdsConfig);
settingsRouter.post('/meta-ads/config', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin']), saveMetaAdsConfig);
settingsRouter.post('/meta-ads/test-connection', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin']), testMetaAdsConnection);

// Biometric Attendance Hardware Gateway
settingsRouter.get('/biometrics/config', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin']), getBiometricsConfig);
settingsRouter.post('/biometrics/config', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin']), saveBiometricsConfig);
settingsRouter.post('/biometrics/test-connection', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin']), testBiometricsConnection);

// Accounting (Tally Prime & Zoho Books)
settingsRouter.get('/accounting/config', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin']), getAccountingConfig);
settingsRouter.post('/accounting/config', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin']), saveAccountingConfig);
settingsRouter.post('/accounting/test-connection', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'Admin']), testAccountingConnection);

