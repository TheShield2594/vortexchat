-- Persist per-user appearance settings including theme preset and custom CSS.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS appearance_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
