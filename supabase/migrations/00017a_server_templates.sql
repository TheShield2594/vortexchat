-- Server template import/export helpers

CREATE OR REPLACE FUNCTION public.apply_server_template(
  p_server_id UUID,
  p_template JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
  v_default_role_id UUID;
  v_default_role_name TEXT;
  v_default_permissions BIGINT := 3;
  v_default_color TEXT := '#99AAB5';
  v_role JSONB;
  v_category JSONB;
  v_channel JSONB;
  v_perm JSONB;
  v_role_id UUID;
  v_channel_id UUID;
  v_parent_id UUID;
  v_deleted_channels INTEGER := 0;
BEGIN
  SELECT owner_id INTO v_owner FROM public.servers WHERE id = p_server_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Server not found';
  END IF;

  IF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Only server owner can import templates';
  END IF;

  IF jsonb_typeof(p_template) <> 'object' THEN
    RAISE EXCEPTION 'Template must be an object';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS tmp_role_map(name TEXT PRIMARY KEY, role_id UUID) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS tmp_category_map(name TEXT PRIMARY KEY, channel_id UUID) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS tmp_channel_map(name TEXT PRIMARY KEY, channel_id UUID) ON COMMIT DROP;
  TRUNCATE tmp_role_map, tmp_category_map, tmp_channel_map;

  SELECT id INTO v_default_role_id
  FROM public.roles
  WHERE server_id = p_server_id AND is_default = TRUE
  LIMIT 1;

  SELECT COALESCE(r->>'name', '@everyone'),
         COALESCE((r->>'permissions')::BIGINT, 3),
         COALESCE(r->>'color', '#99AAB5')
  INTO v_default_role_name, v_default_permissions, v_default_color
  FROM jsonb_array_elements(COALESCE(p_template->'roles', '[]'::jsonb)) r
  WHERE COALESCE((r->>'is_default')::BOOLEAN, FALSE) = TRUE
  LIMIT 1;

  IF v_default_role_id IS NULL THEN
    INSERT INTO public.roles (server_id, name, color, position, permissions, is_default)
    VALUES (p_server_id, v_default_role_name, v_default_color, 0, v_default_permissions, TRUE)
    RETURNING id INTO v_default_role_id;
  ELSE
    UPDATE public.roles
    SET name = v_default_role_name,
        color = v_default_color,
        permissions = v_default_permissions,
        is_hoisted = FALSE,
        mentionable = FALSE
    WHERE id = v_default_role_id;
  END IF;

  INSERT INTO tmp_role_map(name, role_id)
  VALUES (LOWER(v_default_role_name), v_default_role_id)
  ON CONFLICT (name) DO UPDATE SET role_id = EXCLUDED.role_id;

  DELETE FROM public.member_roles
  WHERE server_id = p_server_id
    AND role_id IN (SELECT id FROM public.roles WHERE server_id = p_server_id AND is_default = FALSE);

  DELETE FROM public.roles
  WHERE server_id = p_server_id AND is_default = FALSE;

  FOR v_role IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_template->'roles', '[]'::jsonb))
  LOOP
    IF COALESCE((v_role->>'is_default')::BOOLEAN, FALSE) = TRUE THEN
      CONTINUE;
    END IF;

    INSERT INTO public.roles (server_id, name, color, position, permissions, is_hoisted, mentionable, is_default)
    VALUES (
      p_server_id,
      COALESCE(v_role->>'name', 'new role'),
      COALESCE(v_role->>'color', '#99AAB5'),
      COALESCE((v_role->>'position')::INTEGER, 0),
      COALESCE((v_role->>'permissions')::BIGINT, 0),
      COALESCE((v_role->>'is_hoisted')::BOOLEAN, FALSE),
      COALESCE((v_role->>'mentionable')::BOOLEAN, FALSE),
      FALSE
    )
    RETURNING id INTO v_role_id;

    INSERT INTO tmp_role_map(name, role_id)
    VALUES (LOWER(COALESCE(v_role->>'name', 'new role')), v_role_id)
    ON CONFLICT (name) DO UPDATE SET role_id = EXCLUDED.role_id;
  END LOOP;

  DELETE FROM public.channels WHERE server_id = p_server_id;
  GET DIAGNOSTICS v_deleted_channels = ROW_COUNT;

  FOR v_category IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_template->'categories', '[]'::jsonb))
  LOOP
    INSERT INTO public.channels (server_id, name, type, position)
    VALUES (
      p_server_id,
      COALESCE(v_category->>'name', 'category'),
      'category',
      COALESCE((v_category->>'position')::INTEGER, 0)
    )
    RETURNING id INTO v_channel_id;

    INSERT INTO tmp_category_map(name, channel_id)
    VALUES (LOWER(COALESCE(v_category->>'name', 'category')), v_channel_id)
    ON CONFLICT (name) DO UPDATE SET channel_id = EXCLUDED.channel_id;
  END LOOP;

  FOR v_channel IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_template->'channels', '[]'::jsonb))
  LOOP
    SELECT channel_id INTO v_parent_id
    FROM tmp_category_map
    WHERE name = LOWER(COALESCE(v_channel->>'category', ''));

    INSERT INTO public.channels (
      server_id, name, type, position, topic, parent_id, slowmode_delay, nsfw, forum_guidelines
    )
    VALUES (
      p_server_id,
      COALESCE(v_channel->>'name', 'channel'),
      COALESCE(v_channel->>'type', 'text'),
      COALESCE((v_channel->>'position')::INTEGER, 0),
      NULLIF(v_channel->>'topic', ''),
      v_parent_id,
      COALESCE((v_channel->>'slowmode_delay')::INTEGER, 0),
      COALESCE((v_channel->>'nsfw')::BOOLEAN, FALSE),
      NULLIF(v_channel->>'forum_guidelines', '')
    )
    RETURNING id INTO v_channel_id;

    INSERT INTO tmp_channel_map(name, channel_id)
    VALUES (LOWER(COALESCE(v_channel->>'name', 'channel')), v_channel_id)
    ON CONFLICT (name) DO UPDATE SET channel_id = EXCLUDED.channel_id;

    FOR v_perm IN
      SELECT value FROM jsonb_array_elements(COALESCE(v_channel->'permissions', '[]'::jsonb))
    LOOP
      SELECT role_id INTO v_role_id
      FROM tmp_role_map
      WHERE name = LOWER(COALESCE(v_perm->>'role', ''));

      IF v_role_id IS NULL THEN
        CONTINUE;
      END IF;

      INSERT INTO public.channel_permissions (channel_id, role_id, allow_permissions, deny_permissions)
      VALUES (
        v_channel_id,
        v_role_id,
        COALESCE((v_perm->>'allow')::BIGINT, 0),
        COALESCE((v_perm->>'deny')::BIGINT, 0)
      )
      ON CONFLICT (channel_id, role_id)
      DO UPDATE SET
        allow_permissions = EXCLUDED.allow_permissions,
        deny_permissions = EXCLUDED.deny_permissions;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_channels', v_deleted_channels,
    'roles_count', (SELECT COUNT(*) FROM public.roles WHERE server_id = p_server_id),
    'channels_count', (SELECT COUNT(*) FROM public.channels WHERE server_id = p_server_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.export_server_template(p_server_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
BEGIN
  SELECT owner_id INTO v_owner FROM public.servers WHERE id = p_server_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Server not found';
  END IF;

  IF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Only server owner can export templates';
  END IF;

  RETURN jsonb_build_object(
    'name', (SELECT name FROM public.servers WHERE id = p_server_id),
    'description', (SELECT description FROM public.servers WHERE id = p_server_id),
    'metadata', jsonb_build_object('source', 'export', 'version', '1.0.0', 'created_by', auth.uid()::TEXT),
    'roles', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', r.name,
        'color', r.color,
        'position', r.position,
        'permissions', r.permissions,
        'is_hoisted', r.is_hoisted,
        'mentionable', r.mentionable,
        'is_default', r.is_default
      ) ORDER BY r.position DESC)
      FROM public.roles r
      WHERE r.server_id = p_server_id
    ), '[]'::jsonb),
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', c.name, 'position', c.position) ORDER BY c.position ASC)
      FROM public.channels c
      WHERE c.server_id = p_server_id AND c.type = 'category'
    ), '[]'::jsonb),
    'channels', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', c.name,
        'type', c.type,
        'position', c.position,
        'category', parent.name,
        'topic', c.topic,
        'slowmode_delay', c.slowmode_delay,
        'nsfw', c.nsfw,
        'forum_guidelines', c.forum_guidelines,
        'permissions', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'role', r.name,
            'allow', cp.allow_permissions,
            'deny', cp.deny_permissions
          ))
          FROM public.channel_permissions cp
          JOIN public.roles r ON r.id = cp.role_id
          WHERE cp.channel_id = c.id
        ), '[]'::jsonb)
      ) ORDER BY c.position ASC)
      FROM public.channels c
      LEFT JOIN public.channels parent ON parent.id = c.parent_id
      WHERE c.server_id = p_server_id AND c.type <> 'category'
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_server_template(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_server_template(UUID, JSONB) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.export_server_template(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.export_server_template(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_server_from_template(
  p_name TEXT,
  p_description TEXT,
  p_icon_url TEXT,
  p_template JSONB
)
RETURNS public.servers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_server public.servers;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO public.servers (name, description, icon_url, owner_id)
  VALUES (p_name, NULLIF(p_description, ''), NULLIF(p_icon_url, ''), auth.uid())
  RETURNING * INTO v_server;

  PERFORM public.apply_server_template(v_server.id, p_template);

  SELECT * INTO v_server FROM public.servers WHERE id = v_server.id;
  RETURN v_server;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_server_from_template(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_server_from_template(TEXT, TEXT, TEXT, JSONB) TO authenticated;
