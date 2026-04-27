import type { Route } from "./+types/epo";

import { DateTime } from "luxon";
import { z } from "zod";

import { getEpoToken } from "~/core/epo/getEpoToken.server";
import {
  type FamilyMember,
  findKoreanApplicationReference,
} from "~/core/epo/hasKR";
import makeServerClient from "~/core/lib/supa-client.server";

/* ────────────────────────────────────────────────────────────── *
 * EPO OPS 패밀리 멤버  →  주요 서지(biblio) 정보 추출
 *  - 국제출원번호 (PCT/WO...)
 *  - 국제공개번호 (WOxxxx/xxxxxx)
 *  - 출원인·발명자 목록 (jsonb로 저장하기 쉽게 문자열화)
 *  - 발명의 명칭(영문), 요약(영문)
 * ────────────────────────────────────────────────────────────── */
// type FamilyMember = any; // ➡️ 실제 타입 정의가 없으니 편의상 any

/* ───────────── 추가 헬퍼 ────────────── */
/** "20240104" → "2024-01-04" */
function prettyDate(yyyymmdd: string) {
  if (!yyyymmdd) return null;
  const s = String(yyyymmdd).replace(/\D/g, ""); // 숫자만
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** "2024007028" → "WO2024/007028" */
function formatWO(num: string) {
  if (!num) return "";
  const digits = String(num).replace(/\D/g, "");
  const year = digits.slice(0, 4);
  const serial = digits.slice(4).padStart(6, "0");
  return `WO${year}/${serial}`;
}

/** country + "2023069565" → "PCT/US2023/069565" */
function formatPCT(country: string, num: string) {
  if (!num || !country) return null;
  const digits = String(num).replace(/\D/g, "");
  const year = digits.slice(0, 4);
  const serial = digits.slice(4).padStart(6, "0");
  return `PCT/${country}${year}/${serial}`;
}

/* helplers: toArray, toText, prettyDate, formatWO, formatPCT 그대로 사용 */

function extractPCTInfo(familyMembers) {
  /* ── ① WO 국제공개 family-member (ex: @country="WO") ───────── */
  const woMember = familyMembers.find(
    (m) => m?.["exchange-document"]?.["@country"] === "WO",
  );
  if (!woMember) throw new Error("WO 멤버가 없습니다.");

  const bib = woMember["exchange-document"]["bibliographic-data"];
  /* ▶ 여기가 빠져 있었음!  */
  const exch = woMember["exchange-document"]; // <<== exch 선언

  /* ── ② 국제공개번호 & 날짜 ─────────────────────────────── */
  const intlPublicationNumber = formatWO(
    woMember["exchange-document"]["@doc-number"],
  );
  const pubDateNode = toArray(
    woMember?.["publication-reference"]?.["document-id"],
  ).find((d) => toText(d?.country) === "WO"); // country=WO
  const intlPublicationDate = prettyDate(toText(pubDateNode?.date));

  /* ── ③ 대표 application-reference (@is-representative="YES") ─── */
  const repAppRef = familyMembers
    .flatMap((fm) => toArray(fm?.["application-reference"])) // 모든 멤버의 application-reference
    .find((ar) => ar?.["@is-representative"] === "YES");

  if (!repAppRef) throw new Error("대표 application-reference 없음");

  /* 대표 reference 안의 첫 document-id (타입 무시) */
  const repDocId = toArray(repAppRef["document-id"])[0] || {};

  /* 국제출원번호(국가+번호)와 날짜 */
  const intlApplicationNumber = formatPCT(
    toText(repDocId.country), // US
    toText(repDocId["doc-number"]), // 2023069565
  );
  const intlApplicationDate = prettyDate(toText(repDocId.date)); // 20230701
  function pickName(nodes) {
    // original > epodoc > 기타 순서
    const original = nodes.find((n) => n?.["@data-format"] === "original");
    const epodoc = nodes.find((n) => n?.["@data-format"] === "epodoc");
    const target = original || epodoc || nodes[0];
    return toText(
      target?.["applicant-name"]?.name || target?.["inventor-name"]?.name,
    );
  }

  /* 1) 출원인 ------------------------------------------------------------ */
  const applicantNodes = toArray(bib?.parties?.applicants?.applicant);

  // 1-A) sequence 로 그룹화
  const groupedApplicants = applicantNodes.reduce(
    (acc, node) => {
      const seq = node?.["@sequence"] || Symbol(); // 없는 경우 고유 Symbol 로
      (acc[seq] = acc[seq] || []).push(node);
      return acc;
    },
    {} as Record<string | symbol, any[]>,
  );

  // 1-B) 각 그룹에서 이름 하나만 선택
  const applicants = Object.values(groupedApplicants)
    .map(pickName)
    .filter(Boolean); // null 제거

  /* 2) 발명자도 동일 패턴 ---------------------------------------------- */
  const inventorNodes = toArray(bib?.parties?.inventors?.inventor);
  const groupedInventors = inventorNodes.reduce(
    (acc, node) => {
      const seq = node?.["@sequence"] || Symbol();
      (acc[seq] = acc[seq] || []).push(node);
      return acc;
    },
    {} as Record<string | symbol, any[]>,
  );

  const inventors = Object.values(groupedInventors)
    .map(pickName)
    .filter(Boolean);

  /* 결과 예시
  applicants = ["ANALOG DEVICES, INC"]        // ✅ 1명
  inventors  = ["KESSLER MARTIN [US]", "PATTERSON STUART [US]"] // ✅ 2명
  */
  // /* ── ④ 출원인·발명자·제목·요약 (이전 로직 그대로) ───────── */
  // const applicants = toArray(bib?.parties?.applicants?.applicant)
  //   .map((ap) => toText(ap?.["applicant-name"]?.name))
  //   .filter(Boolean);

  // const inventors = toArray(bib?.parties?.inventors?.inventor)
  //   .map((iv) => toText(iv?.["inventor-name"]?.name))
  //   .filter(Boolean);

  const titleEn = toArray(bib?.["invention-title"]).find(
    (t) => (t?.["@lang"] || "").toLowerCase() === "en",
  );
  const inventionTitle = toText(titleEn);

  /* exchange-document 객체를 이미 exch 변수에 담았다고 가정 */
  const absEn = toArray(exch?.abstract).find(
    (a) => (a?.["@lang"] || "").toLowerCase() === "en",
  );

  const abstractText = toArray(absEn?.p)
    .map((p) => toText(p))
    .join(" ");

  /* ---------- 4) ▣ 우선권 데이터 --------------------------------------- */
  const priorityClaims = toArray(bib?.["priority-claims"]?.["priority-claim"]);

  const priorityApps = priorityClaims
    .map((claim) => {
      const docIds = toArray(claim?.["document-id"]);

      /* (1) original 번호 */
      const orig = docIds.find((d) => d?.["@document-id-type"] === "original");
      const number = toText(orig?.["doc-number"]);

      /* (2) epodoc 날짜 */
      const epo = docIds.find((d) => d?.["@document-id-type"] === "epodoc");
      const dateRaw = toText(epo?.date);
      const date = prettyDate(dateRaw); // "YYYY-MM-DD" or null

      return { number, date };
    })
    // null 값은 제거
    .filter((p) => p.number && p.date);

  /* (3) 가장 빠른 우선일 */
  const priorityDate = priorityApps.length
    ? priorityApps.map((p) => p.date).sort()[0] // ISO8601 문자열은 사전순 == 시간순
    : null;

  /* ── ⑤ 반환 ───────────────────────────────────────────── */
  return {
    intlApplicationNumber, // "PCT/US2023/069565"
    intlApplicationDate, // "2023-07-01"  ← 이제 채워짐
    intlPublicationNumber, // "WO2024/007028"
    intlPublicationDate, // "2024-01-04"
    applicants: JSON.stringify(applicants),
    inventors: JSON.stringify(inventors),
    inventionTitle,
    abstractText,
    priorityApplications: JSON.stringify(priorityApps), // ① jsonb 저장
    priorityDate, // ② 최우선일
  };
}

/* ───────────── 헬퍼들 ────────────── */
/** 값이 배열이 아니면 배열로 감싸기 */
function toArray(v: any) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** 문자열 추출 : '$' → '_' → string 순으로 확인 */
function toText(node: any) {
  if (typeof node === "string") return node;
  if (node && typeof node.$ === "string") return node.$;
  if (node && typeof node._ === "string") return node._;
  return null;
}

/* ------------------------------------------------------------------ *
 * 3) "2024007028"  →  "WO2024/007028"  포맷 변환
 * ------------------------------------------------------------------ */
const toWOFormat = (docNumber: string, country = "WO") => {
  if (!docNumber) return null;

  // 1) 숫자만 남기고
  const digits = docNumber.replace(/\D/g, ""); // 혹시 모를 공백·하이픈 제거

  // 2) 앞 4자 → 연도, 나머지 → 일련번호(6자 왼쪽 0-패딩)
  const year = digits.slice(0, 4);
  const serial = digits.slice(4).padStart(6, "0");

  return `${country}${year}/${serial}`;
};

/* ─────────── 국내단계 31 개월 규정에 따른 연도 하한 계산 ─────────── */
const NATIONAL_PHASE_MONTHS = 31;
const earliestAllowedYear = DateTime.now().minus({
  months: NATIONAL_PHASE_MONTHS,
}).year; // 예) 2025-07-31 → 2023
const minYearGlobal = 2020;
const currentYear = DateTime.now().year;

/* ──────────────────────── 스키마 정의 ─────────────────────────── */
export const pctFamilySchema = z
  .object({
    selectedType: z.enum(["applicationNumber", "publicationNumber"]),
    /* 입력 → 대문자로 변환 후 검증 */
    pctApplicationNumber: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase()),
  })
  .superRefine((data, ctx) => {
    const { selectedType, pctApplicationNumber: raw } = data;

    /* ── ① PCT ApplicationNumber ── */
    if (selectedType === "applicationNumber") {
      const m = /^PCT\/([A-Z]{2})(\d{4})\/(\d{1,6})$/.exec(raw); // ➊
      if (!m) {
        ctx.addIssue({
          // ➋
          code: z.ZodIssueCode.custom,
          message: "Format must be PCT/CCYYYY/NNNNNN (e.g. PCT/KR2025/000123)",
          path: ["pctApplicationNumber"],
        });
        return;
      }

      const year = +m[2]; // ➌
      if (year < earliestAllowedYear) {
        // ➍
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Entry after 31 months is not permitted. Please choose ${earliestAllowedYear} or later.`,
          path: ["pctApplicationNumber"],
        });
      }
      if (year > currentYear) {
        // ➎ 상한
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${year} is a future year. Please enter a valid filing year.`,
          path: ["pctApplicationNumber"],
        });
      }
      if (year < minYearGlobal) {
        // ➏ 절대 하한
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Year must be ${minYearGlobal}+`,
          path: ["pctApplicationNumber"],
        });
      }
      return; // 통과
    }

    /* ── ② WO PublicationNumber ── */
    const m = /^WO(\d{4})\/(\d{1,6})$/.exec(raw);
    if (!m) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Format must be WOYYYY/NNNNNN (e.g. WO2024/123456)",
        path: ["pctApplicationNumber"],
      });
      return;
    }

    const year = +m[1];
    if (year < earliestAllowedYear) {
      // ➍
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Year must be ${earliestAllowedYear}+ (31-month rule).`,
        path: ["pctApplicationNumber"],
      });
    }
    if (year > currentYear) {
      // ➎
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Future year (${year}) is not allowed.`,
        path: ["pctApplicationNumber"],
      });
    }
    if (year < minYearGlobal) {
      // ➏
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Year must be ${minYearGlobal}+`,
        path: ["pctApplicationNumber"],
      });
    }
  });

