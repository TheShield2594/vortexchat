-- Migration: Channel & server editing support
-- Ensures all required columns exist for channel editing (name, topic, nsfw, slowmode_delay)
-- and server editing (name, icon_url, description).
--
-- The channels table already has topic, nsfw, and slowmode_delay columns from the initial schema.
-- The servers table already has name, icon_url, and description columns.
-- This migration adds an index on audit_logs for efficient filtering by target_type + target_id.

-- Index for audit log queries filtering by target
-- Rollback: DROP INDEX IF EXISTS idx_audit_logs_target;
CREATE INDEX IF NOT EXISTS idx_audit_logs_target
  ON audit_logs (server_id, target_type, target_id);

-- Index for invite queries by server with ordering
-- Rollback: DROP INDEX IF EXISTS idx_invites_server_created;
CREATE INDEX IF NOT EXISTS idx_invites_server_created
  ON invites (server_id, created_at DESC);

-- Ensure RLS policies allow channel updates by members with MANAGE_CHANNELS permission.
-- The existing RLS policy for channels UPDATE should already check server membership;
-- the API route handler does the permission check at the application layer.
-- No new RLS policies are needed since the supabase client runs with the authenticated
-- user's JWT and existing policies allow server members to update channels.
