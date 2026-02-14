-- Migration: Create audit_logs table
-- Run this migration via Supabase CLI or directly in the SQL Editor

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE'
  entity_type TEXT NOT NULL, -- 'expense', 'group', 'profile', 'member'
  entity_id TEXT NOT NULL,
  metadata JSONB, -- Stores before/after snapshots or other details
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster querying by user or entity
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policies
-- Users can read their own logs? Maybe only distinct "audit" admins?
-- For now, let's allow users to see their own actions.
CREATE POLICY "Users can view their own audit logs"
  ON audit_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role (admin) or systems can insert?
-- Actually, the backend (service role or user client) will insert.
-- If user client, we need INSERT policy.
CREATE POLICY "Users can insert their own audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);
