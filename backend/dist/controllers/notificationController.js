import { withTransaction, query } from '../config/database.js';
const SETTING_KEY = 'shared_notifications_data';
const MAX_PAGE_SIZE = 100;
const normalized = (value) => String(value ?? '').trim().toLowerCase();
export const notificationIdentityKeys = (user) => [...new Set([user.employeeId, user.id, user.email, user.name]
        .map(normalized)
        .filter(Boolean))];
export const notificationAudienceRoles = (user) => {
    const role = normalized(user.role);
    const department = normalized(user.department);
    const designation = normalized(user.designation);
    const roles = new Set(['ALL']);
    if (role === 'ceo' || role === 'super admin' || designation.includes('ceo') || designation.includes('managing director')) {
        roles.add('CEO');
    }
    if (role === 'hr' || role === 'hr manager' || role === 'hr admin' || department.includes('human resource') || department === 'hr' || /\bhr\b/.test(designation)) {
        roles.add('HR');
    }
    if (role.includes('finance') || role.includes('account') || department.includes('account') || department.includes('finance') || designation.includes('account') || designation.includes('finance')) {
        roles.add('ACCOUNTS');
    }
    return [...roles];
};
export const isNotificationVisibleToUser = (notification, user) => {
    const identities = notificationIdentityKeys(user);
    const sender = normalized(notification.senderKey);
    if (sender && identities.includes(sender))
        return false;
    const targets = (Array.isArray(notification.targetEmployeeIds)
        ? notification.targetEmployeeIds
        : []).map(normalized);
    if (targets.some((target) => identities.includes(target)))
        return true;
    const audiences = notificationAudienceRoles(user);
    return (Array.isArray(notification.targetRoles) ? notification.targetRoles : [])
        .map((role) => String(role ?? '').trim().toUpperCase())
        .some((role) => audiences.includes(role));
};
const decorate = (notification, user) => {
    const identities = notificationIdentityKeys(user);
    const readBy = (Array.isArray(notification.readBy) ? notification.readBy : []).map(normalized);
    return {
        ...notification,
        read: readBy.some((key) => identities.includes(key)),
    };
};
const loadNotifications = async () => {
    const result = await query('SELECT setting_val FROM public.company_settings WHERE setting_key=$1 LIMIT 1', [SETTING_KEY]);
    return Array.isArray(result.rows[0]?.setting_val)
        ? result.rows[0].setting_val
        : [];
};
export const listNotifications = async (req, res, next) => {
    try {
        const user = req.user;
        const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.limit) || 50));
        const offset = Math.max(0, Number(req.query.offset) || 0);
        const all = (await loadNotifications())
            .filter((notification) => isNotificationVisibleToUser(notification, user))
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
            .map((notification) => decorate(notification, user));
        res.json({
            success: true,
            data: all.slice(offset, offset + limit),
            meta: {
                total: all.length,
                unread: all.filter((notification) => !notification.read).length,
                limit,
                offset,
            },
        });
    }
    catch (error) {
        next(error);
    }
};
const markVisibleNotifications = async (user, requestedId) => withTransaction(async (client) => {
    const result = await client.query('SELECT id, setting_val FROM public.company_settings WHERE setting_key=$1 LIMIT 1 FOR UPDATE', [SETTING_KEY]);
    const row = result.rows[0];
    if (!row || !Array.isArray(row.setting_val))
        return 0;
    const identities = notificationIdentityKeys(user);
    const readKey = identities[0];
    if (!readKey)
        return 0;
    let changed = 0;
    const updated = row.setting_val.map((notification) => {
        if (requestedId && String(notification.id) !== requestedId)
            return notification;
        if (!isNotificationVisibleToUser(notification, user))
            return notification;
        const existing = (Array.isArray(notification.readBy) ? notification.readBy : []).map(String);
        if (existing.map(normalized).some((key) => identities.includes(key)))
            return notification;
        changed += 1;
        return { ...notification, readBy: [...existing, readKey] };
    });
    if (changed > 0) {
        await client.query('UPDATE public.company_settings SET setting_val=$1::jsonb, updated_at=NOW() WHERE id=$2', [JSON.stringify(updated), row.id]);
    }
    return changed;
});
export const markNotificationRead = async (req, res, next) => {
    try {
        const id = String(req.params.id || '').trim();
        const changed = await markVisibleNotifications(req.user, id);
        if (changed === 0) {
            res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Visible unread notification was not found', details: [] },
            });
            return;
        }
        res.json({ success: true, data: { id, read: true } });
    }
    catch (error) {
        next(error);
    }
};
export const markAllNotificationsRead = async (req, res, next) => {
    try {
        const changed = await markVisibleNotifications(req.user);
        res.json({ success: true, data: { updated: changed } });
    }
    catch (error) {
        next(error);
    }
};
//# sourceMappingURL=notificationController.js.map