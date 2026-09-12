select category, audience, screen_key, display_order, is_published, title
  from public.guide_articles order by category, display_order limit 20;
