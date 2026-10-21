import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { hasDatabaseColumn, query } from '../config/database.js';
import { AccountStatus, AuthenticatedUser, CredentialEmailStatus, UserRole } from '../types/auth.js';
import { generateTemporaryPassword, validatePasswordComplexity } from '../services/passwordService.js';
import { sendCredentialEmail } from '../services/emailService.js';
import { auditRepository } from './auditRepository.js';

export interface UserAccount {
  id: string;
  email: string;
  passwordHash: string;
  plainPassword?: string;
  additionalPlainPasswords?: string[];
  name: string;
  role: UserRole;
  employeeId: string;
  department: string;
  designation: string;
  company_id?: string;
  isActive: boolean;
  mustChangePassword: boolean;
  accountStatus: AccountStatus;
  credentialEmailStatus?: CredentialEmailStatus;
  credentialEmailSentAt?: string;
  lastLoginAt?: string;
}

export class AuthRepository {
  /**
   * Dual identifier search: Finds account by either registered email OR Employee Code (e.g. EMP-005)
   */
  async findByIdentifier(identifier: string): Promise<UserAccount | null> {
    if (!identifier) return null;
    const clean = identifier.trim();
    try {
      const hasCompanyId = await hasDatabaseColumn('employees', 'company_id');
      const result = await query(
        `SELECT employee.id, employee.auth_id, employee.employee_id, employee.first_name, employee.last_name,
                employee.email, employee.designation, employee.status, employee.must_change_password,
                employee.account_status, employee.credential_email_status, employee.credential_email_sent_at,
                employee.last_login_at, employee.password, department.name AS department,
                role.key AS role_key, role.name AS role_name
                ${hasCompanyId ? ', employee.company_id' : ''}
         FROM employees employee
         LEFT JOIN departments department ON department.id = employee.department_id
         LEFT JOIN roles role ON role.id = employee.role_id
         WHERE ${clean.includes('@') ? 'LOWER(employee.email) = LOWER($1)' : 'LOWER(employee.employee_id) = LOWER($1)'}
         LIMIT 1`,
        [clean]
      );
      const data = result.rows[0] as any;
      if (data) {
          let userRole: UserRole = 'Employee';
          const roleKey = data.role_key || '';
          const roleName = data.role_name || '';
          if (roleKey === 'ceo' || roleName === 'CEO') userRole = 'CEO';
          else if (roleKey === 'super_admin' || roleName === 'Super Admin') userRole = 'Super Admin';
          else if (roleKey === 'hr_admin' || roleName === 'HR Admin' || roleName === 'HR Manager') userRole = 'HR Manager';
          else if (roleKey === 'finance_manager' || roleName === 'Finance Manager') userRole = 'Finance Manager';
          else if (roleKey === 'dept_manager' || roleName === 'Dept Manager' || roleName === 'Department Manager') userRole = 'Department Manager';
          else {
            const dLower = (data.designation || '').toLowerCase();
            if (dLower.includes('ceo') || dLower.includes('director')) userRole = 'CEO';
            else if (dLower.includes('super admin')) userRole = 'Super Admin';
            else if (dLower.includes('hr manager') || dLower.includes('hr admin')) userRole = 'HR Manager';
            else if (dLower.includes('finance') || dLower.includes('account')) userRole = 'Finance Manager';
          }

          const accountStatus: AccountStatus = (data.account_status as AccountStatus) || (data.status === 'Active' ? 'ACTIVE' : 'DEACTIVATED');
          const rawDbPass = data.password || '';
          const passwordHash = rawDbPass.startsWith('$2') ? rawDbPass : (rawDbPass ? await bcrypt.hash(rawDbPass, 10) : '');

          const userAccount: UserAccount = {
            id: data.auth_id || data.id,
            email: data.email,
            passwordHash,
            plainPassword: rawDbPass,
            name: `${data.first_name || ''} ${data.last_name || ''}`.trim() || 'Staff',
            role: userRole,
            employeeId: data.employee_id,
            department: data.department || 'General',
            designation: data.designation || 'Staff',
            company_id: data.company_id || 'company-a',
            isActive: accountStatus === 'ACTIVE',
            mustChangePassword: data.must_change_password !== undefined ? data.must_change_password : false,
            accountStatus,
            credentialEmailStatus: (data.credential_email_status as CredentialEmailStatus) || 'SENT',
            credentialEmailSentAt: data.credential_email_sent_at || undefined,
            lastLoginAt: data.last_login_at || undefined,
          };

          return userAccount;
      }
    } catch (error) {
      console.error('[PostgreSQL] Authentication lookup failed:', error instanceof Error ? error.message : 'Unknown error');
      throw new Error('Authentication service is temporarily unavailable');
    }

    return null;
  }

