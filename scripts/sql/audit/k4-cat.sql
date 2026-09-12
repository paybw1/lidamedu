select category, count(*) as n, min(display_order) as ord_min, max(display_order) as ord_max
  from public.guide_articles where audience='student' group by category order by ord_min;
