-- Migration 47: Expand hr_employment_type enum to include Permanent, Probation, and Temporary
-- Prevents PostgreSQL 22P02 invalid enum value errors during employee onboarding
-- Preserves all existing records and distinct employment types

ALTER TYPE public.hr_employment_type ADD VALUE IF NOT EXISTS 'Permanent';
ALTER TYPE public.hr_employment_type ADD VALUE IF NOT EXISTS 'Probation';
ALTER TYPE public.hr_employment_type ADD VALUE IF NOT EXISTS 'Temporary';
