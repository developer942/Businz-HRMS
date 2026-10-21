import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../config/database.js';
const mapReset = (row) => ({
    id: row.id,
    employeeId: row.employee_id,
    otpHash: row.otp_hash,
    expiresAt: new Date(row.expires_at),
    attemptCount: Number(row.attempt_count) || 0,
    isUsed: Boolean(row.is_used),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
});
export class PasswordResetRepository {
    async countRecentRequests(employeeId, windowMinutes = 15) {
        const result = await query(`SELECT COUNT(*)::text AS count FROM password_resets
       WHERE LOWER(employee_id) = LOWER($1)
         AND created_at >= NOW() - ($2::text || ' minutes')::interval`, [employeeId.trim(), windowMinutes]);
        return Number(result.rows[0]?.count) || 0;
    }
    async createResetRecord(params) {
        const result = await query(`INSERT INTO password_resets (employee_id, otp_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING *`, [params.employeeId.trim(), params.otpHash, params.expiresAt.toISOString()]);
        return mapReset(result.rows[0]);
    }
    async getLatestActiveReset(employeeId) {
        const result = await query(`SELECT * FROM password_resets
       WHERE LOWER(employee_id) = LOWER($1) AND is_used = FALSE
       ORDER BY created_at DESC
       LIMIT 1`, [employeeId.trim()]);
        return result.rows[0] ? mapReset(result.rows[0]) : null;
    }
    async incrementAttempt(id) {
        const result = await query(`UPDATE password_resets
       SET attempt_count = attempt_count + 1, updated_at = NOW()
       WHERE id = $1
       RETURNING attempt_count`, [id]);
        if (!result.rows[0])
            throw new Error('Password reset request not found');
        return Number(result.rows[0].attempt_count);
    }
    async markAsUsed(id) {
        const result = await query(`UPDATE password_resets SET is_used = TRUE, updated_at = NOW()
       WHERE id = $1 AND is_used = FALSE`, [id]);
        if (!result.rowCount)
            throw new Error('Password reset request is invalid or already used');
    }
    generateResetToken(employeeId, email) {
        return jwt.sign({ sub: employeeId, email, purpose: 'password_reset' }, env.JWT_SECRET, { expiresIn: '15m' });
    }
    verifyResetToken(token) {
        try {
            const decoded = jwt.verify(token, env.JWT_SECRET);
            if (decoded.purpose !== 'password_reset' || !decoded.sub)
                return null;
            return { employeeId: decoded.sub, email: decoded.email };
        }
        catch {
            return null;
        }
    }
}
export const passwordResetRepository = new PasswordResetRepository();
//# sourceMappingURL=passwordResetRepository.js.map