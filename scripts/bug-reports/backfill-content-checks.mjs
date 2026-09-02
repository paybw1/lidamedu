// 콘텐츠 오류 신고 13건 — 지금 DB 상태를 확인해 기록에 덧붙인다.
//
// ★"지금 정상"이 "그때 이 신고 때문에 고쳤다"를 뜻하지는 않는다. 처리 내역이 남아
//   있지 않다는 사실은 그대로 두고, 오늘 확인한 현재 상태만 사실로 덧붙인다.
//   (근거: 2026-09-02 운영 DB 조회. 조회 쿼리는 커밋 메시지 참조.)
// ★알림은 만들지 않는다 — 6~7월에 닫힌 신고다.
//
//   node scripts/bug-reports/backfill-content-checks.mjs          # dry-run
//   node scripts/bug-reports/backfill-content-checks.mjs --apply
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");
const TODAY = "2026-09-02";

/** report_id → 오늘 확인한 현재 상태(사실만). */
const CHECKS = {
  // 기재방법일반 2017.04.13 / 2024.12.12 사건유형 없음
  "14d6991a-7732-4cf7-9903-d6aa7e444e80": [
    "지목하신 두 판례 모두 사건유형이 채워져 있습니다.",
    "· 2017-04-13 2014후2061 → 등록무효(특)",
    "· 2024-12-12 2021후10367 → 등록무효(특)",
  ],
  // 권리소진 2006.8.23 사건유형 띄어쓰기 없음
  "c332f47a-0b7a-488e-ab92-f40c387f9511": [
    "지금도 붙여쓴 상태입니다 — 2006-08-23 2005가합48548 → 「실용신안권침해금지등」.",
    "같은 단원의 다른 판례는 「특허권침해금지 및 손해배상청구의 소」처럼 띄어쓰기가 있어,",
    "사건유형은 판결문의 사건명 표기를 그대로 옮기는 것으로 보입니다(확정된 규칙은 아님).",
    "표기를 통일할지는 별도 판단이 필요합니다.",
  ],
  // AER/균등론 2019-01-31 사건유형 없음
  "b48fd11a-48ce-4dc0-9254-3b4373e5f246": [
    "그 단원의 2019-01-31 판례 3건 모두 사건유형이 채워져 있습니다.",
    "· 2017후424 → 권리범위확인(특)  · 2016마5698 → 가처분이의",
    "· 2018다267252 → 특허권침해금지 및 손해배상청구의 소",
  ],
  // 벌칙 — 사건유형이 사건명 안에 들어가 있음
  "7c90d3b3-9a74-4c1b-bab0-9b50e8adc85d": [
    "벌칙 단원의 판례(2015-08-13 2013도10265)는 사건유형이 「특허법위반」으로 따로 들어가 있고,",
    "사건명은 「특허표시한 물건의 기술적 구성이 …」로 분리돼 있습니다. 지금은 섞여 있지 않습니다.",
  ],
  // 최신판례 객관식 9번 정답 오류
  "24af3521-c6c8-4689-b67f-ac2bcc095050": [
    "그 시험지의 9번은 P-6073(특허법상 법정실시권에 관한 설명으로 옳은 것을 모두 고른 것은?)이고",
    "현재 정답은 4번입니다. 신고일(6/24) 이후인 2026-07-21 에 이 문항이 수정된 이력이 있습니다.",
    "다만 그 수정이 이 신고 때문인지, 정답 자체가 바뀐 것인지는 기록이 없어 확인되지 않습니다.",
    "지금도 4번이 아니라고 보시면 어느 지문이 왜 맞는지 함께 알려주시면 다시 보겠습니다.",
  ],
  // 특허 45조 빈칸 '일 군' — 한자로 써야 통과
  "dd67e535-5eff-4297-817f-deb3a6e947a6": [
    "특허법 제45조 빈칸 정답은 현재 「상호관련성 / 발명 / 전체 / 일 군 / 개선」으로,",
    "「일 군」이 한글로 들어가 있습니다. 한자로 입력해야 통과하는 상태가 아닙니다.",
  ],
  // 판례 3번 소제목 비어 있음
  "3c5fc796-7b19-497b-9941-bad43cc36a90": [
    "그 판례(2018후11360)의 소제목은 현재 3개 모두 채워져 있습니다.",
    "[3] 일사부재리 원칙의 적용을 피하기 위하여 심결취소소송에서 새로운 무효사유의 주장이",
    "허용되는지 여부(소극)",
  ],
  // 4번 보기 오타 변개 → 별개
  "3d2cbc74-5a7b-4ba5-b95f-05aeded9f797": [
    "그 문항의 선지에서 「변개」는 남아 있지 않고 「별개」로 되어 있습니다(현재 0건 / 1건).",
  ],
  // 특허 29조 통암기 — 한자 제외 건의 + 3·4항 사이 '본문' 칸
  "63365a05-163d-4198-9e83-f66b253a7b51": [
    "두 가지를 나눠 말씀드립니다.",
    "· 오류(관련 조문 번호가 본문 칸으로 나오던 것) — 암기 정답에서 관련조문·개정 표기를",
    "  걷어내고, 걷어낸 뒤 남는 내용이 없는 항은 입력창을 아예 만들지 않도록 8/26 반영됐습니다.",
    "· 건의(한자 제외) — 반영되지 않았습니다. 제29조 제1항 각 호에는 공지(公知)·공연(公然)",
    "  같은 한자 병기가 그대로 있고, 암기 채점은 관련조문·개정 표기만 걷어낼 뿐 한자 병기는",
    "  건드리지 않습니다. 필요하시면 별도 과제로 다루겠습니다.",
  ],
  // 민법 171조 빈칸이 '파산절차참'에서 끊김
  "e7ffe6a5-647a-48cc-ba8d-06f5dc675c41": [
    "민법 제171조 빈칸 정답은 현재 「채권자 / 시효중단 / 파산절차참가」로, 낱말이 온전합니다.",
  ],
  // 민법 174조도 같은 증상
  "e305c970-0d3d-4d62-bbd2-3dc603d74fae": [
    "민법 제174조 빈칸 정답도 현재 「… / 시효중단 / 효력 / 파산절차참가」로 낱말이 온전합니다.",
  ],
  // 민법 113조 '[과실없]이'
  "c72038db-fc58-42db-8e4c-0851e8782774": [
    "민법 제113조 빈칸 정답은 현재 「과실」입니다 — 「과실없」로 끊겨 있지 않습니다.",
  ],
  // 특허 29조 4항 난이도 상 '고안' 한자
  "69a43409-845b-434b-8c1c-6391c10c85f3": [
    "그 빈칸 세트(난이도 상)의 해당 정답은 현재 「고안의 설명, 청구범위 또는 도면」으로",
    "한글 표기입니다. 한자로 입력해야 통과하는 상태가 아닙니다.",
  ],
};

