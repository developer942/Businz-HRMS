import dns from 'node:dns';
import net from 'node:net';
export class SsrfBlockedError extends Error {
    code = 'SSRF_BLOCKED';
    statusCode = 400;
    constructor(message) {
        super(message);
        this.name = 'SsrfBlockedError';
    }
}
export const ALLOWED_GOOGLE_MAPS_HOSTS = new Set([
    'maps.app.goo.gl',
    'goo.gl',
    'g.co',
    'google.com',
    'www.google.com',
    'maps.google.com',
    'google.co.in',
    'www.google.co.in',
    'maps.google.co.in',
]);
/**
 * Checks whether an IPv4 or IPv6 address belongs to a loopback, private,
 * link-local (including cloud metadata 169.254.169.254), CGNAT, multicast,
 * unspecified, or unique-local network range.
 */
export function isPrivateOrReservedIp(rawIp) {
    const ip = rawIp.trim().toLowerCase().replace(/^\[|\]$/g, '');
    if (!ip)
        return true;
    // Handle IPv6 zone index (e.g. fe80::1%eth0)
    const cleanIp = ip.split('%')[0];
    const version = net.isIP(cleanIp);
    if (version === 4) {
        const parts = cleanIp.split('.').map((p) => Number(p));
        if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
            return true;
        }
        const [a, b, c] = parts;
        // 0.0.0.0/8 (Current / unspecified network)
        if (a === 0)
            return true;
        // 10.0.0.0/8 (Private RFC 1918)
        if (a === 10)
            return true;
        // 100.64.0.0/10 (Carrier-Grade NAT RFC 6598)
        if (a === 100 && b >= 64 && b <= 127)
            return true;
        // 127.0.0.0/8 (Loopback)
        if (a === 127)
            return true;
        // 169.254.0.0/16 (Link-local / Cloud instance metadata service 169.254.169.254)
        if (a === 169 && b === 254)
            return true;
        // 172.16.0.0/12 (Private RFC 1918)
        if (a === 172 && b >= 16 && b <= 31)
            return true;
        // 192.0.0.0/24 (IETF Protocol Assignments) & 192.0.2.0/24 (TEST-NET-1)
        if (a === 192 && b === 0 && (c === 0 || c === 2))
            return true;
        // 192.168.0.0/16 (Private RFC 1918)
        if (a === 192 && b === 168)
            return true;
        // 198.18.0.0/15 (Benchmarking) & 198.51.100.0/24 (TEST-NET-2)
        if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
            return true;
        // 203.0.113.0/24 (TEST-NET-3)
        if (a === 203 && b === 0 && c === 113)
            return true;
        // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved / Broadcast)
        if (a >= 224)
            return true;
        return false;
    }
    if (version === 6) {
        if (cleanIp === '::' || cleanIp === '::1' || cleanIp === '0:0:0:0:0:0:0:1' || cleanIp === '0:0:0:0:0:0:0:0') {
            return true;
        }
        // IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1 or ::ffff:169.254.169.254)
        if (cleanIp.startsWith('::ffff:')) {
            const mappedPart = cleanIp.slice('::ffff:'.length);
            if (net.isIP(mappedPart) === 4) {
                return isPrivateOrReservedIp(mappedPart);
            }
            // Hexadecimal IPv4-mapped representation (e.g. ::ffff:7f00:1)
            const hexParts = mappedPart.split(':');
            if (hexParts.length === 2) {
                const high = parseInt(hexParts[0], 16);
                const low = parseInt(hexParts[1], 16);
                if (!Number.isNaN(high) && !Number.isNaN(low)) {
                    const ipv4 = `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
                    return isPrivateOrReservedIp(ipv4);
                }
            }
            return true;
        }
        // Unique local addresses fc00::/7 (fc00:: through fdff::)
        if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd'))
            return true;
        // Link-local fe80::/10 (fe80:: through febf::)
        if (cleanIp.startsWith('fe8') || cleanIp.startsWith('fe9') || cleanIp.startsWith('fea') || cleanIp.startsWith('feb')) {
            return true;
        }
        // Multicast ff00::/8
        if (cleanIp.startsWith('ff'))
            return true;
        // Documentation 2001:db8::/32
        if (cleanIp.startsWith('2001:db8:') || cleanIp.startsWith('2001:0db8:'))
            return true;
        return false;
    }
    // Not a valid IPv4 or IPv6 literal
    return true;
}
/**
 * Validates that a URL uses HTTPS, has no embedded credentials, uses standard port 443,
 * is not an IP literal, and belongs to the allowlisted Google Maps hostnames.
 */
export function validateSafeMapUrl(rawUrl) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    }
    catch {
        throw new SsrfBlockedError('Invalid URL format.');
    }
    if (parsed.protocol !== 'https:') {
        throw new SsrfBlockedError(`Unsafe URL scheme "${parsed.protocol}". Only https:// Google Maps links are permitted.`);
    }
    if (parsed.username || parsed.password) {
        throw new SsrfBlockedError('URLs with embedded credentials are not permitted.');
    }
    if (parsed.port && parsed.port !== '443') {
        throw new SsrfBlockedError(`Non-standard port "${parsed.port}" is not permitted.`);
    }
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!hostname) {
        throw new SsrfBlockedError('URL hostname is required.');
    }
    if (hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal') ||
        net.isIP(hostname) !== 0) {
        throw new SsrfBlockedError('Direct IP addresses and internal hostnames are forbidden.');
    }
    if (!ALLOWED_GOOGLE_MAPS_HOSTS.has(hostname)) {
        throw new SsrfBlockedError(`Host "${hostname}" is not in the approved Google Maps domain allowlist.`);
    }
    return parsed;
}
const defaultDnsLookup = async (hostname) => {
    return dns.promises.lookup(hostname, { all: true, verbatim: true });
};
/**
 * Resolves the hostname via DNS and verifies that every returned IP is public.
 */
export async function assertSafeHostResolution(hostname, lookupFn = defaultDnsLookup) {
    let records;
    try {
        records = await lookupFn(hostname);
    }
    catch {
        throw new SsrfBlockedError(`Unable to resolve hostname "${hostname}".`);
    }
    if (!Array.isArray(records) || records.length === 0) {
        throw new SsrfBlockedError(`Hostname "${hostname}" did not resolve to any IP address.`);
    }
    for (const record of records) {
        if (isPrivateOrReservedIp(record.address)) {
            throw new SsrfBlockedError(`Hostname "${hostname}" resolved to a restricted or private network address.`);
        }
    }
}
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
/**
 * Fetches a Google Maps URL with strict SSRF protection:
 * - Enforces HTTPS + Google Maps domain allowlist + DNS private-IP blocking
 * - Manually inspects every redirect hop (`redirect: 'manual'`) and validates
 *   each target URL and DNS resolution before following
 * - Enforces request timeout and response body size limits
 */
export async function ssrfSafeMapFetch(initialUrl, options = {}) {
    const maxRedirects = options.maxRedirects ?? 5;
    const timeoutMs = options.timeoutMs ?? 5000;
    const maxBodyBytes = options.maxBodyBytes ?? 256 * 1024;
    const lookupFn = options.dnsLookupFn ?? defaultDnsLookup;
    const fetchFn = options.fetchFn ?? fetch;
    let currentUrlObj = validateSafeMapUrl(initialUrl);
    await assertSafeHostResolution(currentUrlObj.hostname, lookupFn);
    for (let hop = 0; hop <= maxRedirects; hop++) {
        const resp = await fetchFn(currentUrlObj.toString(), {
            method: 'GET',
            redirect: 'manual',
            signal: AbortSignal.timeout(timeoutMs),
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });
        if (REDIRECT_STATUS_CODES.has(resp.status)) {
            if (hop === maxRedirects) {
                throw new SsrfBlockedError(`Maximum redirect limit (${maxRedirects}) exceeded.`);
            }
            const locationHeader = resp.headers.get('location');
            if (!locationHeader) {
                throw new SsrfBlockedError('Redirect response missing Location header.');
            }
            let nextUrlObj;
            try {
                nextUrlObj = new URL(locationHeader, currentUrlObj);
            }
            catch {
                throw new SsrfBlockedError('Invalid redirect Location URL.');
            }
            currentUrlObj = validateSafeMapUrl(nextUrlObj.toString());
            await assertSafeHostResolution(currentUrlObj.hostname, lookupFn);
            continue;
        }
        const rawText = await resp.text().catch(() => '');
        const html = rawText.length > maxBodyBytes ? rawText.slice(0, maxBodyBytes) : rawText;
        return {
            finalUrl: currentUrlObj.toString(),
            status: resp.status,
            html,
        };
    }
    throw new SsrfBlockedError(`Maximum redirect limit (${maxRedirects}) exceeded.`);
}
//# sourceMappingURL=ssrfSafeFetch.js.map