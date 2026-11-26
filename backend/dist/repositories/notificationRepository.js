import { query, withTransaction } from '../config/database.js';
const SETTING_KEY = 'shared_notifications_data';
const normalized = (val) => String(val ?? '').trim().toLowerCase();
export class NotificationRepository {
    /**
     * Determine identity keys for an authenticated user to match recipient records
     */
    getUserIdentities(user) {
        return [...new Set([user.employeeId, user.id, user.email, user.name]
                .map(normalized)
                .filter(Boolean))];
    }
    /**
     * Determine audience roles for an authenticated user
     */
    getUserAudienceRoles(user) {
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
        if (role.includes('manager') || designation.includes('manager') || designation.includes('lead') || designation.includes('head')) {
            roles.add('MANAGER');
        }
        return [...roles];
    }
    /**
     * Create an enterprise notification with explicit deduplication.
     * Safe for repeated or concurrent calls.
     */
    async createNotification(params) {
        const companyId = params.companyId || 'company-a';
        const priority = params.priority || 'Normal';
        const category = params.category || 'Announcement';
        const actionRequired = Boolean(params.actionRequired);
        const actionStatus = params.actionStatus || (actionRequired ? 'Pending' : 'None');
        const targetRoles = (params.targetRoles || []).map(r => String(r).trim().toUpperCase());
        const metadata = params.metadata || {};
        // Auto-generate a stable deduplication key if none supplied
        const dedupKey = params.dedupKey || [
            companyId,
            params.module || 'system',
            params.recordId || 'global',
            params.eventType || 'notice',
            (params.targetEmployeeIds || []).sort().join(',') || targetRoles.sort().join(','),
        ].join(':');
        return withTransaction(async (client) => {
            // 1. Check if a notification with this dedup_key already exists
            const existing = await client.query('SELECT id, dedup_key FROM public.notifications WHERE dedup_key = $1 LIMIT 1', [dedupKey]);
            if (existing.rows[0]) {
                return { id: existing.rows[0].id, dedupKey, created: false };
            }
            // 2. Resolve sender UUID if senderId is employee code
            let senderUuid = null;
            if (params.senderId) {
                const senderRes = await client.query('SELECT id FROM public.employees WHERE id::text = $1 OR employee_id = $1 OR email = $1 LIMIT 1', [params.senderId]);
                senderUuid = senderRes.rows[0]?.id || null;
            }
            // 3. Insert notification
            const insertResult = await client.query(`INSERT INTO public.notifications (
          title, message, priority, category, link, company_id, module,
          record_id, event_type, dedup_key, action_required, action_status,
          sender_id, sender_name, target_roles, metadata, created_at, timestamp
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW()
        )
        ON CONFLICT (dedup_key) DO NOTHING
        RETURNING id`, [
                params.title,
                params.message,
                priority,
                category,
                params.link || null,
                companyId,
                params.module || null,
                params.recordId || null,
                params.eventType || null,
                dedupKey,
                actionRequired,
                actionStatus,
                senderUuid,
                params.senderName || null,
                targetRoles,
                JSON.stringify(metadata),
            ]);
            let notificationId = insertResult.rows[0]?.id;
            if (!notificationId) {
                // Race condition hit ON CONFLICT DO NOTHING: retrieve existing
                const raced = await client.query('SELECT id FROM public.notifications WHERE dedup_key = $1 LIMIT 1', [dedupKey]);
                return { id: raced.rows[0].id, dedupKey, created: false };
            }
            // 4. Resolve recipient employee UUIDs
            const recipientUuids = new Set();
            // A. Specific employee targets
            if (params.targetEmployeeIds && params.targetEmployeeIds.length > 0) {
                const empRes = await client.query(`SELECT id FROM public.employees 
           WHERE employee_id = ANY($1) OR id::text = ANY($1) OR email = ANY($1)`, [params.targetEmployeeIds]);
                empRes.rows.forEach(r => recipientUuids.add(r.id));
            }
            // B. Role targets
            if (targetRoles.length > 0) {
                const roleClauses = [];
                const roleParams = [];
                if (targetRoles.includes('CEO')) {
                    roleParams.push('CEO', 'Super Admin');
                    roleClauses.push(`role = ANY($${roleParams.length}) OR designation ILIKE '%CEO%' OR designation ILIKE '%Managing Director%'`);
                }
                if (targetRoles.includes('HR')) {
                    roleParams.push('HR', 'HR Manager', 'HR Admin');
                    roleClauses.push(`role = ANY($${roleParams.length}) OR department ILIKE '%HR%' OR department ILIKE '%Human Resource%' OR designation ILIKE '%HR%'`);
                }
                if (targetRoles.includes('ACCOUNTS')) {
                    roleParams.push('Finance Manager', 'Accounts');
                    roleClauses.push(`role = ANY($${roleParams.length}) OR department ILIKE '%Finance%' OR department ILIKE '%Account%' OR designation ILIKE '%Account%'`);
                }
                if (targetRoles.includes('ALL')) {
                    roleClauses.push(`account_status = 'ACTIVE'`);
                }
                if (roleClauses.length > 0) {
                    const roleEmpRes = await client.query(`SELECT id FROM public.employees WHERE ${roleClauses.join(' OR ')}`, roleParams);
                    roleEmpRes.rows.forEach(r => recipientUuids.add(r.id));
                }
            }
            // Exclude sender from recipient list
            if (senderUuid) {
                recipientUuids.delete(senderUuid);
            }
            // 5. Insert rows into notification_recipients
            for (const empId of recipientUuids) {
                await client.query(`INSERT INTO public.notification_recipients (notification_id, employee_id, is_read, created_at)
           VALUES ($1, $2, FALSE, NOW())
           ON CONFLICT (notification_id, employee_id) DO NOTHING`, [notificationId, empId]);
            }
            // 6. Synchronize with legacy company_settings.shared_notifications_data for seamless backward compatibility
            try {
                const legacyItem = {
                    id: notificationId,
                    title: params.title,
                    message: params.message,
                    priority,
                    category,
                    link: params.link,
                    createdAt: new Date().toISOString(),
                    timestamp: 'Just now',
                    read: false,
                    senderKey: params.senderId || '',
                    targetRoles,
                    targetEmployeeIds: params.targetEmployeeIds || [],
                    readBy: [],
                    module: params.module,
                    recordId: params.recordId,
                    actionRequired,
                    actionStatus,
                };
                await client.query(`UPDATE public.company_settings
           SET setting_val = (
             SELECT jsonb_path_query_array(
               jsonb_insert(
                 COALESCE(setting_val, '[]'::jsonb),
                 '{0}',
                 $1::jsonb
               ),
               '$[0 to 299]'
             )
           ),
           updated_at = NOW()
           WHERE setting_key = $2`, [JSON.stringify(legacyItem), SETTING_KEY]);
            }
            catch (legacyErr) {
                // Non-blocking fallback
            }
            return { id: notificationId, dedupKey, created: true };
        });
    }
    /**
     * Retrieve notifications for an authenticated user with filtering, pagination, and unread counts.
     */
    async getNotificationsForUser(user, options = {}) {
        const limit = Math.min(100, Math.max(1, options.limit || 50));
        const offset = Math.max(0, options.offset || 0);
        const audienceRoles = this.getUserAudienceRoles(user);
        const identities = this.getUserIdentities(user);
        // Resolve user's employee UUID
        let userUuid = user.id;
        if (user.employeeId) {
            const uRes = await query('SELECT id FROM public.employees WHERE employee_id = $1 OR id::text = $1 OR email = $2 LIMIT 1', [user.employeeId, user.email]);
            if (uRes.rows[0]?.id) {
                userUuid = uRes.rows[0].id;
            }
        }
        // Build filter condition
        let filterClause = '';
        const queryParams = [userUuid, audienceRoles, identities];
        let paramIdx = 4;
        if (options.filter === 'unread') {
            filterClause += ' AND COALESCE(nr.is_read, FALSE) = FALSE';
        }
        else if (options.filter === 'action_required') {
            filterClause += " AND n.action_required = TRUE AND n.action_status = 'Pending'";
        }
        else if (['urgent', 'important', 'normal'].includes(options.filter || '')) {
            queryParams.push(options.filter.charAt(0).toUpperCase() + options.filter.slice(1));
            filterClause += ` AND n.priority = $${paramIdx++}`;
        }
        if (options.module) {
            queryParams.push(options.module);
            filterClause += ` AND (n.module = $${paramIdx++} OR n.link ILIKE '%' || $${paramIdx - 1} || '%')`;
        }
        // Main Query: notifications where user is an explicit recipient OR user belongs to target_roles
        const sql = `
      WITH user_visible_notifs AS (
        SELECT 
          n.id,
          n.title,
          n.message,
          n.timestamp,
          n.priority,
          n.category,
          n.link,
          n.company_id,
          n.module,
          n.record_id,
          n.event_type,
          n.dedup_key,
          n.action_required,
          n.action_status,
          n.handled_at,
          n.handled_by,
          n.sender_id,
          n.sender_name,
          n.target_roles,
          n.metadata,
          n.created_at,
          COALESCE(nr.is_read, FALSE) AS is_read,
          nr.read_at
        FROM public.notifications n
        LEFT JOIN public.notification_recipients nr 
          ON nr.notification_id = n.id AND nr.employee_id = $1
        WHERE 
          -- Match explicit recipient or target role
          (nr.employee_id = $1 OR n.target_roles && $2::text[])
          -- Exclude sender
          AND (n.sender_id IS NULL OR n.sender_id != $1)
          AND (n.sender_name IS NULL OR NOT (LOWER(n.sender_name) = ANY($3::text[])))
          ${filterClause}
      )
      SELECT 
        *,
        COUNT(*) OVER() as full_count,
        COUNT(CASE WHEN NOT is_read THEN 1 END) OVER() as unread_count,
        COUNT(CASE WHEN action_required AND action_status = 'Pending' THEN 1 END) OVER() as action_required_count
      FROM user_visible_notifs
      ORDER BY created_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++};
    `;
        queryParams.push(limit, offset);
        const result = await query(sql, queryParams);
        const total = result.rows[0]?.full_count ? Number(result.rows[0].full_count) : 0;
        const unread = result.rows[0]?.unread_count ? Number(result.rows[0].unread_count) : 0;
        const actionRequired = result.rows[0]?.action_required_count ? Number(result.rows[0].action_required_count) : 0;
        const data = result.rows.map(row => ({
            id: row.id,
            title: row.title,
            message: row.message,
            timestamp: row.timestamp,
            priority: row.priority,
            category: row.category,
            link: row.link,
            module: row.module,
            recordId: row.record_id,
            eventType: row.event_type,
            dedupKey: row.dedup_key,
            actionRequired: row.action_required,
            actionStatus: row.action_status,
            handledAt: row.handled_at,
            senderName: row.sender_name,
            targetRoles: row.target_roles,
            metadata: row.metadata,
            createdAt: row.created_at,
            read: row.is_read,
            readAt: row.read_at,
        }));
        return {
            data,
            meta: {
                total,
                unread,
                actionRequired,
                limit,
                offset,
            },
        };
    }
    /**
     * Mark a notification as read by the user
     */
    async markNotificationRead(notificationId, user) {
        const identities = this.getUserIdentities(user);
        const readKey = identities[0] || user.id;
        // Resolve employee UUID
        let empUuid = user.id;
        const empRes = await query('SELECT id FROM public.employees WHERE employee_id = $1 OR id::text = $1 OR email = $2 LIMIT 1', [user.employeeId || user.id, user.email]);
        if (empRes.rows[0]?.id) {
            empUuid = empRes.rows[0].id;
        }
        return withTransaction(async (client) => {
            // Upsert notification_recipients row
            await client.query(`INSERT INTO public.notification_recipients (notification_id, employee_id, is_read, read_at)
         VALUES ($1, $2, TRUE, NOW())
         ON CONFLICT (notification_id, employee_id) 
         DO UPDATE SET is_read = TRUE, read_at = NOW()`, [notificationId, empUuid]);
            // Also update legacy setting readBy array
            try {
                await client.query(`UPDATE public.company_settings
           SET setting_val = (
             SELECT jsonb_agg(
               CASE 
                 WHEN item->>'id' = $1 THEN 
                   jsonb_set(
                     item, 
                     '{readBy}', 
                     COALESCE(item->'readBy', '[]'::jsonb) || jsonb_build_array($2::text)
                   )
                 ELSE item 
               END
             )
             FROM jsonb_array_elements(setting_val) AS item
           ),
           updated_at = NOW()
           WHERE setting_key = $3`, [notificationId, readKey, SETTING_KEY]);
            }
            catch { }
            return true;
        });
    }
    /**
     * Mark all notifications visible to user as read
     */
    async markAllNotificationsRead(user) {
        const identities = this.getUserIdentities(user);
        const readKey = identities[0] || user.id;
        const audienceRoles = this.getUserAudienceRoles(user);
        let empUuid = user.id;
        const empRes = await query('SELECT id FROM public.employees WHERE employee_id = $1 OR id::text = $1 OR email = $2 LIMIT 1', [user.employeeId || user.id, user.email]);
        if (empRes.rows[0]?.id) {
            empUuid = empRes.rows[0].id;
        }
        return withTransaction(async (client) => {
            // Find all visible unread notifications
            const visible = await client.query(`SELECT n.id 
         FROM public.notifications n
         LEFT JOIN public.notification_recipients nr 
           ON nr.notification_id = n.id AND nr.employee_id = $1
         WHERE (nr.employee_id = $1 OR n.target_roles && $2::text[])
           AND COALESCE(nr.is_read, FALSE) = FALSE`, [empUuid, audienceRoles]);
            for (const row of visible.rows) {
                await client.query(`INSERT INTO public.notification_recipients (notification_id, employee_id, is_read, read_at)
           VALUES ($1, $2, TRUE, NOW())
           ON CONFLICT (notification_id, employee_id)
           DO UPDATE SET is_read = TRUE, read_at = NOW()`, [row.id, empUuid]);
            }
            // Also update legacy setting readBy
            try {
                await client.query(`UPDATE public.company_settings
           SET setting_val = (
             SELECT jsonb_agg(
               jsonb_set(
                 item, 
                 '{readBy}', 
                 COALESCE(item->'readBy', '[]'::jsonb) || jsonb_build_array($1::text)
               )
             )
             FROM jsonb_array_elements(setting_val) AS item
           ),
           updated_at = NOW()
           WHERE setting_key = $2`, [readKey, SETTING_KEY]);
            }
            catch { }
            return visible.rows.length;
        });
    }
    /**
     * Mark action item as handled (e.g. Leave approved, Correction approved, etc.)
     */
    async markActionHandled(module, recordId, handledByUuid) {
        const result = await query(`UPDATE public.notifications
       SET action_status = 'Handled', handled_at = NOW(), handled_by = $1
       WHERE module = $2 AND record_id = $3 AND action_required = TRUE AND action_status = 'Pending'`, [handledByUuid || null, module, recordId]);
        return result.rowCount || 0;
    }
}
export const notificationRepository = new NotificationRepository();
//# sourceMappingURL=notificationRepository.js.map