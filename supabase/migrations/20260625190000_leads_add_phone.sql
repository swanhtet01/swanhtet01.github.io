-- Add phone column to supermega_leads (safe to run on existing table)
-- Run this ONLY if the supermega_leads table already exists from a prior migration run.
-- If running 20260625180000_crm_tables.sql fresh, this is a no-op (column already there).
alter table public.supermega_leads add column if not exists phone text;
