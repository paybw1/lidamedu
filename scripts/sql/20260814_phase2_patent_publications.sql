-- ============================================================
-- errata Phase 2 (특허 한정) — 판본·매핑 시드 v2
-- 근거: 설계 v1.1 §3.3~3.4 + 결정서 v1.2.1 §7.1 + phase2-patent-matching.md
--       + 사용자 지시 [1]~[4] (2026-08-13): frozen_at=판권지 인쇄일(books.published_on),
--       최신판례 10건 원장 수동 삽입, 빠진 판례 무조치, 백필 app_name 지정
-- 스코프: 특허법만. 적용: node scripts/run-prod-sql.mjs <이 파일>
-- ============================================================
begin;
-- [4] 이 트랜잭션의 콘텐츠 변경(백필 3건)이 원장에 app_name 으로 식별되게 한다.
set local application_name = 'phase2_backfill';

-- ── 1. 판본 테이블 (설계 §3.3) ──
create table publications (
  publication_id   uuid primary key default gen_random_uuid(),
  title            text not null,
  subject_code     text not null,
  track            text,
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create table publication_editions (
  edition_id       uuid primary key default gen_random_uuid(),
  publication_id   uuid not null references publications(publication_id),
  edition_label    text not null,
  edition_seq      numeric not null,
  target_exam_year int,
  target_exam_date          date,   -- 확정 전 null (결정서 §7.1 — 판정에 estimate 사용 금지)
  target_exam_date_estimate date,
  frozen_at        timestamptz,
  print_date       date,
  isbn             text,
  status           text not null default 'draft'
    check (status in ('draft','frozen','printed','superseded')),
  created_at       timestamptz not null default now(),
  unique (publication_id, edition_seq)
);

create or replace function trg_edition_immutable() returns trigger
language plpgsql as $$
begin
  if old.status in ('frozen','printed')
     and new.frozen_at is distinct from old.frozen_at then
    raise exception 'frozen 판본의 frozen_at은 변경할 수 없습니다 (edition_id=%)', old.edition_id;
  end if;
  return new;
end $$;

create trigger edition_immutable before update on publication_editions
  for each row execute function trg_edition_immutable();

create table publication_content_map (
  map_id           uuid primary key default gen_random_uuid(),
  edition_id       uuid not null references publication_editions(edition_id),
  content_type     text not null,
  content_id       text not null,
  node_id          text,
  page_no          int,
  page_no_end      int,
  line_hint        text,
  toc_path         text,
  sort_key         numeric,
  created_at       timestamptz not null default now(),
  unique (edition_id, content_type, content_id)
);

create index idx_pcm_lookup on publication_content_map (content_type, content_id, edition_id);
create index idx_pcm_node   on publication_content_map (node_id);

alter table publications enable row level security;
alter table publication_editions enable row level security;
alter table publication_content_map enable row level security;
create policy pub_staff_all on publications            for all using ( private.is_staff(auth.uid()) );
create policy edi_staff_all on publication_editions    for all using ( private.is_staff(auth.uid()) );
create policy pcm_staff_all on publication_content_map for all using ( private.is_staff(auth.uid()) );

create or replace view v_current_editions
  with (security_invoker = on) as
select distinct on (publication_id) *
  from publication_editions
 where status in ('frozen','printed')
 order by publication_id, edition_seq desc;

-- ── 2. 특허 4종 시드 — [1] frozen_at·print_date = 판권지 인쇄일(books.published_on) ──
create temp table p2_pub (slug text primary key, publication_id uuid, edition_id uuid) on commit drop;

with ins as (
  insert into publications (title, subject_code, track) values
    ('리담특허법 조문정리', 'patent', '공통'),
    ('리담특허법 판례', 'patent', '공통'),
    ('리담특허법 객관식(Ⅰ) 기출문제', 'patent', '1차'),
    ('리담특허법 객관식(Ⅱ) 예상문제', 'patent', '1차')
  returning publication_id, title
)
insert into p2_pub (slug, publication_id)
select case title
         when '리담특허법 조문정리' then 'statute'
         when '리담특허법 판례' then 'precedent'
         when '리담특허법 객관식(Ⅰ) 기출문제' then 'mcq1'
         else 'mcq2' end,
       publication_id
from ins;

with ins as (
  insert into publication_editions
    (publication_id, edition_label, edition_seq, target_exam_year, target_exam_date_estimate,
     frozen_at, print_date, isbn, status)
  select p.publication_id, v.label, v.seq, 2027, date '2027-02-26',
         v.frozen::timestamptz, v.frozen::date, v.isbn, 'frozen'
  from (values
    ('statute',  '제5판',  5::numeric,  '2026-03-20',  '9791199812215'),
    ('precedent','제10판', 10::numeric, '2026-07-01', '9791124561270'),
    ('mcq1',     '제20판', 20::numeric, '2026-03-20',     '9791199812222'),
    ('mcq2',     '제20판', 20::numeric, '2026-03-27',     '9791199812246')
  ) as v(slug, label, seq, frozen, isbn)
  join p2_pub p on p.slug = v.slug
  returning edition_id, publication_id
)
update p2_pub t set edition_id = ins.edition_id
from ins where ins.publication_id = t.publication_id;

-- [1]★ 판례 제10판 frozen_at 은 최신판례 10건 등록 시각보다 반드시 앞선다 (축C 분류 전제)
do $$
declare v_frozen timestamptz; v_min timestamptz;
begin
  select e.frozen_at into v_frozen
  from publication_editions e join p2_pub t on t.edition_id = e.edition_id
  where t.slug = 'precedent';
  select min(created_at) into v_min from cases
  where deleted_at is null and subject_laws[1] = 'patent'
    and case_number in ('2026다202753','2023후10965','2024다228104','2024후11125','2024후10979','2022후11190','2022후10722','2024후11590','2024후10641','2024후10658');
  if v_min is null then raise exception '최신판례 10건 조회 실패'; end if;
  if v_frozen >= v_min then
    raise exception '판례 제10판 frozen_at(%) >= 최신판례 최소 등록시각(%) — 축C 분류 불가', v_frozen, v_min;
  end if;
end $$;

-- ── 3. content_map 시드 ──
-- 3a. 조문 268 (조문정리 제5판 목차 — 페이지·편/장/조 toc_path·수록 순서)
insert into publication_content_map (edition_id, content_type, content_id, page_no, toc_path, sort_key)
select (select edition_id from p2_pub where slug='statute'), v.ct, v.cid, v.pg, v.toc, v.sk
from (values
  ('statute', '7b47962c-78ad-49bd-a198-8bd79b32ffad', 1, '제1장 총칙 · > 제1조 【목적】', 1),
  ('statute', 'c38b3f2d-1e84-4268-9220-f00f0d05001d', 1, '제1장 총칙 · > 제2조 【정의】', 2),
  ('statute', 'bfd61dab-a5a4-44b4-bc19-92bccdbd6d6e', 2, '제1장 총칙 · > 제3조 【미성년자 등의 행위능력】', 3),
  ('statute', '64828833-a07d-4bcd-bf4d-e4ec270200ce', 2, '제1장 총칙 · > 제4조 【법인이 아닌 사단 등】', 4),
  ('statute', 'f736a53f-3b56-4367-8cf1-3baaf0c6ff09', 2, '제1장 총칙 · > 제5조 【재외자의 특허관리인】', 5),
  ('statute', '3720178a-903c-461e-8af5-664a2d3f9b54', 2, '제1장 총칙 · > 제6조 【대리권의 범위】', 6),
  ('statute', '23723fec-16d4-453f-bda6-514d391816b2', 3, '제1장 총칙 · > 제7조 【대리권의 증명】', 7),
  ('statute', '2a3d829f-4744-414f-afae-3b9242d99cc0', 3, '제1장 총칙 · > 제7의2조 【행위능력 등의 흠에 대한 추인】', 8),
  ('statute', '56719076-f07f-4893-983e-0e737b8dc173', 3, '제1장 총칙 · > 제8조 【대리권의 불소멸】', 9),
  ('statute', 'c3075fe9-0487-4dee-ad01-325ef7142b82', 3, '제1장 총칙 · > 제9조 【개별대리】', 10),
  ('statute', '6ee9636e-97f8-4704-952c-e7f730851040', 3, '제1장 총칙 · > 제10조 【대리인의 선임 또는 교체 명령 등】', 11),
  ('statute', '475a5b5a-cd2b-470a-9992-0dde1a0cdc8f', 3, '제1장 총칙 · > 제11조 【복수당사자의 대표】', 12),
  ('statute', '905244e7-b7be-46ee-ad00-5577344c110a', 4, '제1장 총칙 · > 제12조 【「민사소송법」의 준용】', 13),
  ('statute', 'd3f988a0-b6c4-4537-9fb8-e5657062948b', 5, '제1장 총칙 · > 제13조 【재외자의 재판관할】', 14),
  ('statute', 'b25f2305-59c5-45e8-b32d-641cbeee2aa3', 5, '제1장 총칙 · > 제14조 【기간의 계산】', 15),
  ('statute', '8503515c-fa91-4408-9a7c-08f62b7aee1f', 5, '제1장 총칙 · > 제15조 【기간의 연장 등】', 16),
  ('statute', 'a4e04185-cf6d-4992-a5c4-44f659fc2721', 5, '제1장 총칙 · > 제16조 【절차의 무효】', 17),
  ('statute', '7f580a9c-4dcd-4816-a826-a7f73d91175f', 7, '제1장 총칙 · > 제17조 【절차의 추후보완】', 18),
  ('statute', '32b12023-9642-47fb-bac4-87cd0a6c1dfb', 7, '제1장 총칙 · > 제18조 【절차의 효력 승계】', 19),
  ('statute', '527d32f8-eda5-42b7-ab78-f87e2b55a51b', 7, '제1장 총칙 · > 제19조 【절차의 속행】', 20),
  ('statute', '5af08692-ec86-4807-a891-0f1ad5271a99', 7, '제1장 총칙 · > 제20조 【절차의 중단】', 21),
  ('statute', '1645ff16-7810-4065-a76f-f800b3f3190b', 7, '제1장 총칙 · > 제21조 【중단된 절차의 수계】', 22),
  ('statute', '0b2ae3d2-802d-4434-8477-5577a52555da', 8, '제1장 총칙 · > 제22조 【수계신청】', 23),
  ('statute', '46818755-1e33-452a-b0b9-d52ad8a90006', 8, '제1장 총칙 · > 제23조 【절차의 중지】', 24),
  ('statute', '1e7cf523-736c-438e-a303-f9135d528407', 8, '제1장 총칙 · > 제24조 【중단 또는 중지의 효과】', 25),
  ('statute', '2f59441e-c048-4304-97f1-30c131b4fea2', 8, '제1장 총칙 · > 제25조 【외국인의 권리능력】', 26),
  ('statute', '36d5cfde-8845-4f90-9fcf-6c3419d51795', 9, '제1장 총칙 · > 제28조 【서류제출의 효력발생시기】', 27),
  ('statute', '53d17486-6487-491e-8e34-9667cb2aedbc', 10, '제1장 총칙 · > 제28의2조 【고유번호의 기재】', 28),
  ('statute', '8f241ad8-e4c8-44b2-8e7c-240dac6a222b', 10, '제1장 총칙 · > 제28의3조 【전자문서에 의한 특허에 관한 절차의 수행】', 29),
  ('statute', 'cf372929-2bff-4b37-8989-15308a02be0b', 10, '제1장 총칙 · > 제28의4조 【전자문서 이용신고 및 전자서명】', 30),
  ('statute', 'e0729f32-3be7-4de1-af5e-41a1ee55dd4b', 10, '제1장 총칙 · > 제28의5조 【정보통신망을 이용한 통지 등의 수행】', 31),
  ('statute', '79650d86-1a89-46bb-ae76-323f5e72a05d', 11, '제1장 총칙 · > 제29조 【특허요건】', 32),
  ('statute', '369ec248-c734-4ef3-826b-6c15e1860b38', 11, '제1장 총칙 · > 제30조 【공지 등이 되지 아니한 발명으로 보는 경우】', 33),
  ('statute', 'a8a22282-a8e7-4d02-aa42-d21923a3ec7c', 12, '제1장 총칙 · > 제32조 【특허를 받을 수 없는 발명】', 34),
  ('statute', '7996f53d-74c8-4b25-81ce-28d8049c3e10', 12, '제1장 총칙 · > 제33조 【특허를 받을 수 있는 자】', 35),
  ('statute', 'b15b566a-d210-4f68-916f-77b0d71544bb', 12, '제1장 총칙 · > 제34조 【무권리자의 특허출원과 정당한 권리자의 보호】', 36),
  ('statute', '305fc7a3-c2ec-4d32-80d5-8c91f394604b', 12, '제1장 총칙 · > 제35조 【무권리자의 특허와 정당한 권리자의 보호】', 37),
  ('statute', 'bf816c89-f2ee-40b5-aff9-6dcbb1988947', 13, '제1장 총칙 · > 제36조 【선출원】', 38),
  ('statute', 'cdf83b37-2263-40ff-8882-daf31de5ccff', 13, '제1장 총칙 · > 제37조 【특허를 받을 수 있는 권리의 이전 등】', 39),
  ('statute', '00495768-c50e-464c-abd8-96c04c853c85', 13, '제1장 총칙 · > 제38조 【특허를 받을 수 있는 권리의 승계】', 40),
  ('statute', '933dec55-0852-4d62-a58c-f46280889706', 14, '제1장 총칙 · > 제41조 【국방상 필요한 발명 등】', 41),
  ('statute', '7acfbe55-ec48-42c2-a5b5-615c92c98185', 15, '제1장 총칙 · > 제42조 【특허출원】', 42),
  ('statute', '7f9bbc74-df0c-406c-a775-4a9123885c46', 17, '제1장 총칙 · > 제42의2조 【특허출원일 등】', 43),
  ('statute', 'e34d4487-8474-4598-acac-71ae3b979002', 17, '제1장 총칙 · > 제42의3조 【외국어특허출원 등】', 44),
  ('statute', '2a6d5b58-7bcd-4309-8a5b-a6fa2cebf67e', 18, '제1장 총칙 · > 제43조 【요약서】', 45),
  ('statute', '743b334c-1562-4216-8b72-73c7b82c3e7d', 18, '제1장 총칙 · > 제44조 【공동출원】', 46),
  ('statute', 'eb472560-73e9-4097-bf96-45a4a2fe0bb0', 18, '제1장 총칙 · > 제45조 【하나의 특허출원의 범위】', 47),
  ('statute', 'a75f9a43-7732-4f1b-91a4-2b0e690dc4a4', 19, '제1장 총칙 · > 제46조 【절차의 보정】', 48),
  ('statute', '08678cff-e720-45b3-afb0-33ee2a57cf91', 19, '제1장 총칙 · > 제47조 【특허출원의 보정】', 49),
  ('statute', '539ec15b-10bb-4f30-84cd-f0a3e0017ce4', 20, '제1장 총칙 · > 제51조 【보정각하】', 50),
  ('statute', '139d67e7-1f6f-4087-97e5-9a527a6ec9cd', 20, '제1장 총칙 · > 제52조 【분할출원】', 51),
  ('statute', '7ce67ebf-5731-4189-bd2d-0e1be723cbbd', 21, '제1장 총칙 · > 제52의2조 【분리출원】', 52),
  ('statute', 'c1e03a4d-1e1c-4204-938d-a636d2f0ad93', 21, '제1장 총칙 · > 제53조 【변경출원】', 53),
  ('statute', '4c59fa63-45dd-4e0b-9bfd-2e44a397da35', 22, '제1장 총칙 · > 제54조 【조약에 의한 우선권 주장】', 54),
  ('statute', '5a34e88f-85a1-4889-920d-b1d8b80521be', 23, '제1장 총칙 · > 제55조 【특허출원 등을 기초로 한 우선권 주장】', 55),
  ('statute', '8432cb07-f6ea-4cc9-b21e-379a84a10c3c', 24, '제1장 총칙 · > 제56조 【선출원의 취하 등】', 56),
  ('statute', '21b00674-2451-4a3d-a5f8-59eb09b5e4ef', 25, '제3장 심사 · > 제57조 【심사관에 의한 심사】', 57),
  ('statute', '8c8a818b-51fc-4c6b-a172-2b8aa34fad9d', 25, '제3장 심사 · > 제58조 【전문기관의 등록 등】', 58),
  ('statute', '7570523a-8084-4e62-bd26-57630a33f53a', 25, '제3장 심사 · > 제58의2조 【전문기관 등록의 취소 등】', 59),
  ('statute', '414fac63-3b1e-4dde-b302-bbc12bad745c', 25, '제3장 심사 · > 제59조 【특허출원심사의 청구】', 60),
  ('statute', '1a00974d-b21d-40db-a062-d60d06c10b62', 27, '제3장 심사 · > 제60조 【출원심사의 청구절차】', 61),
  ('statute', '4682d2a0-e6aa-487d-8093-4c1b43d7820a', 27, '제3장 심사 · > 제61조 【우선심사】', 62),
  ('statute', '29012fc7-0051-4c2f-8bf9-951a3d1bc0f1', 28, '제3장 심사 · > 제62조 【특허거절결정】', 63),
  ('statute', '9352a7c5-74cf-4db0-8c99-167a6dacee5c', 28, '제3장 심사 · > 제63조 【거절이유통지】', 64),
  ('statute', '833daf73-742f-4d33-babf-0f8a4af11e92', 28, '제3장 심사 · > 제63의2조 【특허출원에 대한 정보제공】', 65),
  ('statute', '2dc9d9f1-8c28-465d-8b71-a4978983a425', 28, '제3장 심사 · > 제63의3조 【외국의 심사결과 제출명령】', 66),
  ('statute', '2497bcac-6d3c-42cb-a536-652fc0edc430', 29, '제3장 심사 · > 제64조 【출원공개】', 67),
  ('statute', '02d8cf29-d975-48fc-a41c-9c76e9b96e0d', 30, '제3장 심사 · > 제65조 【출원공개의 효과】', 68),
  ('statute', 'ea97da50-7cfa-43b4-b389-2769e252a488', 31, '제3장 심사 · > 제66조 【특허결정】', 69),
  ('statute', 'd91cdd73-aa5c-4b3c-b402-ff630d7de87e', 31, '제3장 심사 · > 제66의2조 【직권보정 등】', 70),
  ('statute', '4af8278f-d1c8-4209-9ed7-927b9c4f9a50', 31, '제3장 심사 · > 제66의3조 【특허결정 이후 직권 재심사】', 71),
  ('statute', '29d58679-910b-4a71-a234-4c2664fc2c63', 31, '제3장 심사 · > 제67조 【특허여부결정의 방식】', 72),
  ('statute', '7e466cf8-98f9-4191-9cbe-6a7744a80571', 32, '제3장 심사 · > 제67의2조 【재심사의 청구】', 73),
  ('statute', '2201c9d7-51de-440c-8159-0fac78e54619', 32, '제3장 심사 · > 제67의3조 【특허출원의 회복】', 74),
  ('statute', '60e73a87-9e01-43db-9e5f-0b9c20ad1872', 32, '제3장 심사 · > 제68조 【심판규정의 심사에의 준용】', 75),
  ('statute', 'ba2f3569-5c6a-49dd-a487-1d511b0e965e', 33, '제3장 심사 · > 제78조 【심사 또는 소송절차의 중지】', 76),
  ('statute', '27f7c360-fc48-481a-bc46-b961184c5fab', 33, '제3장 심사 · > 제79조 【특허료】', 77),
  ('statute', 'c16a30f2-20a2-4f04-8dc5-8908a0d1aa27', 35, '제3장 심사 · > 제80조 【이해관계인에 의한 특허료의 납부】', 78),
  ('statute', 'b12c456e-dfa7-4d9a-a53a-1908ee1f3e54', 35, '제3장 심사 · > 제81조 【특허료의 추가납부 등】', 79),
  ('statute', '1059e301-0a8a-4acd-b738-f7d0ce8c4ede', 36, '제3장 심사 · > 제81의2조 【특허료의 보전】', 80),
  ('statute', 'a1ef5aab-abc7-431a-9416-3f3b4507da59', 36, '제3장 심사 · > 제81의3조 【특허료의 추가납부 또는 보전에 의한 특허출원과 특허권의 회복 등】', 81),
  ('statute', 'a18d1e2d-5cf0-47dd-bba9-f70bfde80715', 36, '제3장 심사 · > 제82조 【수수료】', 82),
  ('statute', '58220ff6-44a4-42fa-8000-0eb434317789', 37, '제3장 심사 · > 제83조 【특허료 또는 수수료의 감면】', 83),
  ('statute', 'f39c40a6-ecb8-4c3f-a306-1fe423d16f60', 38, '제3장 심사 · > 제84조 【특허료 등의 반환】', 84),
  ('statute', 'ee527adf-6ad7-4741-b744-7d70cf15347e', 39, '제3장 심사 · > 제85조 【특허원부】', 85),
  ('statute', 'cbebf61f-8a18-45b6-b63f-6eeafc0f090a', 39, '제3장 심사 · > 제86조 【특허증의 발급】', 86),
  ('statute', '16ba9915-1192-4b1a-8e10-81c44b8018a6', 40, '제5장 특허권 · > 제87조 【특허권의 설정등록 및 등록공고】', 87),
  ('statute', 'aefed9db-ed34-48e2-afbc-b8d7b5c027f8', 40, '제5장 특허권 · > 제88조 【특허권의 존속기간】', 88),
  ('statute', '105a59dc-de3c-4d25-a12c-b1401fc05994', 40, '제5장 특허권 · > 제89조 【허가 등에 따른 특허권의 존속기간의 연장】', 89),
  ('statute', '9284642e-e4c2-483a-a8b3-e9aaa890dcf6', 41, '제5장 특허권 · > 제90조 【허가 등에 따른 특허권의 존속기간의 연장등록출원】', 90),
  ('statute', '9ca91516-50bb-4684-8c28-e8c864e14baf', 42, '제5장 특허권 · > 제91조 【허가 등에 따른 특허권의 존속기간의 연장등록거절결정】', 91),
  ('statute', 'e33893b8-6934-43b0-b562-8b6ba8fe75b8', 42, '제5장 특허권 · > 제92조 【허가 등에 따른 특허권의 존속기간의 연장등록결정 등】', 92),
  ('statute', '6bd636df-66c3-48dd-b521-300f8c786795', 42, '제5장 특허권 · > 제92의2조 【등록지연에 따른 특허권의 존속기간의 연장】', 93),
  ('statute', 'bb580757-5d4c-4403-b61b-4ab53cf8c39e', 43, '제5장 특허권 · > 제92의3조 【등록지연에 따른 특허권의 존속기간의 연장등록출원】', 94),
  ('statute', '033a06ba-e0f9-4fb6-b4d8-fcd14c4e9c87', 43, '제5장 특허권 · > 제92의4조 【등록지연에 따른 특허권의 존속기간의 연장등록거절결정】', 95),
  ('statute', '7570208a-4f7c-4455-aeaa-e5974bd515c8', 43, '제5장 특허권 · > 제92의5조 【등록지연에 따른 특허권의 존속기간의 연장등록결정 등】', 96),
  ('statute', '64a77d26-45c4-4998-92bd-c7ea576edbc5', 43, '제5장 특허권 · > 제93조 【준용규정】', 97),
  ('statute', '11b0ac71-3da2-4bba-91af-4ed65ae34b64', 44, '제5장 특허권 · > 제94조 【특허권의 효력】', 98),
  ('statute', '1af8ead7-2ad1-40e8-885a-4f303c46b44f', 44, '제5장 특허권 · > 제95조 【허가 등에 따른 존속기간이 연장된 경우의 특허권의 효력】', 99),
  ('statute', '31564aa2-4ce1-4315-a7de-fd75421dbe44', 44, '제5장 특허권 · > 제96조 【특허권의 효력이 미치지 아니하는 범위】', 100),
  ('statute', '09efb130-2532-4e7e-ad30-072f670cd7a3', 44, '제5장 특허권 · > 제97조 【특허발명의 보호범위】', 101),
  ('statute', 'bcc5a025-67a1-417c-9daa-ca5df550f90f', 44, '제5장 특허권 · > 제98조 【타인의 특허발명 등과의 관계】', 102),
  ('statute', 'f02161db-93b3-4575-add8-85e0758d84c3', 44, '제5장 특허권 · > 제99조 【특허권의 이전 및 공유 등】', 103),
  ('statute', '40b7b1dd-0f31-41b1-8a8f-9e8a32f24748', 45, '제5장 특허권 · > 제99의2조 【특허권의 이전청구】', 104),
  ('statute', 'c0f22102-36a6-42be-8cec-b5214db86c86', 45, '제5장 특허권 · > 제100조 【전용실시권】', 105),
  ('statute', '320bbf1c-db03-4d90-82a4-6a29f8077edd', 45, '제5장 특허권 · > 제101조 【특허권 및 전용실시권의 등록의 효력】', 106),
  ('statute', 'f78d5da7-5bda-4325-b71e-d7de61899346', 45, '제5장 특허권 · > 제102조 【통상실시권】', 107),
  ('statute', 'cd4a6bec-5cb9-4dfd-bd33-f914c2d9d456', 46, '제5장 특허권 · > 제103조 【선사용에 의한 통상실시권】', 108),
  ('statute', '009f9c01-be4b-4d49-99a6-d8f824c0d01c', 46, '제5장 특허권 · > 제103의2조 【특허권의 이전청구에 따른 이전등록 전의 실시에 의한 통상실시권】', 109),
  ('statute', '174a012c-0c91-498a-b132-eca9752a5d75', 46, '제5장 특허권 · > 제104조 【무효심판청구 등록 전의 실시에 의한 통상실시권】', 110),
  ('statute', 'bd4dc428-028c-4b58-a325-d9dd9fb3573c', 47, '제5장 특허권 · > 제105조 【디자인권의 존속기간 만료 후의 통상실시권】', 111),
  ('statute', '28e427c1-9f01-4cb5-91d6-9c2febbf3e0e', 47, '제5장 특허권 · > 제106조 【특허권의 수용】', 112),
  ('statute', '52eff06a-da9e-46c1-bde2-ffe90f42945c', 47, '제5장 특허권 · > 제106의2조 【정부 등에 의한 특허발명의 실시】', 113),
  ('statute', '6e30d5aa-7554-4652-941f-5d1147736ffb', 47, '제5장 특허권 · > 제107조 【통상실시권 설정의 재정】', 114),
  ('statute', 'b6fa20e5-1a75-475e-8436-4b16c07c996a', 48, '제5장 특허권 · > 제108조 【답변서의 제출】', 115),
  ('statute', '41d31373-6ce6-4a4a-8601-bbb294075b42', 49, '제5장 특허권 · > 제109조 【산업재산권분쟁조정위원회 및 관계 부처의 장의 의견청취】', 116),
  ('statute', 'a5800094-3161-403c-9bd2-e788b49e3297', 49, '제5장 특허권 · > 제110조 【재정의 방식 등】', 117),
  ('statute', '6d14d077-6002-44e2-a15b-5a042c47aab4', 49, '제5장 특허권 · > 제111조 【재정서등본의 송달】', 118),
  ('statute', 'b558bf08-b124-408f-bc8c-00689ffea42f', 49, '제5장 특허권 · > 제111의2조 【재정서의 변경】', 119),
  ('statute', '99686ddd-66e8-494e-8127-9f17cd8ba6fa', 49, '제5장 특허권 · > 제112조 【대가의 공탁】', 120),
  ('statute', '0964047f-6d1b-4708-93df-7b86128b7948', 49, '제5장 특허권 · > 제113조 【재정의 실효】', 121),
  ('statute', 'c4bb3d3f-b56c-4a8d-9838-aebbc1ae80e1', 50, '제5장 특허권 · > 제114조 【재정의 취소】', 122),
  ('statute', 'eab2b325-91b6-4c7d-b09c-f9e897040d16', 50, '제5장 특허권 · > 제115조 【재정에 대한 불복이유의 제한】', 123),
  ('statute', '1bf84b80-e776-4658-9bad-e2f6bad0b49a', 50, '제5장 특허권 · > 제118조 【통상실시권의 등록의 효력】', 124),
  ('statute', '27d8980f-863c-421c-a6ca-b828ce25f122', 50, '제5장 특허권 · > 제119조 【특허권 등의 포기의 제한】', 125),
  ('statute', 'fa3af0d3-c69c-4021-9fe3-195ddb91f2e8', 51, '제5장 특허권 · > 제120조 【포기의 효과】', 126),
  ('statute', '901333b1-342a-4c4f-a3e4-74b34e109300', 51, '제5장 특허권 · > 제121조 【질권】', 127),
  ('statute', 'abc5efd9-8353-4f6e-80f5-d3a12f60e61e', 51, '제5장 특허권 · > 제122조 【질권행사 등으로 인한 특허권의 이전에 따른 통상실시권】', 128),
  ('statute', '4263ba4d-3ac8-450f-a688-6947f67c7804', 51, '제5장 특허권 · > 제123조 【질권의 물상대위】', 129),
  ('statute', 'be5a2523-a007-421d-abc2-3fbb5285867b', 51, '제5장 특허권 · > 제124조 【상속인이 없는 경우 등의 특허권 소멸】', 130),
  ('statute', '5b8356ce-f9f8-4eee-8dea-544e4e3423b7', 51, '제5장 특허권 · > 제125조 【특허실시보고】', 131),
  ('statute', 'b4c2eaa7-24f7-4641-a02a-423ab3945bdc', 51, '제5장 특허권 · > 제125의2조 【대가 및 보상금액에 대한 집행권원】', 132),
  ('statute', '1eb8fd88-664b-4677-8cd4-92a671a01727', 52, '제5장 특허권 · > 제126조 【권리침해에 대한 금지청구권 등】', 133),
  ('statute', '4446e5d3-919d-41d2-b51f-723dafa6db6c', 52, '제5장 특허권 · > 제126의2조 【구체적 행위의 내용ㆍ방식ㆍ형태 제시 의무】', 134),
  ('statute', '420f041c-711a-4eae-b06c-99bffa90ce18', 52, '제5장 특허권 · > 제127조 【침해로 보는 행위】', 135),
  ('statute', '80f0b16f-7182-4a14-8082-ffcf5c3b1ea0', 52, '제5장 특허권 · > 제128조 【손해배상청구권 등】', 136),
  ('statute', '66c790cf-cbfa-41b0-ad97-0566b820ff39', 53, '제5장 특허권 · > 제128의2조 【감정사항 설명의무】', 137),
  ('statute', 'c47ee691-dca7-4f0a-8dc5-94392f9b5e9a', 53, '제5장 특허권 · > 제129조 【생산방법의 추정】', 138),
  ('statute', '67a93105-6d07-489a-ad8f-fc328ee1a5e6', 53, '제5장 특허권 · > 제130조 【과실의 추정】', 139),
  ('statute', '58065cc3-f98f-4d1d-92d8-ff32795a614a', 54, '제5장 특허권 · > 제131조 【특허권자 등의 신용회복】', 140),
  ('statute', '1b18efca-6d79-4c4a-bb2b-87ca3df4864a', 54, '제5장 특허권 · > 제132조 【자료의 제출】', 141),
  ('statute', '587fd314-009f-486f-a07f-15e698b2af99', 54, '제5장 특허권 · > 제132의2조 【특허취소신청】', 142),
  ('statute', '97614cc8-0cad-495c-aa1a-0b2977409364', 54, '제5장 특허권 · > 제132의3조 【특허취소신청절차에서의 특허의 정정】', 143),
  ('statute', '2189d410-223d-4c82-9362-4a855a4b98d9', 55, '제5장 특허권 · > 제132의4조 【특허취소신청의 방식 등】', 144),
  ('statute', '4cb1e9f2-7ed8-44fe-ae93-f09d710484d3', 55, '제5장 특허권 · > 제132의5조 【특허취소신청서 등의 보정·각하】', 145),
  ('statute', '64a51b63-aef6-402d-9a7c-a2b1ff3c1588', 56, '제5장 특허권 · > 제132의6조 【보정할 수 없는 특허취소신청의 각하결정】', 146),
  ('statute', 'd1cf26b9-a19b-4d9f-bd4f-518af6b01275', 56, '제5장 특허권 · > 제132의7조 【특허취소신청의 합의체 등】', 147),
  ('statute', 'e4c7b209-f3a1-4f26-b125-aa0427abad92', 56, '제5장 특허권 · > 제132의8조 【심리의 방식 등】', 148),
  ('statute', 'f40a278d-c971-4edc-a7c8-c99ae512f1d9', 56, '제5장 특허권 · > 제132의9조 【참가】', 149),
  ('statute', '943edd74-59af-4a4f-9faa-4324b863a815', 56, '제5장 특허권 · > 제132의10조 【특허취소신청의 심리에서의 직권심리】', 150),
  ('statute', '3a882ceb-d135-48c6-9a3c-88a46420f8d0', 56, '제5장 특허권 · > 제132의11조 【특허취소신청의 병합 또는 분리】', 151),
  ('statute', 'c5147356-7b60-482d-9429-aa0edd18cf6f', 56, '제5장 특허권 · > 제132의12조 【특허취소신청의 취하】', 152),
  ('statute', '18df365b-cd23-4dad-8e91-f92b84d26a9d', 57, '제5장 특허권 · > 제132의13조 【특허취소신청에 대한 결정】', 153),
  ('statute', '2ae41cbd-eed3-4f0a-b91b-c887cd84a046', 57, '제5장 특허권 · > 제132의14조 【특허취소신청의 결정 방식】', 154),
  ('statute', '1fffcfc5-4530-4e24-8c6b-ad18fe3c4993', 57, '제5장 특허권 · > 제132의15조 【심판규정의 특허취소신청에의 준용】', 155),
  ('statute', '38fb7a3a-4e8b-48df-8693-8e334fc99abb', 57, '제7장 심판 · > 제132의16조 【특허심판원】', 156),
  ('statute', 'f4834c45-8272-4582-b939-a66f41dc18f0', 58, '제7장 심판 · > 제132의17조 【특허거절결정 등에 대한 심판】', 157),
  ('statute', 'a4cb19ef-13e2-4ce1-b51d-3863d1a00952', 58, '제7장 심판 · > 제133조 【특허의 무효심판】', 158),
  ('statute', '5f92f6ca-24b8-42f2-8d3d-bd4cdcc7421e', 58, '제7장 심판 · > 제133의2조 【특허무효심판절차에서의 특허의 정정】', 159),
  ('statute', '5e122875-da36-42b3-9a0b-4142a800df73', 59, '제7장 심판 · > 제134조 【특허권 존속기간의 연장등록의 무효심판】', 160),
  ('statute', '5794ff0f-4eb4-4823-8bf7-f90d2b596c18', 59, '제7장 심판 · > 제135조 【권리범위 확인심판】', 161),
  ('statute', '7ff02222-c030-4d00-ace6-60718f38e425', 60, '제7장 심판 · > 제136조 【정정심판】', 162),
  ('statute', '291b05f6-9c91-4cb7-b4c8-d1584ed54a44', 61, '제7장 심판 · > 제137조 【정정의 무효심판】', 163),
  ('statute', 'c61b0ec5-4b75-4449-bcf5-801fb5ce2be7', 61, '제7장 심판 · > 제138조 【통상실시권 허락의 심판】', 164),
  ('statute', 'fcf845f5-051d-4a74-9aeb-1cfec3315001', 61, '제7장 심판 · > 제139조 【공동심판의 청구 등】', 165),
  ('statute', '5b59f831-cdea-4722-88f4-1e675d7f7cec', 62, '제7장 심판 · > 제139의2조 【국선대리인】', 166),
  ('statute', 'f60601d5-c6dd-4f0b-bdc6-5173dd4b4255', 62, '제7장 심판 · > 제140조 【심판청구방식】', 167),
  ('statute', 'b0e47dc9-d0e1-4928-8313-84c9334e0b2b', 62, '제7장 심판 · > 제140의2조 【특허거절결정에 대한 심판청구방식】', 168),
  ('statute', 'df4b1c5c-c957-44aa-b1a5-d1684a05943d', 63, '제7장 심판 · > 제141조 【심판청구서 등의 각하】', 169),
  ('statute', 'cb217962-2478-4c34-bc8d-06958f931ad5', 63, '제7장 심판 · > 제142조 【보정할 수 없는 심판청구의 심결각하】', 170),
  ('statute', '828b8b72-5d5f-4740-8275-feddd414210d', 63, '제7장 심판 · > 제143조 【심판관】', 171),
  ('statute', '6d9f5306-4693-454e-9e59-c4f857e9266b', 63, '제7장 심판 · > 제144조 【심판관의 지정】', 172),
  ('statute', '668c2364-c297-475a-ac87-2cccfbf7b879', 64, '제7장 심판 · > 제145조 【심판장】', 173),
  ('statute', '3a589da8-195d-458e-bdea-cf283cc1a15c', 64, '제7장 심판 · > 제146조 【심판의 합의체】', 174),
  ('statute', '516afd56-6ca1-406f-9a9c-65ab929ce812', 64, '제7장 심판 · > 제147조 【답변서 제출 등】', 175),
  ('statute', '1e57c545-88fd-4789-bbd2-8ebcca810026', 64, '제7장 심판 · > 제148조 【심판관의 제척】', 176),
  ('statute', '3ed5a63b-6b64-4cd6-b883-033c0217380d', 64, '제7장 심판 · > 제149조 【제척신청】', 177),
  ('statute', '79f779d5-3568-4667-aea7-a3228d7cc8b4', 64, '제7장 심판 · > 제150조 【심판관의 기피】', 178),
  ('statute', '8def4616-ec9d-4fa9-8709-f2d04b965ae6', 64, '제7장 심판 · > 제151조 【제척 또는 기피의 소명】', 179),
  ('statute', '71d0477e-7708-45a3-b9df-8461b666e10d', 65, '제7장 심판 · > 제152조 【제척 또는 기피 신청에 관한 결정】', 180),
  ('statute', '41e7d329-5c01-4eb9-b720-d030a165b5ba', 65, '제7장 심판 · > 제153조 【심판절차의 중지】', 181),
  ('statute', '8730b166-9d1a-4b9a-9275-76186d5b863c', 65, '제7장 심판 · > 제153의2조 【심판관의 회피】', 182),
  ('statute', 'ba70894c-c9dd-4eaf-a66a-7007567a50f2', 65, '제7장 심판 · > 제154조 【심리 등】', 183),
  ('statute', '4a338f56-fa30-41c6-ac3c-6cb84a1947e7', 66, '제7장 심판 · > 제154의2조 【전문심리위원】', 184),
  ('statute', 'fee253c9-d09a-4a1f-a06c-ec11937620a0', 67, '제7장 심판 · > 제154의3조 【참고인 의견서의 제출】', 185),
  ('statute', '3c5ee66e-408d-459b-9e08-d3789a3190f9', 67, '제7장 심판 · > 제155조 【참가】', 186),
  ('statute', '5ebd087f-30ab-40e4-9e8b-20d8c226f121', 67, '제7장 심판 · > 제156조 【참가의 신청 및 결정】', 187),
  ('statute', 'cea38f1d-ed58-4b83-976d-0cb51d33f0b4', 68, '제7장 심판 · > 제157조 【증거조사 및 증거보전】', 188),
  ('statute', '3dfee15d-7b0c-402d-83c7-8a53347f86f8', 68, '제7장 심판 · > 제158조 【심판의 진행】', 189),
  ('statute', 'cdd9a01a-8243-4a2b-9e49-f0d53c29f7df', 68, '제7장 심판 · > 제158의2조 【적시제출주의】', 190),
  ('statute', '4a04125e-d1c5-466e-88bc-efe286aad75a', 68, '제7장 심판 · > 제159조 【직권심리】', 191),
  ('statute', 'cc597b8e-04a4-4d36-bce1-125f739bc369', 69, '제7장 심판 · > 제160조 【심리·심결의 병합 또는 분리】', 192),
  ('statute', '137e2eea-9062-48f5-8218-2e9d11bdebd3', 69, '제7장 심판 · > 제161조 【심판청구의 취하】', 193),
  ('statute', 'e36fa736-4813-4ecf-998e-e45cf3bb62bc', 69, '제7장 심판 · > 제162조 【심결】', 194),
  ('statute', '4eaaba7b-686f-4292-893d-89a8733adc39', 69, '제7장 심판 · > 제163조 【일사부재리】', 195),
  ('statute', '587803ae-5d44-4ca0-9699-2d79c20c51fa', 69, '제7장 심판 · > 제164조 【소송과의 관계】', 196),
  ('statute', 'a32da6c4-1fea-4bd6-ae12-b04cefffb726', 70, '제7장 심판 · > 제164의2조 【조정위원회 회부】', 197),
  ('statute', '5fc2c1a9-5351-43dc-8bf3-5f57221344c7', 70, '제7장 심판 · > 제165조 【심판비용】', 198),
  ('statute', '78359079-c12a-420b-bf22-8df65fd77c91', 71, '제7장 심판 · > 제166조 【심판비용액 또는 대가에 대한 집행권원】', 199),
  ('statute', '8aa91aad-72b1-4993-9300-e6625e4c29a3', 71, '제7장 심판 · > 제170조 【심사규정의 특허거절결정에 대한 심판에의 준용】', 200),
  ('statute', '3bd084b3-8865-44fb-a556-ebed187a96ff', 72, '제7장 심판 · > 제171조 【특허거절결정에 대한 심판의 특칙】', 201),
  ('statute', '98358598-35ca-4023-a796-c8b0b90ac23d', 72, '제7장 심판 · > 제172조 【심사의 효력】', 202),
  ('statute', '1c109d34-22e9-420a-9f69-4fc62bafd6b8', 72, '제7장 심판 · > 제176조 【특허거절결정 등의 취소】', 203),
  ('statute', '3830d969-74f5-4230-89c5-de30612eb402', 72, '제8장 재심 · > 제178조 【재심의 청구】', 204),
  ('statute', 'e295a8c1-e5bb-441a-aa84-b36995be64c1', 73, '제8장 재심 · > 제179조 【제3자에 의한 재심청구】', 205),
  ('statute', '727dd549-b249-49c0-b189-2fb48f27c524', 73, '제8장 재심 · > 제180조 【재심청구의 기간】', 206),
  ('statute', '780b72e2-7c8f-482e-88d9-05c4e4ab026c', 73, '제8장 재심 · > 제181조 【재심에 의하여 회복된 특허권의 효력 제한】', 207),
  ('statute', '39b9ddd8-611b-4d6d-a080-0ef6a2a162f0', 74, '제8장 재심 · > 제182조 【재심에 의하여 회복한 특허권에 대한 선사용자의 통상실시권】', 208),
  ('statute', '2e7883d5-c09a-40ec-883c-757991830885', 74, '제8장 재심 · > 제183조 【재심에 의하여 통상실시권을 상실한 원권리자의 통상실시권】', 209),
  ('statute', '9b1ae4ab-18af-4529-8778-5664bffea29a', 74, '제8장 재심 · > 제184조 【재심에서의 심판규정 등의 준용】', 210),
  ('statute', 'cac63e68-6153-47f1-a058-d37e16d7885e', 74, '제8장 재심 · > 제185조 【「민사소송법」의 준용】', 211),
  ('statute', '93b72943-6c36-4571-85a4-1be6fdf8e20c', 75, '제9장 소송 · > 제186조 【심결 등에 대한 소】', 212),
  ('statute', 'd113dedb-7b61-4d49-a90d-080372e0f0e9', 75, '제9장 소송 · > 제187조 【피고적격】', 213),
  ('statute', '03eaf101-7686-4235-becf-e37531cf5fad', 75, '제9장 소송 · > 제188조 【소 제기 통지 및 재판서 정본 송부】', 214),
  ('statute', 'b2bf65c6-8a81-434d-9be2-eaec29432ba0', 75, '제9장 소송 · > 제188의2조 【기술심리관의 제척·기피·회피】', 215),
  ('statute', '227bd668-78ce-4b45-a09b-a1b1c9d6f162', 76, '제9장 소송 · > 제189조 【심결 또는 결정의 취소】', 216),
  ('statute', 'a3cf2b8e-acb4-4681-a869-02ab92f06981', 76, '제9장 소송 · > 제190조 【보상금 또는 대가에 관한 불복의 소】', 217),
  ('statute', '064c2f50-f2f9-45a9-afd6-1e22b98b63f1', 76, '제9장 소송 · > 제191조 【보상금 또는 대가에 관한 소송에서의 피고】', 218),
  ('statute', '80243f96-d528-4fa3-9f3c-f3fad9165d5f', 77, '제9장 소송 · > 제191의2조 【변리사의 보수와 소송비용】', 219),
  ('statute', '28a76f87-3a96-4a4b-8c0f-6c42d9d701f3', 77, '제9장 소송 · > 제192조 【국제출원을 할 수 있는 자】', 220),
  ('statute', '50eca54b-fb9e-4952-90f3-f4cf3d883249', 77, '제9장 소송 · > 제193조 【국제출원】', 221),
  ('statute', 'f275dd5a-07ef-4c08-b8dc-4f41971187a6', 79, '제9장 소송 · > 제194조 【국제출원일의 인정 등】', 222),
  ('statute', 'e009f91a-c8a9-45e1-bfdf-28a43b8d3166', 80, '제9장 소송 · > 제195조 【보정명령】', 223),
  ('statute', 'ecd86175-48d7-4b88-a130-4a3cc3e17f2f', 80, '제9장 소송 · > 제196조 【취하된 것으로 보는 국제출원 등】', 224),
  ('statute', 'f1e3e432-9ed1-4baf-86b3-523640b40f50', 80, '제9장 소송 · > 제197조 【대표자 등】', 225),
  ('statute', '3ecd07f9-eb80-4ba4-a26a-b56f96f9b09d', 81, '제9장 소송 · > 제198조 【수수료】', 226),
  ('statute', '25f8569d-c4cc-407a-864a-65925a8c88a6', 81, '제9장 소송 · > 제198의2조 【국제조사 및 국제예비심사】', 227),
  ('statute', 'e02bc93a-929f-46bc-8d52-b85e025f1bca', 81, '제9장 소송 · > 제199조 【국제출원에 의한 특허출원】', 228),
  ('statute', 'c7225321-5f43-418a-913d-12401b357916', 81, '제9장 소송 · > 제200조 【공지 등이 되지 아니한 발명으로 보는 경우의 특례】', 229),
  ('statute', '5aff4ec8-8e37-499f-9cfc-d36cb8befd9e', 81, '제9장 소송 · > 제200의2조 【국제특허출원의 출원서 등】', 230),
  ('statute', '4693a95f-2863-4298-be6d-043eeb8e23a5', 82, '제9장 소송 · > 제201조 【국제특허출원의 국어번역문】', 231),
  ('statute', '70870d9e-28a5-42bc-8107-fd448a1ef66f', 82, '제9장 소송 · > 제202조 【특허출원 등에 의한 우선권 주장의 특례】', 232),
  ('statute', 'f42d61de-472d-4ec0-b2bd-60950da518ab', 84, '제9장 소송 · > 제203조 【서면의 제출】', 233),
  ('statute', '850247ec-09a7-4c73-bba6-b0d80a8b4c4d', 84, '제9장 소송 · > 제204조 【국제조사보고서를 받은 후의 보정】', 234),
  ('statute', '97af9a7a-9141-4676-8280-fef4cc09289c', 84, '제9장 소송 · > 제205조 【국제예비심사보고서 작성 전의 보정】', 235),
  ('statute', 'c19c0920-e4a1-4423-8ed0-fcbe06c69e16', 85, '제9장 소송 · > 제206조 【재외자의 특허관리인의 특례】', 236),
  ('statute', '818d1e1d-2e4a-49ec-a801-90c904b78a2f', 85, '제9장 소송 · > 제207조 【출원공개시기 및 효과의 특례】', 237),
  ('statute', '61c0ab2f-4125-450f-843b-4b6cf766d080', 85, '제9장 소송 · > 제208조 【보정의 특례 등】', 238),
  ('statute', 'b38a00c1-9ae7-4e3b-8a45-7c50cf9a64cb', 86, '제9장 소송 · > 제209조 【변경출원시기의 제한】', 239),
  ('statute', 'c420e932-34c2-418d-ad90-dfe979b3eb54', 86, '제9장 소송 · > 제210조 【출원심사청구시기의 제한】', 240),
  ('statute', 'bf942865-eb76-4d07-a243-e673b8184867', 86, '제9장 소송 · > 제211조 【국제조사보고서 등에 기재된 문헌의 제출명령】', 241),
  ('statute', 'c1e8fe13-3638-43d8-908d-19241c1e6e01', 87, '제9장 소송 · > 제214조 【결정에 의하여 특허출원으로 되는 국제출원】', 242),
  ('statute', '4308ea75-9f2a-48c7-a5da-a1a125b9d7e3', 88, '제11장 보칙 · > 제215조 【둘 이상의 청구항이 있는 특허 또는 특허권에 관한 특칙】', 243),
  ('statute', 'b492aa54-3b0b-4018-82d5-bb1f5fbe3de8', 88, '제11장 보칙 · > 제215의2조 【둘 이상의 청구항이 있는 특허출원의 등록에 관한 특칙】', 244),
  ('statute', '743c1df7-6be1-4145-bb8c-eb2c1186e788', 88, '제11장 보칙 · > 제216조 【서류의 열람 등】', 245),
  ('statute', 'ea5cbe25-11ef-429e-a693-83fa6198f43d', 88, '제11장 보칙 · > 제217조 【특허출원 등에 관한 서류 등의 반출 및 감정 등의 금지】', 246),
  ('statute', '1d5cfe1b-dd50-4522-b28f-6ef67c86695f', 89, '제11장 보칙 · > 제218조 【서류의 송달】', 247),
  ('statute', 'a095bcad-ec55-4230-a7b5-edf8a4c6332a', 90, '제11장 보칙 · > 제219조 【공시송달】', 248),
  ('statute', 'a01e2972-43d3-4a20-a6dc-79fb09356d17', 90, '제11장 보칙 · > 제220조 【재외자에 대한 송달】', 249),
  ('statute', '7b58a15a-2f1d-4bcc-a723-51e8bb52a6d9', 90, '제11장 보칙 · > 제221조 【특허공보】', 250),
  ('statute', '91b336ee-4807-4eff-89d7-deea0a637244', 90, '제11장 보칙 · > 제222조 【서류의 제출 등】', 251),
  ('statute', '92a40f89-9acb-485c-9cde-b81347d78c39', 90, '제11장 보칙 · > 제223조 【특허표시 및 특허출원표시】', 252),
  ('statute', 'cf257e97-0d05-48b7-9ef0-1024306f63f1', 91, '제11장 보칙 · > 제224조 【허위표시의 금지】', 253),
  ('statute', '6c6e11cf-3e62-41c3-abe1-398abd2d323c', 91, '제11장 보칙 · > 제224의2조 【불복의 제한】', 254),
  ('statute', '936482cb-2eab-4fac-892a-15b30e6ecfbc', 91, '제11장 보칙 · > 제224의3조 【비밀유지명령】', 255),
  ('statute', '0ef65680-caa1-4fb9-a7cb-9a1a8356f8e7', 92, '제11장 보칙 · > 제224의4조 【비밀유지명령의 취소】', 256),
  ('statute', 'c8617bad-8c57-4104-89a4-4b7d4e7a17b8', 92, '제11장 보칙 · > 제224의5조 【소송기록 열람 등의 청구 통지 등】', 257),
  ('statute', '878c3c3b-1468-43a1-9d0d-13a1cc6fadb6', 93, '제12장 벌칙 · > 제225조 【침해죄】', 258),
  ('statute', 'd64b7edb-1511-4220-ab3b-8a71cc67ca90', 93, '제12장 벌칙 · > 제226조 【비밀누설죄 등】', 259),
  ('statute', '474ded1a-63a6-4e04-a337-de084eb5942c', 93, '제12장 벌칙 · > 제226의2조 【전문기관 등의 임직원에 대한 공무원 의제】', 260),
  ('statute', 'd0c62b0a-18bc-4e57-91b8-cf77562b3965', 94, '제12장 벌칙 · > 제227조 【위증죄】', 261),
  ('statute', 'deb02f92-1164-4a25-a62b-07d5c4447593', 94, '제12장 벌칙 · > 제228조 【허위표시의 죄】', 262),
  ('statute', '81d997de-d7d0-4233-9a44-69ca39bfd743', 94, '제12장 벌칙 · > 제229조 【거짓행위의 죄】', 263),
  ('statute', 'e44339b6-2759-44de-bcfb-2cc28fcefb53', 94, '제12장 벌칙 · > 제229의2조 【비밀유지명령 위반죄】', 264),
  ('statute', '5d03c84e-7222-40e5-9a8d-94ea870f49bc', 94, '제12장 벌칙 · > 제229의3조 【외국에의 특허출원 금지 또는 비밀취급명령 위반죄】', 265),
  ('statute', '2c155a56-7f63-408e-9e22-c0c39ab04bcc', 94, '제12장 벌칙 · > 제230조 【양벌규정】', 266),
  ('statute', 'e45d2117-bb5d-4da2-8609-7e09c6e0a727', 94, '제12장 벌칙 · > 제231조 【몰수 등】', 267),
  ('statute', 'bc62bf26-f670-4548-aef5-60f6bd17958b', 94, '제12장 벌칙 · > 제232조 【과태료】', 268)
) as v(ct, cid, pg, toc, sk);

-- 3b. 판례 364 (판례 제10판 — 수록 순번 + 색인 페이지. cases.source_seq 는 비파괴 보존)
--     오기 2건 포함 매핑: 2017다245789→2017다245798(법령정보센터 확인), 사건번호 낙자 1건=2009허351(마법천자문, 본문 대조 확정)
insert into publication_content_map (edition_id, content_type, content_id, page_no, sort_key)
select (select edition_id from p2_pub where slug='precedent'), v.ct, v.cid, v.pg, v.sk
from (values
  ('precedent', '1dea17c6-137b-48bc-876c-ab305b696394', 3, 1),
  ('precedent', '2599e979-e6fd-4222-8dc5-57243b00fdcc', 4, 2),
  ('precedent', '32cc31ea-8237-4662-a87a-b16310ff47ba', 4, 3),
  ('precedent', 'c160ffc8-2b68-426d-9fc3-ac4ba3632aba', 4, 4),
  ('precedent', 'c523d98c-70e6-4de6-94f4-3464956d2e1f', 6, 5),
  ('precedent', 'ddf61092-6604-4e20-b413-94f83ce082f0', 6, 6),
  ('precedent', '297f0e80-74e0-4144-9030-cbfca4ea0769', 7, 7),
  ('precedent', 'c1649ded-8bce-4c7c-b232-d96cacb0b3af', 8, 8),
  ('precedent', '73372780-490a-4dc4-a03f-b121c92ab233', 8, 9),
  ('precedent', 'd3f0a2e1-afe9-4848-81f9-ce0c1976af55', 10, 10),
  ('precedent', '26cbcb1e-d4f0-4448-a7bc-ea786b51a6a8', 11, 11),
  ('precedent', 'e94edfd2-59cc-43a8-9334-db802e374fdf', 12, 12),
  ('precedent', 'e4b84e58-a95a-44a7-b05e-9896b297df4b', 12, 13),
  ('precedent', '36dacecd-5879-4f64-9159-11bbf69182a3', 16, 14),
  ('precedent', 'dfbaf61a-2e25-4ea3-93c7-eeb788f5de41', 21, 15),
  ('precedent', '7a145049-3e2e-4cc9-a8a0-778f5dc24335', 22, 16),
  ('precedent', '34b6b037-5cac-45eb-9538-2671e49cdc1f', 23, 17),
  ('precedent', '22353bb4-c44a-4152-bd53-0d4ebaaf43fb', 23, 18),
  ('precedent', 'f7ee2333-b0a8-4a1c-8275-2c6522d70d44', 23, 19),
  ('precedent', '266d96bc-72ea-49f5-af85-56c08f517abc', 24, 20),
  ('precedent', 'cc57234e-9149-4ff3-832f-9a9982e47b03', 25, 21),
  ('precedent', '4364f70f-2338-4292-9529-412bcd429d40', 26, 22),
  ('precedent', '884c68d3-4360-47b9-92db-8c3e9da3baf9', 28, 23),
  ('precedent', '8e84fc20-6def-473a-8639-545708257d6a', 29, 24),
  ('precedent', 'f92ab0e1-3972-462f-893d-a370de3fcd09', 30, 25),
  ('precedent', '9d983694-2cb1-47a1-ac43-cdbba3d14df8', 30, 26),
  ('precedent', 'f39f5d0d-08f3-4918-bcc8-8c989883fe55', 31, 27),
  ('precedent', 'd14beb85-7d89-4987-b8a5-a290d6d75426', 35, 28),
  ('precedent', 'd7201fc1-54d2-43a1-9f8e-645b5c213729', 36, 29),
  ('precedent', '04344d41-357f-4cce-946b-43e5bd33c891', 36, 30),
  ('precedent', '64ef0001-3c68-4bd0-bb77-aec99c2cc8da', 37, 31),
  ('precedent', 'f2753f66-6bca-4808-8c37-a409dd0a7fdd', 38, 32),
  ('precedent', '61742435-6df8-45f9-9cfb-3d3bdb786135', 38, 33),
  ('precedent', 'df4a8631-cbdd-4d23-916a-6550f81a294a', 39, 34),
  ('precedent', '5e4e6732-c52c-47e6-942b-462b14fbf8ff', 40, 35),
  ('precedent', '7b821bcd-ac78-4772-91bf-363991039e82', 40, 36),
  ('precedent', '5eab1ed7-dcf5-4a2d-9679-b147fb6a6130', 41, 37),
  ('precedent', 'a2f50212-ba1a-4dc4-8dac-100f7ceaa791', 41, 38),
  ('precedent', '031f45f6-4dd4-4091-a506-30dd793d09cb', 42, 39),
  ('precedent', '528f72b4-91cc-4195-9573-da74e1790cbe', 42, 40),
  ('precedent', '1d890e2c-0c76-4176-b4b1-c1d2037236ed', 43, 41),
  ('precedent', 'fe77dd49-98ba-447b-825c-b89e3713a273', 43, 42),
  ('precedent', '882a7ab3-9147-49c4-abb6-39cda3157e39', 43, 43),
  ('precedent', '4bd0f1a6-9976-433d-81f0-68c8210fc993', 44, 44),
  ('precedent', '76a006de-74bc-4cee-a317-8b8b687459ea', 44, 45),
  ('precedent', '9b51d038-59a0-4ddd-bca3-836d7dde9d3a', 45, 46),
  ('precedent', '1894456a-74e9-4d51-b905-46a144a12611', 45, 47),
  ('precedent', '576c47ef-bac6-43c1-ab4c-006e02981b5c', 48, 48),
  ('precedent', '7d4ccf96-62a6-462f-b7ab-78dbdc6b9f0d', 50, 49),
  ('precedent', '4bbd7047-748f-4037-9dfa-591b5884661e', 51, 50),
  ('precedent', 'ac392606-36f6-4b47-8819-9079fb52a272', 51, 51),
  ('precedent', '88093d8b-35b0-4358-a978-e52564f00103', 52, 52),
  ('precedent', '4de33dcb-ce74-4b15-bb5f-53cd505a3f0a', 54, 53),
  ('precedent', '306cfa47-d171-49db-a8db-491f3278c8ab', 56, 54),
  ('precedent', '5bb4ee9c-b6fc-4187-b39c-a63bb26e1db3', 57, 55),
  ('precedent', '1d82ab2d-b0b9-4397-aee2-49af85606cc4', 57, 56),
  ('precedent', '9528a1e1-1048-498b-a710-3a71cb29f487', 58, 57),
  ('precedent', '7fe522ab-ca2a-4812-97b8-05866d70e1fe', 59, 58),
  ('precedent', 'ea28ca39-3524-4eab-907d-43c1f3b1a214', 59, 59),
  ('precedent', '32f1e239-3736-42c6-b664-7bb7bbedfabf', 59, 60),
  ('precedent', 'e3fff720-1e37-423c-8b56-30bc63cc34f9', 61, 61),
  ('precedent', 'bb958180-825a-4942-810a-a557853f121f', 62, 62),
  ('precedent', 'beb5df3b-6e9a-4016-b6f2-211a21dcc612', 62, 63),
  ('precedent', 'a5b7a6de-fe58-4ab5-a00d-4e187d1ea4fb', 63, 64),
  ('precedent', '80a122c2-805e-456e-b6b8-759ab953bd72', 63, 65),
  ('precedent', '11b78dd2-e5ff-447d-9476-ec985fd27c96', 63, 66),
  ('precedent', '19c328b6-fa0e-4bd2-9d88-89c049db31d0', 64, 67),
  ('precedent', 'c8f9275e-02ee-45c0-9d8f-1a7434b19e8b', 64, 68),
  ('precedent', 'e02e812b-0306-4fd7-9874-3ee5941a6bcd', 65, 69),
  ('precedent', 'bcf4a21c-3ac3-4b4f-bdea-4f9401fa86ca', 66, 70),
  ('precedent', '693c924d-f139-4800-a3cc-ae33a90e408b', 66, 71),
  ('precedent', '68c4b3bd-1840-4768-b502-2491093950af', 67, 72),
  ('precedent', '47d4960f-b803-4538-87cc-ff3d5f00d5c7', 67, 73),
  ('precedent', 'a144846f-880c-4fb1-b4a9-3e651b70eaad', 69, 74),
  ('precedent', '20ba14fa-caf5-4502-a57c-478f8af4f3b5', 70, 75),
  ('precedent', '13a7991e-8069-4ff9-a2e9-edd0ad3923fa', 72, 76),
  ('precedent', 'ee370afd-c362-4086-bd3e-2fc48c1f1e4f', 73, 77),
  ('precedent', 'bba782dc-e424-4eaa-b18a-e1581ac149c3', 74, 78),
  ('precedent', '9d5116d1-3000-466f-9fac-8344b746ebfe', 74, 79),
  ('precedent', '008eb791-7e5f-4aaa-b30f-f90f2f9973a1', 75, 80),
  ('precedent', 'ea96aac5-d790-43be-91ae-cefe86857cd3', 75, 81),
  ('precedent', '58779b27-7d49-4057-9c40-04735c3007dc', 76, 82),
  ('precedent', 'b018db9c-e64e-45c2-b367-68242a03f653', 77, 83),
  ('precedent', '248a2e2f-748d-4189-a372-8ff897956ec6', 78, 84),
  ('precedent', '03a1eeeb-25a1-461e-b8be-5962bf1cfcbc', 78, 85),
  ('precedent', '6d8fc7d5-fb4f-4232-b19d-c96bf95ca3f7', 80, 86),
  ('precedent', '2f0c7fa8-ebea-4f4d-aeaa-a32166efb606', 81, 87),
  ('precedent', 'c34a7666-65d5-456e-8d30-6b26b9d35599', 82, 88),
  ('precedent', '8c541239-625d-4af6-994f-71c7b89f494b', 83, 89),
  ('precedent', 'e1dc5bcc-5bf0-4819-9395-c43e9e9203ca', 84, 90),
  ('precedent', '9f8a8690-24bd-4a27-a000-d37aab444ad6', 85, 91),
  ('precedent', '9a4edad4-c705-4c0d-ba73-d22c0c5d54b4', 86, 92),
  ('precedent', '97c12c25-6939-431c-b56c-cef369fa8804', 88, 93),
  ('precedent', '0425bd00-cbea-481c-836c-e39c9c1b510d', 89, 94),
  ('precedent', '66af5c34-8622-4243-adfb-28c94cf02c51', 90, 95),
  ('precedent', '36bcf08a-3bd1-4c03-8a32-32b0fd7fb4fe', 91, 96),
  ('precedent', '1fad6641-c665-4da9-8685-e56d4436f90f', 92, 97),
  ('precedent', 'c6a8a29c-17e4-4a8d-b4dc-639250b83a8b', 92, 98),
  ('precedent', '078eb69d-057f-46ee-bc71-02784904e130', 94, 99),
  ('precedent', 'f9d70c04-c7e3-4dac-a093-8771b6f22108', 95, 100),
  ('precedent', '1834cb90-2aa5-47c8-b9d3-242dfabc3a6a', 96, 101),
  ('precedent', '19932e5b-1647-489d-808e-9476e522f4fe', 96, 102),
  ('precedent', 'd7691a82-d182-42f1-b5e6-961641e2853e', 97, 103),
  ('precedent', 'e4af6554-4665-4531-b0ea-77a0175c761c', 98, 104),
  ('precedent', 'd633fbf1-fefe-4453-9cf5-ad252a1aff88', 101, 105),
  ('precedent', 'a910bc99-79bf-4d51-8e6f-25b27cea98a4', 101, 106),
  ('precedent', 'da2724f1-5756-4254-8d5f-24f7d5fe0b1c', 102, 107),
  ('precedent', '15c60a39-3363-4b4b-9e91-1bff49285593', 103, 108),
  ('precedent', '250d2ed0-08b6-4da5-972f-078fc71a7de7', 105, 109),
  ('precedent', '98a481f2-135c-468c-a138-0c30edd8a298', 105, 110),
  ('precedent', '3e29bf45-f937-4426-a91d-0ae25a6bb435', 108, 111),
  ('precedent', '571f7eeb-927b-4bf3-a24e-80fea044a311', 109, 112),
  ('precedent', 'f6d74d31-fabb-4e59-9bfc-ea0ec95b3a76', 109, 113),
  ('precedent', '0dfe5d27-8d8f-4aec-8d12-b1fd24a92198', 110, 114),
  ('precedent', 'eb1e4841-879b-4f4c-a801-55daeb24ace0', 111, 115),
  ('precedent', '3c630754-2e20-4098-8c88-5a608043446d', 111, 116),
  ('precedent', 'eb33eed0-1628-495f-825d-4063df2f9979', 112, 117),
  ('precedent', 'e772b06c-0ec2-4f28-af32-ee0a79e6879a', 112, 118),
  ('precedent', '40225ebf-37f4-48b4-8bed-646f3446f11d', 113, 119),
  ('precedent', 'e20dfcb5-eb8b-44ba-b846-1c475f171bf5', 113, 120),
  ('precedent', '3b1dc991-0694-43b7-8f1c-1a34a9475688', 114, 121),
  ('precedent', '0df48276-a097-482b-b12a-095ff0b58165', 115, 122),
  ('precedent', '56b56f56-485f-4503-a53c-bbc5a499edd6', 116, 123),
  ('precedent', 'b5d88a00-2cd0-4897-971d-530aa9e2b890', 116, 124),
  ('precedent', 'd878e24d-cb3b-44f8-8dba-7fc40f3dddb3', 117, 125),
  ('precedent', '150756d6-9d11-42fc-afe6-8c60543c558f', 122, 126),
  ('precedent', '05e2cb5d-c214-45b0-96f7-fb4b9ace6990', 124, 127),
  ('precedent', 'a6d71a64-b000-4aec-be9d-0133649fb638', 126, 128),
  ('precedent', 'ada3cfed-6ade-43e9-9ba7-492f7a683ec0', 127, 129),
  ('precedent', '08ffa4c3-39f6-40d5-953f-d4e52ece0f86', 128, 130),
  ('precedent', 'fd6bf315-c153-4724-b2a0-9fcb99363982', 130, 131),
  ('precedent', '1841e948-2183-4e6c-913e-3cd34833d78d', 130, 132),
  ('precedent', '80748b53-42cd-474f-b504-198f9ef15277', 133, 133),
  ('precedent', '94a1f9bc-7808-41cd-b9cb-2baa5d62c92e', 134, 134),
  ('precedent', 'dab2a1f6-da5f-4183-bb42-ea951faeb788', 134, 135),
  ('precedent', 'd945b2d1-3d5a-4a04-8574-eb549a5331e2', 136, 136),
  ('precedent', '8b9095ba-f094-4f77-b9df-217a7e0b3f25', 137, 137),
  ('precedent', 'd877d41c-be58-4a64-9c64-6a91ddef31ad', 138, 138),
  ('precedent', '07b4fe01-1476-4953-967b-2103677fd563', 139, 139),
  ('precedent', 'f7d4b578-9c91-4f22-bd8a-060e106cc467', 140, 140),
  ('precedent', '7c4a34cb-c6ee-4f04-b6fa-c6bbdf2dbb56', 141, 141),
  ('precedent', '33544cbc-9232-4bec-bf58-12eefc4109ed', 142, 142),
  ('precedent', '720435a1-3242-46e1-8768-fda23dd95eda', 144, 143),
  ('precedent', 'd08c1d0c-d95d-4db9-af14-837a6f5cd492', 145, 144),
  ('precedent', '72cd5483-ae30-47fd-8b45-51bc3b149a42', 147, 145),
  ('precedent', '859258d6-d0f3-4d32-8830-8a343eb34a7d', 149, 146),
  ('precedent', '675c9ad0-1075-4187-b7c0-47ca1ba26723', 155, 147),
  ('precedent', 'ad294091-f91f-46b8-9319-886f0327e1db', 155, 148),
  ('precedent', 'd40c92db-bb34-4446-8ad8-958c3314f1da', 156, 149),
  ('precedent', '391872b7-83ad-489d-b58a-00f64cf5f1a1', 156, 150),
  ('precedent', 'e57b59d1-e7e8-4ccc-a1a9-cfcc932a6724', null, 151),
  ('precedent', '7d20350f-0c6c-485c-9e13-ddd244d1ce68', 158, 152),
  ('precedent', 'c4ba77e9-bfdf-4665-b0bd-09b5694ac659', 159, 153),
  ('precedent', '68ef7890-e95a-4839-9736-38ee2f0359c5', 159, 154),
  ('precedent', '415f7e2e-a1f6-4535-9dc7-65fbcca699db', 160, 155),
  ('precedent', '009c21c9-dc0c-47db-b868-900015b3da66', 163, 156),
  ('precedent', 'b271bf42-f5fd-49a7-adac-7a1cd7c561ac', 164, 157),
  ('precedent', 'a061f939-6004-407a-bdb9-d66f06ba4981', 166, 158),
  ('precedent', 'f2a3c282-28c3-4894-a562-b6f0a4bfd607', 169, 159),
  ('precedent', 'f079382e-964b-48e3-a659-383a0a2170fe', 172, 160),
  ('precedent', 'fb7b7864-9ed7-419c-a8a0-46438e965774', 172, 161),
  ('precedent', '241dd682-a587-4213-b16f-229622c38ff9', 173, 162),
  ('precedent', '0269f755-92ff-4615-99a6-5a51ff1ce33f', 173, 163),
  ('precedent', '9b6df754-dd11-4177-9f67-4e14a3ea9e69', 174, 164),
  ('precedent', '1f406488-22e2-46a9-b803-417f3134dd00', 175, 165),
  ('precedent', '66e68921-cb6a-4f8c-b759-c6a6caa3602d', 176, 166),
  ('precedent', '0cbe250c-7595-44ef-85e5-34159c767bc3', 176, 167),
  ('precedent', 'be7146ee-5f31-463a-8e7c-8af2e874eb47', 177, 168),
  ('precedent', '2d54d633-e550-4c06-bca9-4ee05835d6dd', 178, 169),
  ('precedent', '75ab8142-5126-4f7e-ab53-df9eacf539df', 178, 170),
  ('precedent', '4ff21766-2210-4194-b03e-8aff0bd3a67b', 180, 171),
  ('precedent', '4c042a85-92da-4c61-9c19-05fc1d7608dc', 181, 172),
  ('precedent', '539ed1a4-d556-4a31-8d9c-f8f30409efd4', 183, 173),
  ('precedent', 'c97e5d71-5d61-4b5d-a9e0-4c06737b2811', 184, 174),
  ('precedent', '452b450b-5c7d-4d8a-8c9d-f40297747a30', 185, 175),
  ('precedent', 'f34ecaf7-fb8e-4a1e-bb0f-1bf48492c21d', 185, 176),
  ('precedent', '3f82e62e-1e45-402c-97ea-9937ba70a916', 187, 177),
  ('precedent', '4c5bf877-5241-49bd-9ba9-773d48217b31', 190, 178),
  ('precedent', 'dcc71d63-1b59-4002-b58e-a59d8bc1decd', 191, 179),
  ('precedent', '99724bc0-7804-44c6-9729-b2c224398aa0', 192, 180),
  ('precedent', 'a3250a42-3d36-4118-b338-2ad42c8e6a4c', 193, 181),
  ('precedent', 'f97d445a-f142-4d0c-bcec-612672872b5d', 193, 182),
  ('precedent', '8b196575-a9c0-4ce2-a2c7-16d4d0afb6fc', 196, 183),
  ('precedent', '23e1fd4f-6dbc-4b9a-9f06-aa1eb07f5c69', 196, 184),
  ('precedent', 'd3ad0928-7d66-4e3e-bb36-3bcc3e6ed7b2', 202, 185),
  ('precedent', 'f969cf4f-d5b8-4e5b-b85f-37dffdd8645a', 202, 186),
  ('precedent', '99fc5d7b-2abd-4261-8f27-4661d2c6c48e', 202, 187),
  ('precedent', 'd11cc2aa-ab0c-4552-b629-054c838f61d0', 203, 188),
  ('precedent', 'd27579cc-0c1a-438e-b7ea-ce9bb8693a96', 204, 189),
  ('precedent', '6509d947-7ba5-4260-b2ac-a4ff4b54bb55', 204, 190),
  ('precedent', '2dead4f7-ddee-4640-a739-4f2110755592', 206, 191),
  ('precedent', '1fbeca25-4cb3-427c-9326-0a2dd97b52da', 206, 192),
  ('precedent', 'c714950d-b3cc-43ad-a66d-5a11138a68ab', 206, 193),
  ('precedent', 'dc31e0f2-b6f0-472f-ac28-d641807c09aa', 207, 194),
  ('precedent', '3891e6d1-d236-4bcc-b4f8-5d320f15f4d0', 207, 195),
  ('precedent', 'abe99163-8b18-498b-bf97-29d349aca029', 208, 196),
  ('precedent', '1fe024ce-f06e-4cfc-a966-d885375319ae', 208, 197),
  ('precedent', '6c3ad51a-dea6-41db-a487-74cb49711d6a', 209, 198),
  ('precedent', 'e0b162ba-4e97-45b6-9044-a9acb301e6df', 213, 199),
  ('precedent', 'b7f549ca-8f2e-41f8-87f4-c08e46193364', 215, 200),
  ('precedent', '02c81f1e-8cf3-4739-b5fa-f48ab0d7a2e1', 216, 201),
  ('precedent', '37274ff7-c1f2-4bf9-b6ea-0e6047ea3326', 217, 202),
  ('precedent', 'ed3f7653-bad9-4990-bae9-bb3a14507976', 223, 203),
  ('precedent', 'd22416cc-271a-47d6-b29f-6bc2189638e8', 223, 204),
  ('precedent', '8c1acabf-c9d0-4942-aa5a-155d4f276a2a', 224, 205),
  ('precedent', '0a343f76-0988-4b58-864e-c7016eed9db3', null, 206),
  ('precedent', 'd41e6fc3-8cfe-41b6-9a4d-04f200c803e4', 226, 207),
  ('precedent', 'dd58ec6b-8c74-4447-a4ab-a87a4d423848', 226, 208),
  ('precedent', '1accc744-fb7d-4e4b-9b52-121fef729b45', 227, 209),
  ('precedent', '997b5b11-1949-447b-9f1b-51e796c6a37c', 229, 210),
  ('precedent', '724d3102-fd28-485c-a7b4-776268e2167d', 237, 211),
  ('precedent', 'be41c8f5-ea1a-486d-ba0c-32cb0785747a', 237, 212),
  ('precedent', '2321cf87-c6e8-4feb-8028-8d8a7ec42a97', 238, 213),
  ('precedent', '1299e09b-98e1-42ba-a869-d967317bb2cf', 238, 214),
  ('precedent', '43f6635d-272b-4293-8547-19127094e53a', 238, 215),
  ('precedent', '583b0913-5849-4a0a-8e6c-fa5fa247f5b2', 240, 216),
  ('precedent', '5890a231-852e-47bc-b400-e5483e044560', 240, 217),
  ('precedent', 'c800400a-0333-4ce6-b7e9-34ebd63072ae', 247, 218),
  ('precedent', 'ed74208c-f310-4e6d-a1ae-e85ce4ba7210', 249, 219),
  ('precedent', '7523ab35-fc8f-448e-a4e4-3db6005364b4', 249, 220),
  ('precedent', '3b6210ac-c01e-4c68-8191-9f272fe5a9cb', 250, 221),
  ('precedent', 'b1185412-d3d7-4acc-b90c-13a9e434b818', 250, 222),
  ('precedent', 'f071ca96-1e8f-4d22-b8da-8794713628c4', 251, 223),
  ('precedent', '95ec7811-9398-4aa7-9135-7a264bffa7c4', 252, 224),
  ('precedent', 'b6c088aa-c825-458e-ab2c-1200389e7d69', 253, 225),
  ('precedent', 'e57383a1-f84a-4ae1-b1d7-34e7f8ff3406', 254, 226),
  ('precedent', 'b5e10976-cec8-441f-ad90-f0ef7ec66624', 255, 227),
  ('precedent', '34745e1f-2320-484d-a65f-ca850012ef01', 258, 228),
  ('precedent', '07660455-d2c4-487d-966d-a8b1b0a9caf2', 259, 229),
  ('precedent', '607ce55a-e40d-42f9-a3ce-63b1f2318f48', 259, 230),
  ('precedent', '2c5dd70a-e592-4031-abe8-c739f2071df6', 261, 231),
  ('precedent', '353cf43d-a9c2-4c16-8a78-eb4c77f18fbc', 264, 232),
  ('precedent', '8edff07b-d5f7-43e5-9204-c4c4d685a11f', 264, 233),
  ('precedent', '2e27852d-5499-4d8f-a2ce-6b6d716898d7', 266, 234),
  ('precedent', '9221690e-86e6-448d-99f0-4496ba80587c', 267, 235),
  ('precedent', '81043cb8-c0cb-43d5-8e49-1e30c962c42d', 268, 236),
  ('precedent', '977c3c6f-564e-4be4-becd-73b574e99a21', 269, 237),
  ('precedent', 'd7465d15-9cd4-4708-909b-f40350421b96', 274, 238),
  ('precedent', '34ff835d-3321-4158-aa2a-edb6878a0c58', 276, 239),
  ('precedent', 'd096c454-d703-4413-bbe5-47a38e7cac6e', 281, 240),
  ('precedent', 'f341ed82-ebf1-46fe-915c-ae2da9756274', 281, 241),
  ('precedent', '470b6c87-3403-467e-8655-c2f037c0e1e9', 281, 242),
  ('precedent', 'edc91789-02a2-49f9-a036-3401b376b99d', 282, 243),
  ('precedent', 'e205ca9a-9e36-41ef-b4be-54da6976323d', 282, 244),
  ('precedent', '142b7be3-0236-4aa9-91d5-699bd9dad63f', 283, 245),
  ('precedent', '929a0ab0-2066-4a9f-939a-1cca349abea8', 283, 246),
  ('precedent', '81e999e4-71af-46ae-ac00-af8e61356d91', 284, 247),
  ('precedent', '07d0f870-a6f6-4572-abb0-3055f8e99d36', 285, 248),
  ('precedent', '3176d95c-8e4c-4770-b5c2-07edfaac862c', 286, 249),
  ('precedent', 'ad135fe5-6185-4723-b883-3cfab9d9ba75', 286, 250),
  ('precedent', '01615372-c870-4f04-bf1a-bd99d9f3d32e', 287, 251),
  ('precedent', '5a02b9d7-2499-47a2-b23f-c3255a324d66', 287, 252),
  ('precedent', '9d4f504b-6b75-497f-99b6-efd5c3052c32', 287, 253),
  ('precedent', 'd4d60c04-146a-4540-be0c-0e068e81ce7d', 288, 254),
  ('precedent', 'aec73b83-d91b-4353-8a8b-6cd8ff2b901b', 288, 255),
  ('precedent', '59c3d66c-dc0d-4bc6-bca9-98e1d1f3d56f', 290, 256),
  ('precedent', '78f51c36-bf17-4efa-b7be-505891da851b', 291, 257),
  ('precedent', '2c8eb47c-60c1-4602-820d-1c9960afe44a', 291, 258),
  ('precedent', 'ac9094c4-0f4a-4ef1-88b4-0e482af7e7d1', 292, 259),
  ('precedent', 'e6f7b338-a560-4d24-9605-38fc4b6bc0ce', 293, 260),
  ('precedent', 'ecd32f47-2e2e-4271-82eb-d6d6376faa33', 293, 261),
  ('precedent', '21801781-ee0e-424a-b781-5d4eebbc5a87', 294, 262),
  ('precedent', 'e17911d8-c32f-4e91-bd6a-4ac5afb0b2d5', 295, 263),
  ('precedent', 'a802c5eb-d6af-4272-bfc8-585f47b5dea1', 296, 264),
  ('precedent', '818effb9-609e-4856-ac74-9548e47ce633', 299, 265),
  ('precedent', 'aca3c71e-9a3b-4b68-bf2c-50ac755b81ee', 299, 266),
  ('precedent', 'c166000f-38e3-4fe2-9d30-bf1429949ee3', 300, 267),
  ('precedent', '611c8c6f-3f55-4cdd-a2d8-c3d7dd1a0a62', 301, 268),
  ('precedent', 'd4bc2efc-ff91-43c6-b1b2-20c9f6cd3679', 302, 269),
  ('precedent', '45ba85f4-9d33-4b9f-8b7b-06e46365830d', 302, 270),
  ('precedent', '5b7ea685-c8d1-4ab0-b05b-72346a644151', 303, 271),
  ('precedent', 'f020b717-2d08-4db9-9393-ca099deabc1d', 303, 272),
  ('precedent', '28bae150-01be-4951-87f9-c1de2c2fdfb6', 303, 273),
  ('precedent', 'f2e03c88-0d62-499c-9ff2-4eb3d47081c7', 304, 274),
  ('precedent', '56c07a2d-755d-48b2-bdbd-f4addc2c2c3d', 305, 275),
  ('precedent', '8f51e9e1-bfb2-41bb-90bd-8568f3791dbc', 305, 276),
  ('precedent', '4d2e8e06-f48d-4299-920f-87f375037744', 307, 277),
  ('precedent', 'c54caaed-840d-40a0-bdb6-234291c984d5', 309, 278),
  ('precedent', '36cb39d4-84c6-4ad7-8b5f-544af8bbf9f9', 312, 279),
  ('precedent', '26d7a488-baf7-46ed-bcde-0f0fdb624c3c', 313, 280),
  ('precedent', '29afc536-76cd-47b7-83bc-400fddef1f3a', 313, 281),
  ('precedent', '0b3ce7fa-b612-4a7c-aa67-4ff66cf289d6', 314, 282),
  ('precedent', 'a85f4b1b-e893-4cb3-bf9a-055a21818a19', null, 283),
  ('precedent', 'aeaeb5b0-2a78-4523-9972-0386af5346aa', 315, 284),
  ('precedent', '3a3cfec7-8b90-430a-976a-5f4ea55dff52', 316, 285),
  ('precedent', '24c236b2-30cf-4d79-b990-daea0f5b1cc0', 317, 286),
  ('precedent', 'ff9d4a42-d71b-491b-bf86-4d0529bcc0da', 318, 287),
  ('precedent', '1a35cdc1-d22b-4522-b15b-88e0e7682bb8', 319, 288),
  ('precedent', 'bb8f63ed-f781-4dac-8001-2dfcd8f5a48d', 320, 289),
  ('precedent', 'ca82fc16-73c0-423c-b328-865fc6b370d6', 321, 290),
  ('precedent', 'dd24c0f0-6027-494b-b055-9e49237bdd3f', 323, 291),
  ('precedent', 'd6e16847-2e9b-44c1-93d2-5f794562cc4c', 324, 292),
  ('precedent', 'a81fdc0d-ec5d-4efe-b931-818cf0d10381', 324, 293),
  ('precedent', '6dd50ea5-4d48-4246-8edd-b77d19e2dde7', 325, 294),
  ('precedent', 'c8f135a5-785e-47be-97c2-8d6b3b7c158d', 325, 295),
  ('precedent', 'a9f3d640-e5d0-43b9-b8ed-74cbfe84a8ab', 327, 296),
  ('precedent', 'ad595a6b-9e46-4db8-9fe5-b3c4d45f506b', 328, 297),
  ('precedent', 'c706b220-6bdd-4d70-ba04-ebf80756c865', 328, 298),
  ('precedent', 'd4fe5626-b959-4eb9-bf6a-c0e3d9af844d', 335, 299),
  ('precedent', '92e18d5a-4f11-43f4-992b-89d4f8d7c659', 336, 300),
  ('precedent', '3464fd53-8886-4da0-b089-7a7cd2ba7338', 337, 301),
  ('precedent', 'ae0fb7c9-d8a7-45f5-b446-92ea19a48b67', 339, 302),
  ('precedent', 'c0f9fbc6-1c5d-4634-b542-7ef644a26c4a', 341, 303),
  ('precedent', '8414bb1e-7cd1-450e-99f1-e084eb2791e1', 342, 304),
  ('precedent', '212ab7d9-d9af-42be-99e4-a353e5966085', 342, 305),
  ('precedent', 'fb047442-40e4-40d3-ac6a-b22637a52f4c', 343, 306),
  ('precedent', '070acb3b-8dc2-42f8-b70e-6781f04a91b4', 343, 307),
  ('precedent', 'ce977ec5-9964-46cf-b300-27d621358515', 344, 308),
  ('precedent', '41144bf9-030b-4a35-908a-c91f2c59aefb', 345, 309),
  ('precedent', 'cc6b7d3a-0bf8-4985-9c51-a0b83e796a0f', 345, 310),
  ('precedent', '439da8eb-f15f-4bb4-aa9d-8c7999958223', 345, 311),
  ('precedent', '2c8043cb-4a7b-4217-87f6-9eaa5f10a431', 347, 312),
  ('precedent', 'e92d0c9c-4332-40a8-bc94-a6de103bdd56', 348, 313),
  ('precedent', '0c67c36c-2823-4759-b4dd-b8cd9ab1f083', 348, 314),
  ('precedent', '293692ce-df50-4854-9c68-3cfaa8e23779', 350, 315),
  ('precedent', '9397cb6d-6caf-4d7e-8125-38527e2e85af', 352, 316),
  ('precedent', '4f4b92f9-cfa9-4906-9721-c70455b2ff9b', 354, 317),
  ('precedent', '356a9fb9-f7d0-4471-a11f-7e049e1adf33', 355, 318),
  ('precedent', '0a462717-4311-4127-b266-51db2133d944', 357, 319),
  ('precedent', '14a993d6-85bf-4c44-9a34-cd779e0cba3d', 358, 320),
  ('precedent', '19d6d254-25e4-4ca7-80aa-7e62d5fedcec', 358, 321),
  ('precedent', '997b60bb-baff-493d-ac98-8c2ef4c72dda', 358, 322),
  ('precedent', 'ed521718-170c-4297-81a0-0033fa6fcaa7', 358, 323),
  ('precedent', 'e10be9e3-b26a-4f36-bc3c-54e1a8ad10b3', 359, 324),
  ('precedent', '3be0cec2-3ae6-4a9c-8310-a0afbf6e9e4f', 361, 325),
  ('precedent', 'bf986b63-1e54-4dde-b319-96dff2a2c815', 362, 326),
  ('precedent', '0e9e8075-06d0-4f9e-b894-32edb63a2283', 362, 327),
  ('precedent', '0f106ef6-ffae-4e50-aa25-04f2c797ebc9', 363, 328),
  ('precedent', '98c0aa14-c029-45b4-9fd5-387e0bc0cf5d', 363, 329),
  ('precedent', 'b62dfc5d-bb21-4528-bbca-c2ad94ead69c', 373, 330),
  ('precedent', '61f75cb3-0130-4fc3-b796-aabecd3ab1ca', 373, 331),
  ('precedent', '1a145e14-0c6d-44ed-8d08-54659c6fa4b4', 374, 332),
  ('precedent', 'ebd4cf63-69ae-48e4-af0e-ac0ad8b6ddf1', 375, 333),
  ('precedent', 'ab48f026-04bb-4bef-9c65-020a20d66c98', 376, 334),
  ('precedent', 'e757fec9-8100-46fa-aa11-66af9500894a', 376, 335),
  ('precedent', 'b6b8bbb0-5d63-4f31-bd9e-c69b842edd95', 376, 336),
  ('precedent', '3443f8f0-a59d-4d0c-bdfe-010ca7b29a16', 379, 337),
  ('precedent', '5b6add49-1fca-4cea-878d-4543bfb26d49', 379, 338),
  ('precedent', '0494162c-ce33-4c99-af93-26c2763844ee', 380, 339),
  ('precedent', '89a29e00-7f71-4cde-a668-31c972f79050', 381, 340),
  ('precedent', 'eb7b9ab0-18ec-4a65-ae87-fd256a1de789', 382, 341),
  ('precedent', '6f339935-9904-4138-be10-e79393a1a1ab', 383, 342),
  ('precedent', 'd1f9f207-1057-4dbe-a9c7-2e42baf837f4', 383, 343),
  ('precedent', 'd9f249a3-bebc-4e2c-ab0a-9a0ff0bbf847', 384, 344),
  ('precedent', 'f30c0ddd-44a2-43d6-9439-c0e62f87bda1', 385, 345),
  ('precedent', '58fde2f4-4c64-4748-aec0-827fda66a239', 386, 346),
  ('precedent', '1eea3526-8e78-4857-af40-0929769860db', null, 347),
  ('precedent', '92df56bb-f64c-4569-a2ce-37429df8d145', 387, 348),
  ('precedent', '8b3583b6-9755-4275-a5ae-9b1b09c0d381', 388, 349),
  ('precedent', '5f32c006-4f2b-4176-aeb1-dfeb05fc3bcc', 389, 350),
  ('precedent', '43848082-540f-49b6-8269-4e0e6b11b3e6', 390, 351),
  ('precedent', '85e56f2c-2c62-4b87-8bbc-d3b9326de50a', 391, 352),
  ('precedent', 'd9871387-1307-4baf-a19a-1e08f863b954', 391, 353),
  ('precedent', '58f96fcc-897b-442e-ab60-28b6a9ce9f1f', 393, 354),
  ('precedent', '42a11bcd-50bc-4ec5-af1c-da4d07052329', 393, 355),
  ('precedent', '0ca35a2a-6d40-42cb-9bb9-0dfec4fb2ea8', 394, 356),
  ('precedent', 'dfad1dd9-a95a-4513-8970-7d1a3a41d251', 2022, 357),
  ('precedent', '27197fde-c136-4a0e-be03-14cddc8f2d76', 396, 358),
  ('precedent', 'a74a81f8-d9f3-4be1-8e10-daad753ca642', 397, 359),
  ('precedent', '57fbd7da-d558-45db-ac27-8d0fac362b8f', 397, 360),
  ('precedent', 'a3e489ab-bf81-4d59-b713-e3dbf3561547', 398, 361),
  ('precedent', 'e08ed373-54d6-49f8-99f2-ff386e6ecbab', 399, 362),
  ('precedent', '062a5d7e-14fa-4724-a335-0afd1d1858bf', 403, 363),
  ('precedent', '5f76ed53-b63e-443f-afac-79f18c504bd2', 404, 364)
) as v(ct, cid, pg, sk);

-- 3c. 객관식 — 기존 source_doc FK 유래 (기출Ⅰ/예상Ⅱ 문제편)
insert into publication_content_map (edition_id, content_type, content_id, sort_key)
select (select edition_id from p2_pub where slug='mcq1'), 'mcq', p.problem_id::text, p.problem_number
from problems p
where p.deleted_at is null and p.source_doc_id = 'b83a2018-18ea-4174-bed4-716244297a9b';

insert into publication_content_map (edition_id, content_type, content_id, sort_key)
select (select edition_id from p2_pub where slug='mcq2'), 'mcq', p.problem_id::text, p.problem_number
from problems p
where p.deleted_at is null and p.source_doc_id = '1b7a79f1-a6e2-49a7-ada1-815032c9da67';

-- ── 4. [2] 최신판례 10건 → 원장 수동 삽입 (INSERT only — append-only 가드 무접촉) ──
insert into content_revisions (
  content_type, content_id, node_id, subject_ref, source_ref,
  op, after_snapshot, changed_fields,
  notice_status, apply_status, applied_at,
  merge_status, source_edition_id,
  created_by_label, app_name
)
select 'precedent', c.case_id::text, c.primary_node_id::text,
       jsonb_build_object('subject_laws', c.subject_laws),
       jsonb_build_object('origin', 'phase2_backfill', 'reason', '제10판 완고 이후 추가'),
       'INSERT', to_jsonb(c), '{}',
       'none', 'applied', now(),
       'pending', (select edition_id from p2_pub where slug='precedent'),
       'system:phase2_backfill', 'phase2_backfill'
from cases c
where c.deleted_at is null and c.subject_laws[1] = 'patent'
  and c.case_number in ('2026다202753','2023후10965','2024다228104','2024후11125','2024후10979','2022후11190','2022후10722','2024후11590','2024후10641','2024후10658');

do $$
declare n int;
begin
  select count(*) into n from content_revisions
  where created_by_label = 'system:phase2_backfill' and content_type = 'precedent';
  if n <> 10 then raise exception '최신판례 원장 삽입 %/10', n; end if;
end $$;

-- ── 5. [4] 특허 기출 미연결 3건 백필 (application_name='phase2_backfill' 로 원장 기록) ──
with fixed as (
  update problems p
  set source_doc_id = 'b83a2018-18ea-4174-bed4-716244297a9b'
  where p.problem_id in ('c6d39092-e986-4129-ba5b-3b2ca875f6cf', '093245f8-bb2b-4b59-b4a1-f0502e7a83d8', '14bcc00f-4f9b-493c-8ac5-7275535cd644')
    and p.source_doc_id is null
  returning p.problem_id, p.problem_number
)
insert into publication_content_map (edition_id, content_type, content_id, sort_key)
select (select edition_id from p2_pub where slug='mcq1'), 'mcq', problem_id::text, problem_number
from fixed;

-- ── 6. 시드 건수 assert ──
do $$
declare n int;
begin
  select count(*) into n from publication_content_map where content_type='statute';
  if n <> 268 then raise exception 'statute % != 268', n; end if;
  select count(*) into n from publication_content_map where content_type='precedent';
  if n <> 364 then raise exception 'precedent % != 364', n; end if;
  select count(*) into n from publication_content_map where content_type='mcq';
  if n < 1100 then raise exception 'mcq 시드 부족: %', n; end if;
  select count(*) into n from problems p join laws l on l.law_id = p.law_id
   where l.law_code='patent' and p.deleted_at is null and p.subject_type='law'
     and p.origin='past_exam' and p.format::text like 'mc%' and p.source_doc_id is null;
  if n <> 0 then raise exception '특허 기출 미연결 잔여 %건', n; end if;
end $$;

commit;
