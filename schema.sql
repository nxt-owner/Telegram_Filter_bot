-- Supabase Table Initialization Script
-- Run this script in the Supabase SQL Editor (SQL Editor -> New Query -> Run)

create table if not exists filters (
  id uuid primary key default gen_random_uuid(),
  keyword text unique not null,
  response text not null,
  created_by bigint,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS) if you want to restrict public access.
-- By default, for a bot using the service role key, RLS does not bypass queries,
-- but the service role key always has full access.
-- If RLS is enabled, the bot script (using service_role key) bypasses RLS policies.
alter table filters enable row level security;

-- Policy to allow authenticated or service_role access if needed,
-- but service_role key bypasses RLS, so no strict policy is required for the bot itself.
