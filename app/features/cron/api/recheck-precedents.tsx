// feat-7-037 — 판례 전문 자동 재확인·적재 cron.
// 미적재 판례를 국가법령정보 OPEN API 에 재확인 → 등록됐으면 전문+PDF 적재 + RAG 재인덱스.
// 대상: 대법원(최근 5년) = 영구 재확인 / 대법원 외 = 1회 시도 후 실패 시 unavailable 제외.
// 호출: Vercel cron 일1회(Hobby) `?limit=`. 인증: CRON_SECRET (embed-chunks 동일 패턴).
// LAW_API_KEY 미설정 → dry-run(대상 수만 보고).

import { data } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import { reindexCases } from "~/features/ai-qna/lib/source-chunker.server";
import {
  fetchOfficialText,
  renderAndStorePdf,
} from "~/features/cases/lib/precedent-import.server";

import type { Route } from "./+types/recheck-precedents";

const RECHECK_YEARS = 5; // 대법원 영구 재확인 범위(선고일)
const API_INTERVAL_MS = 500; // OPEN API 호출 간격(일 한도 보호)

function checkAuth(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const url = new URL(request.url);
  if (url.searchParams.get("secret") === expected) return true;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

function cutoffDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - RECHECK_YEARS);
  return d.toISOString().slice(0, 10);
}

async function run(request: Request) {
  if (!checkAuth(request)) return data({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const limit = Math.min(
    20,
    Math.max(1, Number(url.searchParams.get("limit") ?? 5)),
  );
  const cutoff = cutoffDate();

  // 재확인 대상: 미적재 + 미제외 + (대법원·최근5년 OR 대법원 외 1회시도).
  const { data: due, error } = await adminClient
    .from("cases")
    .select(
      "case_id, case_number, case_title, court, decided_at, law_api_serial_id, official_text_check_count",
    )
    .is("official_text_md", null)
    .is("deleted_at", null)
    .eq("official_text_unavailable", false)
    .or(
      `and(court.eq.supreme,decided_at.gte.${cutoff}),court.neq.supreme,court.is.null`,
    )
    .order("official_text_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) return data({ error: error.message }, { status: 500 });

  if (!process.env.LAW_API_KEY) {
    return data({
      ok: true,
      mode: "dry-run",
      reason: "LAW_API_KEY not set",
      dueInBatch: due?.length ?? 0,
      cutoff,
    });
  }

  const now = new Date().toISOString();
  let recovered = 0;
  let notRegistered = 0;
  let excluded = 0;
  let errors = 0;
  const recoveredCases: string[] = [];

  for (let i = 0; i < (due?.length ?? 0); i++) {
    const c = due![i];
    const nextCount = (c.official_text_check_count ?? 0) + 1;
    try {
      const res = await fetchOfficialText(c.case_number ?? "", {
        serialId: c.law_api_serial_id,
      });

      if (res.status === "ok") {
        await adminClient
          .from("cases")
          .update({
            official_text_md: res.textMd,
            law_api_serial_id: res.serialId,
            official_text_checked_at: now,
            official_text_check_count: nextCount,
            updated_at: now,
          })
          .eq("case_id", c.case_id);
        // PDF 렌더(best-effort) + RAG 재인덱스(학습 활성화).
        await renderAndStorePdf(adminClient, c.case_id, res.textMd, {
          caseNumber: c.case_number,
          caseTitle: c.case_title,
          court: c.court,
          decidedAt: c.decided_at,
        });
        try {
          await reindexCases([c.case_id]);
        } catch {
          // best-effort — 다음 embed cron 이 dirty 로 재처리.
        }
        recovered++;
        recoveredCases.push(c.case_number ?? c.case_id);
      } else {
        // 실패 — checked_at·count 갱신. 대법원 외는 1회 시도 후 제외.
        const exclude = c.court !== "supreme";
        await adminClient
          .from("cases")
          .update({
            official_text_checked_at: now,
            official_text_check_count: nextCount,
            ...(exclude ? { official_text_unavailable: true } : {}),
            updated_at: now,
          })
          .eq("case_id", c.case_id);
        if (res.status === "api_error") errors++;
        else notRegistered++;
        if (exclude) excluded++;
      }
    } catch {
      errors++;
    }
    if (i < due!.length - 1)
      await new Promise((r) => setTimeout(r, API_INTERVAL_MS));
  }

  return data({
    ok: true,
    mode: "live",
    cutoff,
    checked: due?.length ?? 0,
    recovered,
    notRegistered,
    excluded,
    errors,
    recoveredCases,
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  return run(request);
}
export async function action({ request }: Route.ActionArgs) {
  return run(request);
}
