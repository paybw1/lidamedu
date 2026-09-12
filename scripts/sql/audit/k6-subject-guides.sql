select display_order, screen_key, title, left(body_md, 70) as head
  from public.guide_articles
 where audience='student' and category='학습과목' order by display_order;
