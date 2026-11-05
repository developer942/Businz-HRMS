import { Router } from 'express';
import { getCompanySettings, updateCompanySettings, getGeofenceSettings, updateGeofenceSettings, getCompanySmtpConfig, saveCompanySmtpConfig, testCompanySmtpConnection, getMetaAdsConfig, saveMetaAdsConfig, testMetaAdsConnection, getBiometricsConfig, saveBiometricsConfig, testBiometricsConnection, getAccountingConfig, saveAccountingConfig, testAccountingConnection, } from '../controllers/settingsController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireRoles } from '../middleware/rbacMiddleware.js';
import { parseGoogleMapsLink } from '../utils/googleMapsParser.js';
import { ssrfSafeMapFetch, validateSafeMapUrl, SsrfBlockedError, } from '../utils/ssrfSafeFetch.js';
export const settingsRouter = Router();
// Public read access for canonical office geofence boundaries so Face Attendance and HRMSContext
// always validate against the authoritative PostgreSQL office coordinates.
settingsRouter.get('/geofence', getGeofenceSettings);
// All remaining settings endpoints require authentication
settingsRouter.use(authenticateToken);
// Resolve Google Maps link (protected against SSRF, unsafe schemes, private IPs, and untrusted redirects)
settingsRouter.post('/resolve-map-link', requireRoles([
    'Super Admin',
    'CEO',
    'HR Manager',
    'HR Admin',
    'HR',
    'Admin',
    'ERP Administrator',
    'Department Manager',
    'Finance Manager',
]), async (req, res) => {
    try {
        const { url } = req.body;
        if (!url || typeof url !== 'string' || !url.trim()) {
            res.status(400).json({ success: false, message: 'URL is required' });
            return;
        }
        const cleanUrl = url.trim();
        const hasUrlScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(cleanUrl);
        // Enforce strict URL scheme & Google Maps host allowlist whenever input is a URL
        if (hasUrlScheme) {
            try {
                validateSafeMapUrl(cleanUrl);
            }
            catch (err) {
                if (err instanceof SsrfBlockedError) {
                    res.status(400).json({
                        success: false,
                        error: { code: err.code, message: err.message },
                        message: err.message,
                    });
                    return;
                }
                throw err;
            }
        }
        // 1. Direct parse on input URL/coordinates with place pin priority
        const directParsed = parseGoogleMapsLink(cleanUrl);
        if (directParsed.success && !directParsed.isViewportFallback) {
            res.json({
                success: true,
                lat: directParsed.lat,
                lng: directParsed.lng,
                source: directParsed.source,
                isViewportFallback: false,
                isAmbiguous: false,
                resolvedUrl: cleanUrl,
            });
            return;
        }
        // 2. If it is an allowlisted HTTPS Google Maps URL (e.g. maps.app.goo.gl), resolve via SSRF-safe fetch
        if (hasUrlScheme) {
            try {
                const { finalUrl, html } = await ssrfSafeMapFetch(cleanUrl);
                // Parse final resolved URL
                const redirectParsed = parseGoogleMapsLink(finalUrl);
                if (redirectParsed.success && !redirectParsed.isViewportFallback) {
                    res.json({
                        success: true,
                        lat: redirectParsed.lat,
                        lng: redirectParsed.lng,
                        source: redirectParsed.source,
                        isViewportFallback: false,
                        isAmbiguous: false,
                        resolvedUrl: finalUrl,
                    });
                    return;
                }
                // Check HTML content for place pin metadata
                const pinInHtml = html.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
                if (pinInHtml) {
                    const lat = parseFloat(pinInHtml[1]);
                    const lng = parseFloat(pinInHtml[2]);
                    if (!isNaN(lat) && !isNaN(lng)) {
                        res.json({
                            success: true,
                            lat: Number(lat.toFixed(6)),
                            lng: Number(lng.toFixed(6)),
                            source: 'pin',
                            isViewportFallback: false,
                            isAmbiguous: false,
                            resolvedUrl: finalUrl,
                        });
                        return;
                    }
                }
                // Viewport fallback if nothing else found
                if (redirectParsed.success) {
                    res.json({
                        success: true,
                        lat: redirectParsed.lat,
                        lng: redirectParsed.lng,
                        source: redirectParsed.source,
                        isViewportFallback: true,
                        isAmbiguous: true,
                        message: redirectParsed.message,
                        resolvedUrl: finalUrl,
                    });
                    return;
                }
            }
            catch (fetchErr) {
                if (fetchErr instanceof SsrfBlockedError) {
                    res.status(400).json({
                        success: false,
                        error: { code: fetchErr.code, message: fetchErr.message },
                        message: fetchErr.message,
                    });
                    return;
                }
                console.warn('Redirect fetch error for map link:', fetchErr.message);
            }
        }
        // 3. Fallback to directParsed if it had a viewport match
        if (directParsed.success) {
            res.json({
                success: true,
                lat: directParsed.lat,
                lng: directParsed.lng,
                source: directParsed.source,
                isViewportFallback: directParsed.isViewportFallback,
                isAmbiguous: directParsed.isAmbiguous,
                message: directParsed.message,
                resolvedUrl: cleanUrl,
            });
            return;
        }
        res.json({
            success: false,
            message: 'Could not extract coordinates from link or text. Please click on the map or enter Latitude and Longitude.',
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Error resolving map link' });
    }
});
// Company Profile Settings
settingsRouter.get('/company', getCompanySettings);
settingsRouter.put('/company', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'HR', 'Admin']), updateCompanySettings);
// Geofence Attendance Settings (Write restricted strictly to authorized HR / CEO / Admin roles)
settingsRouter.put('/geofence', requireRoles(['Super Admin', 'CEO', 'HR Manager', 'HR Admin', 'HR', 'Admin', 'ERP Administrator']), updateGeofenceSettings);
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
//# sourceMappingURL=settingsRoutes.js.map