const ids = Object.keys(CHECKS);
const { data, error } = await supa
  .from("bug_reports")
  .select("report_id, created_at, message, resolution_note")
  .in("report_id", ids);
if (error) throw new Error(error.message);

const found = new Set(data.map((r) => r.report_id));
const missing = ids.filter((id) => !found.has(id));
if (missing.length) {
  // ★ID 를 잘못 적었을 수 있다 — 조용히 건너뛰지 않고 멈춘다.
  throw new Error(`신고를 찾을 수 없음(ID 확인 필요): ${missing.join(", ")}`);
}

const HEADER = `[현재 상태 확인 ${TODAY}]`;
let n = 0;
for (const r of data) {
  if ((r.resolution_note ?? "").includes(HEADER)) {
    console.log(`skip ${r.report_id.slice(0, 8)} — 이미 확인 기록 있음`);
    continue;
  }
  const block = [HEADER, ...CHECKS[r.report_id]].join("\n");
  const next = `${(r.resolution_note ?? "").trim()}\n\n${block}`.trim();
  console.log(`── ${r.report_id.slice(0, 8)} ${r.message.replace(/\s+/g, " ").slice(0, 42)}`);
  console.log(block.split("\n").map((l) => "   " + l).join("\n"));
  if (APPLY) {
    const { error: e } = await supa
      .from("bug_reports")
      .update({ resolution_note: next })
      .eq("report_id", r.report_id);
    if (e) throw new Error(`갱신 실패 ${r.report_id}: ${e.message}`);
  }
  n++;
}
console.log(
  APPLY
    ? `\n적용 완료 — ${n}건에 현재 상태 확인 결과 추가 (알림 0건)`
    : `\ndry-run — ${n}건. 적용하려면 --apply`,
);
