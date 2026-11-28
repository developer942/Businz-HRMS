-- ============================================================
-- BUSINZ HRMS: Migration 038 - Standardize Petty Cash Expense Categories
-- Keeps historical expenses intact (deactivates cluttered ad-hoc rows
-- instead of deleting) and activates the 10 standardized categories.
-- ============================================================

BEGIN;

-- 1. Deactivate all old / ad-hoc categories so historical FK links stay intact
UPDATE public.petty_cash_categories
SET is_active = FALSE, updated_at = NOW()
WHERE company_id = 'company-a';

-- 2. Upsert & activate the 10 standardized petty cash categories
INSERT INTO public.petty_cash_categories (company_id, name, description, is_active)
VALUES
    ('company-a', 'Inward Transport', 'Inward freight, porter, and incoming material transport charges', TRUE),
    ('company-a', 'Transport', 'Local transit, auto, taxi, and dispatch transport expenses', TRUE),
    ('company-a', 'Food', 'Staff meals, lunch, dinner, and official hospitality food', TRUE),
    ('company-a', 'Snacks', 'Tea, coffee, biscuits, and office refreshments', TRUE),
    ('company-a', 'Material Purchase', 'Consumables, hardware, tools, and petty material purchases', TRUE),
    ('company-a', 'Recharge', 'Mobile, data card, DTH, and utility recharges', TRUE),
    ('company-a', 'Birthday Gift', 'Employee birthday cakes, gifts, and celebrations', TRUE),
    ('company-a', 'Repair & Maintenance', 'Equipment repair, electrical, plumbing, and office maintenance', TRUE),
    ('company-a', 'Advance', 'Short-term petty cash employee or vendor advances', TRUE),
    ('company-a', 'Toll Charge', 'Highway toll, FASTag, and parking toll charges', TRUE)
ON CONFLICT (company_id, name) DO UPDATE
SET description = EXCLUDED.description,
    is_active = TRUE,
    updated_at = NOW();

COMMIT;
