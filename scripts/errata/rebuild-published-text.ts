// 이미 발행된 정오표 항목의 "변경 전 / 변경 후" 문구 재계산.
//
// payload 는 **발행 시점에 굳어 저장**된다. 그래서 문구 생성 규칙을 고쳐도 기존 항목은
// 옛 문구 그대로 남는다. 원장 스냅샷(content_revisions.before/after_snapshot)에서 지금
// 규칙(revisionDiffText)으로 다시 만들어 갈아끼운다.
//
// ★원장이 발행 모달에서 **손으로 고쳐 쓴 문구는 덮지 않는다** — 옛 규칙(둘 중 하나)의
//   결과와 정확히 일치할 때만 교체하고, 다르면 건너뛰고 보고한다.
//   ① 2026-08-21 이전 규칙: 열거형만 라벨, boolean 이 true/false 로 찍히던 것
//   ② 발행 모달 프리필: snapshotFieldText 는 쓰되 구간 라벨·정답 O/X 가 없던 것
//      (단건 발행은 모달 문구를 그대로 실었다 — P-6099)
//
// ★content_revisions 는 append-only 지만 변경 실체(스냅샷·changed_fields)만 불변이고
//   errata_payload 같은 서술 필드는 수정 가능하다(trg_revision_append_only).
//
// 사용:
//   npx tsx scripts/errata/rebuild-published-text.ts            # 예행
//   npx tsx scripts/errata/rebuild-published-text.ts --apply    # 반영 + 시트 재렌더

import "dotenv/config";

import type { Json } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import { diffLines } from "~/core/lib/diff-lines";
import {
  diffFields,
  joinFieldDiffs,
  revisionDiffText,
  sectionLabel,
  snapshotFieldText,
} from "~/features/errata/lib/revision-diff-text";
import {
  editionIdsForRevisions,
  regenerateErrataSheets,
} from "~/features/errata/pdf/regenerate.server";
import {
  CHOICE_TYPE_LABEL,
  FORMAT_LABEL,
  ORIGIN_LABEL,
  POLARITY_LABEL,
  SCOPE_LABEL,
  SUBJECTIVE_KIND_LABEL,
} from "~/features/problems/labels";

const APPLY = process.argv.includes("--apply");

interface Snapshots {
  before_snapshot: unknown;
  after_snapshot: unknown;
  changed_fields: string[] | null;
}

/**
 * 옛 필드 선정 — 원시 UUID 필드(related_article_id 등)를 아직 숨기지 않던 시절.
 * ★지금 diffFields 로 옛 문구를 재현하면 저장본과 어긋나 "사람이 쓴 문구"로 오판한다.
 */
function legacyDiffFields(changed: string[] | null): string[] {
  const set = new Set(changed ?? []);
  if (set.has("body_text") && set.has("body_json")) set.delete("body_json");
  set.delete("search_tsv");
  return [...set].sort();
}

// ── 옛 규칙 ① (2026-08-21 이전) — 열거형만 라벨, 그 밖엔 원시값 ─────────────
const LEGACY_ENUM: Record<string, Record<string, string>> = {
  scope: SCOPE_LABEL,
  polarity: POLARITY_LABEL,
  format: FORMAT_LABEL,
  origin: ORIGIN_LABEL,
  subjective_kind: SUBJECTIVE_KIND_LABEL,
  choice_type: CHOICE_TYPE_LABEL,
};
function legacyField(snapshot: unknown, field: string): string {
  if (snapshot == null || typeof snapshot !== "object") return "";
  const v = (snapshot as Record<string, unknown>)[field];
  if (v == null) return "";
  const labels = LEGACY_ENUM[field];
  if (labels && typeof v === "string" && labels[v]) return labels[v];
  return typeof v === "string" ? v : JSON.stringify(v, null, 1);
}
function legacyTextV1(rev: Snapshots) {
  return joinFieldDiffs(
    legacyDiffFields(rev.changed_fields).map((field) => ({
      beforeText: legacyField(rev.before_snapshot, field),
      afterText: legacyField(rev.after_snapshot, field),
    })),
  );
}

// ── 옛 규칙 ② — 발행 모달 프리필(구간 라벨·정답 O/X 없음) ────────────────────
function legacyTextV2(rev: Snapshots) {
  return joinFieldDiffs(
    legacyDiffFields(rev.changed_fields).map((field) => ({
      beforeText: snapshotFieldText(rev.before_snapshot, field),
      afterText: snapshotFieldText(rev.after_snapshot, field),
    })),
  );
}

const same = (a: string, b: string) => a.trim() === b.trim();

/**
 * 기계가 쓴 문구인지 가릴 때만 쓰는 정규화 — **규칙이 기계적으로 넣고 빼는 것**을 지운다.
 *   · 구간 라벨 「[지문] 」·「[해설] 」 — 이번에 새로 붙는 것
 *   · 뜻 없는 UUID 줄(옛 규칙이 그대로 싣던 related_*_id)
 *   · 새로 생긴 「없음」·「삭제」 표시
 * 이것들을 걷어내고도 문장이 같으면 사람이 손댄 게 아니다.
 */
const UUID_LINE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MARK_LINE = /^(?:[[^]]+]s*)?(?:없음|삭제)$/;
const TAG_PREFIX = /^\[[^\]]+\]\s*/;
function normalizeForMachineCheck(text: string): string {
  return text
    .split("\n")
    .map((l) => l.trim().replace(TAG_PREFIX, ""))
    .filter((l) => l && !UUID_LINE.test(l) && !MARK_LINE.test(l))
    .join("\n");
}
const sameIgnoringMarks = (a: string, b: string) =>
  normalizeForMachineCheck(a) === normalizeForMachineCheck(b);

