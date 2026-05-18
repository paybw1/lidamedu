// 카카오 알림톡 sender — Solapi(api.solapi.com) provider 구현.
// 운영 활성화 절차는 docs/features/feat-qna.md §5.2 참고.
//
// 필요한 환경변수 — Vercel 환경변수(로컬은 .env)로만 관리 (코드·번들 하드코딩 금지):
//   KAKAO_PROVIDER       — 'solapi' (기본). 현재 solapi 만 구현됨
//   KAKAO_API_KEY        — Solapi API Key
//   KAKAO_API_SECRET     — Solapi API Secret (HMAC 서명 키)
//   KAKAO_PFID           — 카카오 비즈니스 채널의 발신 프로필 ID (Solapi pfId)
//   KAKAO_SENDER_PHONE   — (선택) 사전 등록된 SMS 발신번호. 설정 시 알림톡 실패하면
//                          SMS/LMS 로 자동 폴백. 미설정 시 알림톡 전용(폴백 없음).
//   KAKAO_TEMPLATE_NEW_QUESTION         — 새 질문 알림 템플릿 ID (카카오 사전 승인 필요)
//   KAKAO_TEMPLATE_NEW_ANSWER           — 답변 도착 알림 템플릿 ID (카카오 사전 승인 필요)
//   KAKAO_TEMPLATE_REVIEW_REQUESTED     — 주관식 첨삭 요청 알림 (강사 수신)
//   KAKAO_TEMPLATE_REVIEW_COMPLETED     — 주관식 첨삭 완료 알림 (학생 수신)
//
// API_KEY/API_SECRET/PFID/TEMPLATE_* 중 하나라도 비면 sendKakaoAlimtalk 는
// KakaoNotConfigured 를 throw 하고, notify.server.ts 디스패처가 이를 silent catch 하여
// 다른 채널(이메일) 발송에는 영향을 주지 않는다 (활성화 전 정상 동작).

export class KakaoNotConfigured extends Error {
  constructor(missing: string[]) {
    super(`카카오 알림톡 미설정: ${missing.join(", ")}`);
    this.name = "KakaoNotConfigured";
  }
}

export type KakaoTemplateKey =
  | "new-question"
  | "new-answer"
  | "review-requested"
  | "review-completed";

interface KakaoConfig {
  provider: string;
  apiKey: string;
  apiSecret: string;
  pfid: string;
  // 사전 등록된 SMS 발신번호 (선택) — 있으면 알림톡 실패 시 SMS/LMS 폴백.
  senderPhone: string | null;
  templates: Record<KakaoTemplateKey, string>;
}

function readConfig(): KakaoConfig | KakaoNotConfigured {
  const provider = process.env.KAKAO_PROVIDER ?? "solapi";
  const apiKey = process.env.KAKAO_API_KEY ?? "";
  const apiSecret = process.env.KAKAO_API_SECRET ?? "";
  const pfid = process.env.KAKAO_PFID ?? "";
  const senderPhone = process.env.KAKAO_SENDER_PHONE ?? "";
  const tplQuestion = process.env.KAKAO_TEMPLATE_NEW_QUESTION ?? "";
  const tplAnswer = process.env.KAKAO_TEMPLATE_NEW_ANSWER ?? "";
  const tplReviewRequested = process.env.KAKAO_TEMPLATE_REVIEW_REQUESTED ?? "";
  const tplReviewCompleted = process.env.KAKAO_TEMPLATE_REVIEW_COMPLETED ?? "";

  const missing: string[] = [];
  if (!apiKey) missing.push("KAKAO_API_KEY");
  if (!apiSecret) missing.push("KAKAO_API_SECRET");
  if (!pfid) missing.push("KAKAO_PFID");
  if (!tplQuestion) missing.push("KAKAO_TEMPLATE_NEW_QUESTION");
  if (!tplAnswer) missing.push("KAKAO_TEMPLATE_NEW_ANSWER");
  if (!tplReviewRequested) missing.push("KAKAO_TEMPLATE_REVIEW_REQUESTED");
  if (!tplReviewCompleted) missing.push("KAKAO_TEMPLATE_REVIEW_COMPLETED");
  if (missing.length > 0) return new KakaoNotConfigured(missing);

  return {
    provider,
    apiKey,
    apiSecret,
    pfid,
    senderPhone: senderPhone || null,
    templates: {
      "new-question": tplQuestion,
      "new-answer": tplAnswer,
      "review-requested": tplReviewRequested,
      "review-completed": tplReviewCompleted,
    },
  };
}

