-- Fix: Add composite FK from member_roles to server_members
-- PostgREST needs this explicit relationship to resolve the nested join:
--   server_members → member_roles → roles
-- Previously relied on implicit column-name matching which broke on schema cache reload.

ALTER TABLE public.member_roles
  ADD CONSTRAINT fk_member_roles_server_member
  FOREIGN KEY (server_id, user_id)
  REFERENCES public.server_members(server_id, user_id)
  ON DELETE CASCADE;

-- Rollback:
-- ALTER TABLE public.member_roles DROP CONSTRAINT IF EXISTS fk_member_roles_server_member;
