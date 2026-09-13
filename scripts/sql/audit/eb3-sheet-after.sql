SELECT p.title, e.edition_label, e.errata_sheet_item_count AS 항목,
       e.errata_sheet_updated_at, e.errata_sheet_url
  FROM public.publication_editions e
  JOIN public.publications p ON p.publication_id = e.publication_id
 WHERE p.title = '도해특허법';
