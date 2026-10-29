import { z } from 'zod';
// ============================================================================
// 1. REUSABLE ATOMIC VALIDATORS & REGEX PATTERNS
// ============================================================================
const CURRENT_YEAR = new Date().getFullYear();
/**
 * City: Required, String/VARCHAR, letters and spaces ONLY.
 * Regex: ^[A-Za-z ]+$
 */
export const citySchema = z.string({
    required_error: 'City must contain letters and spaces only.',
    invalid_type_error: 'City must be a string',
})
    .trim()
    .min(1, 'City must contain letters and spaces only.')
    .regex(/^[A-Za-z ]+$/, 'City must contain letters and spaces only.');
/**
 * Pincode: Required, STRING/VARCHAR, NOT INTEGER (preserves leading zeros). Exactly 6 digits.
 * Regex: ^[0-9]{6}$
 */
export const pincodeSchema = z.preprocess((val) => (typeof val === 'number' ? String(val) : typeof val === 'string' ? val.trim() : val), z.string({
    required_error: 'Pincode is required',
    invalid_type_error: 'Pincode must be a string',
}).regex(/^[0-9]{6}$/, 'Pincode must be exactly 6 digits.'));
/**
 * Address Line 1: Required, String/VARCHAR, letters, numbers, spaces, and , . - / #
 * Non-empty, rejects whitespace-only.
 */
