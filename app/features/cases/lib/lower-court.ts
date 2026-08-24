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

export interface LowerCourtFile {
  /** 업로드 당시 파일명 — 한글 그대로. 다운로드 표시·저장 이름. */
  name: string;
  /** Storage 키(ASCII). 한글을 키에 넣으면 서명 URL 단계에서 깨진다. */
  path: string;
  size: number;
  mime: string;
}

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
      },
    ];
  });
}

/** "2.4MB" — 목록에 크기를 보여 원본이 맞는지 가늠하게 한다. */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
