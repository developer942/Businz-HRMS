-- ============================================================
-- BUSINZ HRMS: Migration 023 - Sync Missing Daily Expenses (10,000 & 80)
-- ============================================================

BEGIN;

INSERT INTO public.petty_cash_expenses (
    id, expense_number, company_id, account_id, custodian_id, custodian_name,
    category_id, category_name, amount, expense_date, reason, payment_mode,
    status, is_reversed, created_at, updated_at
)
SELECT 
    gen_random_uuid(),
    'PCX-2026-0002',
    'company-a',
    a.id,
    a.custodian_id,
    a.custodian_name,
    COALESCE(c.id, (SELECT id FROM public.petty_cash_categories LIMIT 1)),
    'Office Maintenance',
    10000.00,
    CURRENT_DATE,
    'Daily operational expense',
    'Cash',
    'RECORDED',
    false,
    NOW(),
    NOW()
FROM public.petty_cash_accounts a
LEFT JOIN (SELECT id FROM public.petty_cash_categories WHERE name = 'Office Maintenance' LIMIT 1) c ON true
WHERE a.status = 'ACTIVE'
ON CONFLICT (expense_number) DO NOTHING;

INSERT INTO public.petty_cash_expenses (
    id, expense_number, company_id, account_id, custodian_id, custodian_name,
    category_id, category_name, amount, expense_date, reason, payment_mode,
    status, is_reversed, created_at, updated_at
)
SELECT 
    gen_random_uuid(),
    'PCX-2026-0003',
    'company-a',
    a.id,
    a.custodian_id,
    a.custodian_name,
    COALESCE(c.id, (SELECT id FROM public.petty_cash_categories LIMIT 1)),
    'Tea & Coffee',
    80.00,
    CURRENT_DATE,
    'Refreshments / Daily petty cash',
    'Cash',
    'RECORDED',
    false,
    NOW(),
    NOW()
FROM public.petty_cash_accounts a
LEFT JOIN (SELECT id FROM public.petty_cash_categories WHERE name = 'Tea & Coffee' LIMIT 1) c ON true
WHERE a.status = 'ACTIVE'
ON CONFLICT (expense_number) DO NOTHING;

-- Synchronize active custodian current_balance = (Total Disbursed - Total Expenses)
UPDATE public.petty_cash_accounts a
SET current_balance = (
    COALESCE((SELECT SUM(d.disbursed_amount) FROM public.petty_cash_disbursements d WHERE d.account_id = a.id AND d.status IN ('DISBURSED', 'CONFIRMED')), 0)
    -
    COALESCE((SELECT SUM(e.amount) FROM public.petty_cash_expenses e WHERE e.account_id = a.id AND e.is_reversed = false), 0)
),
updated_at = NOW()
WHERE a.status = 'ACTIVE';

COMMIT;

