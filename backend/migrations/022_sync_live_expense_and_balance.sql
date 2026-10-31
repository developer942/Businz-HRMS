-- ============================================================
-- BUSINZ HRMS: Migration 022 - Sync live expenses & update balance
-- ============================================================

INSERT INTO public.petty_cash_expenses (
    id, expense_number, company_id, account_id, custodian_id, custodian_name,
    category_id, category_name, amount, expense_date, reason, payment_mode,
    status, is_reversed, created_at, updated_at
)
SELECT 
    gen_random_uuid(),
    'PCX-2026-0001',
    'company-a',
    a.id,
    a.custodian_id,
    a.custodian_name,
    c.id,
    'Tea & Coffee',
    1000.00,
    CURRENT_DATE,
    'Testing',
    'Cash',
    'RECORDED',
    false,
    NOW(),
    NOW()
FROM public.petty_cash_accounts a
CROSS JOIN (SELECT id FROM public.petty_cash_categories WHERE name = 'Tea & Coffee' LIMIT 1) c
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

