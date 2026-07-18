-- 밑줄 하이라이트 확장 — 색 3종(기본·빨강·파랑) × 굵기 2종(보통·굵게).
-- 기존 'underline' = 기본색·보통(하위호환, 데이터 무수정). CHECK 값 5 → 10.
alter table user_highlights drop constraint user_highlights_color_check;
alter table user_highlights add constraint user_highlights_color_check check (
  color = any (array[
    'green'::text,
    'yellow'::text,
    'red'::text,
    'blue'::text,
    'underline'::text,
    'underline_thick'::text,
    'underline_red'::text,
    'underline_red_thick'::text,
    'underline_blue'::text,
    'underline_blue_thick'::text
  ])
);
