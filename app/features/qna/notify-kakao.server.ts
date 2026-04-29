// 카카오 알림톡 sender — Solapi 형태 stub.
// 활성화 절차는 docs/features/feat-qna.md §11 카카오 활성화 참고.
//
// 필요한 환경변수:
//   KAKAO_PROVIDER       — 'solapi' (기본). 'aligo' / 'bizppurio' 등으로 확장 가능
//   KAKAO_API_KEY        — provider API key
//   KAKAO_API_SECRET     — provider API secret (Solapi 의 경우)
//   KAKAO_PFID           — 등록된 카카오 비즈니스 채널의 발신 프로필 ID
//   KAKAO_TEMPLATE_NEW_QUESTION  — 새 질문 알림 템플릿 ID (사전 승인 필요)
//   KAKAO_TEMPLATE_NEW_ANSWER    — 답변 도착 알림 템플릿 ID (사전 승인 필요)
//
// 위 변수가 모두 설정되어 있지 않으면 sendKakaoAlimtalk 는 KakaoNotConfigured 를 throw 한다.
// notify.server.ts 의 디스패처가 이를 catch 하여 다른 채널(이메일) 발송에는 영향을 주지 않는다.

export class KakaoNotConfigured extends Error {
  constructor(missing: string[]) {
    super(`카카오 알림톡 미설정: ${missing.join(", ")}`);
    this.name = "KakaoNotConfigured";
  }
}

export type KakaoTemplateKey = "new-question" | "new-answer";

interface KakaoConfig {
  provider: string;
  apiKey: string;
  apiSecret: string;
  pfid: string;
  templates: Record<KakaoTemplateKey, string>;
}

function readConfig(): KakaoConfig | KakaoNotConfigured {
  const provider = process.env.KAKAO_PROVIDER ?? "solapi";
  const apiKey = process.env.KAKAO_API_KEY ?? "";
  const apiSecret = process.env.KAKAO_API_SECRET ?? "";
  const pfid = process.env.KAKAO_PFID ?? "";
  const tplQuestion = process.env.KAKAO_TEMPLATE_NEW_QUESTION ?? "";
  const tplAnswer = process.env.KAKAO_TEMPLATE_NEW_ANSWER ?? "";

  const missing: string[] = [];
  if (!apiKey) missing.push("KAKAO_API_KEY");
  if (!apiSecret) missing.push("KAKAO_API_SECRET");
  if (!pfid) missing.push("KAKAO_PFID");
  if (!tplQuestion) missing.push("KAKAO_TEMPLATE_NEW_QUESTION");
  if (!tplAnswer) missing.push("KAKAO_TEMPLATE_NEW_ANSWER");
  if (missing.length > 0) return new KakaoNotConfigured(missing);

  return {
    provider,
    apiKey,
    apiSecret,
    pfid,
    templates: {
      "new-question": tplQuestion,
      "new-answer": tplAnswer,
    },
  };
}

export interface KakaoSendInput {
  to: string; // E.164 (예: +821012345678)
  template: KakaoTemplateKey;
  // 템플릿 내 변수 치환 — 승인된 템플릿의 #{변수명} 자리에 들어갈 값.
  variables: Record<string, string>;
  // 알림톡 실패 시 폴백할 평문 (제공사 정책에 따라 SMS/LMS 로 발송될 수 있음).
  fallbackText: string;
}

// 실제 provider 호출은 미구현 (대행사 선택 + 템플릿 승인 후 활성화).
// 현재는 환경변수 누락이면 throw, 설정되어 있으면 NotImplemented 로 throw.
export async function sendKakaoAlimtalk(input: KakaoSendInput): Promise<void> {
  const cfg = readConfig();
  if (cfg instanceof KakaoNotConfigured) throw cfg;

  // TODO(provider-impl): cfg.provider 분기로 실제 API 호출 구현.
  //   - solapi: POST https://api.solapi.com/messages/v4/send
  //   - aligo:  POST https://kakaoapi.aligo.in/akv10/alimtalk/send/
  //   - bizppurio: POST https://api.bizppurio.com/v1/message
  // 승인된 템플릿(cfg.templates[input.template]) 과 input.variables 매핑은
  // provider 별 페이로드 형식을 따라야 한다. fallbackText 는 SMS/LMS 폴백 본문.
  void input;
  throw new Error(
    `[kakao:${cfg.provider}] sendKakaoAlimtalk not implemented yet — provider 호출 코드를 작성하세요.`,
  );
}