  async findByEmail(email: string): Promise<UserAccount | null> {
    return this.findByIdentifier(email);
  }

  async findById(id: string): Promise<UserAccount | null> {
    return this.findByIdentifier(id);
  }

  /**
   * Creates a linked authentication account for a newly created employee record
   */
  async createLoginAccount(params: {
    employeeDbId: string;
    employeeCode: string;
    email: string;
    firstName: string;
    lastName: string;
    department?: string;
    designation?: string;
    role?: UserRole;
    temporaryPassword?: string;
  }): Promise<{ user: UserAccount; temporaryPassword: string }> {
    const temporaryPassword = params.temporaryPassword || generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const userRole: UserRole = params.role || 'Employee';

    const account: UserAccount = {
      id: params.employeeDbId,
      email: params.email.toLowerCase().trim(),
      passwordHash,
      name: `${params.firstName || ''} ${params.lastName || ''}`.trim() || 'Businz Employee',
      role: userRole,
      employeeId: params.employeeCode.trim(),
      department: params.department || 'General',
      designation: params.designation || 'Staff',
      isActive: true,
      mustChangePassword: true,
      accountStatus: 'ACTIVE',
      credentialEmailStatus: 'PENDING',
    };

    const updateResult = await query(
      `UPDATE employees SET password = $1, must_change_password = TRUE, account_status = 'ACTIVE',
                            credential_email_status = 'PENDING', updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, params.employeeDbId]
    );
    if (!updateResult.rowCount) throw new Error('Employee login account could not be persisted');

    return { user: account, temporaryPassword };
  }

  /**
   * Updates employee's credential email dispatch status
   */
  async updateEmailStatus(
    email: string,
    status: CredentialEmailStatus,
    sentAt: string
  ): Promise<void> {
    await query(
      `UPDATE employees SET credential_email_status = $1, credential_email_sent_at = $2, updated_at = NOW()
       WHERE LOWER(email) = LOWER($3)`,
      [status, sentAt, email.trim()]
    );
  }

  /**
   * Forces employee password change, verifies current password, and invalidates temporary password
   */
  async changePassword(
    identifier: string,
    currentPassword: string,
    newPassword: string,
    performedBy?: string
  ): Promise<{ success: boolean; message?: string }> {
    const user = await this.findByIdentifier(identifier);
    if (!user) {
      return { success: false, message: 'User account not found' };
    }

    const isMatch = await this.verifyPassword(
      currentPassword,
      user.passwordHash,
      user.plainPassword,
      user.additionalPlainPasswords
    );
    if (!isMatch) {
      return { success: false, message: 'Current password does not match' };
    }

    const validation = validatePasswordComplexity(newPassword);
    if (!validation.valid) {
      return { success: false, message: validation.message || 'Password does not meet complexity requirements' };
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;

    // Record audit log with NO passwords in metadata
    await auditRepository.recordLog(
      'PASSWORD_CHANGED',
      user.employeeId,
      performedBy || user.email,
      { email: user.email }
    );

    await query(
      `UPDATE employees SET password = $1, must_change_password = FALSE, updated_at = NOW()
       WHERE LOWER(email) = LOWER($2)`,
      [user.passwordHash, user.email]
    );

    return { success: true };
  }

  /**
   * Resets credentials for an employee, generating a new temporary password and dispatching an email
   */
  async resetLoginCredentials(
    employeeId: string,
    performedBy: string
  ): Promise<{ success: boolean; temporaryPassword?: string; emailStatus?: CredentialEmailStatus; message?: string }> {
    const user = await this.findByIdentifier(employeeId);
    if (!user) {
      return { success: false, message: `No login account found for Employee ${employeeId}` };
    }

    const newTempPassword = generateTemporaryPassword();
    user.passwordHash = await bcrypt.hash(newTempPassword, 10);
    user.mustChangePassword = true;

    // Record reset audit
    await auditRepository.recordLog(
      'TEMPORARY_LOGIN_RESET',
      user.employeeId,
      performedBy,
      { email: user.email }
    );

    // Dispatch credential notification email
    const emailResult = await sendCredentialEmail({
      to: user.email,
      employeeName: user.name,
      employeeCode: user.employeeId,
      temporaryPassword: newTempPassword,
    });

    user.credentialEmailStatus = emailResult.status;
    user.credentialEmailSentAt = emailResult.sentAt;

    await auditRepository.recordLog(
      'CREDENTIAL_EMAIL_RESENT',
      user.employeeId,
      performedBy,
      { email: user.email, deliveryStatus: emailResult.status }
    );

    await query(
      `UPDATE employees
       SET password = $1, must_change_password = TRUE, credential_email_status = $2,
           credential_email_sent_at = $3, updated_at = NOW()
       WHERE LOWER(employee_id) = LOWER($4)`,
      [user.passwordHash, emailResult.status, emailResult.sentAt, user.employeeId]
    );

    return {
      success: true,
      temporaryPassword: newTempPassword,
      emailStatus: emailResult.status,
    };
  }

  /**
   * Sets a newly chosen password after successful OTP verification.
   * Clears mustChangePassword flag.
   */
  async updatePasswordDirectly(
    employeeId: string,
    newPasswordHash: string,
    performedBy: string
  ): Promise<boolean> {
    const user = await this.findByIdentifier(employeeId);
    if (!user) return false;

    user.passwordHash = newPasswordHash;
    user.mustChangePassword = false;

    const updateResult = await query(
      `UPDATE employees SET password = $1, must_change_password = FALSE, updated_at = NOW()
       WHERE LOWER(employee_id) = LOWER($2)`,
      [newPasswordHash, user.employeeId]
    );
    if (!updateResult.rowCount) return false;

    await auditRepository.recordLog(
      'PASSWORD_RESET_SUCCESS',
      user.employeeId,
      performedBy,
      { email: user.email }
    );

    return true;
  }

  /**
   * Enables or disables employee login access
   */
  async updateAccountStatus(
    employeeId: string,
    status: AccountStatus,
    performedBy: string
  ): Promise<{ success: boolean; message?: string }> {
    const user = await this.findByIdentifier(employeeId);
    if (!user) {
      return { success: false, message: `No login account found for Employee ${employeeId}` };
    }

    user.accountStatus = status;
    user.isActive = status === 'ACTIVE';

    const action = status === 'ACTIVE' ? 'EMPLOYEE_LOGIN_ACTIVATED' : 'EMPLOYEE_LOGIN_DEACTIVATED';
    await auditRepository.recordLog(action, user.employeeId, performedBy, {
      accountStatus: status,
      email: user.email,
    });

    const updateResult = await query(
      `UPDATE employees SET account_status = $1, status = $2, updated_at = NOW()
       WHERE LOWER(employee_id) = LOWER($3)`,
      [status, status === 'ACTIVE' ? 'Active' : 'Inactive', user.employeeId]
    );
    if (!updateResult.rowCount) return { success: false, message: 'Database update failed: employee not found' };

    return { success: true };
  }

  /**
   * Records last login timestamp upon successful authentication
   */
  async recordLoginSuccess(user: UserAccount): Promise<void> {
    const timestamp = new Date().toISOString();
    user.lastLoginAt = timestamp;

    await auditRepository.recordLog('LOGIN_SUCCESS', user.employeeId, user.email, {
      lastLoginAt: timestamp,
    });

    await query(
      `UPDATE employees SET last_login_at = $1, updated_at = NOW()
       WHERE LOWER(employee_id) = LOWER($2)`,
      [timestamp, user.employeeId]
    );
  }

  generateToken(user: UserAccount): string {
    const payload: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      employeeId: user.employeeId,
      name: user.name,
      department: user.department,
      designation: user.designation,
      company_id: user.company_id || 'company-a',
      mustChangePassword: user.mustChangePassword,
      accountStatus: user.accountStatus,
      credentialEmailStatus: user.credentialEmailStatus,
      credentialEmailSentAt: user.credentialEmailSentAt,
      lastLoginAt: user.lastLoginAt,
    };
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });
  }

  async verifyPassword(password: string, hash?: string, plain?: string, additionalPlainPasswords: string[] = []): Promise<boolean> {
    if (!password) return false;
    if (plain && password === plain) return true;
    if (additionalPlainPasswords.includes(password)) return true;
    if (hash && hash.startsWith('$2')) {
      try {
        return await bcrypt.compare(password, hash);
      } catch {
        return false;
      }
    }
    return false;
  }
}

export const authRepository = new AuthRepository();