/**
 * PCT 출원번호(PCT/KR2025/000123)를 docdb 형식(CCccyynnnnnn)으로 변환
 */
function convertPctApplicationToDocdb(pctNumber: string): string | null {
  /* 1) 공백 제거 후 대문자로 통일 */
  const cleaned = pctNumber.trim().toUpperCase();
  // "PCT/KR2025/000123" 같은 형식을 파싱
  const match = cleaned.match(/^PCT\/([A-Z]{2})(\d{4})\/(\d+)$/);
  if (!match) return null;

  const [, country, year, serial] = match;

  const cc = "20"; // 2000년대 기준
  const yy = year.slice(2); // "2025" → "25"
  const paddedSerial = serial.padStart(6, "0"); // 6자리 zero-padding

  return `${country}${cc}${yy}${paddedSerial}`; // ✅ kind code 제거
}

/**
 * PCT 공개번호(WO2022/117128)를 docdb 형식(WOyyyynnnnnn)으로 변환 (kind code 제외)
 */
function convertPctPublicationToDocdb(
  publicationNumber: string,
): string | null {
  /* 1) 공백 제거 후 대문자로 통일 */
  const cleaned = publicationNumber.trim().toUpperCase();
  // 예: "WO2022/117128"
  const match = cleaned.match(/^WO(\d{4})\/(\d+)$/);
  if (!match) return null;

  const [, year, serial] = match;
  const paddedSerial = serial.padStart(6, "0"); // 항상 6자리로 맞춤

  return `WO${year}${paddedSerial}`;
}