export interface KakaoSendInput {
  to: string; // E.164 (예: +821012345678)
  template: KakaoTemplateKey;
  // 승인된 템플릿의 #{변수명} 자리에 들어갈 값. 키는 평문(예: title)으로 전달하고
  // provider adapter 가 #{...} 로 감싼다.
  variables: Record<string, string>;
  // 알림톡 실패 시 폴백 평문. Solapi 는 템플릿에서 폴백 본문을 자동 생성하므로
  // 이 값은 사용하지 않는다 (다른 provider 확장 대비로 시그니처에 유지).
  fallbackText: string;
}

// ─── Web Crypto 헬퍼 (전역 표준 — Node·서버리스 어디서나 동작) ───

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

// Solapi 서명 — (date + salt) 를 apiSecret 키로 HMAC-SHA256, hex digest.
async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );
  return bytesToHex(new Uint8Array(signature));
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes); // 32 hex chars — Solapi 허용 범위(12–64자) 내.
}

// E.164(+8210…) → 국내 표기(010…). Solapi 수신/발신 번호 형식.
function toKoreanLocalNumber(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  return digits.startsWith("82") ? "0" + digits.slice(2) : digits;
}

// ─── Solapi provider ───

const SOLAPI_SEND_URL = "https://api.solapi.com/messages/v4/send";
const SOLAPI_TIMEOUT_MS = 10_000;

async function sendViaSolapi(
  cfg: KakaoConfig,
  input: KakaoSendInput,
): Promise<void> {
  // 인증 — Authorization: HMAC-SHA256 apiKey=…, date=…, salt=…, signature=…
  const date = new Date().toISOString();
  const salt = randomSalt();
  const signature = await hmacSha256Hex(date + salt, cfg.apiSecret);
  const authorization =
    `HMAC-SHA256 apiKey=${cfg.apiKey}, date=${date}, ` +
    `salt=${salt}, signature=${signature}`;

  // 승인된 알림톡 템플릿의 변수는 #{키} 형태 — 평문 키를 감싼다.
  const variables: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.variables)) {
    variables[`#{${key}}`] = value;
  }

  // 단건 발송. 알림톡은 text 와 kakaoOptions.variables 동시 사용 불가 → text 생략.
  // 발신번호(senderPhone)가 없으면 SMS 폴백 불가 → disableSms 로 비활성화.
  const message: Record<string, unknown> = {
    to: toKoreanLocalNumber(input.to),
    kakaoOptions: {
      pfId: cfg.pfid,
      templateId: cfg.templates[input.template],
      variables,
      disableSms: cfg.senderPhone === null,
    },
  };
  if (cfg.senderPhone) {
    message.from = toKoreanLocalNumber(cfg.senderPhone);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOLAPI_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(SOLAPI_SEND_URL, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(
      `[kakao:solapi] 발송 요청 실패: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  } finally {
    clearTimeout(timer);
  }

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(
      `[kakao:solapi] HTTP ${res.status} — ${bodyText.slice(0, 500)}`,
    );
  }

  // 200 — 단건 발송 결과. errorCode = 요청 거부, statusCode "2xxx" = 정상 접수.
  let parsed:
    | {
        statusCode?: string;
        statusMessage?: string;
        errorCode?: string;
        errorMessage?: string;
      }
    | null = null;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return; // 파싱 불가 — best-effort 로 접수 성공 간주.
  }
  if (parsed?.errorCode) {
    throw new Error(
      `[kakao:solapi] ${parsed.errorCode} — ${parsed.errorMessage ?? ""}`,
    );
  }
  if (parsed?.statusCode && !parsed.statusCode.startsWith("2")) {
    throw new Error(
      `[kakao:solapi] 접수 거부 (${parsed.statusCode}) — ${
        parsed.statusMessage ?? ""
      }`,
    );
  }
}

// 카카오 알림톡 1건 발송. 환경변수 누락 시 KakaoNotConfigured,
// 발송 실패 시 Error 를 throw — 디스패처(notify.server.ts)가 채널별로 격리 처리.
export async function sendKakaoAlimtalk(input: KakaoSendInput): Promise<void> {
  const cfg = readConfig();
  if (cfg instanceof KakaoNotConfigured) throw cfg;

  if (cfg.provider !== "solapi") {
    throw new Error(
      `[kakao] provider '${cfg.provider}' 미구현 — 현재 solapi 만 지원합니다.`,
    );
  }
  await sendViaSolapi(cfg, input);
}
