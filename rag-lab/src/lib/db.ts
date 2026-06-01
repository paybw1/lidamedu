/**
 * Supabase 클라이언트 — 본 실험 전용, **SELECT only**.
 *
 * service_role 키를 사용하지만 본 코드는 INSERT/UPDATE/DELETE/RPC 호출이 없다.
 * (검색/grep 으로 즉시 확인 가능 — 본 모듈은 클라이언트만 export.)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
// 본 import 는 **타입만** 가져온다(런타임 결합 0). production 코드는 import 하지 않는다.
import type { Database } from '../../../database.types.js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    'rag-lab/.env 에 SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.',
  );
}

export const db = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: 'public' },
});
