-- DM end-to-end encryption primitives (client-managed keys)
ALTER TABLE public.dm_channels
  ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS encryption_key_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS encryption_membership_epoch INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.user_device_keys (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, device_id)
);

CREATE TABLE IF NOT EXISTS public.dm_channel_keys (
  dm_channel_id UUID NOT NULL REFERENCES public.dm_channels(id) ON DELETE CASCADE,
  key_version INTEGER NOT NULL,
  target_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_device_id TEXT NOT NULL,
  wrapped_key TEXT NOT NULL,
  wrapped_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  wrapped_by_device_id TEXT NOT NULL,
  sender_public_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (dm_channel_id, key_version, target_user_id, target_device_id)
);

CREATE INDEX IF NOT EXISTS dm_channel_keys_target_idx
  ON public.dm_channel_keys(target_user_id, target_device_id, dm_channel_id, key_version DESC);

ALTER TABLE public.user_device_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_channel_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own device keys"
  ON public.user_device_keys FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "dm members can view recipient key envelopes"
  ON public.dm_channel_keys FOR SELECT
  USING (
    target_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.dm_channel_members m
      WHERE m.dm_channel_id = dm_channel_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "dm members can insert recipient key envelopes"
  ON public.dm_channel_keys FOR INSERT
  WITH CHECK (
    wrapped_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.dm_channel_members m
      WHERE m.dm_channel_id = dm_channel_id AND m.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.dm_channel_rotate_on_member_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.dm_channels
  SET encryption_key_version = CASE WHEN is_encrypted THEN encryption_key_version + 1 ELSE encryption_key_version END,
      encryption_membership_epoch = encryption_membership_epoch + 1,
      updated_at = NOW()
  WHERE id = COALESCE(NEW.dm_channel_id, OLD.dm_channel_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS dm_rotate_on_member_insert ON public.dm_channel_members;
CREATE TRIGGER dm_rotate_on_member_insert
  AFTER INSERT ON public.dm_channel_members
  FOR EACH ROW EXECUTE FUNCTION public.dm_channel_rotate_on_member_change();

DROP TRIGGER IF EXISTS dm_rotate_on_member_delete ON public.dm_channel_members;
CREATE TRIGGER dm_rotate_on_member_delete
  AFTER DELETE ON public.dm_channel_members
  FOR EACH ROW EXECUTE FUNCTION public.dm_channel_rotate_on_member_change();
