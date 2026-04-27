import { DateTime } from "luxon";

/* -----------------------------------------------------------------------
 * 1. 최소 타입 정의  (EPO XML → JS 객체 구조 중 필요한 필드만)
 * -------------------------------------------------------------------- */
type CountryField = string | { $: string }; // "KR"  또는  { $: "KR" }

type FieldVal = string | { $: string }; //  "20227015757"  또는  { $: "20227015757" }

type DocumentIdEntry = {
  country?: FieldVal;
  "doc-number"?: FieldVal;
  date?: FieldVal;
};

type DocumentIdGroup = DocumentIdEntry | DocumentIdEntry[];
interface ApplicationReference {
  "document-id": DocumentIdGroup;
}
type AppRefGroup = ApplicationReference | ApplicationReference[];

export interface FamilyMember {
  "application-reference"?: AppRefGroup;
  "exchange-document"?: {
    "@country"?: string;
    "@doc-number"?: string;
  };
}

interface ApplicationReference {
  "document-id": DocumentIdGroup;
}

/* -----------------------------------------------------------------------
 * 2. 타입 가드 헬퍼
 * -------------------------------------------------------------------- */
/* 배열 통일 */
function toArray<T>(v: T | T[] | undefined): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

/* 속성에서 값 꺼내기 (문자열 or { $: 문자열 }) */
function getVal(f?: FieldVal): string | undefined {
  return typeof f === "string" ? f : f?.["$"];
}

/* -----------------------------------------------------------------------
 * 3. 메인 함수
 * -------------------------------------------------------------------- */
/**
 * 패밀리 멤버 배열에 'KR' 국가코드 application-reference 가
 * 한 개라도 포함돼 있는지 확인
 *
 * @param familyMembers  EPO "ops:family-member" 배열
 * @returns boolean      존재하면 true, 없으면 false
 */

function formatKrDocNumber(num: string): string {
  // 숫자만 남김
  const digits = num.replace(/\D/g, "");

  // 한국 특허번호(11자리)면 '10-YYYY-NNNNNN' 으로 변환
  if (digits.length === 11) {
    const year = digits.slice(0, 4); // 2022
    const serial = digits.slice(4); // 7015757
    return `10-${year}-${serial}`;
  }
  return num; // 규격이 다르면 원본 반환
}

/* ------------------------------------------------------------------
 * 1) Luxon 가져오기
 * ---------------------------------------------------------------- */

/* ------------------------------------------------------------------
 * 2) 날짜 포매터
 *    "20220316" → "March 16, 2022"
 * ---------------------------------------------------------------- */
function formatEngDate(yyyymmdd: string): string {
  // 8자리 숫자인지 확인
  if (!/^\d{8}$/.test(yyyymmdd)) return yyyymmdd;

  // Luxon은 ISO 형태 "2022-03-16"을 선호 → 중간에 '-' 삽입
  const iso = `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

  // DateTime.fromISO → .toFormat or toLocaleString 사용
  return DateTime.fromISO(iso, { zone: "utc" }) // 타임존 중요 X → utc
    .toLocaleString({ month: "long", day: "numeric", year: "numeric" });
  // 결과: "March 16, 2022"
}

export function findKoreanApplicationReference(
  familyMembers: FamilyMember[],
): { docNumber: string; date: string } | null {
  for (const member of familyMembers) {
    for (const ref of toArray(member["application-reference"])) {
      for (const doc of toArray(ref?.["document-id"])) {
        if (getVal(doc.country) === "KR") {
          const docNumber = getVal(doc["doc-number"]) ?? "—";
          const date = getVal(doc.date) ?? "—";
          return {
            docNumber: formatKrDocNumber(docNumber),
            date: formatEngDate(date),
          };
        }
      }
    }
  }
  return null; // KR 항목 없음
}
