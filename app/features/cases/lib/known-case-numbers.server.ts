// 인용 허용 사건번호 집합 — citation-guard 의 `allowed` 를 채운다.
//
// ★"우리가 근거를 가진 번호" 의 정의(CLAUDE.md #12):
//   ① cases.case_number            우리가 전문을 보유한 판결
//   ② case_lower_courts.lower_case_number  상고심에 딸린 하급심(★cases 에는 없다)
//   실재하지만 우리 DB 에 없는 번호도 있으므로, 여기 없다고 "지어냄" 으로 단정하지 않는다 —
//   생성 단계에서는 **쓰지 못하게** 할 뿐이다(번호를 빼고 법리만 쓰게 한다).
//
// 한 번 로드해 재사용한다(문항마다 부르지 말 것 — 수천 행이다).

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "database.types";

import { flattenCaseNo } from "./citation-guard";

const PAGE = 1000;

/** 한 칸에 "2005후3284, 2005후3291" 처럼 여러 건이 들어 있는 행이 있다. */
const SPLIT = /[,·/]/;

export async function loadKnownCaseNumbers(
  client: SupabaseClient<Database>,
): Promise<Set<string>> {
  const known = new Set<string>();
  const sources = [
    { table: "cases", column: "case_number" },
    { table: "case_lower_courts", column: "lower_case_number" },
  ] as const;

  for (const { table, column } of sources) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await client
        .from(table)
        .select(column)
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`${table}.${column}: ${error.message}`);
      const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
      for (const row of rows) {
        for (const part of String(row[column] ?? "").split(SPLIT)) {
          const flat = flattenCaseNo(part);
          if (flat) known.add(flat);
        }
      }
      if (rows.length < PAGE) break;
    }
  }
  return known;
}
