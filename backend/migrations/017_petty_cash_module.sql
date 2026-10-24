-- ============================================================
-- BUSINZ HRMS: Petty Cash Management Module Schema Migration
-- Migration: 017_petty_cash_module.sql
-- Role-based Custodian Assignment, Cash Requests, CEO Approval,
-- Accounts Disbursement, Receipt Confirmation, Daily Expenses,
-- Immutable Financial Ledger & Audit Trail.
-- ============================================================

BEGIN;

-- 1. Petty Cash Custodian Accounts
CREATE TABLE IF NOT EXISTS public.petty_cash_accounts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              TEXT NOT NULL DEFAULT 'company-a',
    custodian_id            UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    custodian_employee_id   TEXT NOT NULL,
    custodian_name          TEXT NOT NULL,
    assigned_by_id          UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    assigned_by_name        TEXT NOT NULL,
    assignment_date         DATE NOT NULL DEFAULT CURRENT_DATE,
    status                  TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RECONCILING', 'TRANSFERRED', 'INACTIVE')),
    current_balance         NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (current_balance >= 0.00),
    low_balance_threshold   NUMERIC(14,2) NOT NULL DEFAULT 1000.00 CHECK (low_balance_threshold >= 0.00),
    reconciliation_status   TEXT DEFAULT 'NONE' CHECK (reconciliation_status IN ('NONE', 'PENDING', 'RECONCILED', 'DISCREPANCY')),
    reconciliation_notes    TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial index to ensure only one ACTIVE custodian account per company
CREATE UNIQUE INDEX IF NOT EXISTS idx_uq_active_petty_cash_custodian 
ON public.petty_cash_accounts (company_id) 
WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_petty_cash_custodian ON public.petty_cash_accounts(custodian_id);
CREATE INDEX IF NOT EXISTS idx_petty_cash_company ON public.petty_cash_accounts(company_id);

-- 2. Expense Categories
CREATE TABLE IF NOT EXISTS public.petty_cash_categories (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              TEXT NOT NULL DEFAULT 'company-a',
    name                    TEXT NOT NULL,
    description             TEXT,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_petty_cash_category_name UNIQUE(company_id, name)
);

-- Seed default standardized expense categories
INSERT INTO public.petty_cash_categories (company_id, name, description)
VALUES 
    ('company-a', 'Tea & Coffee', 'Office daily tea, coffee, refreshments, and snacks'),
    ('company-a', 'Stationery', 'Pens, notepads, printing paper, printer toner, and desk supplies'),
    ('company-a', 'Courier', 'Postal and parcel dispatch charges'),
    ('company-a', 'Local Transport', 'Auto rickshaw, taxi, and local employee transit fares'),
    ('company-a', 'Petrol / Fuel', 'Fuel allowances for urgent office errands and field visits'),
    ('company-a', 'Office Maintenance', 'Plumbing, electrical repairs, minor hardware fixes, bulb replacements'),
    ('company-a', 'Cleaning Materials', 'Disinfectants, soaps, mops, brooms, sanitizers, and washroom supplies'),
    ('company-a', 'Other', 'Miscellaneous petty office operational expenditures')
ON CONFLICT (company_id, name) DO NOTHING;

