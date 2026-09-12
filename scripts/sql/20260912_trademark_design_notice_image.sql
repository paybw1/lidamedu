-- 상표법·디자인보호법 조문 공개 공지 → 이미지형으로 교체(원장 지시 2026-09-12).
-- 관례: popup-notices 공개 버킷 PNG 를 마크다운 이미지로 넣는다(오픈 배너와 동일).
-- ★이미지 아래에 짧은 글을 남긴다 — 이미지를 못 보는 환경과 검색을 위해서다.
--   alt 텍스트도 제목 그대로 둔다.

update public.announcements
   set body_md = $md$![상표법·디자인보호법 조문을 열었습니다 — 판례·문제는 준비 중](https://mcgdoplovrjgklbxmozi.supabase.co/storage/v1/object/public/popup-notices/trademark-design-articles-open-v1.png)

상표법과 디자인보호법의 **조문**을 이제 보실 수 있습니다. 종합반 수강생과 해당 과목 수강권 보유자께 열려 있습니다.

**판례 · 기출문제(객관식) · 정오문제**는 지금 내용을 다듬고 있으며, 검수가 끝나는 대로 **곧 순차적으로 올립니다.**$md$,
       updated_at = now()
 where title = '상표법·디자인보호법 조문을 열었습니다 — 판례·문제는 준비 중'
   and deleted_at is null;