export const addressLine1Schema = z.string({
    required_error: 'Address Line 1 is required',
    invalid_type_error: 'Address Line 1 must be a string',
})
    .trim()
    .min(1, 'Address Line 1 is required')
    .regex(/^[A-Za-z0-9\s,.\-/#]+$/, 'Address Line 1 contains invalid characters. Allowed: letters, numbers, spaces, and , . - / #')
    .refine((val) => /[A-Za-z0-9]/.test(val), 'Address Line 1 must contain alphanumeric characters');
/**
 * Address Line 2: Optional, String/VARCHAR, letters, numbers, spaces, and , . - / #
 */
export const addressLine2Schema = z.string({
    invalid_type_error: 'Address Line 2 must be a string',
})
    .trim()
    .regex(/^[A-Za-z0-9\s,.\-/#]*$/, 'Address Line 2 contains invalid characters')
    .optional()
    .or(z.literal(''));
/**
 * State: Required, String/VARCHAR or enum. Letters, spaces, and standard punctuation.
 */
export const stateSchema = z.string({
    required_error: 'State is required',
    invalid_type_error: 'State must be a string',
})
    .trim()
    .min(1, 'State is required')
    .regex(/^[A-Za-z\s&.\-()]+$/, 'State must contain valid alphabetic characters');
/**
 * Country: Required, String/VARCHAR or enum. Letters and spaces ONLY.
 */
export const countrySchema = z.string({
    required_error: 'Country is required',
    invalid_type_error: 'Country must be a string',
})
    .trim()
    .min(1, 'Country is required')
    .regex(/^[A-Za-z ]+$/, 'Country must contain letters and spaces only');
/**
 * Highest Qualification: Required, String/enum.
 */
export const highestQualificationSchema = z.string({
    required_error: 'Highest qualification is required',
    invalid_type_error: 'Highest qualification must be a string',
})
    .trim()
    .min(1, 'Highest qualification is required')
    .regex(/^[A-Za-z0-9\s&.\-/( )]+$/, 'Invalid qualification option.');
/**
 * Degree / Course Name: Required, String/VARCHAR.
 * Letters, numbers where legitimately required, spaces, common characters &, -, ., /, (, )
 * Must contain at least one alphanumeric character (cannot be only special characters).
 */
export const degreeNameSchema = z.string({
    required_error: 'Degree / Course Name is required',
    invalid_type_error: 'Degree / Course Name must be a string',
})
    .trim()
    .min(1, 'Degree / Course Name is required')
    .regex(/^(?=.*[A-Za-z0-9])[A-Za-z0-9\s&.\-/( )]+$/, 'Degree / Course name must contain valid characters.');
/**
 * Specialization: Required, String/VARCHAR.
 * Letters and spaces only, allowing legitimate characters &, -, .
 * Strictly rejects numbers (0-9) and arbitrary symbols (e.g. 34353535454).
 */
export const specializationSchema = z.string({
    required_error: 'Specialization is required',
    invalid_type_error: 'Specialization must be a string',
})
    .trim()
    .min(1, 'Specialization is required')
    .refine((val) => /^[A-Za-z\s&.\-]+$/.test(val) && /[A-Za-z]/.test(val) && !/\d/.test(val), 'Specialization must contain valid characters (letters and spaces only).');
/**
 * University / Institution: Required, String/VARCHAR.
 * Letters and spaces only, allowing legitimate characters &, -, .
 * Strictly rejects numbers and arbitrary symbols (e.g. 12345, Anna@University).
 */
export const universitySchema = z.string({
    required_error: 'University must contain valid characters.',
    invalid_type_error: 'University must be a string',
})
    .trim()
    .min(1, 'University must contain valid characters.')
    .refine((val) => /^[A-Za-z\s&.\-]+$/.test(val) && /[A-Za-z]/.test(val) && !/\d/.test(val), 'University must contain valid characters.');
/**
 * Year of Passing: Required, Integer/Year. Exactly 4 digits, not in the future.
 */
export const yearOfPassingSchema = z.preprocess((val) => {
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (/^[0-9]{4}$/.test(trimmed))
            return parseInt(trimmed, 10);
        return val;
    }
    return val;
}, z.number({
    required_error: 'Year of passing is required',
    invalid_type_error: 'Year of passing must be a 4-digit year and cannot be in the future.',
})
    .int('Year of passing must be an integer')
    .min(1900, 'Year of passing must be a valid 4-digit year and cannot be in the future.')
    .max(CURRENT_YEAR, 'Year of passing must be a 4-digit year and cannot be in the future.'));
/**
 * Grade / Percentage: Datatype Decimal. Numeric only, >= 0 and <= 100.
 */
export const gradePercentageSchema = z.preprocess((val) => {
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (/^[0-9]+(\.[0-9]+)?$/.test(trimmed)) {
            return parseFloat(trimmed);
        }
        return NaN;
    }
    return val;
}, z.number({
    required_error: 'Grade / Percentage is required',
    invalid_type_error: 'Grade / Percentage must be a valid number between 0 and 100.',
})
    .min(0, 'Grade / Percentage must be a valid number between 0 and 100.')
    .max(100, 'Grade / Percentage must be a valid number between 0 and 100.'));
/**
 * Experience Profile: 'Fresher' or 'Experienced'
 */
export const experienceProfileSchema = z.enum(['Fresher', 'Experienced'], {
    errorMap: () => ({ message: "Experience profile must be either 'Fresher' or 'Experienced'" }),
});
/**
 * Total Experience: Decimal, non-negative number.
 */
export const totalExperienceSchema = z.preprocess((val) => {
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (/^[0-9]+(\.[0-9]+)?$/.test(trimmed)) {
            return parseFloat(trimmed);
        }
        return NaN;
    }
    return val;
}, z.number({
    required_error: 'Total experience is required',
    invalid_type_error: 'Total experience must be a non-negative number.',
}).min(0, 'Total experience must be a non-negative number.'));
/**
 * Previous Company Name: String/VARCHAR. Letters, numbers, spaces, and legitimate chars &, ., -, (, )
 */
export const previousCompanySchema = z.string({
    required_error: 'Previous company name is required',
    invalid_type_error: 'Previous company name must be a string',
})
    .trim()
    .min(1, 'Previous company name is required')
    .regex(/^(?=.*[A-Za-z0-9])[A-Za-z0-9\s&.\-()]+$/, 'Previous company name must contain valid characters.');
/**
 * Previous Designation: String/VARCHAR.
 */
export const previousDesignationSchema = z.string({
    required_error: 'Previous designation is required',
    invalid_type_error: 'Previous designation must be a string',
})
    .trim()
    .min(1, 'Previous designation is required')
    .regex(/^(?=.*[A-Za-z])[A-Za-z0-9\s&.\-/( )]+$/, 'Previous designation must contain valid characters.');
/**
 * Previous Department: String/enum.
 */
export const previousDepartmentSchema = z.string({
    required_error: 'Previous department is required',
    invalid_type_error: 'Previous department must be a string',
})
    .trim()
    .min(1, 'Previous department is required')
    .regex(/^(?=.*[A-Za-z])[A-Za-z\s&.\-()]+$/, 'Previous department must be a valid department.');
/**
 * Normalize date strings (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, or ISO timestamps) to YYYY-MM-DD.
 */
export const normalizeDateString = (raw) => {
    const trimmed = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed))
        return trimmed;
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed))
        return trimmed.slice(0, 10);
    const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmyMatch) {
        const day = Number(dmyMatch[1]);
        const month = Number(dmyMatch[2]);
        const year = Number(dmyMatch[3]);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2200) {
            const candidate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dt = new Date(`${candidate}T00:00:00Z`);
            if (!Number.isNaN(dt.getTime()) && dt.getUTCFullYear() === year && dt.getUTCMonth() + 1 === month && dt.getUTCDate() === day) {
                return candidate;
            }
        }
    }
    return trimmed;
};
/**
 * Date validator helper: Valid date format YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, or parseable ISO date.
 */
