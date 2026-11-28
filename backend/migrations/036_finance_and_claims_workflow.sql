-- Migration 036: Finance and Claims Workflow, Status State Machine & Categories Expansion
-- Renames and aligns Field Allowance to Finance and Claims
-- Expands categories: TRAVEL, BUS, TRAIN, TAXI_AUTO, FUEL, FOOD, ROOM, PARKING, TOLL, OTHER
-- Expands statuses for Workflow A (No Advance Required) and Workflow B (Advance Required)

BEGIN;

-- 1. Ensure all balance return columns exist on public.field_allowance_requests
ALTER TABLE public.field_allowance_requests
  ADD COLUMN IF NOT EXISTS returned_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_return_status TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS balance_returned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS balance_return_mode TEXT,
  ADD COLUMN IF NOT EXISTS balance_return_reference TEXT,
  ADD COLUMN IF NOT EXISTS balance_return_proof_path TEXT,
  ADD COLUMN IF NOT EXISTS balance_return_remarks TEXT,
  ADD COLUMN IF NOT EXISTS balance_received_by TEXT,
  ADD COLUMN IF NOT EXISTS balance_received_by_name TEXT,
  ADD COLUMN IF NOT EXISTS balance_received_at TIMESTAMPTZ;

-- 2. Update status check constraint on public.field_allowance_requests
ALTER TABLE public.field_allowance_requests
  DROP CONSTRAINT IF EXISTS field_allowance_requests_status_check;

ALTER TABLE public.field_allowance_requests
  ADD CONSTRAINT field_allowance_requests_status_check CHECK (status IN (
    'DRAFT',
    'PENDING_APPROVAL',
    'PENDING_ADVANCE_APPROVAL',
    'APPROVED',
    'PENDING_DISTRIBUTION',
    'AMOUNT_DISTRIBUTED',
    'ACTIVE_VISIT',
    'IN_PROGRESS',
    'CLAIM_SUBMITTED',
    'PENDING_SETTLEMENT_VERIFICATION',
    'PENDING_REIMBURSEMENT',
    'PENDING_RETURN',
    'COMPLETED',
    'SETTLED',
    'CORRECTION_REQUESTED',
    'REJECTED'
  ));

-- 3. Update category check constraint on public.field_allowance_daily_reports
ALTER TABLE public.field_allowance_daily_reports
  DROP CONSTRAINT IF EXISTS field_allowance_daily_reports_category_check;

ALTER TABLE public.field_allowance_daily_reports
  ADD CONSTRAINT field_allowance_daily_reports_category_check CHECK (category IN (
    'TRAVEL',
    'BUS',
    'TRAIN',
    'TAXI_AUTO',
    'FUEL',
    'FOOD',
    'ROOM',
    'PARKING',
    'TOLL',
    'OTHER'
  ));

-- 4. Reconcile historical visit for Annamalaiyar AR (VRM-026) where advance_required is false
-- and trip was stuck in APPROVED without being able to add expenses smoothly:
UPDATE public.field_allowance_requests
SET status = 'ACTIVE_VISIT', updated_at = NOW()
WHERE employee_id = 'VRM-026'
  AND advance_required = FALSE
  AND status = 'APPROVED';

COMMIT;
