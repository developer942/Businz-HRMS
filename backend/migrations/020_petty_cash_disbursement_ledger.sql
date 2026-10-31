-- ============================================================
-- BUSINZ HRMS: Petty Cash Disbursement Ledger Migration
-- Migration: 020_petty_cash_disbursement_ledger.sql
-- Allow DISBURSEMENT as a valid reference_type in petty_cash_ledger
-- ============================================================

BEGIN;

ALTER TABLE public.petty_cash_ledger DROP CONSTRAINT IF EXISTS petty_cash_ledger_reference_type_check;

ALTER TABLE public.petty_cash_ledger ADD CONSTRAINT petty_cash_ledger_reference_type_check 
  CHECK (reference_type IN (
    'RECEIPT_CONFIRMATION', 
    'DISBURSEMENT', 
    'EXPENSE_RECORD', 
    'EXPENSE_REVERSAL', 
    'RECONCILIATION_ADJUSTMENT'
  ));

COMMIT;
