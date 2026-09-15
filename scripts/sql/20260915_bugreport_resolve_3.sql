-- 오류신고 3건 완료 처리 + 신고자 인박스 알림.
--
-- ★상태만 바꾸면 알림이 안 나간다 — 알림 fanout 은 DB 트리거가 아니라 앱 코드
--   (bug-reports/notify.server.ts → notifications/queries.server.ts) 에 있다.
--   그래서 여기서 `user_notifications` 행을 **직접 함께** 만든다.
--   앱 경로와 동일하게: kind=bug_report_resolved, entity_type=bug_report,
--   body = "<쪽지>\n\n(신고 내용: <원문>)", href = 신고 URL 의 경로 부분.
--
-- 대상(수정 커밋 69f03c74, 배포 manifest-0a49ff47 반영 확인 후 실행):
--   e2de08a5 해설에 코드가보임          — 서식 판정을 rich-text SSOT 로 위임
--   5140135c 정답해설지 객관식 해설 누락 — 객관식 선지 해설 select 누락 보완
--   107486a9 제10조 약칭이 답을 노출     — 같은 답은 단계 경계를 넘어 함께 가림
--
-- 문안의 수치는 전부 실측값이다(운영 조회 · 제10조는 filterPlaceableBlanks 통과 후 실측).

begin;

create temp table resolve_batch (
  report_id uuid primary key,
  note      text not null
) on commit drop;

insert into resolve_batch (report_id, note) values
('e2de08a5-9664-4730-9d8a-6b529e27d1b7',
'고쳤습니다. 지금은 표가 표 모양으로 나옵니다.

해설에 표가 들어 있으면 화면이 그 표를 그려야 하는데, 표를 만드는 코드가 그대로 글자로 찍히고 있었습니다. 신고하신 「행위능력」 단원에서는 권리능력과 행위능력을 정리한 표가 그랬습니다.

같은 증상이 있던 다른 해설(포괄위임 정리표 등)도 함께 고쳐서, 이제 해설 속 표는 정오문제·문제풀이 어느 화면에서든 표로 나옵니다.

알려 주셔서 감사합니다.'),

('5140135c-4059-4804-acbf-2130d72f39a9',
'고쳤습니다. 정답·해설지에 객관식 해설이 함께 나옵니다.

객관식 해설은 대부분 문제 자체가 아니라 각 선지에 붙어 있는데(교재 해설편이 ①~⑤ 문단을 선지 해설로 싣습니다), 해설지를 만들 때 OX 문항만 선지 해설을 읽어 오고 객관식은 읽어 오지 않아 통째로 비어 보였습니다.

신고하신 「특허법 월말고사」는 객관식 30문항 중 28문항이 이제 해설과 함께 나옵니다. 남은 2문항(시험지 15번·23번)은 해설 자료 자체가 등록돼 있지 않아 따로 채워야 합니다.

학생용 오답노트 인쇄에도 같은 문제가 있어 함께 고쳤습니다. 알려 주셔서 감사합니다.'),

('107486a9-e0bc-49de-afe3-51fc9b48c1dc',
'고쳤습니다. 말씀하신 대로 같은 말은 함께 빈칸이 되도록 했습니다.

「하」 단계는 빈칸을 앞에서부터 절반만 가리다 보니, 제10조는 13칸 중 앞 7칸까지만 가려졌고 뒤에 남은 「심판장」 세 곳이 그대로 보여 답을 알려 주고 있었습니다. 「지식재산처장」도 한 곳이 같은 이유로 노출됐습니다.

이제 한 번 가린 말은 뒤에 몇 번 더 나오든 전부 함께 가립니다. 제10조 「하」 단계에서 가려지는 칸은 7칸에서 11칸으로 늘었습니다.

「이하 ○○이라 한다」는 법령에 흔한 형태라 다른 조문에도 같은 문제가 있었는데 이번에 함께 해결됐습니다. 정확히 짚어 주셔서 감사합니다.');

-- ① 신고자 인박스 알림 — 앱의 notifyReporterBugResolved 와 같은 모양.
insert into user_notifications
  (recipient_id, kind, entity_type, entity_id, title, body, href, payload)
select
  b.reporter_id,
  'bug_report_resolved',
  'bug_report',
  b.report_id,
  '신고하신 오류가 처리되었습니다',
  r.note || E'\n\n(신고 내용: ' ||
    case when length(b.message) > 200 then left(b.message, 200) || '…' else b.message end
    || ')',
  coalesce(nullif(regexp_replace(b.url, '^https?://[^/]+', ''), ''), '/me/inbox'),
  jsonb_build_object('url', b.url, 'note', r.note)
from resolve_batch r
join bug_reports b on b.report_id = r.report_id
where b.reporter_id is not null
  and b.status <> 'done';   -- 이미 done 이면 재알림 없음(앱과 동일)

-- ② 상태·처리쪽지·처리시각.
update bug_reports b
set status = 'done',
    resolution_note = r.note,
    resolved_at = now()
from resolve_batch r
where b.report_id = r.report_id
  and b.status <> 'done';

commit;
