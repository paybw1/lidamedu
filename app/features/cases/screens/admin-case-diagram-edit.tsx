// feat-2-035 — 판례 도식 편집(staff). 사실관계 + 쟁점 블록(법조문·법리 4축·포섭·결론).
//
// ★AI 초안은 "쟁점~결론"만 만든다. 사실관계의 근거는 하급심 판결문이고 그 전문은 로컬 캐시라
//   서버리스 런타임에서 읽을 수 없다 — 사실관계는 배치 스크립트가 채우거나 여기서 직접 쓴다.
//   설계 §2 소스 이원화(사실관계=하급심 / 쟁점~결론=대법원)와 같은 경계다.
import type { Route } from "./+types/admin-case-diagram-edit";

import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Form,
  Link,
  data,
  redirect,
  useNavigation,
  useSearchParams,
} from "react-router";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { draftCaseDiagramBlocks } from "~/features/cases/lib/ai-case-diagram-drafter.server";
import {
  type CaseDiagramBlock,
  DOCTRINE_AXES,
  DOCTRINE_AXIS_KEYS,
  DOCTRINE_AXIS_LABEL,
  FACTS_SOURCE_KINDS,
  FACTS_SOURCE_LABEL,
  type FactsSourceKind,
  caseDiagramBlocksSchema,
  diagramApprovable,
  emptyBlock,
  moveDoctrineAxis,
  moveDoctrinePart,
} from "~/features/cases/lib/case-diagram";
import {
  approveCaseDiagram,
  getCaseDiagramEditContext,
  getDiagramNeighbors,
  rejectCaseDiagram,
  replaceCaseDiagramBlocks,
  softDeleteCaseDiagram,
  updateCaseDiagramBlocksByStaff,
  updateCaseDiagramFactsByStaff,
  upsertCaseDiagram,
} from "~/features/cases/queries-case-diagram.server";
import { Chip } from "~/features/community/components/community-ui";
import {
  capBlockedMessage,
  checkAiCap,
  notifyCapReachedOnce,
  recordAiUsage,
} from "~/features/gs/lib/usage-tracker.server";
import { getStaffRole } from "~/features/laws/queries.server";

const MIN_OFFICIAL_TEXT = 200;

export const meta: Route.MetaFunction = () => [
  { title: "판례 도식 편집 | 리담변리사학원" },
];

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  if (!params.caseId) throw data("Not found", { status: 404 });
  const backRaw = new URL(request.url).searchParams.get("back") ?? "";
  const [ctx, neighbors] = await Promise.all([
    getCaseDiagramEditContext(client, params.caseId),
    getDiagramNeighbors(client, params.caseId, backRaw),
  ]);
  if (!ctx) throw data("Not found", { status: 404 });
  return {
    role,
    neighbors,
    kase: {
      ...ctx.kase,
      // 전문은 화면에서 쓰지 않는다(길이만 필요) — 페이로드 절감.
      officialTextMd: null,
      officialTextLen: ctx.kase.officialTextMd?.trim().length ?? 0,
    },
    diagram: ctx.diagram,
  };
}

// ── 도식 패널 인라인 편집 ───────────────────────────────────────────────
// 셋 다 **바꾸는 칸만** 싣는다 — 본문 전체를 보내지 않아 다른 탭의 편집을 덮지 않는다.
const factsSchema = z.object({ factsMd: z.string().trim().max(20_000) });
// 패널에서 한 칸씩 고칠 수 있는 필드. statutes 는 쉼표 구분 문자열로 오간다.
const BLOCK_FIELDS = [
  "issue",
  "statutes",
  "application",
  "conclusion",
  "comment",
] as const;
const BLOCK_FIELD_LABEL: Record<(typeof BLOCK_FIELDS)[number], string> = {
  issue: "쟁점",
  statutes: "법조문",
  application: "사안의 포섭",
  conclusion: "결론",
  comment: "코멘트",
};
// 법리는 4축 중첩이라 별도 — field 하나로 뭉치면 "doctrine.textual" 같은 경로 문자열을
// 파싱해야 해서 오히려 검증이 헐거워진다.
const doctrineSchema2 = z.object({
  blockIndex: z.number().int().min(0).max(99),
  axis: z.enum(DOCTRINE_AXIS_KEYS),
  value: z.string().trim().max(20_000),
});

const blockFieldSchema = z.object({
  blockIndex: z.number().int().min(0).max(99),
  field: z.enum(BLOCK_FIELDS),
  value: z.string().max(20_000),
});

const deleteBlockSchema = z.object({
  blockIndex: z.number().int().min(0).max(99),
});