export const dateSchema = z.string({
    required_error: 'Date is required',
    invalid_type_error: 'Invalid date format',
})
    .trim()
    .transform((val) => normalizeDateString(val))
    .refine((val) => !isNaN(Date.parse(val)), 'Date must be a valid date.');
/**
 * Last Drawn Salary: Decimal/Number, positive only.
 */
export const lastDrawnSalarySchema = z.preprocess((val) => {
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (/^[0-9]+(\.[0-9]+)?$/.test(trimmed)) {
            return parseFloat(trimmed);
        }
        return NaN;
    }
    return val;
}, z.number({
    required_error: 'Last drawn salary is required',
    invalid_type_error: 'Last drawn salary must be a positive number.',
}).min(0, 'Last drawn salary must be a positive number.'));
/**
 * Previous Company Location: String/VARCHAR.
 */
export const companyLocationSchema = z.string({
    invalid_type_error: 'Company location must be a string',
})
    .trim()
    .regex(/^[A-Za-z0-9\s,.\-/( )]*$/, 'Previous company location contains invalid characters.')
    .optional()
    .or(z.literal(''));
/**
 * Bank Name: Required, String/VARCHAR. Letters, spaces, common bank characters.
 * NOT numeric-only.
 */
export const bankNameSchema = z.string({
    required_error: 'Bank name is required',
    invalid_type_error: 'Bank name must be a string',
})
    .trim()
    .min(1, 'Bank name is required')
    .regex(/^(?=.*[A-Za-z])[A-Za-z0-9\s&.\-()]+$/, 'Bank name must contain letters and cannot be numeric-only.');
/**
 * Account Number: STRING/VARCHAR, NOT Integer/Number. Digits only, 9 to 18 digits.
 * Preserves leading zeros.
 */
export const accountNumberSchema = z.preprocess((val) => (typeof val === 'number' ? String(val) : typeof val === 'string' ? val.trim() : val), z.string({
    required_error: 'Account number is required',
    invalid_type_error: 'Account number must be a string',
}).regex(/^[0-9]{9,18}$/, 'Account number must be between 9 and 18 digits.'));
/**
 * IFSC Code: Exactly 11 chars. Uppercase. 4 letters + 0 + 6 alphanumeric.
 * Regex: ^[A-Z]{4}0[A-Z0-9]{6}$
 */
