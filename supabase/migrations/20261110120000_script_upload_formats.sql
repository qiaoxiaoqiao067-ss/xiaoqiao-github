-- Keep the script bucket private and preserve existing limits/types.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY(
  SELECT DISTINCT mime FROM unnest(
    allowed_mime_types || ARRAY['application/msword', 'application/octet-stream',
      'image/png', 'image/jpeg', 'image/webp']
  ) AS mime
)
WHERE id = 'content-files' AND allowed_mime_types IS NOT NULL;