-- 3. Petty Cash Requests
CREATE TABLE IF NOT EXISTS public.petty_cash_requests (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_number          TEXT NOT NULL UNIQUE,
    company_id              TEXT NOT NULL DEFAULT 'company-a',
    account_id              UUID NOT NULL REFERENCES public.petty_cash_accounts(id) ON DELETE RESTRICT,
    employee_id             UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    employee_name           TEXT NOT NULL,
    employee_code           TEXT NOT NULL,
    requested_amount        NUMERIC(14,2) NOT NULL CHECK (requested_amount > 0),
    approved_amount         NUMERIC(14,2) CHECK (approved_amount IS NULL OR approved_amount > 0),
    request_date            DATE NOT NULL DEFAULT CURRENT_DATE,
    purpose                 TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'PENDING_CEO_APPROVAL' 
                            CHECK (status IN (
                                'PENDING_CEO_APPROVAL', 
                                'APPROVED_BY_CEO', 
                                'REJECTED_BY_CEO', 
                                'DISBURSED_PENDING_RECEIPT', 
                                'COMPLETED', 
                                'DISPUTED_RECEIPT', 
                                'CANCELLED'
                            )),
    ceo_id                  UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    ceo_name                TEXT,
    ceo_action_at           TIMESTAMPTZ,
    ceo_remarks             TEXT,
    supporting_document_url TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pcr_account ON public.petty_cash_requests(account_id);
CREATE INDEX IF NOT EXISTS idx_pcr_status ON public.petty_cash_requests(status);
CREATE INDEX IF NOT EXISTS idx_pcr_emp ON public.petty_cash_requests(employee_id);

-- 4. Accounts Cash Disbursements
CREATE TABLE IF NOT EXISTS public.petty_cash_disbursements (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    disbursement_number     TEXT NOT NULL UNIQUE,
    company_id              TEXT NOT NULL DEFAULT 'company-a',
    request_id              UUID NOT NULL UNIQUE REFERENCES public.petty_cash_requests(id) ON DELETE RESTRICT,
    account_id              UUID NOT NULL REFERENCES public.petty_cash_accounts(id) ON DELETE RESTRICT,
    disbursed_by_id         UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    disbursed_by_name       TEXT NOT NULL,
    disbursed_amount        NUMERIC(14,2) NOT NULL CHECK (disbursed_amount > 0),
    payment_mode            TEXT NOT NULL CHECK (payment_mode IN ('Cash', 'Bank Transfer', 'UPI')),
    payment_date            DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_reference       TEXT NOT NULL,
    remarks                 TEXT,
    payment_proof_url       TEXT,
    status                  TEXT NOT NULL DEFAULT 'DISBURSED' CHECK (status IN ('DISBURSED', 'CONFIRMED', 'DISPUTED')),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pcd_request ON public.petty_cash_disbursements(request_id);
CREATE INDEX IF NOT EXISTS idx_pcd_account ON public.petty_cash_disbursements(account_id);

-- 5. Employee Receipt Confirmations
CREATE TABLE IF NOT EXISTS public.petty_cash_receipts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number          TEXT NOT NULL UNIQUE,
    company_id              TEXT NOT NULL DEFAULT 'company-a',
    request_id              UUID NOT NULL UNIQUE REFERENCES public.petty_cash_requests(id) ON DELETE RESTRICT,
    disbursement_id         UUID NOT NULL REFERENCES public.petty_cash_disbursements(id) ON DELETE RESTRICT,
    account_id              UUID NOT NULL REFERENCES public.petty_cash_accounts(id) ON DELETE RESTRICT,
    custodian_id            UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    status                  TEXT NOT NULL CHECK (status IN ('CONFIRMED', 'DISPUTED')),
    amount_received         NUMERIC(14,2) CHECK (amount_received IS NULL OR amount_received > 0),
    discrepancy_reason      TEXT,
    idempotency_key         TEXT UNIQUE,
    confirmed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Daily Expenses
CREATE TABLE IF NOT EXISTS public.petty_cash_expenses (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_number          TEXT NOT NULL UNIQUE,
    company_id              TEXT NOT NULL DEFAULT 'company-a',
    account_id              UUID NOT NULL REFERENCES public.petty_cash_accounts(id) ON DELETE RESTRICT,
    custodian_id            UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    custodian_name          TEXT NOT NULL,
    category_id             UUID NOT NULL REFERENCES public.petty_cash_categories(id) ON DELETE RESTRICT,
    category_name           TEXT NOT NULL,
    amount                  NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    expense_date            DATE NOT NULL,
    reason                  TEXT NOT NULL,
    payment_mode            TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_mode IN ('Cash', 'UPI', 'Card', 'Other')),
    bill_attachment_url     TEXT,
    status                  TEXT NOT NULL DEFAULT 'RECORDED' CHECK (status IN ('RECORDED', 'FLAGGED', 'REVERSED')),
    flag_reason             TEXT,
    flagged_by_id           UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    flagged_by_name         TEXT,
    flagged_at              TIMESTAMPTZ,
    is_reversed             BOOLEAN NOT NULL DEFAULT FALSE,
    reversed_at             TIMESTAMPTZ,
    reversed_by_id          UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    reversed_by_name        TEXT,
    reversal_reason         TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pcx_account ON public.petty_cash_expenses(account_id);
CREATE INDEX IF NOT EXISTS idx_pcx_date ON public.petty_cash_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_pcx_category ON public.petty_cash_expenses(category_id);

-- 7. Immutable Financial Ledger
CREATE TABLE IF NOT EXISTS public.petty_cash_ledger (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              TEXT NOT NULL DEFAULT 'company-a',
    account_id              UUID NOT NULL REFERENCES public.petty_cash_accounts(id) ON DELETE RESTRICT,
    transaction_type        TEXT NOT NULL CHECK (transaction_type IN ('CREDIT', 'DEBIT', 'REVERSAL', 'ADJUSTMENT')),
    reference_type          TEXT NOT NULL CHECK (reference_type IN ('RECEIPT_CONFIRMATION', 'EXPENSE_RECORD', 'EXPENSE_REVERSAL', 'RECONCILIATION_ADJUSTMENT')),
    reference_id            UUID NOT NULL,
    amount                  NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    balance_before          NUMERIC(14,2) NOT NULL CHECK (balance_before >= 0),
    balance_after           NUMERIC(14,2) NOT NULL CHECK (balance_after >= 0),
    description             TEXT NOT NULL,
    idempotency_key         TEXT UNIQUE,
    created_by_id           UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    created_by_name         TEXT NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pcl_account_created ON public.petty_cash_ledger(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pcl_reference ON public.petty_cash_ledger(reference_id);

-- 8. Petty Cash Attachments Metadata
CREATE TABLE IF NOT EXISTS public.petty_cash_attachments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              TEXT NOT NULL DEFAULT 'company-a',
    entity_type             TEXT NOT NULL CHECK (entity_type IN ('REQUEST', 'DISBURSEMENT', 'EXPENSE')),
    entity_id               UUID NOT NULL,
    file_name               TEXT NOT NULL,
    file_path               TEXT NOT NULL,
    file_size               INTEGER NOT NULL,
    mime_type               TEXT NOT NULL,
    uploaded_by_id          UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pca_entity ON public.petty_cash_attachments(entity_type, entity_id);

-- 9. Petty Cash Audit Logs
CREATE TABLE IF NOT EXISTS public.petty_cash_audit_logs (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              TEXT NOT NULL DEFAULT 'company-a',
    account_id              UUID REFERENCES public.petty_cash_accounts(id) ON DELETE SET NULL,
    action                  TEXT NOT NULL,
    performed_by_id         UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    performed_by_name       TEXT NOT NULL,
    performed_by_role       TEXT NOT NULL,
    entity_type             TEXT NOT NULL,
    entity_id               UUID NOT NULL,
    details                 JSONB,
    ip_address              TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pcal_account ON public.petty_cash_audit_logs(account_id);
CREATE INDEX IF NOT EXISTS idx_pcal_action ON public.petty_cash_audit_logs(action);

COMMIT;
