import { z } from 'zod';

export const loginSchema = z.union([
  z.object({
    identifier: z.preprocess(
      (val) => (typeof val === 'string' ? val.trim().toLowerCase() : val),
      z.string().min(1, 'User ID or Email is required')
    ),
    password: z.string().min(1, 'Password is required'),
  }),
  z.object({
    email: z.preprocess(
      (val) => (typeof val === 'string' ? val.trim().toLowerCase() : val),
      z.string({ required_error: 'Email ID is required.' })
        .min(1, 'Email ID is required.')
        .refine((val) => /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(val), {
          message: 'Please enter a valid email ID.',
        })
    ),
    password: z.string().min(1, 'Password is required'),
  }),
]);

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(10, 'New password must be at least 10 characters'),
    confirmPassword: z.string().min(1, 'Password confirmation is required'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'New password and confirmation do not match',
    path: ['confirmPassword'],
  });

export const updateAccountStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'LOCKED', 'DISABLED', 'DEACTIVATED'], {
    errorMap: () => ({ message: "Status must be 'ACTIVE', 'LOCKED', 'DISABLED', or 'DEACTIVATED'" }),
  }),
});

export const forgotPasswordSchema = z.object({
  email_or_employee_id: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim().toLowerCase() : val),
    z.string().min(1, 'Registered Email or Employee ID is required')
  ),
});

export const verifyResetOtpSchema = z.object({
  email_or_employee_id: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim().toLowerCase() : val),
    z.string().min(1, 'Registered Email or Employee ID is required')
  ),
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Verification code must be exactly 6 numeric digits'),
});

export const resetPasswordSchema = z
  .object({
    reset_token: z.string().min(1, 'Reset token is required'),
    new_password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least 1 uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least 1 lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least 1 number')
      .regex(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/, 'Password must contain at least 1 special character'),
    confirm_password: z.string().min(1, 'Password confirmation is required'),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'New password and confirmation do not match',
    path: ['confirm_password'],
  });

export const emailOtpLoginRequestSchema = z.object({
  email: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim().toLowerCase() : val),
    z
      .string({ required_error: 'Registered email address is required' })
      .min(1, 'Registered email address is required')
      .refine((val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
        message: 'Please enter a valid registered email address.',
      })
  ),
});

export const emailOtpLoginVerifySchema = z.object({
  email: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim().toLowerCase() : val),
    z
      .string({ required_error: 'Registered email address is required' })
      .min(1, 'Registered email address is required')
      .refine((val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
        message: 'Please enter a valid registered email address.',
      })
  ),
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Verification code must be exactly 6 numeric digits'),
});

export const mobileOtpLoginRequestSchema = z.object({
  mobile_number: z
    .string({ required_error: 'Registered mobile number is required' })
    .trim()
    .min(10, 'Please enter a valid mobile number'),
});

export const mobileOtpLoginVerifySchema = z.object({
  mobile_number: z
    .string({ required_error: 'Registered mobile number is required' })
    .trim()
    .min(10, 'Please enter a valid mobile number'),
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Verification code must be exactly 6 numeric digits'),
});