export const ifscCodeSchema = z.preprocess((val) => (typeof val === 'string' ? val.trim().toUpperCase() : val), z.string({
    required_error: 'IFSC is required',
    invalid_type_error: 'IFSC must be a string',
}).regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC format.'));
/**
 * PAN Card Number: Exactly 10 chars. Uppercase. 5 letters + 4 digits + 1 letter.
 * Regex: ^[A-Z]{5}[0-9]{4}[A-Z]$
 */
export const panNumberSchema = z.preprocess((val) => (typeof val === 'string' ? val.trim().toUpperCase() : val), z.string({
    required_error: 'PAN is required',
    invalid_type_error: 'PAN must be a string',
}).regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Invalid PAN format.'));
/**
 * UAN / PF Number: Optional, String/VARCHAR. Exactly 12 digits when provided.
 * Preserves leading zeros.
 */
export const uanNumberSchema = z.preprocess((val) => {
    if (val === '' || val === null || val === undefined)
        return undefined;
    return typeof val === 'number' ? String(val) : typeof val === 'string' ? val.trim() : val;
}, z.string()
    .regex(/^[0-9]{12}$/, 'UAN must be exactly 12 digits.')
    .optional());
// ============================================================================
// 2. STRUCTURED SUB-OBJECT SCHEMAS (Address, Education, Experience, Banking)
// ============================================================================
export const currentAddressSchema = z.object({
    line1: addressLine1Schema,
    line2: addressLine2Schema.optional(),
    city: citySchema,
    state: stateSchema,
    country: countrySchema,
    pincode: pincodeSchema,
});
export const educationalDetailsSchema = z.object({
    highestQualification: highestQualificationSchema,
    degreeName: degreeNameSchema,
    specialization: specializationSchema,
    university: universitySchema,
    yearOfPassing: yearOfPassingSchema,
    gradePercentage: gradePercentageSchema,
    certificateUrl: z.string().optional(),
});
export const baseExperienceDetailsSchema = z.object({
    experienceType: experienceProfileSchema,
    totalExperience: totalExperienceSchema.optional(),
    previousCompany: z.string().optional(),
    previousDesignation: z.string().optional(),
    previousDepartment: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    lastDrawnSalary: lastDrawnSalarySchema.optional(),
    companyLocation: companyLocationSchema.optional(),
    experienceCertificateUrl: z.string().optional(),
    relievingLetterUrl: z.string().optional(),
});
export const experienceDetailsSchema = baseExperienceDetailsSchema.superRefine((data, ctx) => {
    if (data.experienceType === 'Experienced') {
        if (data.totalExperience === undefined || isNaN(data.totalExperience)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Total experience is required for experienced profile',
                path: ['totalExperience'],
            });
        }
        if (!data.previousCompany || !data.previousCompany.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Previous company name is required for experienced profile',
                path: ['previousCompany'],
            });
        }
        else if (!/^(?=.*[A-Za-z0-9])[A-Za-z0-9\s&.\-()]+$/.test(data.previousCompany.trim())) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Previous company name must contain valid characters.',
                path: ['previousCompany'],
            });
        }
        if (!data.previousDesignation || !data.previousDesignation.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Previous designation is required for experienced profile',
                path: ['previousDesignation'],
            });
        }
        else if (!/^(?=.*[A-Za-z])[A-Za-z0-9\s&.\-/( )]+$/.test(data.previousDesignation.trim())) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Previous designation must contain valid characters.',
                path: ['previousDesignation'],
            });
        }
        if (data.startDate && data.endDate) {
            if (Date.parse(data.endDate) < Date.parse(data.startDate)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Employment end date cannot be earlier than start date.',
                    path: ['endDate'],
                });
            }
        }
    }
});
export const bankDetailsSchema = z.object({
    bankName: bankNameSchema,
    accountNumber: accountNumberSchema,
    ifscCode: ifscCodeSchema,
    branch: z.string().optional(),
});
export const statutoryDetailsSchema = z.object({
    panNumber: panNumberSchema,
    uanNumber: uanNumberSchema.optional(),
});
/**
 * Indian Mobile Phone Schema:
 * - Exactly 10 digits
 * - First digit must be 6, 7, 8, or 9
 * - Rejects values longer or shorter than 10 digits
 * - Rejects alphabets and symbols
 * - Rejects all-repeated unrealistic digits (e.g. 1111111111)
 */