const moveSchema = z.object({
  blockIndex: z.number().int().min(0).max(99),
  from: z.enum(DOCTRINE_AXIS_KEYS),
  to: z.enum(DOCTRINE_AXIS_KEYS),
});

// 축 안의 갈래 하나만 옮기기 — 번호로 묶인 서술을 다시 나눈다.
const movePartSchema = moveSchema.extend({
  partIndex: z.number().int().min(0).max(19),
});

const saveSchema = z.object({
  factsMd: z.string().trim().max(20000),
  factsSourceKind: z.enum(FACTS_SOURCE_KINDS),
  factsSourceRef: z.string().trim().max(200),
  blocksJson: z.string(),
});

export async function action({ request, params }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");
  const caseId = params.caseId;
  if (!caseId) return data({ error: "Not found" }, { status: 404 });

  if (intent === "save") {
    const parsed = saveSchema.safeParse({
      factsMd: fd.get("factsMd") ?? "",
      factsSourceKind: fd.get("factsSourceKind") ?? "none",
      factsSourceRef: fd.get("factsSourceRef") ?? "",
      blocksJson: fd.get("blocksJson") ?? "[]",
    });
    if (!parsed.success) return data({ error: "입력값이 올바르지 않습니다." });

    let rawBlocks: unknown;
    try {
      rawBlocks = JSON.parse(parsed.data.blocksJson);
    } catch {
      return data({ error: "쟁점 데이터를 읽지 못했습니다." });
    }
    const blocks = caseDiagramBlocksSchema.safeParse(rawBlocks);
    if (!blocks.success) {
      return data({ error: "쟁점은 2자 이상 입력해야 합니다." });
    }
    await upsertCaseDiagram(client, {
      caseId,
      factsMd: parsed.data.factsMd,
      factsSourceKind: parsed.data.factsSourceKind,
      factsSourceRef: parsed.data.factsSourceRef || null,
      blocks: blocks.data,
      generatedBy: "staff",
      userId: user.id,
    });
    return data({ ok: "저장했습니다. (검수 대기 상태)" });
  }

  if (intent === "draft") {
    const ctx = await getCaseDiagramEditContext(client, caseId);
    if (!ctx)
      return data({ error: "판례를 찾지 못했습니다." }, { status: 404 });
    const officialText = ctx.kase.officialTextMd?.trim() ?? "";
    if (officialText.length < MIN_OFFICIAL_TEXT) {
      return data({
        error:
          "판례 전문이 없거나 너무 짧아 초안을 만들 수 없습니다. 직접 작성해 주세요.",
      });
    }
    const cap = await checkAiCap();
    if (cap.blocked) {
      await recordAiUsage({
        kind: "ai_case_diagram_draft",
        model: "claude-opus-4-7",
        inputTokens: 0,
        outputTokens: 0,
        outcome: "skipped_cap",
        meta: { userId: user.id },
        reason: cap.reason,
      });
      runAfterResponse(notifyCapReachedOnce(cap));
      return data({ error: capBlockedMessage(cap) }, { status: 503 });
    }
    const blocks = await draftCaseDiagramBlocks({
      caseTitle: ctx.kase.caseTitle,
      caseNumber: ctx.kase.caseNumber,
      court: ctx.kase.court,
      decidedAt: ctx.kase.decidedAt,
      officialTextMd: officialText,
      summaryItems: ctx.kase.summaryItems,
      usage: { meta: { userId: user.id } },
    });
    if (!blocks) {
      return data({
        error: "AI 초안 생성에 실패했습니다. 다시 시도해 주세요.",
      });
    }
    await replaceCaseDiagramBlocks(client, {
      caseId,
      blocks,
      userId: user.id,
    });
    return data({ ok: `쟁점 ${blocks.length}개 초안을 생성했습니다.` });
  }

  // 법리 축 재분류 — 도식 패널(시트/팝업)에서 칩 하나로 옮긴다. 전체 저장과 달리
  //   본문을 싣지 않아, 다른 탭에서 편집 중인 내용을 덮어쓰지 않는다.
  // 쟁점 하나 삭제 — 도식 패널(판례 화면)에서 바로 지운다.
  //   ★마지막 하나는 지우지 않는다 — 쟁점 0개인 도식은 승인도 안 되고 화면에서
  //     "아직 쟁점이 정리되지 않았습니다" 만 남는 반쪽 상태가 된다. 그 경우는
  //     도식 자체를 지우는 게 맞아서 그렇게 안내한다.
  if (intent === "delete_block") {
    const parsed = deleteBlockSchema.safeParse({
      blockIndex: Number(fd.get("blockIndex")),
    });
    if (!parsed.success)
      return data({ error: "삭제 대상이 올바르지 않습니다." });
    const ctx = await getCaseDiagramEditContext(client, caseId);
    if (!ctx?.diagram) return data({ error: "도식이 없습니다." });
    const blocks = ctx.diagram.blocks;
    const target = blocks[parsed.data.blockIndex];
    if (!target) return data({ error: "쟁점을 찾지 못했습니다." });
    if (blocks.length <= 1) {
      return data({
        error:
          "마지막 쟁점은 지울 수 없습니다 — 검수 화면의 「도식 삭제」를 쓰세요.",
      });
    }
    await updateCaseDiagramBlocksByStaff(client, {
      diagramId: ctx.diagram.diagramId,
      blocks: blocks.filter((_, i) => i !== parsed.data.blockIndex),
    });
    return data({ ok: `쟁점 ${parsed.data.blockIndex + 1} 을 지웠습니다.` });
  }

  // 한 축에 번호로 묶인 갈래 중 **하나만** 다른 축으로. 남는 쪽은 다시 번호를 매긴다.
  if (intent === "move_doctrine_part") {
    const moved = movePartSchema.safeParse({
      blockIndex: Number(fd.get("blockIndex")),
      from: fd.get("from"),
      to: fd.get("to"),
      partIndex: Number(fd.get("partIndex")),
    });
    if (!moved.success)
      return data({ error: "이동 대상이 올바르지 않습니다." });
    const ctx = await getCaseDiagramEditContext(client, caseId);
    if (!ctx?.diagram) return data({ error: "도식이 없습니다." });
    const blocks = ctx.diagram.blocks;
    const target = blocks[moved.data.blockIndex];
    if (!target) return data({ error: "쟁점을 찾지 못했습니다." });
    const nextBlock = moveDoctrinePart(
      target,
      moved.data.from,
      moved.data.to,
      moved.data.partIndex,
    );
    // 화면이 본 갈래 수와 서버가 센 것이 다르면(다른 탭에서 이미 옮겼다면) 아무 일도 안 일어난다.
    if (nextBlock === target)
      return data({
        error: "그 갈래를 찾지 못했습니다 — 새로고침 후 다시 시도하세요.",
      });
    await updateCaseDiagramBlocksByStaff(client, {
      diagramId: ctx.diagram.diagramId,
      blocks: blocks.map((b, i) =>
        i === moved.data.blockIndex ? nextBlock : b,
      ),
    });
    return data({
      ok: `${moved.data.partIndex + 1}번 갈래를 ${DOCTRINE_AXIS_LABEL[moved.data.to]} 로 옮겼습니다.`,
    });
  }

  if (intent === "move_doctrine") {
    const moved = moveSchema.safeParse({
      blockIndex: Number(fd.get("blockIndex")),
      from: fd.get("from"),
      to: fd.get("to"),
    });
    if (!moved.success)
      return data({ error: "이동 대상이 올바르지 않습니다." });
    const ctx = await getCaseDiagramEditContext(client, caseId);
    if (!ctx?.diagram) return data({ error: "도식이 없습니다." });
    const blocks = ctx.diagram.blocks;
    const target = blocks[moved.data.blockIndex];
    if (!target) return data({ error: "쟁점을 찾지 못했습니다." });
    const next = blocks.map((b, i) =>
      i === moved.data.blockIndex
        ? moveDoctrineAxis(b, moved.data.from, moved.data.to)
        : b,
    );
    await updateCaseDiagramBlocksByStaff(client, {
      diagramId: ctx.diagram.diagramId,
      blocks: next,
    });
    return data({
      ok: `${DOCTRINE_AXIS_LABEL[moved.data.from]} → ${DOCTRINE_AXIS_LABEL[moved.data.to]} 로 옮겼습니다.`,
    });
  }

  // 사실관계 저장 — 도식 패널 인라인.
  if (intent === "set_facts") {
    const parsed = factsSchema.safeParse({ factsMd: fd.get("factsMd") ?? "" });
    if (!parsed.success) return data({ error: "사실관계가 너무 깁니다." });
    const ctx = await getCaseDiagramEditContext(client, caseId);
    if (!ctx?.diagram) return data({ error: "도식이 없습니다." });
    await updateCaseDiagramFactsByStaff(client, {
      diagramId: ctx.diagram.diagramId,
      factsMd: parsed.data.factsMd,
    });
    return data({ ok: "사실관계를 저장했습니다." });
  }

  // 쟁점 블록의 한 칸만 저장 — 도식 패널(시트/팝업) 인라인 편집 공용.
  //   ★본문을 통째로 싣지 않는다 — 다른 탭에서 검수 화면을 열어 둔 채여도 덮어쓰지 않는다.
  if (intent === "set_block_field") {
    const parsed = blockFieldSchema.safeParse({
      blockIndex: Number(fd.get("blockIndex")),
      field: fd.get("field"),
      value: fd.get("value") ?? "",
    });
    if (!parsed.success) {
      return data({ error: "입력값이 올바르지 않습니다." });
    }
    const { blockIndex, field, value } = parsed.data;
    // 쟁점은 도식의 뼈대라 비울 수 없다(빈 쟁점 블록은 의미가 없다 — 스키마와 같은 규칙).
    if (field === "issue" && value.trim().length < 2) {
      return data({ error: "쟁점을 2자 이상 입력하세요." });
    }
    const ctx = await getCaseDiagramEditContext(client, caseId);
    if (!ctx?.diagram) return data({ error: "도식이 없습니다." });
    if (!ctx.diagram.blocks[blockIndex]) {
      return data({ error: "쟁점을 찾지 못했습니다." });
    }
    const next = ctx.diagram.blocks.map((b, i) => {
      if (i !== blockIndex) return b;
      // 법조문은 쉼표 구분 문자열로 받아 배열로 되돌린다(패널 입력 형식 = 검수 화면과 동일).
      if (field === "statutes") {
        return {
          ...b,
          statutes: value
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        };
      }
      return { ...b, [field]: value.trim() };
    });
    await updateCaseDiagramBlocksByStaff(client, {
      diagramId: ctx.diagram.diagramId,
      blocks: next,
    });
    return data({ ok: `${BLOCK_FIELD_LABEL[field]}을(를) 저장했습니다.` });
  }

  // 법리 한 축 저장 — 도식 패널 인라인.
  if (intent === "set_doctrine") {
    const parsed = doctrineSchema2.safeParse({
      blockIndex: Number(fd.get("blockIndex")),
      axis: fd.get("axis"),
      value: fd.get("value") ?? "",
    });
    if (!parsed.success) return data({ error: "입력값이 올바르지 않습니다." });
    const { blockIndex, axis, value } = parsed.data;
    const ctx = await getCaseDiagramEditContext(client, caseId);
    if (!ctx?.diagram) return data({ error: "도식이 없습니다." });
    if (!ctx.diagram.blocks[blockIndex]) {
      return data({ error: "쟁점을 찾지 못했습니다." });
    }
    const next = ctx.diagram.blocks.map((b, i) => {
      if (i !== blockIndex) return b;
      const doctrine = { ...b.doctrine };
      // ★빈 값이면 키를 지운다 — 빈 문자열로 두면 filledAxes 가 '있는 축'으로 세어
      //   화면에 빈 축이 남는다(근거 없는 축을 만들지 않는다는 설계).
      if (value) doctrine[axis] = value;
      else delete doctrine[axis];
      return { ...b, doctrine };
    });
    await updateCaseDiagramBlocksByStaff(client, {
      diagramId: ctx.diagram.diagramId,
      blocks: next,
    });
    return data({
      ok: `${DOCTRINE_AXIS_LABEL[axis]}${value ? "을(를) 저장했습니다." : " 축을 비웠습니다."}`,
    });
  }

  if (intent === "approve") {
    const ctx = await getCaseDiagramEditContext(client, caseId);
    if (!ctx?.diagram) return data({ error: "도식이 없습니다." });
    if (!diagramApprovable(ctx.diagram.blocks)) {
      return data({
        error:
          "쟁점이 1개 이상 있어야 하고, 각 쟁점에 결론이 있어야 승인됩니다.",
      });
    }
    await approveCaseDiagram(client, {
      diagramId: ctx.diagram.diagramId,
      userId: user.id,
    });
    // ★도식은 staff 전용(2026-08-23 원장 지시) — 승인해도 학생에게는 안 보인다.
    //   승인은 '검수 완료' 표시로만 쓰인다. 학생 공개로 되돌리면 문구도 함께 고칠 것.
    return data({ ok: "승인(검수 완료) 했습니다." });
  }

  if (intent === "reject") {
    const ctx = await getCaseDiagramEditContext(client, caseId);
    if (!ctx?.diagram) return data({ error: "도식이 없습니다." });
    const reason = String(fd.get("reason") ?? "").trim();
    if (!reason) return data({ error: "반려 사유를 입력하세요." });
    await rejectCaseDiagram(client, {
      diagramId: ctx.diagram.diagramId,
      reason,
    });
    return data({ ok: "반려 처리했습니다." });
  }

  if (intent === "delete") {
    const ctx = await getCaseDiagramEditContext(client, caseId);
    if (ctx?.diagram)
      await softDeleteCaseDiagram(client, ctx.diagram.diagramId);
    // 삭제 후에도 들어온 목록 상태로 돌려보낸다. ★"?" 로 시작하는 값만 신뢰(외부 주입 차단).
    const backRaw = new URL(request.url).searchParams.get("back") ?? "";
    const back = backRaw.startsWith("?") ? backRaw : "";
    return redirect(`/admin/case-diagrams${back}`);
  }

  return data({ error: "알 수 없는 요청입니다." }, { status: 400 });
}

