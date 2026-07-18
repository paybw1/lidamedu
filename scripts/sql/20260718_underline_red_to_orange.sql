-- 밑줄 색 개명: 빨강(underline_red*) → 주황(underline_orange*) — 교재 밑줄(amber)과 톤 통일(원장 지시).
-- ★순서: 제약 제거 → 데이터 이관 → 새 제약 (기존 CHECK 가 새 값을 막으므로).
alter table user_highlights drop constraint user_highlights_color_check;
update user_highlights set color = 'underline_orange' where color = 'underline_red';
update user_highlights set color = 'underline_orange_thick' where color = 'underline_red_thick';
alter table user_highlights add constraint user_highlights_color_check check (
  color = any (array[
    'green'::text,
    'yellow'::text,
    'red'::text,
    'blue'::text,
    'underline'::text,
    'underline_thick'::text,
    'underline_orange'::text,
    'underline_orange_thick'::text,
    'underline_blue'::text,
    'underline_blue_thick'::text
  ])
);