/**
 * 사람이 고쳐 쓴 문구에는 **구간 라벨만 얹는다** — 문장은 그대로 둔다.
 * 문제집과 해설집이 따로 있어 어느 책 얘기인지는 반드시 보여야 하지만, 원장이 다듬은
 * 문장을 기계가 되돌리면 안 된다. 바뀐 구간이 하나로 특정될 때만 손댄다.
 */
function prependLabel(text: string, tag: string): string {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l.trim());
  if (i < 0) return text;
  if (lines[i].trimStart().startsWith("[")) return text; // 이미 붙어 있다
  lines[i] = `[${tag}] ${lines[i].trimStart()}`;
  return lines.join("\n");
}

/** 이 revision 이 가리키는 구간 라벨 — 하나로 특정될 때만 값을 준다. */
function soleSectionTag(rev: Snapshots): string | null {
  const tags = new Set<string>();
  for (const field of diffFields(rev.changed_fields ?? [])) {
    const tag =
      sectionLabel(field, rev.after_snapshot) ??
      sectionLabel(field, rev.before_snapshot);
    if (tag) tags.add(tag);
  }
  return tags.size === 1 ? [...tags][0] : null;
}

async function main(): Promise<void> {
  const { data: revs, error } = await adminClient
    .from("content_revisions")
    .select(
      "revision_id, content_type, errata_title, errata_payload, before_snapshot, after_snapshot, changed_fields, withdraws_revision_id",
    )
    .eq("notice_status", "published");
  if (error) throw error;

  const changed: { revisionId: string; title: string; payload: Json }[] = [];
  const skipped: string[] = [];
  const relabeled: string[] = [];
  const report: string[] = [];

  for (const r of revs ?? []) {
    if (r.withdraws_revision_id) continue; // 철회 고지 행은 본문이 없다
    if (r.content_type === "dohae") continue; // 도해는 구간 라벨 개념이 없다 — 규칙 변화 없음
    const payload = (r.errata_payload ?? {}) as Record<string, unknown>;
    const curB = typeof payload.before_text === "string" ? payload.before_text : "";
    const curA = typeof payload.after_text === "string" ? payload.after_text : "";
    const next = revisionDiffText(r);
    if (same(curB, next.beforeText) && same(curA, next.afterText)) continue;

    const v1 = legacyTextV1(r);
    const v2 = legacyTextV2(r);
    const machineWritten =
      (same(curB, v1.beforeText) && same(curA, v1.afterText)) ||
      (same(curB, v2.beforeText) && same(curA, v2.afterText)) ||
      // 2026-08-21 규칙(구간 라벨은 있으나 UUID 를 싣고 「없음」이 없던 것)
      (sameIgnoringMarks(curB, next.beforeText) &&
        sameIgnoringMarks(curA, next.afterText));
    if (!machineWritten) {
      // 문장은 원장 것이다 — 구간 라벨만 얹어 어느 책 얘기인지 드러낸다.
      const tag = soleSectionTag(r);
      const labeledB = tag ? prependLabel(curB, tag) : curB;
      const labeledA = tag ? prependLabel(curA, tag) : curA;
      if (tag && (labeledB !== curB || labeledA !== curA)) {
        changed.push({
          revisionId: r.revision_id,
          title: r.errata_title ?? "",
          payload: {
            ...payload,
            before_text: labeledB,
            after_text: labeledA,
          } as Json,
        });
        relabeled.push(
          `  ${r.errata_title} (${r.revision_id.slice(0, 8)}) — [${tag}] 만 얹음(문장 보존)`,
        );
        continue;
      }
      skipped.push(`${r.errata_title} (${r.revision_id.slice(0, 8)})`);
      continue;
    }
    changed.push({
      revisionId: r.revision_id,
      title: r.errata_title ?? "",
      payload: {
        ...payload,
        before_text: next.beforeText,
        after_text: next.afterText,
      } as Json,
    });
    report.push(
      `  ${r.errata_title} (${r.revision_id.slice(0, 8)}) ${JSON.stringify(r.changed_fields)}\n` +
        `     전: ${next.beforeText.replace(/\n/g, " ⏎ ").slice(0, 120)}\n` +
        `     후: ${next.afterText.replace(/\n/g, " ⏎ ").slice(0, 120)}`,
    );
  }

  console.log(
    `발행분 ${(revs ?? []).length}건 · 문구 갱신 ${changed.length}건 · 손으로 쓴 문구라 건너뜀 ${skipped.length}건`,
  );
  if (report.length) console.log("\n[갱신]\n" + report.join("\n"));
  if (relabeled.length)
    console.log(
      "\n[구간 라벨만 추가 — 원장 문구는 그대로]\n" + relabeled.join("\n"),
    );
  if (skipped.length) console.log("\n[건너뜀 — 사람이 고쳐 쓴 문구]\n  " + skipped.join("\n  "));

  if (!APPLY) {
    console.log("\n--apply 를 붙이면 반영하고 시트를 다시 렌더합니다.");
    return;
  }
  if (changed.length === 0) return;

  for (const c of changed) {
    const { error: uErr } = await adminClient
      .from("content_revisions")
      .update({ errata_payload: c.payload })
      .eq("revision_id", c.revisionId);
    if (uErr) throw uErr;
  }
  // 갱신된 항목이 실린 교재만 다시 렌더한다.
  const editions = await editionIdsForRevisions(changed.map((c) => c.revisionId));
  console.log(`\n반영 ${changed.length}건 · 시트 재렌더 ${editions.length}종`);
  console.log(JSON.stringify(await regenerateErrataSheets(editions), null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
