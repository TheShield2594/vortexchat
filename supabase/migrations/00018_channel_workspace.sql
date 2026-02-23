-- Channel workspace primitives: tasks + lightweight docs/notes

CREATE TABLE IF NOT EXISTS public.channel_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'blocked', 'done')),
  assignee_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channel_tasks_channel_id ON public.channel_tasks(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_tasks_server_id ON public.channel_tasks(server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_tasks_assignee_id ON public.channel_tasks(assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_channel_tasks_status_due ON public.channel_tasks(status, due_at);
CREATE INDEX IF NOT EXISTS idx_channel_tasks_title_fts ON public.channel_tasks USING gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));

CREATE TABLE IF NOT EXISTS public.channel_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  updated_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channel_docs_channel_id ON public.channel_docs(channel_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_docs_server_id ON public.channel_docs(server_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_docs_content_fts ON public.channel_docs USING gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')));

DROP TRIGGER IF EXISTS channel_tasks_updated_at ON public.channel_tasks;
CREATE TRIGGER channel_tasks_updated_at
  BEFORE UPDATE ON public.channel_tasks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS channel_docs_updated_at ON public.channel_docs;
CREATE TRIGGER channel_docs_updated_at
  BEFORE UPDATE ON public.channel_docs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.channel_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view channel tasks"
  ON public.channel_tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.server_members sm
      WHERE sm.server_id = channel_tasks.server_id
        AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create channel tasks"
  ON public.channel_tasks FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1
      FROM public.server_members sm
      WHERE sm.server_id = channel_tasks.server_id
        AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "Task owners or channel managers can update tasks"
  ON public.channel_tasks FOR UPDATE
  USING (
    auth.uid() = created_by
    OR public.has_permission(channel_tasks.server_id, 64 /* MANAGE_CHANNELS */)
  )
  WITH CHECK (
    auth.uid() = created_by
    OR public.has_permission(channel_tasks.server_id, 64 /* MANAGE_CHANNELS */)
  );

CREATE POLICY "Task owners or channel managers can delete tasks"
  ON public.channel_tasks FOR DELETE
  USING (
    auth.uid() = created_by
    OR public.has_permission(channel_tasks.server_id, 64 /* MANAGE_CHANNELS */)
  );

CREATE POLICY "Members can view channel docs"
  ON public.channel_docs FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.server_members sm
      WHERE sm.server_id = channel_docs.server_id
        AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create channel docs"
  ON public.channel_docs FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND auth.uid() = updated_by
    AND EXISTS (
      SELECT 1
      FROM public.server_members sm
      WHERE sm.server_id = channel_docs.server_id
        AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "Doc editors and channel managers can update docs"
  ON public.channel_docs FOR UPDATE
  USING (
    auth.uid() = created_by
    OR public.has_permission(channel_docs.server_id, 64 /* MANAGE_CHANNELS */)
  )
  WITH CHECK (
    auth.uid() = updated_by
    AND (
      auth.uid() = created_by
      OR public.has_permission(channel_docs.server_id, 64 /* MANAGE_CHANNELS */)
    )
  );

CREATE POLICY "Doc owners or channel managers can delete docs"
  ON public.channel_docs FOR DELETE
  USING (
    auth.uid() = created_by
    OR public.has_permission(channel_docs.server_id, 64 /* MANAGE_CHANNELS */)
  );
