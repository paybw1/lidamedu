-- 확인되지 않는 사건번호 제거 — 2000마7838 (원장 지시 2026-09-12).
--
-- P-9646(상표 2차) 채점기준의 설문(3) 항목. 네 곳 모두 없음:
--   cases 0 · case_lower_courts 판결문원문 0 · 교재 content_chunks 0
--   casenote 없음 · 국가법령정보센터 없음 (라이브 재조회)
--
-- ★같은 줄의 2010다103000 전합은 건드리지 않는다 — 별건이고 확인된 바 없다는 표시도 없다.
-- ★번호만 빼고 법리("취소사유는 심결확정 전까지 유효")는 그대로 둔다(CLAUDE.md 12).
--
-- 백업: scripts/backups/20260912_P9646_rubric_before.json

update public.problems
   set grading_rubric_md = replace(
         grading_rubric_md,
         '취소사유는 심결확정 전까지 유효(2000마7838)로 권리남용 불인정',
         '취소사유는 심결확정 전까지 유효하므로 권리남용 불인정'),
       updated_at = now()
 where display_no = 9646 and deleted_at is null
   and grading_rubric_md like '%취소사유는 심결확정 전까지 유효(2000마7838)로 권리남용 불인정%';
