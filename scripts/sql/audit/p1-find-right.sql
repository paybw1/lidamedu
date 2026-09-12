-- 5종이 대신하려던 법리로 우리 cases 를 뒤진다(92도3350 이 그랬듯 이미 있을 수 있다).
with q(tag, kw) as (values
  ('2021다257968 · 상표 상호의 보통사용', '상호'),
  ('2011후2737 · 디자인 공지부분 중요도', '공지'),
  ('2011후3727 · 디자인 요부관찰',        '요부'),
  ('2011다108085 · 민법 독립당사자참가',  '독립당사자참가'),
  ('2011다15469 · 민법 신의칙',           '신의칙')
),
hit as (
  select q.tag, c.case_number, c.decided_at, c.case_title,
         row_number() over (partition by q.tag order by c.decided_at desc) as rn
    from q join public.cases c
      on c.deleted_at is null
     and concat_ws(' ', c.case_title, c.summary_body_md) like '%' || q.kw || '%'
)
select tag, case_number, decided_at, left(case_title, 60) as title
  from hit where rn <= 5 order by tag, decided_at desc;
