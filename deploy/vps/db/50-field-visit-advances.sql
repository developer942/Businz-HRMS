-- 50-field-visit-advances.sql
-- BUSINZ HRMS: Field Allowance, Advance Disbursement, Daily Expenses & Final Settlement Management
-- Complete audit-trailed workflow for travel advances, daily receipts, and accounts reconciliation

CREATE TABLE IF NOT EXISTS public.field_visit_advances (
    id VARCHAR(128) PRIMARY KEY,
    request_number VARCHAR(32) UNIQUE NOT NULL,
    company_id VARCHAR(64) DEFAULT 'company-a',
    employee_id VARCHAR(128) NOT NULL,
    employee_code VARCHAR(32) NOT NULL,
    employee_name VARCHAR(255),
    department_id VARCHAR(128),
    department_name VARCHAR(255),
    purpose TEXT NOT NULL,
    client_name VARCHAR(255) NOT NULL,
    destination VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    funding_type VARCHAR(32) NOT NULL DEFAULT 'advance', -- 'advance' (Option A) or 'personal' (Option B)
    requested_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (requested_amount >= 0),
    approved_amount NUMERIC(12, 2) DEFAULT NULL,
    disbursed_amount NUMERIC(12, 2) DEFAULT 0.00,
    travel_mode VARCHAR(64),
    justification TEXT,
    estimated_breakdown JSONB DEFAULT '[]'::jsonb,
    supporting_documents JSONB DEFAULT '[]'::jsonb,
    remarks TEXT,
    status VARCHAR(64) NOT NULL DEFAULT 'Draft',
    created_by VARCHAR(128),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fva_employee_id ON public.field_visit_advances(employee_id);
CREATE INDEX IF NOT EXISTS idx_fva_employee_code ON public.field_visit_advances(employee_code);
CREATE INDEX IF NOT EXISTS idx_fva_status ON public.field_visit_advances(status);
CREATE INDEX IF NOT EXISTS idx_fva_start_date ON public.field_visit_advances(start_date);
CREATE INDEX IF NOT EXISTS idx_fva_funding_type ON public.field_visit_advances(funding_type);

CREATE TABLE IF NOT EXISTS public.field_visit_advance_approvals (
    id VARCHAR(128) PRIMARY KEY,
    advance_id VARCHAR(128) NOT NULL REFERENCES public.field_visit_advances(id) ON DELETE CASCADE,
    approver_id VARCHAR(128),
    approver_name VARCHAR(255),
    decision VARCHAR(32) NOT NULL, -- 'Approved', 'Rejected', 'Correction Requested'
    approved_amount NUMERIC(12, 2) DEFAULT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fva_approvals_adv_id ON public.field_visit_advance_approvals(advance_id);

CREATE TABLE IF NOT EXISTS public.field_visit_advance_disbursements (
    id VARCHAR(128) PRIMARY KEY,
    advance_id VARCHAR(128) NOT NULL REFERENCES public.field_visit_advances(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(64) NOT NULL, -- 'Cash', 'Bank Transfer', 'UPI', 'Cheque'
    payment_reference VARCHAR(255),
    proof_reference TEXT,
    accounts_user_id VARCHAR(128),
    accounts_user_name VARCHAR(255),
    remarks TEXT,
    disbursed_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(32) NOT NULL DEFAULT 'Disbursed'
);

CREATE INDEX IF NOT EXISTS idx_fva_disb_adv_id ON public.field_visit_advance_disbursements(advance_id);

CREATE TABLE IF NOT EXISTS public.field_visit_expenses (
    id VARCHAR(128) PRIMARY KEY,
    advance_id VARCHAR(128) NOT NULL REFERENCES public.field_visit_advances(id) ON DELETE CASCADE,
    employee_id VARCHAR(128) NOT NULL,
    expense_date DATE NOT NULL,
    category VARCHAR(64) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    description TEXT NOT NULL,
    payment_method VARCHAR(64),
    remarks TEXT,
    receipt_url TEXT,
    receipt_file_name VARCHAR(255),
    approval_status VARCHAR(32) NOT NULL DEFAULT 'Draft', -- 'Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Correction Requested'
    rejection_reason TEXT,
    created_by VARCHAR(128),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fve_advance_id ON public.field_visit_expenses(advance_id);
CREATE INDEX IF NOT EXISTS idx_fve_expense_date ON public.field_visit_expenses(expense_date);

CREATE TABLE IF NOT EXISTS public.field_visit_settlements (
    id VARCHAR(128) PRIMARY KEY,
    advance_id VARCHAR(128) UNIQUE NOT NULL REFERENCES public.field_visit_advances(id) ON DELETE CASCADE,
    total_disbursed NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- A: Total confirmed company advance disbursements
    total_recorded_expense NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- D: Total recorded expenses by employee
    total_eligible_expense NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- E: Total approved eligible expenses by CEO/HR
    provisional_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- B = A - D (Can be negative!)
    net_settlement NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- F = A - E: Final settlement balance
    return_due NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- max(0, F): Unused advance to return to Accounts
    reimbursement_due NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- max(0, -F): Reimbursement company owes employee
    actual_returned NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    actual_reimbursed NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    employee_remarks TEXT,
    approver_id VARCHAR(128),
    approver_name VARCHAR(255),
    approval_reason TEXT,
    approval_status VARCHAR(32) NOT NULL DEFAULT 'Draft', -- 'Draft', 'Pending Approval', 'Approved', 'Rejected', 'Correction Requested'
    settlement_status VARCHAR(64) NOT NULL DEFAULT 'Draft', -- 'Draft', 'Pending Approval', 'Correction Requested', 'Approved', 'Pending Balance Collection', 'Partially Settled', 'Pending Reimbursement', 'Completed'
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fvs_advance_id ON public.field_visit_settlements(advance_id);
CREATE INDEX IF NOT EXISTS idx_fvs_settlement_status ON public.field_visit_settlements(settlement_status);

CREATE TABLE IF NOT EXISTS public.field_visit_balance_returns (
    id VARCHAR(128) PRIMARY KEY,
    settlement_id VARCHAR(128) NOT NULL REFERENCES public.field_visit_settlements(id) ON DELETE CASCADE,
    advance_id VARCHAR(128) NOT NULL REFERENCES public.field_visit_advances(id) ON DELETE CASCADE,
    employee_reported_amount NUMERIC(12, 2) NOT NULL CHECK (employee_reported_amount > 0),
    actual_received_amount NUMERIC(12, 2) DEFAULT NULL,
    payment_method VARCHAR(64) NOT NULL, -- 'Cash Handover', 'Bank Transfer', 'UPI', 'Cheque'
    payment_reference VARCHAR(255),
    proof_reference TEXT,
    handover_date DATE NOT NULL,
    receipt_date DATE,
    employee_remarks TEXT,
    accounts_remarks TEXT,
    confirmed_by VARCHAR(128),
    confirmed_by_name VARCHAR(255),
    confirmed_at TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'Awaiting Confirmation' -- 'Awaiting Confirmation', 'Confirmed', 'Partial Receipt', 'Mismatch Reported'
);

CREATE INDEX IF NOT EXISTS idx_fvbr_settlement_id ON public.field_visit_balance_returns(settlement_id);

CREATE TABLE IF NOT EXISTS public.field_visit_reimbursements (
    id VARCHAR(128) PRIMARY KEY,
    settlement_id VARCHAR(128) NOT NULL REFERENCES public.field_visit_settlements(id) ON DELETE CASCADE,
    advance_id VARCHAR(128) NOT NULL REFERENCES public.field_visit_advances(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(64) NOT NULL,
    payment_reference VARCHAR(255),
    proof_reference TEXT,
    reimbursed_by VARCHAR(128),
    reimbursed_by_name VARCHAR(255),
    reimbursed_at TIMESTAMPTZ DEFAULT NOW(),
    remarks TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'Completed'
);

CREATE INDEX IF NOT EXISTS idx_fvr_settlement_id ON public.field_visit_reimbursements(settlement_id);

CREATE TABLE IF NOT EXISTS public.field_visit_audit_logs (
    id VARCHAR(128) PRIMARY KEY,
    entity_type VARCHAR(64) NOT NULL, -- 'ADVANCE', 'DISBURSEMENT', 'EXPENSE', 'SETTLEMENT', 'RETURN', 'REIMBURSEMENT'
    entity_id VARCHAR(128) NOT NULL,
    action VARCHAR(64) NOT NULL,
    actor_id VARCHAR(128),
    actor_name VARCHAR(255),
    actor_role VARCHAR(64),
    previous_status VARCHAR(64),
    new_status VARCHAR(64),
    event_payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fva_audit_entity ON public.field_visit_audit_logs(entity_type, entity_id);

GRANT ALL ON public.field_visit_advances TO web_anon, authenticated, service_role;
GRANT ALL ON public.field_visit_advance_approvals TO web_anon, authenticated, service_role;
GRANT ALL ON public.field_visit_advance_disbursements TO web_anon, authenticated, service_role;
GRANT ALL ON public.field_visit_expenses TO web_anon, authenticated, service_role;
GRANT ALL ON public.field_visit_settlements TO web_anon, authenticated, service_role;
GRANT ALL ON public.field_visit_balance_returns TO web_anon, authenticated, service_role;
GRANT ALL ON public.field_visit_reimbursements TO web_anon, authenticated, service_role;
GRANT ALL ON public.field_visit_audit_logs TO web_anon, authenticated, service_role;
