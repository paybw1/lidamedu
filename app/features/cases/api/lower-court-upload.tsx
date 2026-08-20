// feat-2-035 — 하급심 판결문 파일 업로드(staff). `/admin/cases/lower-court` 행별 버튼이 호출한다.
//
// 폴더에 파일을 넣고 배치를 돌리는 경로(source/하급심 판결문/특허/)의 화면판이다.
// 파일명 규약을 그대로 쓴다: `<대법원 사건번호> <법원> <하급심 사건번호>.pdf`
//   → 앞 토큰(대법원 사건번호)은 떼고 나머지가 출처 표기가 된다.
//
// ★별도 리소스 라우트인 이유: mupdf(PDF 텍스트 추출)를 화면 모듈 그래프에 끌어들이지 않기 위해.
// ★Storage 에 원본을 남기지 않는다 — 쓰는 쪽은 body_text 뿐이고, 배치 강등 방지 가드가 이미 DB 를 지킨다.

import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { extractPdfText } from "~/features/cases/lib/pdf-extract.server";
import { saveLowerCourtText } from "~/features/cases/queries-lower-court.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/lower-court-upload";

// ★Vercel 서버리스 요청 본문 상한이 4.5MB 라 그 이상은 액션에 닿기 전에 잘린다.
//   여러 파일을 올리면 합계 기준. 화면에도 같은 숫자를 적어 둔다.
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
/** 이보다 짧으면 스캔 PDF(텍스트 레이어 없음)나 잘못 고른 파일로 본다. */
const MIN_TEXT_CHARS = 200;
const CASE_NO_TOKEN = /^\d{2,4}[가-힣]{1,3}\d+$/;

/**
 * 텍스트 파일 디코드 — ★한글 Windows 메모장은 CP949 로 저장한다.
 * UTF-8 로 읽어 깨진 문자가 나오면 EUC-KR 로 다시 읽는다. 조용히 깨진 채로 적재하면
 * 사실관계 소스가 통째로 못 쓰게 되고, 나중에 원인을 찾기도 어렵다.
 */
function decodeText(bytes: Uint8Array): string | null {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (!utf8.includes("�")) return utf8;
  try {
    const euckr = new TextDecoder("euc-kr").decode(bytes);
    if (!euckr.includes("�")) return euckr;
  } catch {
    // ICU 미탑재 환경 — 아래에서 실패로 처리한다.
  }
  return null;
}

/** `2022후10814 특허법원 2021허4232.pdf` → `특허법원 2021허4232` */
function sourceRefFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").trim();
  const parts = base.split(/\s+/);
  if (parts.length > 1 && CASE_NO_TOKEN.test(parts[0])) {
    return parts.slice(1).join(" ");
  }
  return base;
}

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  // ★서버 게이트가 유일한 방어 — RLS(staff 전용)와 겹쳐 두 겹으로 막는다.
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const caseId = String(fd.get("caseId") ?? "");
  if (!caseId) return fail("caseId 누락");

  const files = fd.getAll("files").filter((f): f is File => f instanceof File);
  const usable = files.filter((f) => f.size > 0);
  if (!usable.length) return fail("파일이 없습니다.");

  const total = usable.reduce((s, f) => s + f.size, 0);
  if (total > MAX_TOTAL_BYTES) {
    return fail(
      `파일 합계 ${(total / 1024 / 1024).toFixed(1)}MB — 4MB 를 넘으면 업로드할 수 없습니다. 전문 붙여넣기를 쓰세요.`,
    );
  }

  // 심급이 여러 개면 파일도 여러 개다(1심+2심). 파일명 머리표와 구분선을 붙여 합친다 —
  // 배치 수집기(readManualFiles)와 같은 형식이라 도식 생성기가 동일하게 읽는다.
  const parts: string[] = [];
  for (const file of usable) {
    const name = file.name;
    const lower = name.toLowerCase();
    const bytes = new Uint8Array(await file.arrayBuffer());
    let text = "";
    if (lower.endsWith(".pdf")) {
      try {
        text = (await extractPdfText(bytes)).text;
      } catch (e) {
        return fail(
          `${name} — PDF 텍스트 추출 실패: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      if (!text.trim()) {
        return fail(
          `${name} — 텍스트가 0자입니다(스캔 이미지 PDF 로 보입니다). 텍스트 레이어가 있는 PDF 를 쓰거나 전문 붙여넣기를 이용하세요.`,
        );
      }
    } else if (lower.endsWith(".txt") || lower.endsWith(".md")) {
      const decoded = decodeText(bytes);
      if (decoded === null) {
        return fail(
          `${name} — 글자가 깨집니다. UTF-8 로 저장하거나 전문 붙여넣기를 이용하세요.`,
        );
      }
      text = decoded;
    } else {
      return fail(`${name} — .pdf · .txt · .md 만 올릴 수 있습니다.`);
    }
    parts.push(`[${name}]\n${text.trim()}`);
  }

  const bodyText = parts.join("\n\n———\n\n");
  if (bodyText.length < MIN_TEXT_CHARS) {
    return fail(
      `추출된 텍스트가 ${bodyText.length}자뿐입니다 — 판결문 전문이 맞는지 확인하세요.`,
    );
  }

  const sourceRef = usable
    .map((f) => sourceRefFromFilename(f.name))
    .filter(Boolean)
    .join(" / ");
  const result = await saveLowerCourtText(client, caseId, {
    bodyText,
    sourceRef,
  });
  return data({ kind: "single" as const, result });
}

/** 화면이 collect·paste 와 같은 자리에 띄우도록 결과 모양을 맞춘다. */
function fail(message: string) {
  return data({ kind: "error" as const, message });
}
