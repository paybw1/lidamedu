// feat-2-035 — 하급심 판결문 수집 코어(국가법령정보센터 판례 API).
//
// ★이 파일이 파싱·매칭의 SSOT 다. 배치 수집기(scripts/case-diagram/fetch-lower-court.mjs)와
//   운영 화면(/admin/cases/lower-court)이 **같은 코드**를 쓴다 — 원심 표기 정규식이
//   한 번 어긋나 41건이 통째로 "원심 미상"으로 분류된 적이 있어(2026-08-20) 사본을 두지 않는다.
//   스크립트는 tsx 로 이 파일을 직접 import 한다: `npx tsx scripts/case-diagram/fetch-lower-court.mjs`
//
// 의존성 없음(node 내장 fetch 만) — 그래야 앱 번들과 tsx 양쪽에서 그대로 돈다.
// `~/` alias 를 쓰지 말 것(스크립트 쪽에서 해석되지 않는다).

const API = "https://www.law.go.kr/DRF";
/** 공개 OC. 별도 발급 키가 있으면 환경변수로 덮는다. */
const OC = process.env.LAW_GO_KR_OC ?? "test";

export interface LowerRef {
  court: string;
  /** 판결문 표기 그대로의 선고일(YYYY.MM.DD). 없는 표기도 있다. */
  decidedAt: string | null;
  caseNumber: string;
}

export interface SerialHit {
  serial: string;
  court: string;
  decidedAt: string;
}

function stripTags(s: unknown): string {
  return String(s ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r\n?/g, "\n")
    .trim();
}

/** 법원명 정규화 — "서울고등법원" ↔ "서울고법", "대구지방법원" ↔ "대구지법" 을 같게 본다. */
export function normalizeCourt(name: unknown): string {
  return String(name ?? "")
    .replace(/\s+/g, "")
    .replace(/고등법원/g, "고법")
    .replace(/지방법원/g, "지법")
    .replace(/가정법원/g, "가법")
    .replace(/행정법원/g, "행법")
    .trim();
}

/**
 * 날짜 표기 정규화 — API 는 "2016. 1. 21." · "20160121" · "2016.01.21" 을 섞어 준다.
 * 문자열 그대로 비교하면 같은 날짜가 불일치로 떨어져 멀쩡한 판결문을 미수록으로 분류한다.
 */
export function dateKey(value: unknown): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const spaced = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (spaced) {
    return `${spaced[1]}-${spaced[2].padStart(2, "0")}-${spaced[3].padStart(2, "0")}`;
  }
  const packed = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (packed) return `${packed[1]}-${packed[2]}-${packed[3]}`;
  return null;
}

/**
 * 대법원 원문 헤더에서 원심 표기 추출. 판결·결정 둘 다.
 *
 * ★표기가 세 갈래다(원장 지적 2026-08-20 — "전문에 원심번호가 있는데 미상으로 나온다"):
 *   ① 【원심판결】 특허법원 2023. 6. 16. 선고 2022허4635 판결
 *   ② 원 심 판 결  특허법원 2016. 1. 21. 선고 2014허4913 판결   ← 글자 사이 공백·괄호 없음
 *   ③ 【원심결정】 대구지법 2024. 12. 5.자 2024라10826 결정
 *   ②를 못 잡아 41건이 통째로 "원심 미상"으로 분류돼 있었다.
 * 사건번호 연도도 2자리(98노8499)가 있어 \d{2,4} 로 받는다.
 */
const LOWER_MARKER = "【?\\s*원\\s*심\\s*(?:판\\s*결|결\\s*정)\\s*】?";
const CASE_NO = "\\d{2,4}\\s*[가-힣]{1,3}\\s*\\d+";

export function parseLowerRef(officialTextMd: unknown): LowerRef | null {
  // 줄바꿈이 공백으로 들어온 전문이 많아 공백을 한 칸으로 눌러 놓고 찾는다.
  const text = String(officialTextMd ?? "").replace(/\s+/g, " ");
  const clean = (s: string) => s.replace(/\s+/g, "");

  const withDate = new RegExp(
    `${LOWER_MARKER}\\s*([^【]*?)\\s*(\\d{4})\\.\\s*(\\d{1,2})\\.\\s*(\\d{1,2})\\.\\s*(?:선고|자)\\s*(${CASE_NO})`,
  );
  const md = text.match(withDate);
  if (md) {
    const pad = (v: string) => v.padStart(2, "0");
    return {
      court: md[1].replace(/[,\s]+$/, "").trim(),
      decidedAt: `${md[2]}.${pad(md[3])}.${pad(md[4])}`,
      caseNumber: clean(md[5]),
    };
  }
  const noDate = new RegExp(`${LOWER_MARKER}\\s*([^【]*?)\\s*(${CASE_NO})`);
  const m = text.match(noDate);
  if (!m) return null;
  return {
    court: m[1].replace(/[,\s]+$/, "").trim(),
    decidedAt: null,
    caseNumber: clean(m[2]),
  };
}

