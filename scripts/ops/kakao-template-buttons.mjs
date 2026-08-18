// 알림톡 템플릿 v2 생성 — 승인된 본문 그대로 + WL(웹링크) 버튼 추가 → 검수 요청.
// 승인 템플릿은 수정 불가라 새 템플릿을 만들어 검수받고, 승인되면 .env / Vercel 의
// KAKAO_TEMPLATE_* ID 만 교체한다(그동안 기존 템플릿으로 무중단 발송).
//
//   node scripts/ops/kakao-template-buttons.mjs           # 생성 + 검수 요청
//   node scripts/ops/kakao-template-buttons.mjs --status  # 생성된 v2 템플릿 상태 확인
//
// 버튼 링크 도메인은 운영(SITE_URL) 고정. 변수는 카카오 규격상 링크 안에 #{var} 허용.

import { createHmac, randomBytes } from "node:crypto";
import "dotenv/config";

const BASE = "https://www.lidamipedu.com";
const NAME_SUFFIX = " (링크)";

const apiKey = process.env.KAKAO_API_KEY;
const apiSecret = process.env.KAKAO_API_SECRET;
const pfid = process.env.KAKAO_PFID;
if (!apiKey || !apiSecret || !pfid) {
  console.error("KAKAO_API_KEY / KAKAO_API_SECRET / KAKAO_PFID 미설정 (.env)");
  process.exit(1);
}

// 본문은 2026-05-20 승인본과 동일(검수 리스크 최소화) — 버튼만 추가.
const TEMPLATES = [
  {
    envName: "KAKAO_TEMPLATE_NEW_QUESTION",
    name: `새 질문 알림${NAME_SUFFIX}`,
    content:
      "[변리사 학습 플랫폼] 새 질문이 등록되었어요\n\n#{targetLabel}에 새 질문이 올라왔습니다.\n\n제목: #{title}\n작성자: #{askerName}\n내용: #{excerpt}\n\n질문 확인하기",
    buttons: [
      {
        buttonType: "WL",
        buttonName: "질문 확인하기",
        linkMo: `${BASE}/qna/#{threadId}`,
        linkPc: `${BASE}/qna/#{threadId}`,
      },
    ],
  },
  {
    envName: "KAKAO_TEMPLATE_NEW_ANSWER",
    name: `답변 등록 알림${NAME_SUFFIX}`,
    content:
      "[변리사 학습 플랫폼] 답변이 등록되었어요.\n\n#{targetLabel}의 질문에 답변이 달렸습니다.\n\n제목: #{title}\n답변자: #{answererName}\n내용: #{excerpt}\n\n답변 확인하기",
    buttons: [
      {
        buttonType: "WL",
        buttonName: "답변 확인하기",
        linkMo: `${BASE}/qna/#{threadId}`,
        linkPc: `${BASE}/qna/#{threadId}`,
      },
    ],
  },
];

function authHeader() {
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", apiSecret)
    .update(date + salt)
    .digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

async function api(method, path, body) {
  const res = await fetch(`https://api.solapi.com${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
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

async function listV2Templates() {
  const res = await api(
    "GET",
    `/kakao/v2/templates?channelId=${pfid}&limit=100`,
  );
  const list = res.json?.templateList ?? res.json?.list ?? [];
  return Array.isArray(list) ? list : [];
}

if (process.argv[2] === "--status") {
  const list = await listV2Templates();
  for (const t of TEMPLATES) {
    const found = list.find((x) => x.name === t.name);
    if (!found) {
      console.log(`${t.name}: (미생성)`);
      continue;
    }
    console.log(
      `${t.name}: ${found.status} — templateId=${found.templateId}` +
        ` → 승인되면 ${t.envName} 교체`,
    );
    // 반려면 검수 코멘트 노출 — 문구 조정 후 재신청 근거.
    if (found.status === "REJECTED") {
      const detail = await api("GET", `/kakao/v2/templates/${found.templateId}`);
      const last = (detail.json?.comments ?? []).filter((c) => c.isAdmin).at(-1);
      if (last) console.log(`  반려 사유: ${last.content.replace(/\r?\n/g, " ").slice(0, 300)}`);
    }
  }
  // ★process.exit() 금지 — Windows Node 에서 미정리 fetch 핸들과 겹치면
  //   libuv assertion(async.c) 으로 비정상 종료 코드가 난다. 자연 종료로 충분.
} else {
  await createAndInspect();
}

async function createAndInspect() {
const existing = await listV2Templates();
for (const t of TEMPLATES) {
  const dup = existing.find((x) => x.name === t.name);
  if (dup) {
    console.log(`↷ ${t.name}: 이미 존재 (${dup.status}, ${dup.templateId}) — 생성 생략`);
    continue;
  }
  const created = await api("POST", "/kakao/v2/templates", {
    channelId: pfid,
    name: t.name,
    content: t.content,
    categoryCode: "008001",
    messageType: "BA",
    emphasizeType: "NONE",
    buttons: t.buttons,
  });
  if (created.status !== 200 || !created.json?.templateId) {
    console.error(`✗ ${t.name}: 생성 실패 HTTP ${created.status}`);
    console.error(JSON.stringify(created.json).slice(0, 500));
    continue;
  }
  const templateId = created.json.templateId;
  console.log(`✓ ${t.name}: 생성 — ${templateId}`);

  // 검수 요청 — 배포 API 버전에 따라 POST/PUT 이 다를 수 있어 순차 시도.
  let inspect = await api(
    "POST",
    `/kakao/v2/templates/${templateId}/inspection`,
  );
  if (inspect.status === 404 || inspect.status === 405) {
    inspect = await api("PUT", `/kakao/v2/templates/${templateId}/inspection`);
  }
  if (inspect.status === 200) {
    console.log(`  → 검수 요청 완료 (status=${inspect.json?.status ?? "?"})`);
  } else {
    console.error(
      `  → 검수 요청 실패 HTTP ${inspect.status}: ${JSON.stringify(inspect.json).slice(0, 300)}`,
    );
    console.error(
      "    Solapi 콘솔에서 수동으로 검수 요청해 주세요: https://console.solapi.com/kakao/templates",
    );
  }
}

console.log(
  "\n검수는 보통 영업일 1~3일. 상태 확인: node scripts/ops/kakao-template-buttons.mjs --status",
);
console.log("승인되면 .env 와 Vercel 의 KAKAO_TEMPLATE_* 값을 새 templateId 로 교체하세요.");
}
