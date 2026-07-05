// 카카오 알림톡 라이브 테스트 발송 — Solapi 실계정으로 1건 발송(과금 ~10원 내외).
// 프로덕션 코드(app/features/qna/notify-kakao.server.ts)와 동일한 인증·페이로드 경로.
//
//   node scripts/ops/kakao-alimtalk-test.mjs 01012345678 [템플릿키]
//   템플릿키: new-question(기본) | new-answer | review-requested | review-completed
//
// .env 의 KAKAO_* 환경변수를 사용한다. 발송 전 상태만 보려면:
//   node scripts/ops/kakao-alimtalk-test.mjs --status

import { createHmac, randomBytes } from "node:crypto";
import "dotenv/config";

const TEMPLATE_ENV = {
  "new-question": "KAKAO_TEMPLATE_NEW_QUESTION",
  "new-answer": "KAKAO_TEMPLATE_NEW_ANSWER",
  "review-requested": "KAKAO_TEMPLATE_REVIEW_REQUESTED",
  "review-completed": "KAKAO_TEMPLATE_REVIEW_COMPLETED",
};

// 승인 템플릿의 변수 세트에 맞춘 샘플 값(2026-07-06 승인본 기준).
const SAMPLE_VARIABLES = {
  "new-question": {
    "#{targetLabel}": "문제",
    "#{title}": "알림톡 라이브 테스트",
    "#{askerName}": "시스템 점검",
    "#{excerpt}": "이 메시지가 도착했다면 알림톡 라이브 발송이 정상 동작합니다.",
  },
  "new-answer": {
    "#{targetLabel}": "문제",
    "#{title}": "알림톡 라이브 테스트",
    "#{answererName}": "시스템 점검",
    "#{excerpt}": "이 메시지가 도착했다면 알림톡 라이브 발송이 정상 동작합니다.",
  },
  "review-requested": {
    "#{targetLabel}": "문제",
    "#{title}": "알림톡 라이브 테스트",
    "#{askerName}": "시스템 점검",
    "#{excerpt}": "이 메시지가 도착했다면 알림톡 라이브 발송이 정상 동작합니다.",
  },
  "review-completed": {
    "#{targetLabel}": "문제",
    "#{title}": "알림톡 라이브 테스트",
    "#{answererName}": "시스템 점검",
    "#{excerpt}": "이 메시지가 도착했다면 알림톡 라이브 발송이 정상 동작합니다.",
  },
};

const apiKey = process.env.KAKAO_API_KEY;
const apiSecret = process.env.KAKAO_API_SECRET;
const pfid = process.env.KAKAO_PFID;
const senderPhone = process.env.KAKAO_SENDER_PHONE;
if (!apiKey || !apiSecret || !pfid) {
  console.error("KAKAO_API_KEY / KAKAO_API_SECRET / KAKAO_PFID 미설정 (.env)");
  process.exit(1);
}

function authHeader() {
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", apiSecret)
    .update(date + salt)
    .digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

async function api(path, init = {}) {
  const res = await fetch(`https://api.solapi.com${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function printStatus() {
  const balance = await api("/cash/v1/balance");
  console.log(
    `잔액: ${balance.json?.balance ?? "?"}원 · 포인트: ${balance.json?.point ?? "?"}`,
  );
  const senders = await api("/senderid/v1/numbers/active");
  console.log(`등록 발신번호: ${JSON.stringify(senders.json)}`);
  for (const [key, envName] of Object.entries(TEMPLATE_ENV)) {
    const id = process.env[envName];
    if (!id) {
      console.log(`템플릿 ${key}: (env ${envName} 없음)`);
      continue;
    }
    const t = await api(`/kakao/v2/templates/${id}`);
    console.log(`템플릿 ${key}: ${t.json?.status ?? t.status}`);
  }
}

const [arg1, arg2] = process.argv.slice(2);
if (!arg1 || arg1 === "--status") {
  await printStatus();
  if (!arg1) {
    console.log(
      "\n발송: node scripts/ops/kakao-alimtalk-test.mjs 01012345678 [new-question|new-answer|review-requested|review-completed]",
    );
  }
  process.exit(0);
}

const to = arg1.replace(/\D/g, "");
if (!/^01\d{8,9}$/.test(to)) {
  console.error(`수신번호 형식 오류: ${arg1}`);
  process.exit(1);
}
const templateKey = arg2 ?? "new-question";
const templateId = process.env[TEMPLATE_ENV[templateKey] ?? ""];
if (!templateId) {
  console.error(`템플릿 키 오류 또는 env 미설정: ${templateKey}`);
  process.exit(1);
}

const message = {
  to,
  kakaoOptions: {
    pfId: pfid,
    templateId,
    variables: SAMPLE_VARIABLES[templateKey],
    disableSms: true, // 테스트는 알림톡 경로만 검증(SMS 폴백 과금 방지).
  },
};
if (senderPhone) message.from = senderPhone.replace(/\D/g, "");

console.log(`발송: ${to} ← 템플릿 ${templateKey} (${templateId})`);
const res = await api("/messages/v4/send", {
  method: "POST",
  body: JSON.stringify({ message }),
});
console.log("HTTP", res.status);
console.log(JSON.stringify(res.json, null, 2));
const ok =
  res.status === 200 &&
  !res.json?.errorCode &&
  (!res.json?.statusCode || String(res.json.statusCode).startsWith("2"));
console.log(ok ? "\n✅ 접수 성공 — 수신 확인하세요." : "\n❌ 접수 실패 — 위 응답 확인.");
