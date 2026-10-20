import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types/auth.js';
import { PermissionAction, DataAccessLevel } from '../types/rbac.js';
import { rbacRepository } from '../repositories/rbacRepository.js';

declare global {
  namespace Express {
    interface Request {
      dataAccessScope?: {
        level: DataAccessLevel;
        employeeId?: string;
        department?: string;
      };
    }
  }
}

/**
 * Validates whether the authenticated user possesses one of the allowed role names.
 */
export const requireRoles = (allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'HRMS_UNAUTHENTICATED',
          message: 'Authentication required. Please sign in to your HRMS account.',
          details: [],
        },
      });
      return;
    }

    // Super Admin and CEO always possess full access
    if (req.user.role === 'Super Admin' || req.user.role === 'CEO') {
      return next();
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'HRMS_FORBIDDEN',
          message: `Insufficient permissions: Your role (${req.user.role}) does not have permission for this action. Required: ${allowedRoles.join(', ')}`,
          details: [`Allowed roles: ${allowedRoles.join(', ')}`],
        },
      });
      return;
    }

    next();
  };
};

/**
 * Validates dynamic module-level action permission for the user's role.
 * Example: requirePermission('employees', 'view'), requirePermission('payroll', 'edit')
 */
export const requirePermission = (moduleName: string, action: PermissionAction) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required to verify permissions',
          details: [],
        },
      });
      return;
    }

    const userRole = req.user.role;

    // Super Admin and CEO retain master permission bypass
    if (userRole === 'Super Admin' || userRole === 'CEO') {
      return next();
    }

    const roleConfig = rbacRepository.getRolePermissions(userRole);
    if (!roleConfig) {
      // Fallback: check standard roles
      if (['Admin', 'HR', 'HR Manager', 'HR Admin'].includes(userRole)) {
        return next();
      }
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `No permission matrix configured for role: ${userRole}`,
          details: [`Required module permission: ${moduleName}.${action}`],
        },
      });
      return;
    }

    const moduleActions = roleConfig.modulePermissions[moduleName] || [];
    if (!moduleActions.includes(action)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied: Role "${userRole}" lacks "${action}" permission on module "${moduleName}".`,
          details: [`Configured actions for ${moduleName}: [${moduleActions.join(', ') || 'none'}]`],
        },
      });
      return;
    }

    next();
  };
};

/**
 * Validates specific granular special permission (e.g. view_salary, edit_salary, process_payroll).
 */
export const requireSpecialPermission = (specialPermissionKey: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          details: [],
        },
      });
      return;
    }

    const userRole = req.user.role;

    // Super Admin and CEO retain master permission bypass
    if (userRole === 'Super Admin' || userRole === 'CEO') {
      return next();
    }

    const roleConfig = rbacRepository.getRolePermissions(userRole);
    if (!roleConfig) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied: Special permission "${specialPermissionKey}" required.`,
          details: [`Role "${userRole}" has no special permissions configured.`],
        },
      });
      return;
    }

    if (!roleConfig.specialPermissions.includes(specialPermissionKey)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied: Role "${userRole}" lacks special permission "${specialPermissionKey}".`,
          details: [],
        },
      });
      return;
    }

    next();
  };
};

/**
 * Scopes data access based on role's configured Data Access level:
 * - 'own': restricted to req.user.employeeId
 * - 'team': restricted to direct/indirect reportees or same department
 * - 'department': restricted to req.user.department
 * - 'all': unrestricted across all employees
 */
export const scopeDataAccess = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.user) {
    return next();
  }

  const userRole = req.user.role;
  if (userRole === 'Super Admin' || userRole === 'CEO') {
    req.dataAccessScope = {
      level: 'all',
      employeeId: req.user.employeeId,
      department: req.user.department,
    };
    return next();
  }

  const roleConfig = rbacRepository.getRolePermissions(userRole);
  const level: DataAccessLevel = roleConfig ? roleConfig.dataAccess : 'own';

  req.dataAccessScope = {
    level,
    employeeId: req.user.employeeId,
    department: req.user.department,
  };

  next();
};