/** 이전/다음 판례 — 끝이면 비활성(자리를 지켜 버튼이 흔들리지 않게 한다). */
function NeighborLink({
  caseId,
  back,
  dir,
}: {
  caseId: string | null;
  back: string;
  dir: "prev" | "next";
}) {
  const Icon = dir === "prev" ? ChevronLeftIcon : ChevronRightIcon;
  const cls =
    "border-border text-muted-foreground hover:bg-muted inline-flex size-6 items-center justify-center rounded-full border";
  if (!caseId) {
    return (
      <span className={`${cls} opacity-40`} aria-hidden>
        <Icon className="size-3.5" />
      </span>
    );
  }
  return (
    <Link
      to={`/admin/case-diagrams/${caseId}${back ? `?back=${encodeURIComponent(back)}` : ""}`}
      title={dir === "prev" ? "이전 판례" : "다음 판례"}
      className={cls}
      prefetch="intent"
    >
      <Icon className="size-3.5" />
    </Link>
  );
}

/**
 * 법조문 입력창 — 쉼표로 여러 건. 쉼표를 찍으면 뒤에 공백을 자동으로 넣는다.
 *
 * ★종전 버그(원장 보고 2026-08-23): 매 타건마다 trim + 빈값 제거를 걸고 그 결과를 다시
 *   그려서, 쉼표를 찍는 순간 빈 항목이 지워지며 **쉼표까지 사라졌다** — 구분자를 입력할
 *   방법이 없어 둘째 법조문을 추가할 수 없었다.
 * ★그래서 화면 값과 저장 값을 **정확히 왕복**시킨다: 표시는 항목을 ", " 로 잇고,
 *   입력은 "," 로 쪼갠 뒤 각 항목의 **앞 공백만** 떼어 낸다. 앞뒤 trim·빈값 제거는
 *   저장 직전(cleanBlocks)에 한 번만 — 그래야 "특허법 제29조, " 같은 중간 상태가 남는다.
 * ★공백을 자동으로 끼우면 문자열 길이가 바뀌어 커서가 끝으로 튄다. 캐럿 위치를 직접
 *   계산해 되돌린다(같은 정규화를 커서 앞 구간에만 적용하면 그 길이가 새 캐럿 위치다).
 */
