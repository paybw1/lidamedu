-- 5d/5e 착수 전 스키마 실측 (읽기 전용)
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public'
  and (table_name in ('bank_transfers','shipments','orders','shipping_settings','book_shipping_settings')
       or (table_name='profiles' and column_name in ('address','address_detail','postcode','zip','phone','name')))
order by table_name, ordinal_position;
