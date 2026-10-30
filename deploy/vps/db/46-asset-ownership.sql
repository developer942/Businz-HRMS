-- Migration 46: Add ownership column to public.assets (Owned vs Rental)
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS ownership TEXT NOT NULL DEFAULT 'Owned';

-- Populate existing rental records based on notes or device name
UPDATE public.assets
SET ownership = 'Rental'
WHERE LOWER(COALESCE(notes, '')) LIKE '%rent%' OR LOWER(name) LIKE '%rent%';