function StatuteInput({
  statutes,
  onChange,
}: {
  statutes: string[];
  onChange: (next: string[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    const caret = caretRef.current;
    if (el && caret !== null) {
      el.setSelectionRange(caret, caret);
      caretRef.current = null;
    }
  });

  // "A,B" · "A,  B" → "A, B". 첫 항목 앞에는 공백을 붙이지 않는다.
  const canon = (v: string) =>
    v
      .split(",")
      .map((x, i) => (i === 0 ? x : ` ${x.replace(/^ +/, "")}`))
      .join(",");

  return (
    <Input
      ref={ref}
      value={statutes.join(", ")}
      onChange={(e) => {
        const typed = e.target.value;
        const caret = e.target.selectionStart ?? typed.length;
        caretRef.current = canon(typed.slice(0, caret)).length;
        onChange(
          canon(typed)
            .split(",")
            .map((x) => x.replace(/^ /, "")),
        );
      }}
      placeholder="특허법 제29조 제2항, 특허법 제42조 제4항"
      className="text-sm"
    />
  );
}

/**
 * 저장 직전 정리 — 법조문 칸은 타이핑 중 다듬지 않으므로(입력이 깨진다) 여기서 한 번만 한다.
 * 앞뒤 공백 제거 + 빈 항목 제거. ★서버 zod(statutes: trimmed.min(1))가 빈 문자열을 거부한다.
 */
function cleanBlocks(blocks: CaseDiagramBlock[]): CaseDiagramBlock[] {
  return blocks.map((b) => ({
    ...b,
    statutes: b.statutes.map((x) => x.trim()).filter(Boolean),
  }));
}

export default function AdminCaseDiagramEdit({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { kase, diagram, role, neighbors } = loaderData;
  // 돌아가기 — **들어온 자리로** 되돌린다. 들어오는 길이 두 갈래라 파라미터도 둘이다.
  //   ?back=<encoded query>  목록에서 왔다 → 그 목록 상태(연도·상태·검색어)로.
  //   ?from=<encoded path>   판례 화면 도식 패널에서 왔다 → 읽던 판례로(쿼리 포함).
  // ★from 이 없던 시절엔 패널에서 들어온 사람이 전부 운영관리 도식 목록으로 튕겼다
  //   (원장 지적 2026-08-26) — 판례를 읽다 들어왔는데 읽던 자리를 잃는다.
  // ★두 값 모두 **우리가 만든 형태만** 받는다 — 외부 URL 주입을 막는다(open redirect 방지).
  //   from 은 앱 내부 절대경로 한정: "/" 로 시작하되 "//" · "/\" 는 외부 호스트로 해석된다.
  //   ★prev/next 로 다른 판례로 옮겨가면 from 은 넘기지 않는다(NeighborLink 는 back 만) —
  //     읽던 판례가 아닌 곳을 "판례로 돌아가기" 라고 가리키면 거짓말이 된다.
  const [searchParams] = useSearchParams();
  const backRaw = searchParams.get("back") ?? "";
  const backTo = backRaw.startsWith("?") ? backRaw : "";
  const fromRaw = searchParams.get("from") ?? "";
  const fromTo =
    fromRaw.startsWith("/") &&
    !fromRaw.startsWith("//") &&
    !fromRaw.startsWith("/\\")
      ? fromRaw
      : "";
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  const [factsMd, setFactsMd] = useState(diagram?.factsMd ?? "");
  const [factsSourceKind, setFactsSourceKind] = useState<FactsSourceKind>(
    diagram?.factsSourceKind ?? "none",
  );
  const [factsSourceRef, setFactsSourceRef] = useState(
    diagram?.factsSourceRef ?? "",
  );
  const [blocks, setBlocks] = useState<CaseDiagramBlock[]>(
    diagram?.blocks.length ? diagram.blocks : [emptyBlock()],
  );

  const patchBlock = (idx: number, patch: Partial<CaseDiagramBlock>) =>
    setBlocks((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)),
    );
  const patchDoctrine = (idx: number, key: string, value: string) =>
    setBlocks((prev) =>
      prev.map((b, i) =>
        i === idx ? { ...b, doctrine: { ...b.doctrine, [key]: value } } : b,
      ),
    );

  return (
    <AdminShell
      cluster="cases"
      role={role}
      title="판례 도식 편집"
      desc={`${kase.caseNumber} · ${kase.court} ${kase.decidedAt}`}
      width={960}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          to={fromTo || `/admin/case-diagrams${backTo}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
        >
          <ArrowLeftIcon className="size-3.5" />
          {fromTo ? "판례로 돌아가기" : "목록으로"}
        </Link>
        {/* 이전/다음 — 목록으로 나갔다 들어오지 않고 죽 훑는다. 범위·순서는 목록과 동일. */}
        {neighbors ? (
          <span className="ml-auto inline-flex items-center gap-1">
            <NeighborLink caseId={neighbors.prevId} back={backTo} dir="prev" />
            <span className="text-muted-foreground text-[11px] font-medium tabular-nums">
              {neighbors.idx + 1} / {neighbors.total}
            </span>
            <NeighborLink caseId={neighbors.nextId} back={backTo} dir="next" />
          </span>
        ) : null}
      </div>

      <header className="mb-5">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {diagram ? (
            diagram.reviewStatus === "approved" ? (
              <Chip tone="emerald">승인</Chip>
            ) : diagram.reviewStatus === "rejected" ? (
              <Chip tone="coral">반려</Chip>
            ) : (
              <Chip tone="amber">검수 대기</Chip>
            )
          ) : (
            <Chip tone="outline">미생성</Chip>
          )}
          <Chip tone="outline">{kase.caseNumber}</Chip>
          <Chip tone="outline">
            {kase.court} {kase.decidedAt}
          </Chip>
          <Chip tone="outline">
            전문 {kase.officialTextLen.toLocaleString()}자
          </Chip>
        </div>
        <h1 className="text-lg font-bold">{kase.caseTitle}</h1>
        {diagram?.rejectedReason ? (
          <p className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
            반려 사유: {diagram.rejectedReason}
          </p>
        ) : null}
      </header>

      {actionData && "error" in actionData && actionData.error ? (
        <p className="mb-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          {actionData.error}
        </p>
      ) : null}
      {actionData && "ok" in actionData && actionData.ok ? (
        <p className="mb-4 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {actionData.ok}
        </p>
      ) : null}

      {/* ── AI 초안 (쟁점~결론) ───────────────────────────────────────── */}
      <Form method="post" className="mb-5">
        <input type="hidden" name="intent" value="draft" />
        <div className="border-border bg-muted/30 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">AI 초안 — 쟁점 ~ 결론</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              대법원 판결문에서 쟁점·법조문·법리(근거 있는 축만)·포섭·결론을
              만듭니다. 사실관계는 하급심이 근거라 여기서 만들지 않습니다 —
              아래에 직접 쓰거나 배치 스크립트로 채웁니다. ★기존 쟁점 블록은
              교체됩니다.
            </p>
          </div>
          <Button
            type="submit"
            variant="outline"
            className="rounded-full"
            disabled={busy || kase.officialTextLen < MIN_OFFICIAL_TEXT}
          >
            <SparklesIcon className="size-4" /> 초안 생성
          </Button>
        </div>
      </Form>

      <Form method="post" className="space-y-5">
        <input type="hidden" name="intent" value="save" />
        <input
          type="hidden"
          name="blocksJson"
          value={JSON.stringify(cleanBlocks(blocks))}
        />

        {/* ── 사실관계 ─────────────────────────────────────────────── */}
        <section className="border-border bg-card rounded-xl border p-4 shadow-sm">
          <h2 className="mb-1 text-sm font-bold">사실관계</h2>
          <p className="text-muted-foreground mb-3 text-xs">
            2차는 이 사실관계를 각색해 출제됩니다. 근거는 하급심 판결문 — 없으면
            비워 두세요(창작 금지).
          </p>
          <Textarea
            name="factsMd"
            value={factsMd}
            onChange={(e) => setFactsMd(e.target.value)}
            rows={10}
            placeholder="누가·언제·무엇을 했고 어떤 분쟁이 생겼는지"
            className="text-sm"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              name="factsSourceKind"
              value={factsSourceKind}
              onChange={(e) =>
                setFactsSourceKind(e.target.value as FactsSourceKind)
              }
              className="border-border bg-background h-8 rounded-lg border px-2 text-xs"
            >
              {FACTS_SOURCE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {FACTS_SOURCE_LABEL[k]}
                </option>
              ))}
            </select>
            <Input
              name="factsSourceRef"
              value={factsSourceRef}
              onChange={(e) => setFactsSourceRef(e.target.value)}
              placeholder="출처 표기 — 예: 특허법원 2022허4635"
              className="h-8 max-w-xs text-xs"
            />
          </div>
        </section>

        {/* ── 쟁점 블록 ────────────────────────────────────────────── */}
        {blocks.map((b, idx) => (
          <section
            key={idx}
            className="border-border bg-card rounded-xl border p-4 shadow-sm"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold">쟁점 {idx + 1}</h2>
              <button
                type="button"
                onClick={() =>
                  setBlocks((prev) => prev.filter((_, i) => i !== idx))
                }
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
              >
                <XIcon className="size-3.5" /> 삭제
              </button>
            </div>

            <Field label="쟁점">
              <Input
                value={b.issue}
                onChange={(e) => patchBlock(idx, { issue: e.target.value })}
                placeholder="이 쟁점에서 무엇이 문제되는가"
                className="text-sm"
              />
            </Field>

            <Field label="법조문" hint="쉼표로 구분. 판결문에 명시된 것만.">
              <StatuteInput
                statutes={b.statutes}
                onChange={(statutes) => patchBlock(idx, { statutes })}
              />
            </Field>

            <div className="mt-3">
              <p className="text-muted-foreground mb-2 text-xs font-semibold">
                법리 — 판결문에서 확인되는 축만 채우세요(빈 축은 학생 화면에
                나타나지 않습니다)
              </p>
              <div className="space-y-2">
                {DOCTRINE_AXES.map((ax) => (
                  <div key={ax.key}>
                    <label className="text-muted-foreground mb-1 block text-[11px]">
                      {ax.label}
                      <span className="text-muted-foreground/70">
                        {" "}
                        — {ax.hint}
                      </span>
                    </label>
                    <Textarea
                      value={b.doctrine[ax.key] ?? ""}
                      onChange={(e) =>
                        patchDoctrine(idx, ax.key, e.target.value)
                      }
                      rows={2}
                      className="text-sm"
                    />
                    {/* 축 옮기기 — 검수에서 가장 잦은 수정이 '분류가 틀림'이다.
                        ★여기서는 서버를 부르지 않고 화면 상태만 바꾼다. 이 화면은
                        '저장'을 눌러야 반영되는 곳이라, 축만 즉시 서버에 쓰면
                        본문 편집분과 어긋난다(도식 패널은 편집이 없어 즉시 저장). */}
                    {(b.doctrine[ax.key] ?? "").trim() ? (
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="text-muted-foreground text-[10px] font-medium">
                          축 옮기기
                        </span>
                        {DOCTRINE_AXES.filter((t) => t.key !== ax.key).map(
                          (t) => (
                            <button
                              key={t.key}
                              type="button"
                              title={t.hint}
                              onClick={() =>
                                setBlocks((prev) =>
                                  prev.map((blk, i) =>
                                    i === idx
                                      ? moveDoctrineAxis(blk, ax.key, t.key)
                                      : blk,
                                  ),
                                )
                              }
                              className="border-border text-muted-foreground hover:border-primary hover:text-link rounded-full border px-2 py-0.5 text-[11px] font-medium"
                            >
                              {t.label}
                            </button>
                          ),
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <Field label="사안의 포섭">
              <Textarea
                value={b.application}
                onChange={(e) =>
                  patchBlock(idx, { application: e.target.value })
                }
                rows={3}
                className="text-sm"
              />
            </Field>

            <Field label="결론">
              <Textarea
                value={b.conclusion}
                onChange={(e) =>
                  patchBlock(idx, { conclusion: e.target.value })
                }
                rows={2}
                className="text-sm"
              />
            </Field>

            <Field
              label="코멘트"
              hint="강사가 덧붙이는 말 — 출제 포인트·주의점. 비워도 됩니다."
            >
              <Textarea
                value={b.comment ?? ""}
                onChange={(e) => patchBlock(idx, { comment: e.target.value })}
                rows={2}
                placeholder="예: 이 쟁점은 2차에서 사실관계를 바꿔 반복 출제됨"
                className="text-sm"
              />
            </Field>
          </section>
        ))}

        <button
          type="button"
          onClick={() => setBlocks((prev) => [...prev, emptyBlock()])}
          className="border-border text-muted-foreground hover:bg-muted w-full rounded-xl border border-dashed py-3 text-xs font-semibold"
        >
          <PlusIcon className="mr-1 inline size-3.5" /> 쟁점 추가
        </button>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button type="submit" className="rounded-full" disabled={busy}>
            저장
          </Button>
          <span className="text-muted-foreground text-xs">
            저장하면 검수 대기 상태가 됩니다.
          </span>
        </div>
      </Form>

      {/* ── 승인 / 반려 / 삭제 ───────────────────────────────────────── */}
      {diagram ? (
        <div className="border-border mt-6 space-y-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Form method="post">
              <input type="hidden" name="intent" value="approve" />
              <Button
                type="submit"
                className="rounded-full"
                disabled={busy || diagram.reviewStatus === "approved"}
              >
                <CheckIcon className="size-4" /> 승인
              </Button>
            </Form>
            <Form method="post" className="flex items-center gap-2">
              <input type="hidden" name="intent" value="reject" />
              <Input
                name="reason"
                placeholder="반려 사유"
                className="h-9 w-56 text-xs"
              />
              <Button
                type="submit"
                variant="outline"
                className="rounded-full"
                disabled={busy}
              >
                반려
              </Button>
            </Form>
            <Form method="post" className="ml-auto">
              <input type="hidden" name="intent" value="delete" />
              <Button
                type="submit"
                variant="ghost"
                className="text-muted-foreground rounded-full"
                disabled={busy}
              >
                <Trash2Icon className="size-4" /> 도식 삭제
              </Button>
            </Form>
          </div>
          <p className="text-muted-foreground text-xs">
            승인 조건 — 쟁점 1개 이상 + 각 쟁점에 결론. 저장 후
            승인하세요(저장하면 검수 대기로 되돌아갑니다).
          </p>
        </div>
      ) : null}
    </AdminShell>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      <label className="text-muted-foreground mb-1 block text-[11px] font-semibold">
        {label}
        {hint ? (
          <span className="text-muted-foreground/70 font-normal">
            {" "}
            — {hint}
          </span>
        ) : null}
      </label>
      {children}
    </div>
  );
}