const convertToDocdb = (input: string, selectedType: string) => {
  if (selectedType === "applicationNumber") {
    // console.log("🚀 [convertToDocdb] convertPctApplicationToDocdb", input);
    return convertPctApplicationToDocdb(input);
  } else if (selectedType === "publicationNumber") {
    // console.log("🚀 [convertToDocdb] convertPctPublicationToDocdb", input);
    return convertPctPublicationToDocdb(input);
  } else {
    // console.log("🚀 [convertToDocdb] null");
    return null;
  }
};

export const action = async ({ request }: Route.LoaderArgs) => {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  /* ① 폼 데이터 추출 */
  const formData = await request.formData();
  // console.log("🚀 [formData] formData", formData);
  const formObject = Object.fromEntries(formData) as Record<string, string>;
  const parsed = pctFamilySchema.safeParse(formObject);
  if (!parsed.success) {
    // console.log("🚀 [parsed] parsed", parsed);
    const { fieldErrors, formErrors } = parsed.error.flatten();
    // console.log("🚀 [fieldErrors] fieldErrors", fieldErrors);
    // console.log("🚀 [formErrors] formErrors", formErrors);
    // return { fieldErrors, formErrors };
    return {
      formErrors: fieldErrors.pctApplicationNumber,
    };
  }
  const selectedType = formData.get("selectedType"); // "applicationNumber" | "publicationNumber"
  const pctApplicationNumber = formData.get("pctApplicationNumber"); // "WO2022/117218" 등

  /* ② 타입 체크 */
  if (
    typeof selectedType !== "string" ||
    typeof pctApplicationNumber !== "string"
  ) {
    throw new Error("required value is missing");
  }

  /* ③ 나머지 로직은 동일 */
  const token = await getEpoToken();
  const pathPart =
    selectedType === "applicationNumber" ? "application" : "publication";
  const docdb = convertToDocdb(pctApplicationNumber, selectedType);
  // console.log("🚀 [docdb] docdb", docdb);
  const url = `https://ops.epo.org/3.2/rest-services/family/${pathPart}/docdb/${docdb}/biblio`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`EPO API 호출 실패: ${txt}`);
  }

  const data = await res.json();
  // console.log("🚀 [data] data", data);
  // console.dir(
  //   data["ops:world-patent-data"]["ops:patent-family"]["ops:family-member"],
  //   { depth: null, colors: true },
  // );
  const familyMembers = data["ops:world-patent-data"]["ops:patent-family"][
    "ops:family-member"
  ] as FamilyMember[];

  if (!Array.isArray(familyMembers)) {
    // console.error("❌ family-member 가 배열이 아닙니다.");
    return;
  }

  // console.log("🚀 [familyMembers] familyMembers", familyMembers);
  const pctInfo = extractPCTInfo(familyMembers);
  // console.log("🚀 [pctInfo] pctInfo", pctInfo);
  console.log("🚀 [pctInfo] pctInfo", pctInfo);

  // const woMember = familyMembers.find(
  //   (m: any) => m?.["exchange-document"]?.["@country"] === "WO",
  // );
  /* ① WO 멤버 자체를 한 번에 펼쳐서 보기 */
  // console.dir(woMember, { depth: null });

  /* ② bibliographic-data 쪽만 따로 보기 */
  // console.dir(woMember?.["exchange-document"]?.["bibliographic-data"], {
  //   depth: null,
  // });
  // if (!woMember) {
  //   console.warn("⚠️ WO 멤버를 찾지 못했습니다.");
  //   return;
  // }

  // /* ------------------------------------------------------------------ *
  //  * 2) doc-number 바로 추출
  //  * ------------------------------------------------------------------ */
  // const receivedPublicationNumber = toWOFormat(
  //   woMember?.["exchange-document"]?.["@doc-number"] ?? "",
  // );

  // console.log("✅ receivedPublicationNumber:", receivedPublicationNumber); // → "2024007028"

  // /* ------------------------------------------------------------------ *
  //  * 2) 모든 멤버의 <publication-reference> 안에 있는
  //  *    <document-id> 목록을 평탄화(flatMap)합니다.
  //  * ------------------------------------------------------------------ */
  // type DocId = {
  //   "@document-id-type"?: string; // 속성(attribute)
  //   country?: string[]; // 내용(text-node) → 배열로 들어오는 경우가 많음
  //   "doc-number"?: string[];
  // };

  // console.log("🚀 [familyMembers] familyMembers", familyMembers);

  // const allDocIds: DocId[] = familyMembers.flatMap(
  //   (member: any) => member?.["publication-reference"]?.["document-id"] ?? [],
  // );

  // /* ------------------------------------------------------------------ *
  //  * 3) 조건에 맞는 <document-id> 하나 찾기
  //  *    - @document-id-type === "docdb"
  //  *    - country === "WO"
  //  * ------------------------------------------------------------------ */
  // const targetDoc = allDocIds.find(
  //   (d) =>
  //     d?.["@document-id-type"] === "docdb" && (d.country?.[0] ?? "") === "WO",
  // );

  // if (!targetDoc) {
  //   console.warn("⚠️ WO/docdb 문서를 찾지 못했습니다.");
  //   return;
  // }

  // /* ------------------------------------------------------------------ *
  //  * 4) <doc-number> 값(문자열 배열)에서 첫 번째 요소만 꺼내기
  //  * ------------------------------------------------------------------ */
  // const publicationNumber = targetDoc["doc-number"]?.[0] ?? null;

  // console.log("✅ publicationNumber:", publicationNumber);

  const koreanApplicationReference =
    findKoreanApplicationReference(familyMembers);

  if (koreanApplicationReference) {
    console.log(
      "🚀 [koreanApplicationReference] koreanApplicationReference",
      koreanApplicationReference,
    );
    return {
      formErrors: [
        `This PCT application has already entered the Korean national phase(Application No. ${koreanApplicationReference.docNumber}, filed ${koreanApplicationReference.date}). You can’t create another entry.`,
      ],
    };
  }

  return { pctInfo };
};
