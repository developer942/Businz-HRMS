import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { employeeRepository } from '../repositories/employeeRepository.js';
import { authRepository } from '../repositories/authRepository.js';
import { auditRepository } from '../repositories/auditRepository.js';
import { generateTemporaryPassword } from '../services/passwordService.js';
import { sendCredentialEmail, sendOfferLetterEmail } from '../services/emailService.js';
import { createEmployeeSchema, updateEmployeeSchema } from '../validators/employeeValidators.js';
import { updateAccountStatusSchema } from '../validators/authValidators.js';
import { AccountStatus } from '../types/auth.js';

const sendOfferLetterSchema = z.object({
  to: z.string().email(),
  candidateName: z.string().trim().min(1),
  employeeCode: z.string().trim().optional(),
  subject: z.string().trim().min(1),
  letterBody: z.string().trim().min(1),
  companyName: z.string().trim().optional(),
});

export const getEmployees = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { department, status, search } = req.query;
    let list = await employeeRepository.getEmployees({
      department: department as string,
      status: status as string,
      search: search as string,
    });

    // Enforce data access scoping based on user's role configuration
    if (req.dataAccessScope && req.dataAccessScope.level !== 'all') {
      const { level, employeeId, department: userDept } = req.dataAccessScope;
      if (level === 'own') {
        list = list.filter(emp => emp.id === employeeId || emp.employeeId === employeeId);
      } else if (level === 'department' && userDept) {
        list = list.filter(emp => emp.department?.toLowerCase() === userDept.toLowerCase());
      } else if (level === 'team' && employeeId) {
        list = list.filter(emp => 
          emp.id === employeeId || 
          emp.employeeId === employeeId || 
          (emp as any).reportingManagerId === employeeId ||
          (emp as any).reporting_manager_id === employeeId
        );
      }
    }

    res.status(200).json({
      success: true,
      data: list,
    });
  } catch (err) {
    next(err);
  }
};

