-- feat-7-046 Stage 5(B) — 발송 로그. 메일(Resend)·알림톡(Solapi) 은 fire-and-forget 라
-- "누구에게 무엇을 언제 보냈다"는 기록이 없었다. 발송 지점에서 성공/실패를 append-only 기록한다.
-- 회원 CRM 발송 탭·운영 감사에 사용. 쓰기는 서버 권위(service_role), 읽기는 staff.

create table if not exists public.message_send_logs (
  log_id uuid primary key default gen_random_uuid(),
  recipient_id uuid references public.profiles(profile_id) on delete set null,
  channel text not null,   -- 'email' | 'kakao' | 'sms'
  provider text not null,  -- 'resend' | 'solapi'
  kind text,               -- 템플릿/리포트 종류 (new-answer, weekly_report_student 등)
  to_address text,         -- 이메일 또는 전화번호
  subject text,
  status text not null,    -- 'sent' | 'failed'
  error text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists message_send_logs_recipient_idx
  on public.message_send_logs(recipient_id, created_at desc);

alter table public.message_send_logs enable row level security;

drop policy if exists message_send_logs_select on public.message_send_logs;
create policy message_send_logs_select on public.message_send_logs
  for select using (private.is_staff(auth.uid()));

-- 쓰기(발송 기록)는 서버 권위(service_role = adminClient)만 — 별도 policy 없음.
