-- Server emoji storage bucket + RLS policies

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'server-emojis',
  'server-emojis',
  TRUE,
  262144,
  ARRAY['image/png', 'image/gif', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY IF NOT EXISTS "Anyone can view server emojis"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'server-emojis');

CREATE POLICY IF NOT EXISTS "Admins can upload server emojis"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'server-emojis' AND
    public.has_permission(((storage.foldername(name))[1])::uuid, 128)
  );

CREATE POLICY IF NOT EXISTS "Admins can update server emojis"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'server-emojis' AND
    public.has_permission(((storage.foldername(name))[1])::uuid, 128)
  );

CREATE POLICY IF NOT EXISTS "Admins can delete server emojis"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'server-emojis' AND
    public.has_permission(((storage.foldername(name))[1])::uuid, 128)
  );
