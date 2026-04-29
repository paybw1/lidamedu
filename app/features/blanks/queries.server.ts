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
      beforeContext:
        typeof o.before_context === "string"
          ? o.before_context
          : typeof o.beforeContext === "string"
            ? o.beforeContext
            : undefined,
      afterContext:
        typeof o.after_context === "string"
          ? o.after_context
          : typeof o.afterContext === "string"
            ? o.afterContext
            : undefined,
    });
  }
  return out.sort((a, b) => a.idx - b.idx);
}

// admin: 빈칸 set 의 정답 한 칸 갱신.
// 정답이 원본 article body_json 안에서 발견되면 before/after_context 도 자동 채움.
// 학습 화면(BlankFillView) 의 매칭 패턴 = before+answer+after 이므로 컨텍스트가 비면 input 자체가
// 본문에 그려지지 않는다. 운영자는 정답만 입력하고, 컨텍스트는 시스템이 자동 추출.
export async function updateBlankAnswer(
  client: SupabaseClient<Database>,
  setId: string,
  blankIdx: number,
  answer: string,
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

  // 2. 컨텍스트 자동 추출 — body_json 평문 안에서 answer 위치 탐색
  let beforeContext = "";
  let afterContext = "";
  const trimmed = answer.trim();
  if (trimmed.length > 0 && data.articles?.current_revision_id) {
    const { data: rev } = await client
      .from("article_revisions")
      .select("body_json")
      .eq("revision_id", data.articles.current_revision_id)
      .maybeSingle();
    const flatText = flattenBodyText(rev?.body_json);
    if (flatText) {
      const matches = findAllOccurrences(flatText, trimmed);
      if (matches.length > 0) {
        // 단일 매칭이면 그 위치, 다중이면 첫 위치 (운영자가 검수 가능)
        const start = matches[0];
        const CONTEXT_LEN = 12;
        beforeContext = flatText.slice(
          Math.max(0, start - CONTEXT_LEN),
          start,
        );
        afterContext = flatText.slice(
          start + trimmed.length,
          Math.min(flatText.length, start + trimmed.length + CONTEXT_LEN),
        );
      }
    }
  }

  const next = blanks.map((b) =>
    b.idx === blankIdx
      ? {
          ...b,
          answer: trimmed,
          beforeContext,
          afterContext,
        }
      : b,
  );

  // BlankItem (camelCase) → DB JSON (snake_case)
  const dbJson = next.map((b) => ({
    idx: b.idx,
    length: b.length,
    answer: b.answer,
    before_context: b.beforeContext ?? "",
    after_context: b.afterContext ?? "",
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

// 빈칸 자료에 새 빈칸 추가 — selection text 를 빈칸 자료 본문에서 첫 등장 위치를 찾아 [[BLANK:N]] 으로 치환,
// blanks 배열에 새 idx 추가. 컨텍스트는 원본 body_json 에서 자동 추출.
export async function addBlankToSet(
  client: SupabaseClient<Database>,
  setId: string,
  selectionText: string,
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
  // 빈칸 자료 본문 안에서 selection text 첫 등장 위치 (이미 토큰 [[BLANK:N]] 안 부분 회피)
  // 단순: indexOf — 토큰은 일반 문자열이라 selection 이 토큰을 포함하면 실패
  const pos = bodyText.indexOf(trimmed);
  if (pos === -1) {
    return {
      ok: false,
      reason:
        "빈칸 자료 본문에서 선택 텍스트를 찾지 못했습니다. 다른 단어를 선택해주세요.",
    };
  }
  // 이미 빈칸이 있는 위치인지 확인 — 그 자리가 [[BLANK:N]] 토큰 일부면 실패
  if (
    /\[\[BLANK:\d+\]\]/.test(
      bodyText.slice(Math.max(0, pos - 12), pos + trimmed.length + 12),
    ) &&
    bodyText.slice(pos, pos + trimmed.length).includes("BLANK")
  ) {
    return { ok: false, reason: "이미 빈칸으로 처리된 영역입니다." };
  }

  // blanks 파싱 + 새 idx 결정
  const blanks = parseBlanks(row.blanks);
  const maxIdx = blanks.reduce((m, b) => Math.max(m, b.idx), 0);
  const newIdx = maxIdx + 1;

  // body_text 의 해당 위치 → [[BLANK:newIdx]]
  const newBodyText =
    bodyText.slice(0, pos) +
    `[[BLANK:${newIdx}]]` +
    bodyText.slice(pos + trimmed.length);

  // 컨텍스트 자동 추출 — 원본 body_json 에서 selection text 위치 ±12 글자
  let beforeContext = "";
  let afterContext = "";
  if (row.articles?.current_revision_id) {
    const { data: rev } = await client
      .from("article_revisions")
      .select("body_json")
      .eq("revision_id", row.articles.current_revision_id)
      .maybeSingle();
    const flat = flattenBodyText(rev?.body_json);
    if (flat) {
      const found = flat.indexOf(trimmed);
      if (found !== -1) {
        beforeContext = flat.slice(Math.max(0, found - 12), found);
        afterContext = flat.slice(
          found + trimmed.length,
          Math.min(flat.length, found + trimmed.length + 12),
        );
      }
    }
  }

  const newBlanks = [
    ...blanks,
    {
      idx: newIdx,
      length: Math.max(1, trimmed.length),
      answer: trimmed,
      beforeContext,
      afterContext,
    },
  ].sort((a, b) => a.idx - b.idx);

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

// body_json blocks 의 모든 inline text/title_marker 를 평문으로 합친다 (관련조문 ref raw 도 포함).
function flattenBodyText(bodyJson: unknown): string {
  if (!bodyJson || typeof bodyJson !== "object") return "";
  const b = bodyJson as { blocks?: unknown };
  if (!Array.isArray(b.blocks)) return "";
  const out: string[] = [];
  const walk = (blocks: unknown[]) => {
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      const blk = block as Record<string, unknown>;
      const inline = Array.isArray(blk.inline) ? (blk.inline as unknown[]) : [];
      for (const tok of inline) {
        if (!tok || typeof tok !== "object") continue;
        const t = tok as Record<string, unknown>;
        if (typeof t.text === "string") out.push(t.text);
        else if (typeof t.raw === "string") out.push(t.raw);
      }
      if (Array.isArray(blk.children)) walk(blk.children as unknown[]);
    }
  };
  walk(b.blocks);
  return out.join(" ");
}

function findAllOccurrences(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const out: number[] = [];
  let from = 0;
  while (true) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    out.push(idx);
    from = idx + needle.length;
  }
  return out;
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

// admin: 정답이 미입력된 빈칸 단위 row.
// 한 set 안의 여러 미매칭 빈칸이 각각 row 로 펼쳐져 한꺼번에 검수 가능하게 한다.
export interface UnmappedBlankRow {
  setId: string;
  articleId: string;
  articleNumber: string | null;
  articleLabel: string;
  ownerId: string;
  ownerName: string | null;
  version: string;
  displayName: string | null;
  blankIdx: number;
  blankLength: number;
  // 빈칸 자료 본문(body_text) 안의 [[BLANK:idx]] 토큰 주변 발췌 (앞뒤 ~40자)
  excerpt: string;
}

export async function listUnmappedBlanks(
  client: SupabaseClient<Database>,
  lawCode: string,
  ownerId?: string,
): Promise<UnmappedBlankRow[]> {
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
      "set_id, body_text, blanks, owner_id, version, display_name, profiles!owner_id(name), articles!inner(article_id, article_number, display_label, law_id)",
    )
    .eq("articles.law_id", law.law_id);
  if (ownerId) q = q.eq("owner_id", ownerId);
  const { data, error } = await q;
  if (error) throw error;

  const out: UnmappedBlankRow[] = [];
  for (const row of data ?? []) {
    const blanks = parseBlanks(row.blanks);
    const article = row.articles;
    if (!article) continue;
    for (const b of blanks) {
      if (b.answer.trim().length > 0) continue;
      out.push({
        setId: row.set_id,
        articleId: article.article_id,
        articleNumber: article.article_number,
        articleLabel: article.display_label,
        ownerId: row.owner_id,
        ownerName: row.profiles?.name ?? null,
        version: row.version,
        displayName: row.display_name,
        blankIdx: b.idx,
        blankLength: b.length,
        excerpt: extractBlankExcerpt(row.body_text, b.idx),
      });
    }
  }
  return out.sort((a, b) => {
    const aN = aNum(a.articleNumber);
    const bN = aNum(b.articleNumber);
    if (aN[0] !== bN[0]) return aN[0] - bN[0];
    if (aN[1] !== bN[1]) return aN[1] - bN[1];
    if (a.setId !== b.setId) return a.setId < b.setId ? -1 : 1;
    return a.blankIdx - b.blankIdx;
  });
}

// body_text 에서 [[BLANK:idx]] 토큰 주변 ~40자 발췌. 같은 줄로 한정.
function extractBlankExcerpt(bodyText: string, blankIdx: number): string {
  const token = `[[BLANK:${blankIdx}]]`;
  const pos = bodyText.indexOf(token);
  if (pos === -1) return "";
  const lineStart = bodyText.lastIndexOf("\n", pos - 1) + 1;
  const lineEndRaw = bodyText.indexOf("\n", pos + token.length);
  const lineEnd = lineEndRaw === -1 ? bodyText.length : lineEndRaw;
  const line = bodyText.slice(lineStart, lineEnd);
  const tokenStartInLine = pos - lineStart;
  const before = line.slice(Math.max(0, tokenStartInLine - 40), tokenStartInLine);
  const after = line.slice(
    tokenStartInLine + token.length,
    Math.min(line.length, tokenStartInLine + token.length + 40),
  );
  return `${before}▢${after}`.trim();
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
