select p.profile_id, p.name, p.role
  from public.profiles p where p.role='admin' order by p.created_at limit 3;
