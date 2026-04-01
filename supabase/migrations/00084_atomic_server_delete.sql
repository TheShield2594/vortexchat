-- ============================================================
-- Atomic server deletion RPC
--
-- Wraps server deletion in a single transaction so either
-- everything is removed or nothing is. The DB schema already
-- has ON DELETE CASCADE for most child tables, but some tables
-- (e.g. audit_logs, member_timeouts) may not cascade automatically.
-- This function explicitly cleans up those tables first, then
-- deletes the server row which cascades the rest.
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_server_cascade(p_server_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete tables that may not have ON DELETE CASCADE from servers
  DELETE FROM public.audit_logs WHERE server_id = p_server_id;
  DELETE FROM public.member_timeouts WHERE server_id = p_server_id;
  DELETE FROM public.member_screening WHERE server_id = p_server_id;

  -- The server row deletion cascades to:
  -- server_members, roles, member_roles, channels (→ messages, reactions,
  -- channel_permissions), invites, automod_rules, screening_configs,
  -- webhooks, server_emojis, server_app_installs, events, etc.
  DELETE FROM public.servers WHERE id = p_server_id;
END;
$$;
