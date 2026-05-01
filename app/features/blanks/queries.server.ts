import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

export interface BlankItem {
  idx: number;
  length: number;
  answer: string;
  hint?: string;
  // 원본 본문 paragraph 안에서 정답 앞·뒤 컨텍스트 (자동 매칭 시 함께 추출).
  // BlankFillView 가 본문 inline text 안에서 (before+answer+after) 패턴을 찾아 정답 자리만 input 으로 치환.
  beforeContext?: string;
  afterContext?: string;
  // 운영자가 드래그로 슬롯을 만들 때 캡처된 가장 가까운 clause/item/sub DOM id.
  // 같은 답이 여러 항에 있을 때 (예: 제102조 ① 과 ⑤ 양쪽 "특허권자") 정답 재입력/재매칭 시
  // 슬롯이 만들어진 항을 결정적으로 한정하기 위한 강한 hint.
  blockId?: string;
  // 정확 위치 — 운영자 드래그 시점 DOM 의 데이터 속성에서 캡처. 같은 단어가 같은 항 안에 여러 번
  // 등장해도 (예: "그 사단 중 사단" 의 두 번째 사단) 컨텍스트 매칭이 아닌 결정적 좌표로 배치된다.
  //   blockIndex — walkBlocks pre-order 순서에서의 block 인덱스 (article-body.tsx 가 DOM 에 마킹).
  //   cumOffset  — 그 block 의 inline cumulative text 내 시작 char offset.
  // 둘 다 있고 substring 검증 통과하면 컨텍스트 무시하고 그 자리에 배치. 실패 시 기존 매칭 fallback.
  blockIndex?: number;
  cumOffset?: number;
}

export interface BlankSet {
  setId: string;
  articleId: string;
  version: string;
  bodyText: string;
  blanks: BlankItem[];
  importance: number;
  ownerId: string;
  ownerName: string | null;
  displayName: string | null;
}

// 한 article 의 모든 owner set (강사별 다중) — 학습자가 선택해 학습.
export async function listBlankSetsByArticle(
  client: SupabaseClient<Database>,
  articleId: string,
): Promise<BlankSet[]> {
  const { data, error } = await client
    .from("article_blank_sets")
    .select(
      "set_id, article_id, version, body_text, blanks, importance, owner_id, display_name, profiles!owner_id(name)",
    )
    .eq("article_id", articleId)
    .order("version")
    .order("display_name");
  if (error) throw error;
  return (data ?? []).map(rowToSet);
}

// preferred owner (지정된 강사) 우선, 없으면 첫 번째.
export async function getBlankSetByArticleId(
  client: SupabaseClient<Database>,
  articleId: string,
  preferredOwnerId?: string,
): Promise<BlankSet | null> {
  const all = await listBlankSetsByArticle(client, articleId);
  if (all.length === 0) return null;
  if (preferredOwnerId) {
    const match = all.find((s) => s.ownerId === preferredOwnerId);
    if (match) return match;
  }
  return all[0];
}

export async function getBlankSetsByArticleIds(
  client: SupabaseClient<Database>,
  articleIds: string[],
  preferredOwnerId?: string,
): Promise<Record<string, BlankSet>> {
  if (articleIds.length === 0) return {};
  const { data, error } = await client
    .from("article_blank_sets")
    .select(
      "set_id, article_id, version, body_text, blanks, importance, owner_id, display_name, profiles!owner_id(name)",
    )
    .in("article_id", articleIds);
  if (error) throw error;

  // articleId 별로 preferredOwner 우선, 없으면 첫 row.
  const byArticle = new Map<string, BlankSet[]>();
  for (const row of data ?? []) {
    const set = rowToSet(row);
    const arr = byArticle.get(row.article_id) ?? [];
    arr.push(set);
    byArticle.set(row.article_id, arr);
  }
  const out: Record<string, BlankSet> = {};
  for (const [aid, sets] of byArticle.entries()) {
    if (preferredOwnerId) {
      const m = sets.find((s) => s.ownerId === preferredOwnerId);
      if (m) {
        out[aid] = m;
        continue;
      }
    }
    out[aid] = sets[0];
  }
  return out;
}

type RawSetRow = {
  set_id: string;
  article_id: string;
  version: string;
  body_text: string;
  blanks: unknown;
  importance: number | null;
  owner_id: string;
  display_name: string | null;
  profiles?: { name: string | null } | null;
};

function rowToSet(row: RawSetRow): BlankSet {
  return {
    setId: row.set_id,
    articleId: row.article_id,
    version: row.version,
    bodyText: row.body_text,
    blanks: parseBlanks(row.blanks),
    importance: row.importance ?? 0,
    ownerId: row.owner_id,
    ownerName: row.profiles?.name ?? null,
    displayName: row.display_name,
  };
}

// 일부 row 는 snake_case (before_context) 와 camelCase (beforeContext) 를 동시에 보관한다.
// snake_case 가 빈 문자열이라도 typeof === 'string' 이라 우선 채택되면 빈 컨텍스트로 매칭에 실패한다.
// 둘 중 비어있지 않은 값을 우선해 사용. (camelCase 우선 — token-internal 추출본인 경우가 많아 신뢰도 더 높음)
function pickContext(...candidates: unknown[]): string | undefined {
  for (const v of candidates) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function pickNumber(...candidates: unknown[]): number | undefined {
  for (const v of candidates) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.length > 0) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function parseBlanks(value: unknown): BlankItem[] {
  if (!Array.isArray(value)) return [];
  const out: BlankItem[] = [];
  for (const v of value) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const idx = typeof o.idx === "number" ? o.idx : Number(o.idx);
    if (!Number.isFinite(idx)) continue;
    out.push({
      idx,
      length: typeof o.length === "number" ? o.length : 4,
      answer: typeof o.answer === "string" ? o.answer : "",
      hint: typeof o.hint === "string" ? o.hint : undefined,
      beforeContext: pickContext(o.beforeContext, o.before_context),
      afterContext: pickContext(o.afterContext, o.after_context),
      blockId: pickContext(o.blockId, o.block_id),
      blockIndex: pickNumber(o.blockIndex, o.block_index),
      cumOffset: pickNumber(o.cumOffset, o.cum_offset),
    });
  }
  return out.sort((a, b) => a.idx - b.idx);
}

