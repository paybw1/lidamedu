create or replace function submit_patent_payment(
  _user_id uuid,
  _patent_id uuid,
  _process_id uuid,
  _amount integer,
  _payment_method text,
  _payment_ref text
)
returns void
language plpgsql
as $$
declare
  now_ts timestamp := now();
  due_date date := (now() + interval '1 year')::date;
begin
  -- 1. patents 테이블 업데이트
  update patents
  set status = 'prepare for filling',
      updated_at = now_ts
  where id = _patent_id;

  -- 2. processes_patents 업데이트
  update processes_patents
  set is_paid = true,
      paid_at = now_ts,
      payment_method = _payment_method,
      payment_ref = _payment_ref,
      status = 'paid',
      updated_at = now_ts
  where id = _process_id;

  -- 3. payments_patents insert
  insert into payments_patents (
    user_id, patent_id, process_id,
    amount, payment_method, paid_at, payment_ref,
    created_at, updated_at
  )
  values (
    _user_id, _patent_id, _process_id,
    _amount, _payment_method, now_ts, _payment_ref,
    now_ts, now_ts
  );

  -- 4. processes_patent_alarms insert
  insert into processes_patent_alarms (
    process_patent_id, type, scheduled_at,
    is_sent, created_at, updated_at
  )
  values
    (_process_id, '3_months', (due_date - interval '3 months')::date, false, now_ts, now_ts),
    (_process_id, '2_months', (due_date - interval '2 months')::date, false, now_ts, now_ts),
    (_process_id, '1_month',  (due_date - interval '1 month')::date,  false, now_ts, now_ts),
    (_process_id, '2_weeks',  (due_date - interval '14 days')::date,  false, now_ts, now_ts);
end;
$$;