export const getEmployeeById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = String(req.params.id);
    const emp = await employeeRepository.getEmployeeById(id);

    if (!emp) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Employee with ID ${id} not found`,
          details: [],
        },
      });
      return;
    }

    // Enforce data access scoping on single employee fetch
    if (req.dataAccessScope && req.dataAccessScope.level === 'own') {
      const { employeeId } = req.dataAccessScope;
      if (employeeId && emp.id !== employeeId && emp.employeeId !== employeeId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You only have permission to view your own employee profile.',
            details: [],
          },
        });
        return;
      }
    }

    res.status(200).json({
      success: true,
      data: emp,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Creates employee record, automatically provisions linked login account, and sends credential email
 */
export const createEmployee = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = createEmployeeSchema.parse(req.body);
    const cleanEmail = validated.email.toLowerCase().trim();
    const performer = req.user?.email || 'HR Department';

    // STEP 1: Validate that employee email does not already exist
    const existingEmpByEmail = await employeeRepository.findByEmail(cleanEmail);
    const existingAuthByEmail = await authRepository.findByIdentifier(cleanEmail);
    if (existingEmpByEmail || existingAuthByEmail) {
      res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_EMAIL',
          message: 'Email ID already exists.',
          details: [],
        },
      });
      return;
    }

    // STEP 2: Validate that Employee Code does not already exist (if provided)
    if (validated.employeeId) {
      const cleanEmpId = validated.employeeId.trim();
      const existingEmpById = await employeeRepository.findByEmployeeId(cleanEmpId);
      const existingAuthById = await authRepository.findByIdentifier(cleanEmpId);
      if (existingEmpById || existingAuthById) {
        res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_EMPLOYEE_CODE',
            message: `Employee Code / User ID "${cleanEmpId}" is already assigned to another employee.`,
            details: [],
          },
        });
        return;
      }
    }

    // STEP 3 & 4: Generate or accept provided temporary password
    const temporaryPassword = ((req.body.password || (validated as any).password) as string)?.trim() || generateTemporaryPassword();

    // Determine Employee Code
    let employeeCode = validated.employeeId?.trim();
    if (!employeeCode) {
      const allEmps = await employeeRepository.getAllEmployees();
      const numbers = allEmps
        .map(e => {
          const match = (e.employeeId || '').match(/\d+/);
          return match ? parseInt(match[0], 10) : 0;
        })
        .filter(n => !isNaN(n));
      const maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;
      employeeCode = `EMP-${(maxNum + 1).toString().padStart(3, '0')}`;
    }
    const employeeDbId = `e01a1111-0000-0000-0000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;

    // Determine role dynamically
    const userRole = (req.body.role as any) || (
      (validated.designation || '').toLowerCase().includes('ceo') || (validated.department || '').toLowerCase() === 'management'
        ? 'CEO'
        : (validated.designation || '').toLowerCase().includes('hr') || (validated.department || '').toLowerCase() === 'hr'
        ? 'HR Manager'
        : (validated.designation || '').toLowerCase().includes('account') || (validated.designation || '').toLowerCase().includes('finance') || (validated.department || '').toLowerCase() === 'accounts' || (validated.department || '').toLowerCase() === 'finance'
        ? 'Finance Manager'
        : 'Employee'
    );

    // STEP 5: Create linked authentication account
    const { user: authUser } = await authRepository.createLoginAccount({
      employeeDbId,
      employeeCode,
      email: cleanEmail,
      firstName: validated.firstName,
      lastName: validated.lastName || '',
      department: validated.department,
      designation: validated.designation,
      role: userRole,
      temporaryPassword,
    });

    // Create linked employee record
    const newEmp = await employeeRepository.createEmployee({
      ...validated,
      id: employeeDbId,
      employeeId: employeeCode,
      email: cleanEmail,
      authUserId: authUser.id,
      mustChangePassword: true,
      accountStatus: 'ACTIVE',
      status: 'Active',
      password: temporaryPassword,
    });

    // Audit log: employee login created
    await auditRepository.recordLog('EMPLOYEE_LOGIN_CREATED', employeeCode, performer, {
      email: cleanEmail,
      authUserId: authUser.id,
    });

    // STEP 6: Send credential notification email
    const emailResult = await sendCredentialEmail({
      to: cleanEmail,
      employeeName: `${validated.firstName} ${validated.lastName || ''}`.trim(),
      employeeCode,
      temporaryPassword,
    });

    // Update status in repository
    newEmp.credentialEmailStatus = emailResult.status;
    newEmp.credentialEmailSentAt = emailResult.sentAt;
    await authRepository.updateEmailStatus(cleanEmail, emailResult.status, emailResult.sentAt);

    // Audit log: email sent / failed
    await auditRepository.recordLog(
      emailResult.status === 'SENT' ? 'CREDENTIAL_EMAIL_SENT' : 'CREDENTIAL_EMAIL_SENT',
      employeeCode,
      performer,
      {
        email: cleanEmail,
        deliveryStatus: emailResult.status,
        error: emailResult.error,
      }
    );

    const isEmailOk = emailResult.status === 'SENT';

    const { password: _password, ...employeePayload } = newEmp;

    res.status(201).json({
      success: true,
      status: isEmailOk ? 'CREATED' : 'EMAIL_FAILED',
      message: isEmailOk
        ? 'Employee onboarded and login account credentials sent successfully.'
        : 'Employee created successfully, but login credential email could not be delivered.',
      data: {
        ...employeePayload,
        authUserId: authUser.id,
        accountStatus: 'ACTIVE',
        mustChangePassword: true,
        credentialEmailStatus: emailResult.status,
        credentialEmailSentAt: emailResult.sentAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const updateEmployee = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = String(req.params.id);
    const validated = updateEmployeeSchema.parse(req.body);

    // Validate email uniqueness if email is being updated
    if (validated.email) {
      const cleanEmail = validated.email.toLowerCase().trim();
      const existing = await employeeRepository.findByEmail(cleanEmail);
      if (existing && existing.id !== id && existing.employeeId !== id) {
        res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_EMAIL',
            message: 'Email ID already exists.',
            details: [],
          },
        });
        return;
      }
    }

    const updated = await employeeRepository.updateEmployee(id, validated as any);

    if (!updated) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Employee with ID ${id} not found`,
          details: [],
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

export const deleteEmployee = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = String(req.params.id);
    const success = await employeeRepository.deleteEmployee(id);

    if (!success) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Employee with ID ${id} not found`,
          details: [],
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: `Employee ${id} deleted successfully`,
    });
  } catch (err) {
    next(err);
  }
};