// admin: 빈칸 set 의 정답 한 칸 갱신.
// 정답이 원본 article body_json 안에서 발견되면 before/after_context 도 자동 채움.
// 학습 화면(BlankFillView) 의 매칭 패턴 = before+answer+after 이므로 컨텍스트가 비면 input 자체가
// 본문에 그려지지 않는다. 운영자는 정답만 입력하고, 컨텍스트는 시스템이 자동 추출.
//
// hints (옵션): "→ #N" 버튼처럼 운영자가 본문에서 드래그한 위치를 명시한 경우. 주어지면 기존 슬롯의
// 저장된 컨텍스트 대신 이 hints 를 사용해 매칭 — 즉 슬롯 위치가 드래그 위치로 이동한다.
//   - blockIndex/cumOffset: DOM 데이터 속성으로 캡처한 정확 위치 (가장 강함, 컨텍스트 매칭 우회).
//   - blockHint/before/afterHint: fallback (드래그 영역 주변 + 가장 가까운 항/호 id).
// 미지정이면 기존 슬롯의 before/after/block/exact 좌표를 사용해 위치를 보존 (paste 등).
export async function updateBlankAnswer(
  client: SupabaseClient<Database>,
  setId: string,
  blankIdx: number,
  answer: string,
  hints?: {
    beforeHint?: string;
    afterHint?: string;
    blockHint?: string;
    blockIndex?: number;
    cumOffset?: number;
  },
): Promise<void> {
  // 1. 현재 set + article 의 current revision body 조회
  const { data, error } = await client
    .from("article_blank_sets")
    .select(
      "blanks, articles(article_id, current_revision_id)",
    )
    .eq("set_id", setId)
    .single();
  if (error) throw error;
  const blanks = parseBlanks(data.blanks);
  const target = blanks.find((b) => b.idx === blankIdx);

  // 2. 컨텍스트 자동 추출 — body_json 의 inline 토큰 안에서 정답 위치 탐색.
  //    findAnswerInTokens 가 단일 토큰 또는 block-cumulative 에서 답을 찾고 ±30자 컨텍스트로 사용.
  //    explicit hints (드래그 위치) 가 있으면 그것을 우선, 없으면 기존 슬롯 컨텍스트를 hint 로
  //    같은 답이 여러 항에 있을 때 (예: 제102조 ① 과 ⑤ 양쪽 "특허권자") 위치를 결정한다.
  let beforeContext = "";
  let afterContext = "";
  let resolvedBlockId: string | undefined = target?.blockId;
  let resolvedBlockIndex: number | undefined = target?.blockIndex;
  let resolvedCumOffset: number | undefined = target?.cumOffset;
  const trimmed = answer.trim();
  // 정확 위치가 들어왔으면 (드래그한 자리), explicit relocation 이라고 판단해 컨텍스트 hint 도 무시.
  const hasExactHint =
    typeof hints?.blockIndex === "number" &&
    typeof hints?.cumOffset === "number";
  const hasContextHint = !!(
    hints?.beforeHint?.trim() ||
    hints?.afterHint?.trim() ||
    hints?.blockHint?.trim()
  );
  const hasExplicitHint = hasExactHint || hasContextHint;
  if (hasExactHint) {
    resolvedBlockIndex = hints!.blockIndex;
    resolvedCumOffset = hints!.cumOffset;
    if (hints?.blockHint?.trim()) resolvedBlockId = hints.blockHint.trim();
  }
  if (trimmed.length > 0 && data.articles?.current_revision_id) {
    const { data: rev } = await client
      .from("article_revisions")
      .select("body_json")
      .eq("revision_id", data.articles.current_revision_id)
      .maybeSingle();
    const otherBlanks = blanks.filter((b) => b.idx !== blankIdx);
    const effectiveHints = hasExplicitHint
      ? hints
      : target
        ? {
            beforeHint: target.beforeContext,
            afterHint: target.afterContext,
            blockHint: target.blockId,
          }
        : undefined;
    const tokenMatch = findAnswerInTokens(
      rev?.body_json,
      trimmed,
      effectiveHints,
      otherBlanks,
    );
    if (tokenMatch) {
      const { tokenText, position } = tokenMatch;
      // 30자 — 같은 답이 여러 항/블록에 등장하고 직전 12자가 동일한 케이스
      // (예: 제36조 ④/⑤ "...실용신안등록출원은 제1항부터 제3항까지의...") 도
      // 30자에서는 차이가 나타나 정확히 의도 자리만 anchor 매칭됨.
      const CONTEXT_LEN = 30;
      beforeContext = tokenText.slice(
        Math.max(0, position - CONTEXT_LEN),
        position,
      );
      afterContext = tokenText.slice(
        position + trimmed.length,
        Math.min(tokenText.length, position + trimmed.length + CONTEXT_LEN),
      );
      // explicit hints 가 있으면 hints.blockHint 우선, 없으면 매칭된 occurrence 의 blockId.
      // 둘 다 없으면 target 의 기존 blockId 유지.
      if (!hasExactHint) {
        resolvedBlockId =
          hints?.blockHint?.trim() ||
          tokenMatch.blockId ||
          target?.blockId ||
          undefined;
      }
    }
  }

  const next: BlankItem[] = blanks.map((b) =>
    b.idx === blankIdx
      ? {
          ...b,
          answer: trimmed,
          beforeContext,
          afterContext,
          blockId: resolvedBlockId,
          blockIndex: resolvedBlockIndex,
          cumOffset: resolvedCumOffset,
        }
      : b,
  );

  // BlankItem (camelCase) → DB JSON (snake_case).
  // 과거 row 가 camelCase 필드 (afterContext 등) 를 같이 갖고 있을 수 있어
  // explicit 하게 빈 문자열로 덮어씀으로써 stale 한 dual-format 데이터를 정리한다.
  const dbJson = next.map((b) => ({
    idx: b.idx,
    length: b.length,
    answer: b.answer,
    before_context: b.beforeContext ?? "",
    after_context: b.afterContext ?? "",
    beforeContext: b.beforeContext ?? "",
    afterContext: b.afterContext ?? "",
    ...(b.blockId ? { block_id: b.blockId } : {}),
    ...(typeof b.blockIndex === "number" ? { block_index: b.blockIndex } : {}),
    ...(typeof b.cumOffset === "number" ? { cum_offset: b.cumOffset } : {}),
    ...(b.hint ? { hint: b.hint } : {}),
  }));

  const { error: upErr } = await client
    .from("article_blank_sets")
    .update({
      blanks: dbJson as unknown as Database["public"]["Tables"]["article_blank_sets"]["Update"]["blanks"],
    })
    .eq("set_id", setId);
  if (upErr) throw upErr;
}

// body_json 안의 인라인 토큰들을 walk 하면서 정답이 등장하는 모든 위치를 수집한다.
// caller 에서 hint 와의 매칭 점수로 disambiguate.
//
// 검색 대상 토큰:
//   - text / underline / subtitle / annotation / amendment_note → t.text
//   - ref_article / ref_law → t.raw  (예: "제29조의2", "특허법")
//
// ref 토큰을 포함하지 않으면, 운영자가 본문에서 "제29조" 를 드래그해 빈칸으로 만들 때
// occurrence 가 0 건이 되어 컨텍스트가 빈 채로 저장되고, 이후 본문 매칭이 실패한다.
function tokenBodyContent(t: Record<string, unknown>): string | null {
  if (
    (t.type === "text" ||
      t.type === "underline" ||
      t.type === "subtitle" ||
      t.type === "annotation" ||
      t.type === "amendment_note") &&
    typeof t.text === "string"
  ) {
    return t.text;
  }
  if (
    (t.type === "ref_article" || t.type === "ref_law") &&
    typeof t.raw === "string"
  ) {
    return t.raw;
  }
  return null;
}

// article-body.tsx 에서 LabeledBlock 이 부여하는 DOM id 와 동일 형식으로 block id 생성.
// "clause-N" / "item-N" / "sub-X". para/title_marker 등은 null.
function blockOwnId(block: Record<string, unknown>): string | null {
  if (block.kind === "clause" && typeof block.number === "number") {
    return `clause-${block.number}`;
  }
  if (block.kind === "item" && typeof block.number === "number") {
    return `item-${block.number}`;
  }
  if (block.kind === "sub" && typeof block.letter === "string") {
    return `sub-${block.letter}`;
  }
  return null;
}

