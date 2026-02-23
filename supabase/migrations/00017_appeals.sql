-- Appeal workflow for moderation bans.

CREATE TABLE IF NOT EXISTS public.moderation_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ban_server_id UUID NOT NULL,
  ban_user_id UUID NOT NULL,
  linked_action TEXT NOT NULL DEFAULT 'member_ban',
  appellant_statement TEXT NOT NULL CHECK (char_length(appellant_statement) BETWEEN 20 AND 4000),
  evidence_attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewing', 'approved', 'denied', 'closed')),
  assigned_reviewer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  decision_template_id UUID,
  decision_reason TEXT,
  anti_abuse_score SMALLINT NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  CONSTRAINT moderation_appeals_ban_fk
    FOREIGN KEY (ban_server_id, ban_user_id)
    REFERENCES public.server_bans(server_id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT moderation_appeals_same_subject CHECK (server_id = ban_server_id AND user_id = ban_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS moderation_appeals_open_unique_idx
  ON public.moderation_appeals(server_id, user_id)
  WHERE status IN ('submitted', 'reviewing');

CREATE INDEX IF NOT EXISTS moderation_appeals_triage_idx
  ON public.moderation_appeals(server_id, status, submitted_at ASC);

CREATE INDEX IF NOT EXISTS moderation_appeals_user_idx
  ON public.moderation_appeals(user_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS public.moderation_decision_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 80),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 10 AND 3000),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'denied', 'closed')),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(server_id, title)
);

ALTER TABLE public.moderation_appeals
  ADD CONSTRAINT moderation_appeals_template_fk
  FOREIGN KEY (decision_template_id)
  REFERENCES public.moderation_decision_templates(id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.moderation_appeal_internal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appeal_id UUID NOT NULL REFERENCES public.moderation_appeals(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  note TEXT NOT NULL CHECK (char_length(note) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS moderation_appeal_notes_idx
  ON public.moderation_appeal_internal_notes(appeal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.moderation_appeal_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appeal_id UUID NOT NULL REFERENCES public.moderation_appeals(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  previous_status TEXT CHECK (previous_status IS NULL OR previous_status IN ('submitted', 'reviewing', 'approved', 'denied', 'closed')),
  new_status TEXT NOT NULL CHECK (new_status IN ('submitted', 'reviewing', 'approved', 'denied', 'closed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS moderation_appeal_status_events_idx
  ON public.moderation_appeal_status_events(appeal_id, created_at DESC);

ALTER TABLE public.moderation_appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_decision_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_appeal_internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_appeal_status_events ENABLE ROW LEVEL SECURITY;

-- Appellant may only view their own appeals.
CREATE POLICY "Appeal owner can view own appeals"
  ON public.moderation_appeals FOR SELECT
  USING (auth.uid() = user_id);

-- Server moderators can triage appeals.
CREATE POLICY "Server moderators can view appeals"
  ON public.moderation_appeals FOR SELECT
  USING (public.has_permission(server_id, 16) OR public.has_permission(server_id, 128));

-- Inserts/updates are expected via API + service-role.

CREATE POLICY "Moderators can view decision templates"
  ON public.moderation_decision_templates FOR SELECT
  USING (public.has_permission(server_id, 16) OR public.has_permission(server_id, 128));

CREATE POLICY "Moderators can manage decision templates"
  ON public.moderation_decision_templates FOR ALL
  USING (public.has_permission(server_id, 16) OR public.has_permission(server_id, 128));

CREATE POLICY "Moderators can view internal notes"
  ON public.moderation_appeal_internal_notes FOR SELECT
  USING (public.has_permission(server_id, 16) OR public.has_permission(server_id, 128));

CREATE POLICY "Moderators can manage internal notes"
  ON public.moderation_appeal_internal_notes FOR ALL
  USING (public.has_permission(server_id, 16) OR public.has_permission(server_id, 128));

CREATE POLICY "Appeal owner can view status events"
  ON public.moderation_appeal_status_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.moderation_appeals ma
      WHERE ma.id = moderation_appeal_status_events.appeal_id
        AND ma.user_id = auth.uid()
    )
  );

CREATE POLICY "Moderators can view status events"
  ON public.moderation_appeal_status_events FOR SELECT
  USING (public.has_permission(server_id, 16) OR public.has_permission(server_id, 128));
