-- 오류신고 처리 쪽지 영속화 — 지금까지는 신고자 알림(user_notifications)에만 남아
-- 관리자 화면에서 답변 내용을 볼 수 없었다.
ALTER TABLE bug_reports
  ADD COLUMN IF NOT EXISTS resolution_note text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- 기존 완료 알림에서 백필 (신고당 최신 알림 기준).
WITH latest AS (
  SELECT DISTINCT ON (entity_id)
    entity_id::uuid AS report_id,
    payload->>'note' AS note,
    created_at
  FROM user_notifications
  WHERE kind = 'bug_report_resolved' AND entity_type = 'bug_report'
  ORDER BY entity_id, created_at DESC
)
UPDATE bug_reports b
SET resolution_note = COALESCE(b.resolution_note, l.note),
    resolved_at = COALESCE(b.resolved_at, l.created_at)
FROM latest l
WHERE b.report_id = l.report_id;
