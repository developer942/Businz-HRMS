import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { authRepository } from '../repositories/authRepository.js';
export const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (!token) {
        res.status(401).json({
            success: false,
            error: {
                code: 'HRMS_UNAUTHENTICATED',
                message: 'Authentication required. Please provide a valid Bearer token.',
                details: [],
            },
        });
        return;
    }
    if (token.startsWith('vrm_session_')) {
        res.status(401).json({
            success: false,
            error: { code: 'HRMS_TOKEN_INVALID', message: 'Legacy browser sessions are no longer accepted. Please sign in again.', details: [] },
        });
        return;
    }
    let verifiedUser = null;
    let isExpired = false;
    try {
        verifiedUser = jwt.verify(token, env.JWT_SECRET);
    }
    catch (error) {
        isExpired = error?.name === 'TokenExpiredError';
    }
    if (isExpired && !verifiedUser) {
        res.status(401).json({
            success: false,
            error: {
                code: 'HRMS_TOKEN_EXPIRED',
                message: 'Your HRMS session has expired. Please sign in again.',
                details: [],
            },
        });
        return;
    }
    if (!verifiedUser) {
        res.status(401).json({
            success: false,
            error: {
                code: 'HRMS_TOKEN_INVALID',
                message: 'Invalid HRMS session token. Please sign in again.',
                details: [],
            },
        });
        return;
    }
    try {
        const currentAccount = await authRepository.findByIdentifier(verifiedUser.employeeId || verifiedUser.email);
        if (!currentAccount || !currentAccount.isActive || currentAccount.accountStatus === 'DEACTIVATED' || currentAccount.accountStatus === 'DISABLED') {
            res.status(401).json({
                success: false,
                error: { code: 'HRMS_TOKEN_INVALID', message: 'Your account is unavailable or has been deactivated. Please sign in again.', details: [] },
            });
            return;
        }
        verifiedUser = {
            ...verifiedUser,
            id: currentAccount.id,
            email: currentAccount.email,
            role: currentAccount.role,
            employeeId: currentAccount.employeeId,
            name: currentAccount.name,
            department: currentAccount.department,
            designation: currentAccount.designation,
            company_id: currentAccount.company_id || 'company-a',
            mustChangePassword: currentAccount.mustChangePassword,
            accountStatus: currentAccount.accountStatus,
        };
    }
    catch (error) {
        next(error);
        return;
    }
    if (verifiedUser.mustChangePassword && !req.originalUrl.endsWith('/auth/change-password')) {
        res.status(403).json({
            success: false,
            error: {
                code: 'PASSWORD_CHANGE_REQUIRED',
                message: 'You must change your temporary password before accessing the application.',
                details: [],
            },
        });
        return;
    }
    req.user = verifiedUser;
    next();
};
//# sourceMappingURL=authMiddleware.js.map