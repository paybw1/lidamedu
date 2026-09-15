do $do$
declare
  v_author uuid := 'e20ac99a-bfa6-4862-94dd-23c063189463'::uuid;
  v_title  text := '환불 규정 개정 안내 (2026년 9월 15일 시행)';
  v_md     text := $md$환불 규정 일부가 개정되었습니다. 환불·해지 신청은 고객센터(☏ 02-594-8881)로 접수하며, **결제 후 3일 이내 전액 환불은 종전과 같습니다.**

**① 환불·해지 신청은 고객센터로 접수합니다**

종전에는 「내 구독」 화면에서 직접 신청하셨으나, 앞으로는 고객센터(전화 02-594-8881 · 카카오톡 · 1:1 문의 · 방문)로 신청해 주시면 담당자가 결제·이용 내역을 확인한 뒤 처리해 드립니다. 처리 결과는 「내 구독」·「주문 내역」 화면에서 확인하실 수 있습니다.

**② 결제 후 3일 이내 전액 환불은 종전과 같습니다**

결제일로부터 3일(72시간) 이내에 신청하시면 전액 환불해 드립니다. 환불 처리가 완료되는 때에 구독이 종료되며, 신청일부터 3영업일 이내에 환급 처리합니다(카드사·결제사 반영에는 수일이 더 걸릴 수 있습니다).

**③ 3일이 지난 뒤에는 「내 구독」에서 직접 해지하실 수 있습니다**

해지하시면 다음 갱신일부터 청구되지 않고, 이미 결제하신 기간은 만료일까지 그대로 이용하실 수 있습니다.

전액 환불을 받으실 권리는 달라지지 않았고, 신청 방법만 고객센터 접수로 바뀌었습니다. 개정 전문은 [환불 규정](/legal/refund-policy) 페이지에서 보실 수 있습니다.

문의 ☏ 02-594-8881$md$;
  v_prev   text := $prev$환불 규정 일부가 개정되었습니다. 환불·해지 신청은 고객센터(☏ 02-594-8881)로 접수하며, 결제 후 3일 이내 전액 환불은 종전과 같습니다. ① 환불·해지 신청은 고객센터로 접수합니다 종전에는 「내 구독」 …$prev$;
  v_id     uuid;
  v_n      int;
  v_out    jsonb;
begin
  insert into announcements (title, body_md, body_html, author_id,
                             audience_kind, platform_scope, is_pinned, published_at)
  values (v_title, v_md, '', v_author, 'all', 'study', true, now())
  returning announcement_id into v_id;

  insert into user_notifications (recipient_id, kind, entity_type, entity_id,
                                  title, body, href, payload)
  select p.profile_id, 'announcement', 'announcement', v_id,
         v_title, v_prev, '/announcements', null
  from profiles p;
  get diagnostics v_n = row_count;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (v_author, 'admin', 'announcement.create', 'announcement', v_id,
          jsonb_build_object('title', v_title, 'publish', true, 'audienceKind', 'all'));

  v_out := jsonb_build_object('announcementId', v_id, 'notified', v_n,
                              'mdLen', length(v_md), 'preview', v_prev);
  raise notice 'APPLIED %', v_out::text;
end $do$;