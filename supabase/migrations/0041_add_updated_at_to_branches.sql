-- Migration 0041: Add updated_at to public.branches
ALTER TABLE public.branches
ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