export const phoneSchema = z.preprocess((val) => {
    if (val === null || val === undefined || val === '')
        return undefined;
    if (typeof val === 'number')
        return String(val).trim();
    if (typeof val === 'string')
        return val.trim();
    return val;
}, z.string({
    required_error: 'Phone number is required.',
    invalid_type_error: 'Phone number must be a string.',
})
    .refine((val) => {
    // 1. Indian 10-digit mobile (starts with 6-9, no all-repeated digits)
    if (/^[6-9]\d{9}$/.test(val)) {
        return !/^(\d)\1{9}$/.test(val);
    }
    // 2. International phone with country code (e.g. +1 2025550143 or +971 501234567)
    if (/^\+[1-9]\d{0,3}[\s-]?[0-9]{6,14}$/.test(val)) {
        const rawDigits = val.replace(/\D/g, '');
        return !/^(\d)\1{6,}$/.test(rawDigits);
    }
    return false;
}, {
    message: 'Phone number must contain exactly 10 digits starting with 6, 7, 8, or 9.',
}));
export const optionalPhoneSchema = z.preprocess((val) => {
    if (val === null || val === undefined || val === '')
        return undefined;
    if (typeof val === 'number')
        return String(val).trim();
    if (typeof val === 'string') {
        const trimmed = val.trim();
        return trimmed === '' ? undefined : trimmed;
    }
    return val;
}, z.string({
    invalid_type_error: 'Phone number must be a string.',
})
    .refine((val) => {
    if (/^[6-9]\d{9}$/.test(val)) {
        return !/^(\d)\1{9}$/.test(val);
    }
    if (/^\+[1-9]\d{0,3}[\s-]?[0-9]{6,14}$/.test(val)) {
        const rawDigits = val.replace(/\D/g, '');
        return !/^(\d)\1{6,}$/.test(rawDigits);
    }
    return false;
}, {
    message: 'Phone number must contain exactly 10 digits starting with 6, 7, 8, or 9.',
})
    .optional());
/**
 * First Name Schema:
 * - Min 2 characters, Max 100 characters
 * - Letters and spaces only, allowing legitimate '.', "'", '-'
 * - Must start with a letter
 * - Rejects numbers and random special characters
 * - Rejects 4+ consecutive identical characters (e.g. kkkk, aaaa)
 * - Rejects unrealistic consonant keyboard mash (e.g. dfxcvbn, asdfghhjkklll)
 */
