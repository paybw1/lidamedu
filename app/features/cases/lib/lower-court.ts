// feat-2-035 — 하급심 판결문 상태 라벨(클라이언트 안전).
//
// ★.server 모듈에 두면 안 된다 — 화면 컴포넌트가 라벨을 쓰는 순간 React Router 가
//   "Server-only module referenced by client" 로 빌드를 깬다(loader 밖 참조는 제거해 주지 않는다).
//   DB CHECK 제약과 같은 목록을 유지할 것.

export const LOWER_STATUSES = [
  "loaded",
  "not_in_api",
  "summary_only",
  "no_ref",
] as const;

export type LowerCourtStatus = (typeof LOWER_STATUSES)[number];

export const LOWER_STATUS_LABEL: Record<LowerCourtStatus, string> = {
  loaded: "적재됨",
  not_in_api: "미수록 — 판결문만 구하면 됨",
  summary_only: "요지만 — 판결문만 구하면 됨",
  no_ref: "원심 미상 — 원심 확인부터",
};

/** 수기 확보가 필요한 상태인지. 목록 기본 필터. */
export function needsManualWork(status: LowerCourtStatus): boolean {
  return status !== "loaded";
}

// ───────────────────────── 업로드 원본 파일 ─────────────────────────
//
// 업로드 경로는 원래 텍스트만 뽑고 원본 바이트를 버렸다. 나중에 원본이 필요해졌을 때
// 되찾을 방법이 없어(원장 2026-08-24) 파일을 함께 보관하도록 바꿨다.

/**
 * original = 운영자가 올린 판결문 원본 파일.
 * generated = 적재된 본문에서 만들어 낸 PDF(자동 수집분은 애초에 파일이 없었다).
 * ★둘을 반드시 구분한다 — 생성본을 "원본"이라 표시하면 API 텍스트를 판결문 원본으로
 *   오인하게 된다. 서식·표·서명란이 없는 다른 물건이다.
 */
export type LowerCourtFileKind = "original" | "generated";

export interface LowerCourtFile {
  /** 업로드 당시 파일명 — 한글 그대로. 다운로드 표시·저장 이름. */
  name: string;
  /** Storage 키(ASCII). 한글을 키에 넣으면 서명 URL 단계에서 깨진다. */
  path: string;
  size: number;
  mime: string;
  kind: LowerCourtFileKind;
}

/** 화면 표기 — 생성본은 무엇으로 만든 것인지 이름에 드러낸다. */
export const FILE_KIND_LABEL: Record<LowerCourtFileKind, string> = {
  original: "원본 내려받기",
  generated: "PDF 내려받기",
};

/** jsonb 컬럼 → 화면이 믿고 쓸 수 있는 배열. 형태가 어긋난 원소는 버린다. */
export function parseLowerCourtFiles(raw: unknown): LowerCourtFile[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((v) => {
    if (typeof v !== "object" || v === null) return [];
    const o = v as Record<string, unknown>;
    if (typeof o.name !== "string" || typeof o.path !== "string") return [];
    return [
      {
        name: o.name,
        path: o.path,
        size: typeof o.size === "number" ? o.size : 0,
        mime: typeof o.mime === "string" ? o.mime : "application/octet-stream",
        // kind 도입(2026-08-24) 전 항목은 전부 업로드 원본이다.
        kind: o.kind === "generated" ? "generated" : "original",
      },
    ];
  });
}

/**
 * 원본 다운로드 경로. ★`/api/admin/…` 이다 — routes.ts 가 /api 안에 /admin 을 중첩한다.
 *   화면 경로(/admin/cases/lower-court/…)와 헷갈리기 쉬워 한 곳에서만 만든다.
 */
export function lowerCourtFileHref(caseId: string, index: number): string {
  return `/api/admin/cases/lower-court/${caseId}/file?i=${index}`;
}

/** "2.4MB" — 목록에 크기를 보여 원본이 맞는지 가늠하게 한다. */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