/**
 * 사실관계가 실린 전문인지 판정. law.go.kr 은 같은 사건이라도 판시사항·판결요지만
 * 수록한 레코드를 주는 일이 있는데, 그건 "확보"가 아니다(도식의 사실관계를 못 쓴다).
 */
export function hasFactSection(text: unknown): boolean {
  const t = String(text ?? "");
  // 사실관계 표제는 법원·사건유형마다 다르다. 특허법원 심결취소소송은 "1. 기초사실" 이 많지만
  // "1. 이 사건 심결의 경위" 로 시작하는 판결도 그만큼 많다(둘 다 사실관계 절이다).
  if (
    /기초\s*사실|인정\s*사실|사실\s*관계|심결의\s*경위|처분의\s*경위|사건의\s*개요|분쟁의\s*경과|당사자의\s*주장/.test(
      t,
    )
  ) {
    return true;
  }
  // 표제가 위 어디에도 안 걸리는 판결문도 있다 — 당사자 표시와 【이 유】가 모두 있으면 전문으로 본다.
  // (판시사항·판결요지만 실린 레코드에는 둘 다 없다. 이 플래그의 목적이 바로 그 구분이다.)
  return (
    /【\s*원\s{0,6}고\s*】|【\s*신\s*청\s*인\s*】|【\s*채\s*권\s*자\s*】|【\s*항\s*소\s*인\s*】/.test(
      t,
    ) && /【\s*이\s{0,6}유\s*】/.test(t)
  );
}

interface PrecListItem {
  사건번호?: string;
  법원명?: string;
  선고일자?: string;
  사건명?: string;
  판례일련번호?: string | number;
}

/**
 * 국가법령정보센터 — 사건번호로 판례일련번호 조회. ★nb= 가 사건번호 키(query= 는 사건명).
 *
 * ★사건번호만으로는 판례가 유일하지 않다 — `허` 는 특허법원 전용이라 안전하지만
 *   `나`·`가합`·`라` 는 법원마다 같은 번호가 존재한다(서울고법 2008나68717 ≠ 부산고법 2008나68717).
 *   법원명이 다르면 채택하지 않는다. 엉뚱한 사건의 사실관계에 그럴듯한 출처를 달아 주는 게
 *   이 기능의 최악 실패다. 선고일자가 파싱된 경우 2차 확인으로 쓴다.
 */
