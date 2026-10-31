-- ============================================================
-- BUSINZ HRMS: Migration 021 - Petty Cash Categories Table & Seed
-- ============================================================

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

CREATE INDEX IF NOT EXISTS idx_petty_cash_categories_company ON public.petty_cash_categories(company_id);

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

