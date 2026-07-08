// 반려 2건 재신청 (2026-07-08) — 검수 지적 "의미 불분명한 내용 ▶ 질문 확인하기/지금 확인하기".
// 원인: 본문 끝의 행동 문구 줄이 WL 버튼과 중복되는 고정 텍스트로 남아 있었음.
// 조치: 본문에서 해당 줄 제거(행동 유도는 버튼이 담당) + 내용 라벨 명확화.
import { createHmac, randomBytes } from "node:crypto";
import "dotenv/config";

const apiKey = process.env.KAKAO_API_KEY;
const apiSecret = process.env.KAKAO_API_SECRET;

const FIXES = [
  {
    templateId: "KA01TP260706023825084K7fETSbeJU3",
    name: "새 질문 알림 (링크)",
    content:
      "[변리사 학습 플랫폼] 담당자님, 새 질문이 등록되었어요\n\n답변 담당자로 지정되신 강사·운영자님께 발송되는 업무 알림입니다.\n#{targetLabel}에 새 질문이 올라왔습니다.\n\n제목: #{title}\n작성자: #{askerName}\n질문 내용: #{excerpt}",
  },
  {
    templateId: "KA01TP26070602382664573fw5F9t0Fv",
    name: "채점 요청 도착 알림 (링크)",
    content:
      "[변리사 학습 플랫폼] 담당자님, 채점 요청이 등록되었어요\n\n채점 담당자로 지정되신 강사·운영자님께 발송되는 업무 알림입니다.\n#{targetLabel}에 새 채점 요청이 올라왔습니다.\n\n제목: #{title}\n작성자: #{askerName}\n답안 내용: #{excerpt}",
  },
];

function auth() {
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const sig = createHmac("sha256", apiSecret).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${sig}`;
}
async function api(method, path, body) {
  const res = await fetch(`https://api.solapi.com${path}`, {
    method,
    headers: { Authorization: auth(), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

for (const f of FIXES) {
  const upd = await api("PUT", `/kakao/v2/templates/${f.templateId}`, {
    content: f.content,
  });
  console.log(`${f.name}: 본문 수정 HTTP ${upd.status}${upd.status !== 200 ? " — " + JSON.stringify(upd.json).slice(0, 200) : ""}`);
  if (upd.status !== 200) continue;
  let insp = await api("POST", `/kakao/v2/templates/${f.templateId}/inspection`);
  if (insp.status === 404 || insp.status === 405) {
    insp = await api("PUT", `/kakao/v2/templates/${f.templateId}/inspection`);
  }
  console.log(`  → 재검수 요청 HTTP ${insp.status} (status=${insp.json?.status ?? "?"})`);
}
// ★process.exit() 금지 — Windows libuv assertion 회피(자연 종료).