export async function findSerial(
  caseNumber: string,
  expected?: { court?: string | null; decidedAt?: string | null } | null,
): Promise<{ hit: SerialHit | null; reason: string | null }> {
  const url = `${API}/lawSearch.do?OC=${OC}&target=prec&type=JSON&nb=${encodeURIComponent(caseNumber)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`lawSearch ${res.status}`);
  const json = (await res.json().catch(() => null)) as {
    PrecSearch?: { prec?: PrecListItem | PrecListItem[] };
  } | null;
  const raw = json?.PrecSearch?.prec;
  if (!raw) return { hit: null, reason: "미수록" };
  const list = Array.isArray(raw) ? raw : [raw];
  // 부분일치가 섞여 올 수 있어 사건번호 완전일치만 후보로.
  const sameNumber = list.filter(
    (p) => String(p?.사건번호 ?? "").trim() === caseNumber,
  );
  if (!sameNumber.length) return { hit: null, reason: "미수록" };

  const wantCourt = normalizeCourt(expected?.court);
  const wantDate = dateKey(expected?.decidedAt);
  const verified = sameNumber.filter((p) => {
    const gotCourt = normalizeCourt(p?.법원명);
    const courtOk = !wantCourt || !gotCourt || gotCourt === wantCourt;
    const gotDate = dateKey(p?.선고일자);
    const dateOk = !wantDate || !gotDate || gotDate === wantDate;
    return courtOk && dateOk;
  });
  if (!verified.length) {
    const got = sameNumber
      .map((p) => `${p?.법원명 ?? "?"} ${p?.선고일자 ?? "?"}`)
      .join(" / ");
    return {
      hit: null,
      reason: `법원·선고일 불일치 (기대 ${expected?.court ?? "?"} ${expected?.decidedAt ?? "?"} / 실제 ${got})`,
    };
  }
  const hit = verified[0];
  if (!hit?.판례일련번호) return { hit: null, reason: "미수록" };
  return {
    hit: {
      serial: String(hit.판례일련번호),
      court: String(hit.법원명 ?? "").trim(),
      decidedAt: String(hit.선고일자 ?? "").trim(),
    },
    reason: null,
  };
}

/** 판례일련번호 → 전문. */
export async function fetchFullText(serial: string): Promise<string> {
  const url = `${API}/lawService.do?OC=${OC}&target=prec&ID=${serial}&type=JSON`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`lawService ${res.status}`);
  const json = (await res.json().catch(() => null)) as {
    PrecService?: { 판례내용?: string };
  } | null;
  return stripTags(json?.PrecService?.판례내용);
}

export type LowerFetchOutcome =
  | {
      status: "loaded" | "summary_only";
      ref: LowerRef;
      hit: SerialHit;
      text: string;
      /** 우리 DB 원문이 비어 있어 대법원 전문을 API 에서 받아 원심 표기를 찾은 경우. */
      viaSupreme: boolean;
    }
  | { status: "not_in_api"; ref: LowerRef; reason: string; viaSupreme: boolean }
  | { status: "no_ref"; reason: string; viaSupreme: boolean };

/**
 * 대법원 판례 한 건 → 원심 판결문 전문.
 *
 * ★2단 탐색: 우리 DB 의 `cases.official_text_md` 에서 원심 표기를 찾고, 원문이 비어 있거나
 *   표기가 없으면 **대법원 전문을 API 에서 받아** 거기서 원심 표기를 찾는다.
 *   원심 미상 16건 중 13건이 "우리 DB 원문이 비어서"였다 — 로컬만 보면 영영 못 찾는다.
 *   ※받아 온 대법원 전문은 파싱에만 쓰고 버린다. `cases` 에 되쓰지 않는다(Non-negotiable 8).
 */
export async function resolveLowerCourtText(input: {
  supremeCaseNumber: string;
  /** cases.decided_at (YYYY-MM-DD) — 대법원 전문 폴백 시 동명이번 방지용 검증에 쓴다. */
  supremeDecidedAt?: string | null;
  officialTextMd?: string | null;
  /** 운영자가 원심 사건번호를 직접 지정한 경우 — 파싱을 건너뛴다. */
  forcedRef?: { caseNumber: string; court?: string | null } | null;
}): Promise<LowerFetchOutcome> {
  let viaSupreme = false;
  let ref: LowerRef | null = input.forcedRef
    ? {
        caseNumber: input.forcedRef.caseNumber.replace(/\s+/g, ""),
        court: (input.forcedRef.court ?? "").trim(),
        decidedAt: null,
      }
    : parseLowerRef(input.officialTextMd);

  if (!ref) {
    // 폴백 — 대법원 전문을 받아서 원심 표기를 찾는다.
    const supreme = await findSerial(input.supremeCaseNumber, {
      court: "대법원",
      decidedAt: input.supremeDecidedAt ?? null,
    });
    if (!supreme.hit) {
      return {
        status: "no_ref",
        reason: `원심 표기 없음 · 대법원 전문도 못 받음(${supreme.reason ?? "미수록"})`,
        viaSupreme: true,
      };
    }
    const supremeText = await fetchFullText(supreme.hit.serial);
    ref = parseLowerRef(supremeText);
    viaSupreme = true;
    if (!ref) {
      return {
        status: "no_ref",
        reason: "대법원 전문에도 원심 표기가 없음",
        viaSupreme,
      };
    }
  }

  const { hit, reason } = await findSerial(ref.caseNumber, ref);
  if (!hit) {
    return {
      status: "not_in_api",
      ref,
      reason: reason ?? "미수록",
      viaSupreme,
    };
  }
  const text = await fetchFullText(hit.serial);
  if (!text) {
    return {
      status: "not_in_api",
      ref,
      reason: `전문 본문 없음 (serial ${hit.serial})`,
      viaSupreme,
    };
  }
  return {
    status: hasFactSection(text) ? "loaded" : "summary_only",
    ref,
    hit,
    text,
    viaSupreme,
  };
}