interface AnswerOccurrence {
  tokenText: string;
  position: number;
  // 해당 occurrence 가 속한 가장 가까운 clause/item/sub 의 id (DOM id 와 동일 포맷).
  // null = para/title_marker/header_refs/sub_article_group 등 식별자 없는 영역.
  // 운영자가 본문 드래그 시 보낸 blockHint 와 매칭해 occurrence 를 한 항/호로 한정한다.
  blockId: string | null;
}

function collectAnswerOccurrences(
  bodyJson: unknown,
  answer: string,
): AnswerOccurrence[] {
  const out: AnswerOccurrence[] = [];
  if (!bodyJson || typeof bodyJson !== "object") return out;
  const root = bodyJson as { blocks?: unknown };
  if (!Array.isArray(root.blocks)) return out;
  const walk = (blocks: unknown[], inheritedBlockId: string | null) => {
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      const blk = block as Record<string, unknown>;
      const ownId = blockOwnId(blk);
      const currentBlockId = ownId ?? inheritedBlockId;
      const inline = Array.isArray(blk.inline) ? (blk.inline as unknown[]) : [];
      for (const tok of inline) {
        if (!tok || typeof tok !== "object") continue;
        const text = tokenBodyContent(tok as Record<string, unknown>);
        if (!text) continue;
        let from = 0;
        while (true) {
          const pos = text.indexOf(answer, from);
          if (pos === -1) break;
          out.push({ tokenText: text, position: pos, blockId: currentBlockId });
          from = pos + 1;
        }
      }
      if (Array.isArray(blk.children)) {
        walk(blk.children as unknown[], currentBlockId);
      }
      if (blk.kind === "sub_article_group") {
        if (Array.isArray(blk.preface)) {
          walk(blk.preface as unknown[], inheritedBlockId);
        }
        if (Array.isArray(blk.articles)) {
          for (const sub of blk.articles as unknown[]) {
            if (!sub || typeof sub !== "object") continue;
            const subObj = sub as Record<string, unknown>;
            if (Array.isArray(subObj.blocks)) {
              walk(subObj.blocks as unknown[], inheritedBlockId);
            }
          }
        }
      }
    }
  };
  walk(root.blocks, null);
  return out;
}

// block 단위 cumulative text 안에서 답 occurrence 수집 — 여러 inline 토큰에 걸친 답을 잡는다.
// 예: 제2조 제3호 다목의 "그 방법에 의하여 생산한 물건" 은 underline 토큰 끝 + 다음 text 토큰 시작에
// 걸쳐 있어 단일 토큰 검색으로는 못 잡지만, block cumulative ("...외에 그 방법에 의하여 생산한 물건을
// 사용·...") 안에서는 정확히 발견된다.
//
// tokenText = block 의 cumulative inline content. 호출부에서 ±12자 추출해 컨텍스트로 사용하면
// 렌더러의 computeBlockBlankHits tier1/2/3 anchored 매칭 (같은 cumulative 위에서 검색) 과 정합.
function collectCumulativeOccurrences(
  bodyJson: unknown,
  answer: string,
): AnswerOccurrence[] {
  const out: AnswerOccurrence[] = [];
  if (!bodyJson || typeof bodyJson !== "object") return out;
  const root = bodyJson as { blocks?: unknown };
  if (!Array.isArray(root.blocks)) return out;
  const walk = (blocks: unknown[], inheritedBlockId: string | null) => {
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      const blk = block as Record<string, unknown>;
      const ownId = blockOwnId(blk);
      const currentBlockId = ownId ?? inheritedBlockId;
      const inline = Array.isArray(blk.inline) ? (blk.inline as unknown[]) : [];
      if (inline.length > 0) {
        const cumulative = inline
          .map((tok) =>
            tok && typeof tok === "object"
              ? (tokenBodyContent(tok as Record<string, unknown>) ?? "")
              : "",
          )
          .join("");
        if (cumulative.length > 0) {
          let from = 0;
          while (true) {
            const pos = cumulative.indexOf(answer, from);
            if (pos === -1) break;
            out.push({
              tokenText: cumulative,
              position: pos,
              blockId: currentBlockId,
            });
            from = pos + 1;
          }
        }
      }
      if (Array.isArray(blk.children)) {
        walk(blk.children as unknown[], currentBlockId);
      }
      if (blk.kind === "sub_article_group") {
        if (Array.isArray(blk.preface)) {
          walk(blk.preface as unknown[], inheritedBlockId);
        }
        if (Array.isArray(blk.articles)) {
          for (const sub of blk.articles as unknown[]) {
            if (!sub || typeof sub !== "object") continue;
            const subObj = sub as Record<string, unknown>;
            if (Array.isArray(subObj.blocks)) {
              walk(subObj.blocks as unknown[], inheritedBlockId);
            }
          }
        }
      }
    }
  };
  walk(root.blocks, null);
  return out;
}

