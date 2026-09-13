SELECT bucket_id, count(*) AS 파일,
       (array_agg(name ORDER BY name))[1:3] AS 표본
  FROM storage.objects
 WHERE name ILIKE '%판례%' OR name ILIKE '%제10판%' OR bucket_id ILIKE '%book%' OR bucket_id ILIKE '%errata%'
 GROUP BY bucket_id ORDER BY count(*) DESC LIMIT 10;
