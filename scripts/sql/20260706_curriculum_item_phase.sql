do $$ begin
  if not exists (select 1 from pg_type where typname = 'curriculum_item_phase') then
    create type curriculum_item_phase as enum ('pre','post');
  end if;
end $$;
alter table public.curriculum_items add column if not exists phase curriculum_item_phase;