export const firstNameSchema = z.preprocess((val) => (typeof val === 'string' ? val.trim() : val), z.string({
    required_error: 'First Name is required.',
    invalid_type_error: 'First Name must be a string.',
})
    .min(2, 'First Name must be at least 2 characters.')
    .max(100, 'First Name cannot exceed 100 characters.')
    .regex(/^[A-Za-z][A-Za-z\s.'-]*$/, 'First Name must contain letters and spaces only. Numbers and invalid symbols are not allowed.')
    .refine((val) => !/(.)\1{3,}/i.test(val), {
    message: 'First Name contains invalid repetitive characters.',
})
    .refine((val) => !/[bcdfghjklmnpqrstvwxyz]{6,}/i.test(val.replace(/[\s.'-]/g, '')), {
    message: 'Please enter a realistic name.',
}));
/**
 * Last Name Schema:
 * - Max 100 characters
 * - Letters and spaces only, allowing legitimate '.', "'", '-'
 * - Rejects numbers and random symbols
 * - Rejects 4+ consecutive identical characters
 */
export const lastNameSchema = z.preprocess((val) => (typeof val === 'string' ? val.trim() : val), z.string({
    invalid_type_error: 'Last Name must be a string.',
})
    .max(100, 'Last Name cannot exceed 100 characters.')
    .regex(/^[A-Za-z\s.'-]*$/, 'Last Name must contain letters and spaces only.')
    .refine((val) => !/(.)\1{3,}/i.test(val), {
    message: 'Last Name contains invalid repetitive characters.',
})
    .refine((val) => val === '' || !/[bcdfghjklmnpqrstvwxyz]{6,}/i.test(val.replace(/[\s.'-]/g, '')), {
    message: 'Please enter a realistic name.',
})
    .optional()
    .default(''));
/**
 * Salary Schema:
 * - Non-negative number (0 or positive)
 * - Not float for precision issues; validated as number/decimal >= 0
 * - Max realistic upper bound
 */
export const basicSalarySchema = z.preprocess((val) => {
    if (val === null || val === undefined || val === '')
        return undefined;
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (/^[0-9]+(\.[0-9]+)?$/.test(trimmed))
            return parseFloat(trimmed);
        return NaN;
    }
    return val;
}, z.number({
    invalid_type_error: 'Salary must be a valid number.',
})
    .min(0, 'Salary cannot be negative.')
    .max(100000000, 'Salary exceeds maximum allowed limit.'));
/**
 * Employee ID Schema:
 * - String, 2 to 50 characters
 * - Alphanumeric, hyphen, underscore
 */
export const employeeIdSchema = z.preprocess((val) => (typeof val === 'string' ? val.trim() : val), z.string({
    required_error: 'Employee ID is required.',
    invalid_type_error: 'Employee ID must be a string.',
})
    .min(2, 'Employee ID must be at least 2 characters.')
    .max(50, 'Employee ID cannot exceed 50 characters.')
    .regex(/^[A-Za-z0-9\-_]+$/, 'Employee ID can only contain letters, numbers, hyphens, and underscores.'));
// ============================================================================
// 3. COMPOSITE CREATE EMPLOYEE SCHEMA
// Supports standard fields + nested objects OR flat address/education/banking fields.
/**
 * Employee Email Validation:
 * - Automatically converts uppercase to lowercase.
 * - Removes leading and trailing spaces.
 * - Rejects any spaces inside the email.
 * - Enforces valid email format (e.g., arun@company.com).
 * - Messages: "Email ID is required." / "Please enter a valid email ID."
 */
export const employeeEmailSchema = z.preprocess((val) => (typeof val === 'string' ? val.trim().toLowerCase() : val), z.string({
    required_error: 'Email ID is required.',
    invalid_type_error: 'Email ID must be a string.',
})
    .min(1, 'Email ID is required.')
    .max(255, 'Email ID cannot exceed 255 characters.')
    .refine((val) => !/\s/.test(val), {
    message: 'Please enter a valid email ID.',
})
    .refine((val) => /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(val), {
    message: 'Please enter a valid email ID.',
}));
export const createEmployeeSchema = z.object({
    // Core Identification & Contact
    firstName: firstNameSchema,
    lastName: lastNameSchema,
    email: employeeEmailSchema,
    department: z.string().max(100).optional().default('General'),
    designation: z.string().max(100).optional().default('Staff'),
    basicSalary: basicSalarySchema.optional().default(15000),
    grossSalary: basicSalarySchema.optional(),
    employeeId: employeeIdSchema.optional(),
    password: z.string().min(6, 'Password must be at least 6 characters.').optional(),
    phone: optionalPhoneSchema,
    mobile: optionalPhoneSchema,
    emergencyMobile: optionalPhoneSchema,
    emergencyAltMobile: optionalPhoneSchema,
    branch: z.string().max(100).optional(),
    role: z.string().max(50).optional(),
    // Nested structures (as sent from frontend onboarding)
    currentAddress: currentAddressSchema.optional(),
    permanentAddress: z.object({
        line1: z.string().optional(),
        line2: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        pincode: z.string().optional(),
        sameAsCurrent: z.boolean().optional(),
    }).optional(),
    educationalDetails: educationalDetailsSchema.optional(),
    experienceDetails: experienceDetailsSchema.optional(),
    bankDetails: bankDetailsSchema.optional(),
    salaryDetails: z.object({
        panNumber: panNumberSchema.optional(),
        uanNumber: uanNumberSchema.optional(),
        basicSalary: basicSalarySchema.optional(),
        monthlyCtc: basicSalarySchema.optional(),
    }).passthrough().optional(),
    // Flat field validations (when supplied at top level)
    addressLine1: addressLine1Schema.optional(),
    line1: addressLine1Schema.optional(),
    currentLine1: addressLine1Schema.optional(),
    addressLine2: addressLine2Schema.optional(),
    line2: addressLine2Schema.optional(),
    currentLine2: addressLine2Schema.optional(),
    city: citySchema.optional(),
    currentCity: citySchema.optional(),
    state: stateSchema.optional(),
    currentState: stateSchema.optional(),
    country: countrySchema.optional(),
    currentCountry: countrySchema.optional(),
    pincode: pincodeSchema.optional(),
    currentPincode: pincodeSchema.optional(),
    highestQualification: highestQualificationSchema.optional(),
    qualification: highestQualificationSchema.optional(),
    degreeName: degreeNameSchema.optional(),
    specialization: specializationSchema.optional(),
    university: universitySchema.optional(),
    yearOfPassing: yearOfPassingSchema.optional(),
    gradePercentage: gradePercentageSchema.optional(),
    experienceProfile: experienceProfileSchema.optional(),
    experienceType: experienceProfileSchema.optional(),
    totalExperience: totalExperienceSchema.optional(),
    previousCompany: previousCompanySchema.optional(),
    previousCompanyName: previousCompanySchema.optional(),
    previousDesignation: previousDesignationSchema.optional(),
    previousDepartment: previousDepartmentSchema.optional(),
    employmentStartDate: dateSchema.optional(),
    startDate: dateSchema.optional(),
    expStartDate: dateSchema.optional(),
    employmentEndDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    expEndDate: dateSchema.optional(),
    lastDrawnSalary: lastDrawnSalarySchema.optional(),
    previousCompanyLocation: companyLocationSchema.optional(),
    companyLocation: companyLocationSchema.optional(),
    bankName: bankNameSchema.optional(),
    accountNumber: accountNumberSchema.optional(),
    ifscCode: ifscCodeSchema.optional(),
    panNumber: panNumberSchema.optional(),
    pan: panNumberSchema.optional(),
    uanNumber: uanNumberSchema.optional(),
    uan: uanNumberSchema.optional(),
}).passthrough().superRefine((data, ctx) => {
    // Validate employment start and end dates if both provided at top-level
    const start = data.employmentStartDate || data.startDate || data.expStartDate;
    const end = data.employmentEndDate || data.endDate || data.expEndDate;
    if (typeof start === 'string' && typeof end === 'string') {
        if (Date.parse(end) < Date.parse(start)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Employment end date cannot be earlier than start date.',
                path: ['employmentEndDate'],
            });
        }
    }
});
// ============================================================================
// 4. COMPOSITE UPDATE EMPLOYEE SCHEMA
// All fields optional, but if supplied (non-empty) MUST pass field-level validation strictly.
// Empty strings ("") or null on optional sub-fields are treated as omitted/optional.
// ============================================================================
const emptyToUndefined = (schema) => z.preprocess((val) => {
    if (val === null || val === undefined)
        return undefined;
    if (typeof val === 'string' && val.trim() === '')
        return undefined;
    return val;
}, schema.optional());
export const updateCurrentAddressSchema = z.object({
    line1: emptyToUndefined(addressLine1Schema),
    line2: emptyToUndefined(addressLine2Schema),
    city: emptyToUndefined(citySchema),
    state: emptyToUndefined(stateSchema),
    country: emptyToUndefined(countrySchema),
    pincode: emptyToUndefined(pincodeSchema),
}).passthrough();
export const updateEducationalDetailsSchema = z.object({
    highestQualification: emptyToUndefined(highestQualificationSchema),
    degreeName: emptyToUndefined(degreeNameSchema),
    specialization: emptyToUndefined(specializationSchema),
    university: emptyToUndefined(universitySchema),
    yearOfPassing: emptyToUndefined(yearOfPassingSchema),
    gradePercentage: emptyToUndefined(gradePercentageSchema),
    certificateUrl: z.string().optional().nullable(),
}).passthrough();
export const updateExperienceDetailsSchema = z.object({
    experienceType: emptyToUndefined(experienceProfileSchema),
    totalExperience: emptyToUndefined(totalExperienceSchema),
    previousCompany: z.string().optional().nullable(),
    previousDesignation: z.string().optional().nullable(),
    previousDepartment: z.string().optional().nullable(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    lastDrawnSalary: emptyToUndefined(lastDrawnSalarySchema),
    companyLocation: emptyToUndefined(companyLocationSchema),
    experienceCertificateUrl: z.string().optional().nullable(),
    relievingLetterUrl: z.string().optional().nullable(),
}).passthrough();
export const updateBankDetailsSchema = z.object({
    bankName: emptyToUndefined(bankNameSchema),
    accountNumber: emptyToUndefined(accountNumberSchema),
    ifscCode: emptyToUndefined(ifscCodeSchema),
    branch: z.string().optional().nullable(),
    accountHolderName: z.string().optional().nullable(),
}).passthrough();
export const updateEmployeeSchema = z.object({
    firstName: firstNameSchema.optional(),
    lastName: lastNameSchema.optional(),
    email: employeeEmailSchema.optional(),
    personalEmail: emptyToUndefined(employeeEmailSchema),
    department: z.string().max(100).optional(),
    designation: z.string().max(100).optional(),
    basicSalary: emptyToUndefined(basicSalarySchema),
    grossSalary: emptyToUndefined(basicSalarySchema),
    employeeId: emptyToUndefined(employeeIdSchema),
    password: emptyToUndefined(z.string().min(6)),
    phone: optionalPhoneSchema,
    mobile: optionalPhoneSchema,
    emergencyMobile: optionalPhoneSchema,
    emergencyAltMobile: optionalPhoneSchema,
    branch: z.string().max(100).optional(),
    status: z.string().optional(),
    mustChangePassword: z.boolean().optional(),
    accountStatus: z.string().optional(),
    // Nested structures
    currentAddress: updateCurrentAddressSchema.optional(),
    permanentAddress: z.object({
        line1: z.string().optional(),
        line2: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        pincode: z.string().optional(),
        sameAsCurrent: z.boolean().optional(),
    }).passthrough().optional(),
    educationalDetails: updateEducationalDetailsSchema.optional(),
    experienceDetails: updateExperienceDetailsSchema.optional(),
    bankDetails: updateBankDetailsSchema.optional(),
    salaryDetails: z.object({
        panNumber: emptyToUndefined(panNumberSchema),
        uanNumber: uanNumberSchema.optional(),
        basicSalary: emptyToUndefined(basicSalarySchema),
        monthlyCtc: emptyToUndefined(basicSalarySchema),
    }).passthrough().optional(),
    // Flat field validations
    addressLine1: emptyToUndefined(addressLine1Schema),
    line1: emptyToUndefined(addressLine1Schema),
    currentLine1: emptyToUndefined(addressLine1Schema),
    addressLine2: emptyToUndefined(addressLine2Schema),
    line2: emptyToUndefined(addressLine2Schema),
    currentLine2: emptyToUndefined(addressLine2Schema),
    city: emptyToUndefined(citySchema),
    currentCity: emptyToUndefined(citySchema),
    state: emptyToUndefined(stateSchema),
    currentState: emptyToUndefined(stateSchema),
    country: emptyToUndefined(countrySchema),
    currentCountry: emptyToUndefined(countrySchema),
    pincode: emptyToUndefined(pincodeSchema),
    currentPincode: emptyToUndefined(pincodeSchema),
    highestQualification: emptyToUndefined(highestQualificationSchema),
    qualification: emptyToUndefined(highestQualificationSchema),
    degreeName: emptyToUndefined(degreeNameSchema),
    specialization: emptyToUndefined(specializationSchema),
    university: emptyToUndefined(universitySchema),
    yearOfPassing: emptyToUndefined(yearOfPassingSchema),
    gradePercentage: emptyToUndefined(gradePercentageSchema),
    experienceProfile: emptyToUndefined(experienceProfileSchema),
    experienceType: emptyToUndefined(experienceProfileSchema),
    totalExperience: emptyToUndefined(totalExperienceSchema),
    previousCompany: emptyToUndefined(previousCompanySchema),
    previousCompanyName: emptyToUndefined(previousCompanySchema),
    previousDesignation: emptyToUndefined(previousDesignationSchema),
    previousDepartment: emptyToUndefined(previousDepartmentSchema),
    employmentStartDate: emptyToUndefined(dateSchema),
    startDate: emptyToUndefined(dateSchema),
    expStartDate: emptyToUndefined(dateSchema),
    employmentEndDate: emptyToUndefined(dateSchema),
    endDate: emptyToUndefined(dateSchema),
    expEndDate: emptyToUndefined(dateSchema),
    lastDrawnSalary: emptyToUndefined(lastDrawnSalarySchema),
    previousCompanyLocation: emptyToUndefined(companyLocationSchema),
    companyLocation: emptyToUndefined(companyLocationSchema),
    bankName: emptyToUndefined(bankNameSchema),
    accountNumber: emptyToUndefined(accountNumberSchema),
    ifscCode: emptyToUndefined(ifscCodeSchema),
    panNumber: emptyToUndefined(panNumberSchema),
    pan: emptyToUndefined(panNumberSchema),
    uanNumber: uanNumberSchema.optional(),
    uan: uanNumberSchema.optional(),
}).passthrough().superRefine((data, ctx) => {
    const start = data.employmentStartDate || data.startDate || data.expStartDate;
    const end = data.employmentEndDate || data.endDate || data.expEndDate;
    if (typeof start === 'string' && typeof end === 'string' && start.trim() && end.trim()) {
        if (Date.parse(end) < Date.parse(start)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Employment end date cannot be earlier than start date.',
                path: ['employmentEndDate'],
            });
        }
    }
});
//# sourceMappingURL=employeeValidators.js.map