function commonSuffixLength(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function commonPrefixLength(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

// 답이 등장하는 후보 위치들 중 hint 와 가장 잘 맞는 위치를 선택.
// hint 가 모두 비어있으면 (PasteNewBlankInput 처럼 단순 입력) 다음 우선순위:
//   1) 토큰 콘텐츠 자체가 답과 일치하면서 기존 빈칸이 점유하지 않은 위치 (underline 강조 단어)
//   2) 기존 빈칸이 점유하지 않은 첫 위치
//   3) (모두 점유) 첫 위치
//
// 검색은 두 단계:
//   Pass 1 — 단일 inline 토큰 안에서 정답을 찾는다 (가장 specific 한 컨텍스트).
//   Pass 2 — Pass 1 결과 없으면 block 단위 cumulative text 안에서 검색 (token 경계 가로지르는 답).
function findAnswerInTokens(
  bodyJson: unknown,
  answer: string,
  hints?: { beforeHint?: string; afterHint?: string; blockHint?: string },
  existingBlanks?: Array<{
    answer: string;
    beforeContext?: string;
    afterContext?: string;
  }>,
): AnswerOccurrence | null {
  let occurrences = collectAnswerOccurrences(bodyJson, answer);
  if (occurrences.length === 0) {
    occurrences = collectCumulativeOccurrences(bodyJson, answer);
  }
  if (occurrences.length === 0) return null;

  // blockHint (DOM 의 가장 가까운 clause/item/sub id) 가 주어지면, 그 블록 안의 occurrence 만 우선.
  // 같은 답이 다른 항/호에도 있을 때 (예: art102 ① 과 ⑤ 양쪽의 "특허권자") 운영자가 드래그한 항으로
  // 강제 한정하는 마지막 보루. 매칭 occurrence 가 없으면 전체로 fallback (blockHint 가 본문에 없는
  // 잘못된 값이거나 sub_article_group 같은 식별자 영역인 경우).
  const blockHint = hints?.blockHint?.trim();
  if (blockHint) {
    const filtered = occurrences.filter((o) => o.blockId === blockHint);
    if (filtered.length > 0) occurrences = filtered;
  }

  const trimmedAnswer = answer.trim();
  const beforeHint = (hints?.beforeHint ?? "").trim();
  const afterHint = (hints?.afterHint ?? "").trim();

  // 같은 정답을 가진 기존 빈칸이 이 occurrence 위치를 이미 점유했는지.
  // 12자 / 30자 컨텍스트 둘 다 비교 (legacy 빈칸은 12자, 신규는 30자로 저장).
  const isOccupied = (occ: AnswerOccurrence): boolean => {
    if (!existingBlanks || existingBlanks.length === 0) return false;
    return [12, 30].some((len) => {
      const before = occ.tokenText.slice(
        Math.max(0, occ.position - len),
        occ.position,
      );
      const after = occ.tokenText.slice(
        occ.position + answer.length,
        occ.position + answer.length + len,
      );
      return existingBlanks.some(
        (b) =>
          b.answer === answer &&
          (b.beforeContext ?? "") === before &&
          (b.afterContext ?? "") === after,
      );
    });
  };

  if (!beforeHint && !afterHint) {
    // hint 없음 — 강조 토큰 + free 우선, 그 외 free 첫 매칭, 모두 점유면 첫 위치.
    for (const o of occurrences) {
      if (o.tokenText.trim() === trimmedAnswer && !isOccupied(o)) return o;
    }
    for (const o of occurrences) {
      if (!isOccupied(o)) return o;
    }
    return occurrences[0];
  }

  // hint 와 가장 잘 맞는 occurrence 선택.
  // 점수 동점 시 비점유 occurrence 우선 — 같은 답이 여러 항에 등장하고 한쪽이 이미 점유된 케이스
  // (예: 제36조의 "제1항부터 제3항까지" 가 ④와 ⑤ 양쪽에 있고 ④자리는 기존 빈칸이 부분 점유) 에서
  // 사용자가 다른 자리를 의도했음을 감지.
  let bestMatch: AnswerOccurrence | null = null;
  let bestScore = -1;
  let bestOccupied = false;
  for (const o of occurrences) {
    const beforeText = o.tokenText.slice(
      Math.max(0, o.position - beforeHint.length),
      o.position,
    );
    const afterText = o.tokenText.slice(
      o.position + answer.length,
      o.position + answer.length + afterHint.length,
    );
    const score =
      commonSuffixLength(beforeText, beforeHint) +
      commonPrefixLength(afterText, afterHint);
    const occupied = isOccupied(o);
    const better =
      score > bestScore ||
      (score === bestScore && bestOccupied && !occupied);
    if (better) {
      bestScore = score;
      bestMatch = o;
      bestOccupied = occupied;
    }
  }
  return bestMatch;
}

// 빈칸 자료에 새 빈칸 추가 — body_text 에 등장하면 [[BLANK:N]] 로 치환, body_text 에 없고
// body_json (시행령/sub_article 포함) 에만 존재하면 body_text 는 그대로 두고 blanks 배열에만 추가.
// 컨텍스트는 답이 등장한 인라인 토큰 내부에서 추출해 렌더링 매칭과 일치시킨다.
//
// hints (옵션):
//   - blockIndex/cumOffset: DOM 데이터 속성에서 캡처한 정확 위치. 둘 다 있으면 컨텍스트 매칭을
//     완전히 우회하고 이 자리에 결정적으로 배치 — 같은 단어가 같은 항에 여러 번 있어도 안전.
//   - beforeHint/afterHint: 운영자가 본문 드래그로 선택한 영역 주변 ±80자 (정확 위치 못 잡힐 때 fallback).
//   - blockHint: 선택 영역의 가장 가까운 clause/item/sub DOM id ("clause-5" 등). 동일 정답이
//     여러 항/호에 있을 때 운영자가 드래그한 항으로 occurrence 를 강제 한정 (또 다른 fallback).
export async function addBlankToSet(
  client: SupabaseClient<Database>,
  setId: string,
  selectionText: string,
  hints?: {
    beforeHint?: string;
    afterHint?: string;
    blockHint?: string;
    blockIndex?: number;
    cumOffset?: number;
  },
): Promise<{ ok: true; newIdx: number } | { ok: false; reason: string }> {
  const trimmed = selectionText.trim();
  if (!trimmed) return { ok: false, reason: "빈 텍스트" };

  const { data: row, error } = await client
    .from("article_blank_sets")
    .select(
      "set_id, body_text, blanks, articles(current_revision_id)",
    )
    .eq("set_id", setId)
    .single();
  if (error) return { ok: false, reason: error.message };

  const bodyText = row.body_text;
  const posInBodyText = bodyText.indexOf(trimmed);
  const existingBlanks = parseBlanks(row.blanks);

  // body_json 에서 선택 텍스트 위치/컨텍스트 추출 (인라인 토큰 내부 한정).
  // hints 가 있으면 어떤 occurrence 를 쓸지 사용자 선택 위치 기준으로 결정.
  // hints 가 없으면 기존 빈칸이 이미 점유한 위치를 건너뛰어 다음 free 위치를 선택.
  let tokenMatch: AnswerOccurrence | null = null;
  if (row.articles?.current_revision_id) {
    const { data: rev } = await client
      .from("article_revisions")
      .select("body_json")
      .eq("revision_id", row.articles.current_revision_id)
      .maybeSingle();
    tokenMatch = findAnswerInTokens(
      rev?.body_json,
      trimmed,
      hints,
      existingBlanks,
    );
  }

  if (posInBodyText === -1 && !tokenMatch) {
    return {
      ok: false,
      reason:
        "선택 텍스트를 본문에서 찾지 못했습니다. 본문에 정확히 등장하는 단어/구문을 선택해주세요.",
    };
  }

  // body_text 의 그 자리가 이미 빈칸 토큰이면 실패 (body_text 매칭일 때만 검사)
  if (posInBodyText !== -1) {
    if (
      /\[\[BLANK:\d+\]\]/.test(
        bodyText.slice(
          Math.max(0, posInBodyText - 12),
          posInBodyText + trimmed.length + 12,
        ),
      ) &&
      bodyText
        .slice(posInBodyText, posInBodyText + trimmed.length)
        .includes("BLANK")
    ) {
      return { ok: false, reason: "이미 빈칸으로 처리된 영역입니다." };
    }
  }

  const maxIdx = existingBlanks.reduce((m, b) => Math.max(m, b.idx), 0);
  const newIdx = maxIdx + 1;

  // body_text 업데이트 — body_text 에 등장한 경우에만
  const newBodyText =
    posInBodyText !== -1
      ? bodyText.slice(0, posInBodyText) +
        `[[BLANK:${newIdx}]]` +
        bodyText.slice(posInBodyText + trimmed.length)
      : bodyText;

  // 컨텍스트 — 답 위치 ±30 글자 (token 내부 또는 block cumulative).
  // 30자 윈도우는 같은 답이 여러 항에 등장하고 직전 12자가 동일한 케이스에서
  // anchor 매칭이 의도 자리만 잡도록 한다.
  let beforeContext = "";
  let afterContext = "";
  let blockId: string | null = null;
  if (tokenMatch) {
    const { tokenText, position } = tokenMatch;
    beforeContext = tokenText.slice(Math.max(0, position - 30), position);
    afterContext = tokenText.slice(
      position + trimmed.length,
      Math.min(tokenText.length, position + trimmed.length + 30),
    );
    // 매칭된 occurrence 의 블록 id — DOM 에서 받은 blockHint 가 있으면 그것, 없으면 매칭 위치
    // 자체의 blockId. 향후 정답 재입력 시 슬롯이 본래 항을 떠나지 않도록 저장.
    blockId = hints?.blockHint?.trim() || tokenMatch.blockId;
  }

  // 정확 위치 — DOM 데이터 속성으로 캡처한 blockIndex/cumOffset. 두 값 다 있으면 저장.
  // (rendering 시 컨텍스트 매칭 무시하고 이 좌표로 직접 배치.)
  const exactBlockIndex =
    typeof hints?.blockIndex === "number" && Number.isFinite(hints.blockIndex)
      ? hints.blockIndex
      : undefined;
  const exactCumOffset =
    typeof hints?.cumOffset === "number" && Number.isFinite(hints.cumOffset)
      ? hints.cumOffset
      : undefined;

  const newBlanks: BlankItem[] = [
    ...existingBlanks,
    {
      idx: newIdx,
      length: Math.max(1, trimmed.length),
      answer: trimmed,
      beforeContext,
      afterContext,
      blockId: blockId ?? undefined,
      blockIndex: exactBlockIndex,
      cumOffset: exactCumOffset,
    },
  ].sort((a, b) => a.idx - b.idx);

  const dbJson = newBlanks.map((b) => ({
    idx: b.idx,
    length: b.length,
    answer: b.answer,
    before_context: b.beforeContext ?? "",
    after_context: b.afterContext ?? "",
    ...(b.blockId ? { block_id: b.blockId } : {}),
    ...(typeof b.blockIndex === "number" ? { block_index: b.blockIndex } : {}),
    ...(typeof b.cumOffset === "number" ? { cum_offset: b.cumOffset } : {}),
  }));

  const { error: upErr } = await client
    .from("article_blank_sets")
    .update({
      body_text: newBodyText,
      blanks: dbJson as never,
    })
    .eq("set_id", setId);
  if (upErr) return { ok: false, reason: upErr.message };
  return { ok: true, newIdx };
}

// 빈칸 제거 — body_text 의 [[BLANK:N]] 을 정답 텍스트로 치환, blanks 배열에서 idx 제거.
export async function removeBlankFromSet(
  client: SupabaseClient<Database>,
  setId: string,
  blankIdx: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { data: row, error } = await client
    .from("article_blank_sets")
    .select("body_text, blanks")
    .eq("set_id", setId)
    .single();
  if (error) return { ok: false, reason: error.message };

  const blanks = parseBlanks(row.blanks);
  const target = blanks.find((b) => b.idx === blankIdx);
  if (!target) return { ok: false, reason: "해당 빈칸 없음" };

  // 정답 텍스트로 치환. 정답이 비어있으면 그냥 토큰 제거.
  const replacement = target.answer || "";
  const tokenRe = new RegExp(`\\[\\[BLANK:${blankIdx}\\]\\]`, "g");
  const newBodyText = row.body_text.replace(tokenRe, replacement);

  const newBlanks = blanks.filter((b) => b.idx !== blankIdx);
  const dbJson = newBlanks.map((b) => ({
    idx: b.idx,
    length: b.length,
    answer: b.answer,
    before_context: b.beforeContext ?? "",
    after_context: b.afterContext ?? "",
  }));

  const { error: upErr } = await client
    .from("article_blank_sets")
    .update({
      body_text: newBodyText,
      blanks: dbJson as never,
    })
    .eq("set_id", setId);
  if (upErr) return { ok: false, reason: upErr.message };
  return { ok: true };
}

// 여러 idx 한번에 제거. body_text 의 [[BLANK:N]] 토큰들을 각 빈칸의 정답으로 치환,
// blanks 배열에서 해당 idx 들 일괄 제거. 한 번의 update 트랜잭션.
export async function removeBlanksFromSet(
  client: SupabaseClient<Database>,
  setId: string,
  blankIdxs: number[],
): Promise<{ ok: true; removed: number } | { ok: false; reason: string }> {
  if (blankIdxs.length === 0) return { ok: true, removed: 0 };
  const { data: row, error } = await client
    .from("article_blank_sets")
    .select("body_text, blanks")
    .eq("set_id", setId)
    .single();
  if (error) return { ok: false, reason: error.message };

  const blanks = parseBlanks(row.blanks);
  const idxSet = new Set(blankIdxs);
  const targetMap = new Map<number, BlankItem>();
  for (const b of blanks) {
    if (idxSet.has(b.idx)) targetMap.set(b.idx, b);
  }
  if (targetMap.size === 0) return { ok: true, removed: 0 };

  let newBodyText = row.body_text;
  for (const [idx, target] of targetMap.entries()) {
    const replacement = target.answer || "";
    const tokenRe = new RegExp(`\\[\\[BLANK:${idx}\\]\\]`, "g");
    newBodyText = newBodyText.replace(tokenRe, replacement);
  }

  const newBlanks = blanks.filter((b) => !idxSet.has(b.idx));
  const dbJson = newBlanks.map((b) => ({
    idx: b.idx,
    length: b.length,
    answer: b.answer,
    before_context: b.beforeContext ?? "",
    after_context: b.afterContext ?? "",
  }));

  const { error: upErr } = await client
    .from("article_blank_sets")
    .update({
      body_text: newBodyText,
      blanks: dbJson as never,
    })
    .eq("set_id", setId);
  if (upErr) return { ok: false, reason: upErr.message };
  return { ok: true, removed: targetMap.size };
}


// admin: 미매칭(answer 빈) 빈칸 가진 set 목록
export interface BlankSetSummary {
  setId: string;
  articleId: string;
  articleNumber: string | null;
  articleLabel: string;
  ownerId: string;
  version: string;
  displayName: string | null;
  totalBlanks: number;
  filledBlanks: number;
  unmappedBlanks: number;
}

// 빈칸 set fork — 다른 owner 의 set 을 본인 owner 로 복제.
export async function forkBlankSet(
  client: SupabaseClient<Database>,
  sourceSetId: string,
  ownerId: string,
  displayName: string | null,
): Promise<string> {
  const { data: src, error } = await client
    .from("article_blank_sets")
    .select("article_id, version, body_text, blanks, importance")
    .eq("set_id", sourceSetId)
    .single();
  if (error) throw error;
  // 같은 (article_id, version, owner_id) 조합이 있으면 새 version 자동 부여
  let version = src.version;
  for (let i = 2; i < 100; i++) {
    const { data: existing } = await client
      .from("article_blank_sets")
      .select("set_id")
      .eq("article_id", src.article_id)
      .eq("version", version)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (!existing) break;
    version = `${src.version}-${i}`;
  }
  const { data: inserted, error: insErr } = await client
    .from("article_blank_sets")
    .insert({
      article_id: src.article_id,
      version,
      body_text: src.body_text,
      blanks: src.blanks as never,
      importance: src.importance,
      owner_id: ownerId,
      display_name: displayName,
    })
    .select("set_id")
    .single();
  if (insErr) throw insErr;
  return inserted.set_id;
}

export async function listBlankSetsWithStatus(
  client: SupabaseClient<Database>,
  lawCode: string,
  ownerId?: string,
): Promise<BlankSetSummary[]> {
  const { data: law, error: lawErr } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (lawErr) throw lawErr;
  if (!law) return [];

  let q = client
    .from("article_blank_sets")
    .select(
      "set_id, blanks, owner_id, version, display_name, articles!inner(article_id, article_number, display_label, law_id)",
    )
    .eq("articles.law_id", law.law_id);
  if (ownerId) q = q.eq("owner_id", ownerId);
  const { data, error } = await q;
  if (error) throw error;

  const out: BlankSetSummary[] = [];
  for (const row of data ?? []) {
    const blanks = parseBlanks(row.blanks);
    const filled = blanks.filter((b) => b.answer.trim().length > 0).length;
    const article = row.articles;
    if (!article) continue;
    out.push({
      setId: row.set_id,
      articleId: article.article_id,
      articleNumber: article.article_number,
      articleLabel: article.display_label,
      ownerId: row.owner_id,
      version: row.version,
      displayName: row.display_name,
      totalBlanks: blanks.length,
      filledBlanks: filled,
      unmappedBlanks: blanks.length - filled,
    });
  }
  return out.sort((a, b) => {
    const aN = aNum(a.articleNumber);
    const bN = aNum(b.articleNumber);
    if (aN[0] !== bN[0]) return aN[0] - bN[0];
    return aN[1] - bN[1];
  });
}

function aNum(s: string | null): [number, number] {
  if (!s) return [0, 0];
  const m = s.match(/^(\d+)(?:의(\d+))?/);
  if (!m) return [0, 0];
  return [Number(m[1]), m[2] ? Number(m[2]) : 0];
}

// ───────── 사용자 학습 통계 ─────────

export interface UserBlankStats {
  totalAttempts: number;
  correctAttempts: number;
  uniqueBlanksAttempted: number;
  uniqueBlanksCorrect: number;
  recentArticles: RecentArticle[];
  weakBlanks: WeakBlank[];
}

export interface RecentArticle {
  setId: string;
  articleId: string;
  articleNumber: string | null;
  articleLabel: string;
  lawCode: string;
  ownerId: string;
  ownerName: string | null;
  totalBlanks: number;
  correctBlanks: number;
  lastAttemptedAt: string;
}

export interface WeakBlank {
  setId: string;
  blankIdx: number;
  articleNumber: string | null;
  articleLabel: string;
  lawCode: string;
  ownerId: string;
  ownerName: string | null;
  wrongCount: number;
  attempts: number;
  answer: string;
}

export async function getUserBlankStats(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<UserBlankStats> {
  const { data: attempts, error } = await client
    .from("user_blank_attempts")
    .select("set_id, blank_idx, is_correct, attempted_at, user_input")
    .eq("user_id", userId)
    .order("attempted_at", { ascending: false })
    .limit(2000);
  if (error) throw error;

  const all = attempts ?? [];
  const totalAttempts = all.length;
  const correctAttempts = all.filter((a) => a.is_correct).length;

  const blankKey = (setId: string, idx: number) => `${setId}:${idx}`;
  const blanksAttempted = new Set<string>();
  const blanksCorrect = new Set<string>();
  const wrongCount = new Map<string, number>();
  const attemptCount = new Map<string, number>();
  const lastByBlank = new Map<string, string>();
  const lastBySet = new Map<string, string>();
  const setBlanksAttempted = new Map<string, Set<number>>();
  const setBlanksCorrect = new Map<string, Set<number>>();

  for (const a of all) {
    const key = blankKey(a.set_id, a.blank_idx);
    blanksAttempted.add(key);
    attemptCount.set(key, (attemptCount.get(key) ?? 0) + 1);
    if (a.is_correct) {
      blanksCorrect.add(key);
    } else {
      wrongCount.set(key, (wrongCount.get(key) ?? 0) + 1);
    }
    if (!lastByBlank.has(key)) lastByBlank.set(key, a.attempted_at);
    if (!lastBySet.has(a.set_id)) lastBySet.set(a.set_id, a.attempted_at);
    const setAttempted = setBlanksAttempted.get(a.set_id) ?? new Set<number>();
    setAttempted.add(a.blank_idx);
    setBlanksAttempted.set(a.set_id, setAttempted);
    if (a.is_correct) {
      const setCorrect = setBlanksCorrect.get(a.set_id) ?? new Set<number>();
      setCorrect.add(a.blank_idx);
      setBlanksCorrect.set(a.set_id, setCorrect);
    }
  }

  // 최근 학습한 set + 메타 fetch
  const recentSetIds = [...lastBySet.keys()].slice(0, 10);
  let recentArticles: RecentArticle[] = [];
  if (recentSetIds.length > 0) {
    const { data: sets } = await client
      .from("article_blank_sets")
      .select(
        "set_id, article_id, blanks, owner_id, profiles!owner_id(name), articles(article_number, display_label, laws(law_code))",
      )
      .in("set_id", recentSetIds);
    for (const row of sets ?? []) {
      const article = row.articles;
      if (!article) continue;
      const blanksArr = Array.isArray(row.blanks) ? row.blanks : [];
      recentArticles.push({
        setId: row.set_id,
        articleId: row.article_id,
        articleNumber: article.article_number,
        articleLabel: article.display_label,
        lawCode: article.laws?.law_code ?? "",
        ownerId: row.owner_id,
        ownerName: row.profiles?.name ?? null,
        totalBlanks: blanksArr.length,
        correctBlanks: setBlanksCorrect.get(row.set_id)?.size ?? 0,
        lastAttemptedAt: lastBySet.get(row.set_id) ?? "",
      });
    }
    recentArticles.sort(
      (a, b) =>
        new Date(b.lastAttemptedAt).getTime() -
        new Date(a.lastAttemptedAt).getTime(),
    );
  }

  // 약점 빈칸 — wrong count 순. 정답 한번도 못 맞춘 것 우선.
  const weakKeys = [...wrongCount.entries()]
    .filter(([k, _]) => !blanksCorrect.has(k))
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);
  const weakSetIds = [...new Set(weakKeys.map(([k]) => k.split(":")[0]))];
  let weakBlanks: WeakBlank[] = [];
  if (weakSetIds.length > 0) {
    const { data: sets } = await client
      .from("article_blank_sets")
      .select(
        "set_id, blanks, owner_id, profiles!owner_id(name), articles(article_number, display_label, laws(law_code))",
      )
      .in("set_id", weakSetIds);
    type SetRow = NonNullable<typeof sets>[number];
    const setMap = new Map<string, SetRow>(
      (sets ?? []).map((s) => [s.set_id, s]),
    );
    for (const [key, wc] of weakKeys) {
      const [setId, idxStr] = key.split(":");
      const idx = Number(idxStr);
      const setRow = setMap.get(setId);
      if (!setRow) continue;
      const article = setRow.articles;
      if (!article) continue;
      const blanksArr = Array.isArray(setRow.blanks) ? setRow.blanks : [];
      const target = blanksArr.find(
        (b: unknown) =>
          b != null &&
          typeof b === "object" &&
          (b as { idx?: number }).idx === idx,
      ) as { answer?: string } | undefined;
      weakBlanks.push({
        setId,
        blankIdx: idx,
        articleNumber: article.article_number,
        articleLabel: article.display_label,
        lawCode: article.laws?.law_code ?? "",
        ownerId: setRow.owner_id,
        ownerName: setRow.profiles?.name ?? null,
        wrongCount: wc,
        attempts: attemptCount.get(key) ?? wc,
        answer: target?.answer ?? "",
      });
    }
  }

  return {
    totalAttempts,
    correctAttempts,
    uniqueBlanksAttempted: blanksAttempted.size,
    uniqueBlanksCorrect: blanksCorrect.size,
    recentArticles,
    weakBlanks,
  };
}

// ───────── 운영자/강사용 집계 통계 ─────────

export interface AdminBlankSummary {
  totalAttempts: number;
  correctAttempts: number;
  activeUsers: number;
  uniqueBlanks: number;
}

export interface AdminContentTopBlank {
  setId: string;
  blankIdx: number;
  articleNumber: string | null;
  articleLabel: string;
  lawCode: string;
  ownerName: string | null;
  answer: string;
  attempts: number;
  wrongCount: number;
  accuracy: number;
}

export interface AdminContentStats extends AdminBlankSummary {
  topWrong: AdminContentTopBlank[];
  topTried: AdminContentTopBlank[];
}

export async function getAdminContentBlankStats(
  client: SupabaseClient<Database>,
): Promise<AdminContentStats> {
  // 운영자/강사 RLS 정책으로 모든 row 조회. 최근 30일 + 무제한 limit 도 가능하지만
  // 우선 5000 rows 로 안전 cap.
  const { data: attempts, error } = await client
    .from("user_blank_attempts")
    .select("user_id, set_id, blank_idx, is_correct")
    .order("attempted_at", { ascending: false })
    .limit(10000);
  if (error) throw error;
  const all = attempts ?? [];

  const totalAttempts = all.length;
  const correctAttempts = all.filter((a) => a.is_correct).length;
  const userSet = new Set<string>();
  const blankAttempts = new Map<string, number>();
  const blankWrong = new Map<string, number>();

  for (const a of all) {
    userSet.add(a.user_id);
    const key = `${a.set_id}:${a.blank_idx}`;
    blankAttempts.set(key, (blankAttempts.get(key) ?? 0) + 1);
    if (!a.is_correct) {
      blankWrong.set(key, (blankWrong.get(key) ?? 0) + 1);
    }
  }

  const uniqueBlanks = blankAttempts.size;

  // 가장 많이 틀린 + 가장 많이 시도한 빈칸 후보 키.
  const sortedByWrong = [...blankWrong.entries()].sort(
    ([, a], [, b]) => b - a,
  );
  const sortedByTried = [...blankAttempts.entries()].sort(
    ([, a], [, b]) => b - a,
  );
  const topWrongKeys = sortedByWrong.slice(0, 20).map(([k]) => k);
  const topTriedKeys = sortedByTried.slice(0, 20).map(([k]) => k);
  const allTopKeys = [...new Set([...topWrongKeys, ...topTriedKeys])];

  if (allTopKeys.length === 0) {
    return {
      totalAttempts,
      correctAttempts,
      activeUsers: userSet.size,
      uniqueBlanks,
      topWrong: [],
      topTried: [],
    };
  }

  // set 정보 fetch.
  const setIds = [...new Set(allTopKeys.map((k) => k.split(":")[0]))];
  const { data: sets } = await client
    .from("article_blank_sets")
    .select(
      "set_id, blanks, owner_id, profiles!owner_id(name), articles(article_number, display_label, laws(law_code))",
    )
    .in("set_id", setIds);
  type SetRow = NonNullable<typeof sets>[number];
  const setMap = new Map<string, SetRow>(
    (sets ?? []).map((s) => [s.set_id, s]),
  );

  const buildRow = (key: string): AdminContentTopBlank | null => {
    const [setId, idxStr] = key.split(":");
    const idx = Number(idxStr);
    const setRow = setMap.get(setId);
    if (!setRow?.articles) return null;
    const blanksArr = Array.isArray(setRow.blanks) ? setRow.blanks : [];
    const target = blanksArr.find(
      (b: unknown) =>
        b != null &&
        typeof b === "object" &&
        (b as { idx?: number }).idx === idx,
    ) as { answer?: string } | undefined;
    const attempts = blankAttempts.get(key) ?? 0;
    const wrong = blankWrong.get(key) ?? 0;
    const accuracy =
      attempts > 0 ? Math.round(((attempts - wrong) / attempts) * 100) : 0;
    return {
      setId,
      blankIdx: idx,
      articleNumber: setRow.articles.article_number,
      articleLabel: setRow.articles.display_label,
      lawCode: setRow.articles.laws?.law_code ?? "",
      ownerName: setRow.profiles?.name ?? null,
      answer: target?.answer ?? "",
      attempts,
      wrongCount: wrong,
      accuracy,
    };
  };

  const topWrong = topWrongKeys
    .map(buildRow)
    .filter((r): r is AdminContentTopBlank => r !== null);
  const topTried = topTriedKeys
    .map(buildRow)
    .filter((r): r is AdminContentTopBlank => r !== null);

  return {
    totalAttempts,
    correctAttempts,
    activeUsers: userSet.size,
    uniqueBlanks,
    topWrong,
    topTried,
  };
}

export interface AdminAutoTopBlank {
  articleId: string;
  articleNumber: string | null;
  articleLabel: string;
  lawCode: string;
  blockIndex: number;
  cumOffset: number;
  answer: string;
  attempts: number;
  wrongCount: number;
  accuracy: number;
}

export interface AdminAutoStats extends AdminBlankSummary {
  topWrong: AdminAutoTopBlank[];
  topTried: AdminAutoTopBlank[];
}

export async function getAdminAutoBlankStats(
  client: SupabaseClient<Database>,
  blankType: AutoBlankType,
): Promise<AdminAutoStats> {
  const { data: attempts, error } = await client
    .from("user_auto_blank_attempts")
    .select("user_id, article_id, block_index, cum_offset, answer, is_correct")
    .eq("blank_type", blankType)
    .order("attempted_at", { ascending: false })
    .limit(10000);
  if (error) throw error;
  const all = attempts ?? [];

  const totalAttempts = all.length;
  const correctAttempts = all.filter((a) => a.is_correct).length;
  const userSet = new Set<string>();
  const blankAttempts = new Map<string, number>();
  const blankWrong = new Map<string, number>();
  const blankAnswer = new Map<string, string>();

  for (const a of all) {
    userSet.add(a.user_id);
    const key = `${a.article_id}:${a.block_index}:${a.cum_offset}`;
    blankAttempts.set(key, (blankAttempts.get(key) ?? 0) + 1);
    if (!blankAnswer.has(key)) blankAnswer.set(key, a.answer);
    if (!a.is_correct) {
      blankWrong.set(key, (blankWrong.get(key) ?? 0) + 1);
    }
  }

  const uniqueBlanks = blankAttempts.size;
  const topWrongKeys = [...blankWrong.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([k]) => k);
  const topTriedKeys = [...blankAttempts.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([k]) => k);
  const allTopKeys = [...new Set([...topWrongKeys, ...topTriedKeys])];

  if (allTopKeys.length === 0) {
    return {
      totalAttempts,
      correctAttempts,
      activeUsers: userSet.size,
      uniqueBlanks,
      topWrong: [],
      topTried: [],
    };
  }

  const articleIds = [
    ...new Set(allTopKeys.map((k) => k.split(":")[0])),
  ];
  const { data: rows } = await client
    .from("articles")
    .select("article_id, article_number, display_label, laws(law_code)")
    .in("article_id", articleIds);
  type ArticleRow = NonNullable<typeof rows>[number];
  const articleMap = new Map<string, ArticleRow>(
    (rows ?? []).map((r) => [r.article_id, r]),
  );

  const buildRow = (key: string): AdminAutoTopBlank | null => {
    const [articleId, blockIndexStr, cumOffsetStr] = key.split(":");
    const ar = articleMap.get(articleId);
    if (!ar) return null;
    const attempts = blankAttempts.get(key) ?? 0;
    const wrong = blankWrong.get(key) ?? 0;
    const accuracy =
      attempts > 0 ? Math.round(((attempts - wrong) / attempts) * 100) : 0;
    return {
      articleId,
      articleNumber: ar.article_number,
      articleLabel: ar.display_label,
      lawCode: ar.laws?.law_code ?? "",
      blockIndex: Number(blockIndexStr),
      cumOffset: Number(cumOffsetStr),
      answer: blankAnswer.get(key) ?? "",
      attempts,
      wrongCount: wrong,
      accuracy,
    };
  };

  return {
    totalAttempts,
    correctAttempts,
    activeUsers: userSet.size,
    uniqueBlanks,
    topWrong: topWrongKeys
      .map(buildRow)
      .filter((r): r is AdminAutoTopBlank => r !== null),
    topTried: topTriedKeys
      .map(buildRow)
      .filter((r): r is AdminAutoTopBlank => r !== null),
  };
}

// ───────── 주체/시기 빈칸 학습 통계 ─────────

export type AutoBlankType = "subject" | "period";

export interface AutoRecentArticle {
  articleId: string;
  articleNumber: string | null;
  articleLabel: string;
  lawCode: string;
  totalAttempts: number;
  correctAttempts: number;
  uniqueBlanksAttempted: number;
  uniqueBlanksCorrect: number;
  lastAttemptedAt: string;
}

export interface AutoWeakBlank {
  articleId: string;
  articleNumber: string | null;
  articleLabel: string;
  lawCode: string;
  blockIndex: number;
  cumOffset: number;
  answer: string;
  wrongCount: number;
  attempts: number;
}

export interface UserAutoBlankStats {
  totalAttempts: number;
  correctAttempts: number;
  uniqueBlanksAttempted: number;
  uniqueBlanksCorrect: number;
  recentArticles: AutoRecentArticle[];
  weakBlanks: AutoWeakBlank[];
}

export async function getUserAutoBlankStats(
  client: SupabaseClient<Database>,
  userId: string,
  blankType: AutoBlankType,
): Promise<UserAutoBlankStats> {
  const { data: attempts, error } = await client
    .from("user_auto_blank_attempts")
    .select(
      "article_id, block_index, cum_offset, answer, is_correct, attempted_at",
    )
    .eq("user_id", userId)
    .eq("blank_type", blankType)
    .order("attempted_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  const all = attempts ?? [];

  const totalAttempts = all.length;
  const correctAttempts = all.filter((a) => a.is_correct).length;

  // 한 빈칸을 (article_id, block_index, cum_offset) 으로 식별.
  const blankKey = (
    articleId: string,
    blockIndex: number,
    cumOffset: number,
  ) => `${articleId}:${blockIndex}:${cumOffset}`;
  const blanksAttempted = new Set<string>();
  const blanksCorrect = new Set<string>();
  const wrongCount = new Map<string, number>();
  const attemptCount = new Map<string, number>();
  const lastByBlank = new Map<string, string>();
  const lastByArticle = new Map<string, string>();
  const articleAttempts = new Map<string, number>();
  const articleCorrect = new Map<string, number>();
  const articleBlanksAttempted = new Map<string, Set<string>>();
  const articleBlanksCorrect = new Map<string, Set<string>>();
  const blankAnswer = new Map<string, string>();

  for (const a of all) {
    const key = blankKey(a.article_id, a.block_index, a.cum_offset);
    blanksAttempted.add(key);
    attemptCount.set(key, (attemptCount.get(key) ?? 0) + 1);
    if (!blankAnswer.has(key)) blankAnswer.set(key, a.answer);
    articleAttempts.set(
      a.article_id,
      (articleAttempts.get(a.article_id) ?? 0) + 1,
    );
    const articleSet =
      articleBlanksAttempted.get(a.article_id) ?? new Set<string>();
    articleSet.add(key);
    articleBlanksAttempted.set(a.article_id, articleSet);

    if (a.is_correct) {
      blanksCorrect.add(key);
      articleCorrect.set(
        a.article_id,
        (articleCorrect.get(a.article_id) ?? 0) + 1,
      );
      const correctSet =
        articleBlanksCorrect.get(a.article_id) ?? new Set<string>();
      correctSet.add(key);
      articleBlanksCorrect.set(a.article_id, correctSet);
    } else {
      wrongCount.set(key, (wrongCount.get(key) ?? 0) + 1);
    }
    if (!lastByBlank.has(key)) lastByBlank.set(key, a.attempted_at);
    if (!lastByArticle.has(a.article_id))
      lastByArticle.set(a.article_id, a.attempted_at);
  }

  // 최근 article + 메타.
  const recentArticleIds = [...lastByArticle.keys()].slice(0, 10);
  let recentArticles: AutoRecentArticle[] = [];
  if (recentArticleIds.length > 0) {
    const { data: rows } = await client
      .from("articles")
      .select("article_id, article_number, display_label, laws(law_code)")
      .in("article_id", recentArticleIds);
    for (const row of rows ?? []) {
      recentArticles.push({
        articleId: row.article_id,
        articleNumber: row.article_number,
        articleLabel: row.display_label,
        lawCode: row.laws?.law_code ?? "",
        totalAttempts: articleAttempts.get(row.article_id) ?? 0,
        correctAttempts: articleCorrect.get(row.article_id) ?? 0,
        uniqueBlanksAttempted:
          articleBlanksAttempted.get(row.article_id)?.size ?? 0,
        uniqueBlanksCorrect:
          articleBlanksCorrect.get(row.article_id)?.size ?? 0,
        lastAttemptedAt: lastByArticle.get(row.article_id) ?? "",
      });
    }
    recentArticles.sort(
      (a, b) =>
        new Date(b.lastAttemptedAt).getTime() -
        new Date(a.lastAttemptedAt).getTime(),
    );
  }

  // 약점 — wrong 많고 아직 정답 못 맞춘 빈칸 우선.
  const weakKeys = [...wrongCount.entries()]
    .filter(([k]) => !blanksCorrect.has(k))
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15);
  const weakArticleIds = [
    ...new Set(weakKeys.map(([k]) => k.split(":")[0])),
  ];
  let weakBlanks: AutoWeakBlank[] = [];
  if (weakArticleIds.length > 0) {
    const { data: rows } = await client
      .from("articles")
      .select("article_id, article_number, display_label, laws(law_code)")
      .in("article_id", weakArticleIds);
    type ArticleRow = NonNullable<typeof rows>[number];
    const articleMap = new Map<string, ArticleRow>(
      (rows ?? []).map((r) => [r.article_id, r]),
    );
    for (const [key, wc] of weakKeys) {
      const [articleId, blockIndexStr, cumOffsetStr] = key.split(":");
      const ar = articleMap.get(articleId);
      if (!ar) continue;
      weakBlanks.push({
        articleId,
        articleNumber: ar.article_number,
        articleLabel: ar.display_label,
        lawCode: ar.laws?.law_code ?? "",
        blockIndex: Number(blockIndexStr),
        cumOffset: Number(cumOffsetStr),
        answer: blankAnswer.get(key) ?? "",
        wrongCount: wc,
        attempts: attemptCount.get(key) ?? wc,
      });
    }
  }

  return {
    totalAttempts,
    correctAttempts,
    uniqueBlanksAttempted: blanksAttempted.size,
    uniqueBlanksCorrect: blanksCorrect.size,
    recentArticles,
    weakBlanks,
  };
}