export const sendEmployeeOfferLetter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = sendOfferLetterSchema.parse(req.body);
    const performer = req.user?.email || 'HR Department';

    const result = await sendOfferLetterEmail(validated);

    await auditRepository.recordLog(
      'CREDENTIAL_EMAIL_SENT',
      validated.employeeCode || validated.to,
      performer,
      {
        email: validated.to,
        emailType: 'OFFER_LETTER',
        deliveryStatus: result.status,
        error: result.error,
      }
    );

    if (result.status === 'FAILED') {
      res.status(502).json({
        success: false,
        status: result.status,
        error: {
          code: 'OFFER_EMAIL_FAILED',
          message: result.error || 'Offer letter email could not be delivered.',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      status: result.status,
      message: 'Offer letter email sent successfully.',
      data: {
        sentAt: result.sentAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * HR Action: Reset / Resend Login Credentials
 */
export const resetEmployeeLogin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = String(req.params.id);
    const emp = await employeeRepository.getEmployeeById(id);

    if (!emp) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Employee with ID ${id} not found`,
          details: [],
        },
      });
      return;
    }

    const performer = req.user?.email || 'HR Department';
    const result = await authRepository.resetLoginCredentials(emp.employeeId, performer);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'RESET_FAILED',
          message: result.message || 'Failed to reset employee login credentials',
          details: [],
        },
      });
      return;
    }

    // Keep employee record updated
    emp.mustChangePassword = true;
    emp.credentialEmailStatus = result.emailStatus;
    emp.credentialEmailSentAt = new Date().toISOString();

    res.status(200).json({
      success: true,
      message: 'New login credentials generated and dispatched to registered email.',
      data: {
        employeeId: emp.employeeId,
        email: emp.email,
        temporaryPassword: result.temporaryPassword,
        emailStatus: result.emailStatus,
        mustChangePassword: true,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * HR Action: Enable or Disable Employee Login Access
 */
export const updateEmployeeLoginStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = String(req.params.id);
    const validated = updateAccountStatusSchema.parse(req.body);
    const emp = await employeeRepository.getEmployeeById(id);

    if (!emp) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Employee with ID ${id} not found`,
          details: [],
        },
      });
      return;
    }

    const performer = req.user?.email || 'HR Department';
    const result = await authRepository.updateAccountStatus(
      emp.employeeId,
      validated.status as AccountStatus,
      performer
    );

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'STATUS_UPDATE_FAILED',
          message: result.message || 'Failed to update login status',
          details: [],
        },
      });
      return;
    }

    emp.accountStatus = validated.status as AccountStatus;
    if (validated.status === 'DEACTIVATED' || validated.status === 'DISABLED') {
      emp.status = 'Inactive';
    } else if (validated.status === 'ACTIVE' && (emp.status === 'Inactive' || emp.status === 'Terminated')) {
      emp.status = 'Active';
    }

    res.status(200).json({
      success: true,
      message: `Employee login access has been ${validated.status === 'ACTIVE' ? 'activated' : 'deactivated'}.`,
      data: {
        employeeId: emp.employeeId,
        accountStatus: validated.status,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * HR View: Get detailed employee login account status and audit history
 */
export const getEmployeeLoginAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = String(req.params.id);
    const emp = await employeeRepository.getEmployeeById(id);

    if (!emp) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Employee with ID ${id} not found`,
          details: [],
        },
      });
      return;
    }

    const authUser = await authRepository.findByIdentifier(emp.employeeId);
    const auditLogs = await auditRepository.getLogs({ employeeId: emp.employeeId, limit: 15 });

    const passwordStatus = authUser?.mustChangePassword
      ? 'Temporary Password Active'
      : 'Password Changed';

    res.status(200).json({
      success: true,
      data: {
        userId: emp.employeeId,
        email: emp.email,
        accountStatus: authUser?.accountStatus || emp.accountStatus || 'ACTIVE',
        authAccount: authUser ? 'Created' : 'Not Created',
        credentialEmailStatus: authUser?.credentialEmailStatus || emp.credentialEmailStatus || 'SENT',
        credentialEmailSentAt: authUser?.credentialEmailSentAt || emp.credentialEmailSentAt || null,
        lastLoginAt: authUser?.lastLoginAt || emp.lastLoginAt || 'Never',
        mustChangePassword: authUser?.mustChangePassword ?? emp.mustChangePassword ?? false,
        passwordStatus,
        auditLogs,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const sendEmployeeCredentials = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { to, employeeCode, employeeName, temporaryPassword, loginUrl } = req.body;
    if (!to || !employeeCode) {
      res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Recipient email and employee code are required',
          details: [],
        },
      });
      return;
    }

    const emailResult = await sendCredentialEmail({
      to: String(to).trim().toLowerCase(),
      employeeName: employeeName || 'Employee',
      employeeCode,
      temporaryPassword: temporaryPassword || 'Password@123',
      loginUrl: loginUrl || 'http://localhost:5173/login',
    });

    res.status(200).json({
      success: true,
      status: emailResult.status,
      sentAt: emailResult.sentAt,
      error: emailResult.error,
    });
  } catch (err) {
    next(err);
  }
};
