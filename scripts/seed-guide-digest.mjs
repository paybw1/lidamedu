// 특허법 정리비교표(feat-2-038) 이용 가이드 + 공지 초안 시드 — 멱등(제목 매칭). 둘 다 **미발행**으로 넣는다.
//   node scripts/seed-guide-digest.mjs            # 가이드 임시저장 + 공지 초안 upsert
//   node scripts/seed-guide-digest.mjs --publish-guide   # 가이드만 발행 전환(공지 발행은 /admin/announcements 의 「발행」— 알림 팬아웃이 그 경로에만 있다)
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!new URL(url).host.includes("mcgdoplo")) throw new Error("ABORT: not prod");
const c = createClient(url, key, { auth: { persistSession: false } });
const publishGuide = process.argv.includes("--publish-guide");
const AUTHOR = "e20ac99a-bfa6-4862-94dd-23c063189463"; // 임병웅(admin)
const BANNER = "https://mcgdoplovrjgklbxmozi.supabase.co/storage/v1/object/public/landing-banners/announcements/digest-notice-20260911.png";

const GUIDE_TITLE = "정리비교표 — 단원을 한 장으로 보고 빈칸으로 외우기";
const GUIDE_BODY = `교재 부록의 **정리비교표**(특허법, 14장)를 화면에서 그대로 볼 수 있습니다. 상자와 칸이 전부 글자로 옮겨져 있어서, 목차를 누르면 그 줄·그 칸이 빈칸이 됩니다. 단원을 한 장으로 훑고, 같은 자리에서 바로 외우는 용도입니다. 지금은 **특허법**만 제공됩니다.

**여는 방법**

- *학습과목 → 특허법 → 조문 탭*에서 왼쪽 목차 패널 위의 **[정리비교표]** 단추를 누릅니다. 전체 체계도(교재 2쪽)부터 교재 순서대로 넘겨 봅니다.
- 체계도에서 단원을 열면 상단 단추 줄(도해 배지 옆)에 **[정리]** 배지가 있습니다. 누르면 그 단원이 속한 장의 비교표가 바로 열립니다. 심판(3장)·국제출원(2장)처럼 여러 장이 붙은 단원은 배지에 개수가 함께 보입니다.

**들어 있는 자료 (14장)**

체계도 · 총칙 · 특허요건 · 이익제도 · 심사제도 · 권리 · 심판제도 · 정정청구 제도 · 재심 제도 · 심결취소소송 · 국제출원절차 · 국내단계의 번역문 제출 · 특허법·실용신안법 · 국제조약

**화면 다루기**

- 처음 열 때 저작권 안내가 한 번 뜹니다. [확인했습니다]를 누르면 그 기기에서는 다음부터 바로 열립니다.
- 위쪽 **‹ · ›** 단추로 앞뒤 장으로 넘깁니다. 단추에 앞뒤 장의 이름이 적혀 있고, 제목 옆 숫자가 몇 번째 장인지 알려 줍니다.
- **글자 크기**는 − / + 로 85%부터 250%까지 조절되고 기본은 120%입니다. 한 번 정하면 다음에도 그대로입니다.
- 표가 화면보다 크면 가로·세로로 밀어서 봅니다. 다크 모드에서도 같은 색 구분으로 보입니다.

**빈칸으로 외우기**

따로 켤 것 없이 바로 됩니다.

1. **행 목차**(왼쪽 라벨, 예: 「의의」)를 누르면 그 가로줄 전체가 가려집니다.
2. **열 목차**(위쪽 라벨, 예: 「진보성」)를 누르면 그 세로줄 전체가 가려집니다.
3. 표 **모서리 칸**(예: 「특허요건」)을 누르면 내용 전체가 가려집니다.
4. 내용칸 하나만 누르면 그 칸만 가려집니다. 가려진 칸을 다시 누르면 도로 보이고, 이미 다 가려진 줄의 목차를 다시 누르면 그 줄이 도로 보입니다.
5. 위쪽 **[전부 빈칸]** 으로 한 번에 가리고 **[모두 보기]** 로 한 번에 풉니다. 넓은 화면에서는 「빈칸 3 / 57」처럼 몇 칸을 가렸는지 함께 표시됩니다.

체계도·도형 자료에서는 제목 상자를 누르면 그 갈래의 상자들이 함께 가려집니다. 가린 상태는 저장되지 않아서, 다른 장으로 넘기면 모두 보이는 상태로 돌아갑니다.

**활용 팁**

- 단원을 읽은 뒤 [정리] 배지로 그 장을 열어 **열 목차부터** 하나씩 가려 보세요. 제도끼리 비교하는 축(세로줄)을 가리면 비교표를 만든 뜻이 그대로 살아납니다.
- 도해(도해 배지)의 「칸 가리기」와 같은 손놀림입니다. 두 화면을 오가며 같은 방식으로 외울 수 있습니다.
- 글자를 드래그해 선택하는 중에는 눌러도 가려지지 않습니다.`;

const ANN_TITLE = "특허법 정리비교표를 조문 화면에서 바로 볼 수 있습니다";
const annBody = (guideId) => `<p><img src="${BANNER}" alt="특허법 정리비교표 이용 안내" style="max-width:100%;height:auto;border-radius:12px" /></p><p><b>특허법 정리비교표</b>(교재 부록 14장)를 학습 플랫폼에서 바로 보실 수 있게 되었습니다. 표와 상자가 전부 글자로 옮겨져 있어, 목차를 누르면 그 줄·그 칸이 빈칸이 됩니다. 단원을 한 장으로 정리하고 같은 자리에서 외우실 수 있습니다.</p><h3>보는 방법</h3><ol><li><b>학습과목 → 특허법</b>의 <b>조문</b> 탭으로 들어갑니다.</li><li>왼쪽 목차 패널 위 <b>‘정리비교표’ 단추</b>를 누르면 전체 체계도부터 교재 순서대로 볼 수 있습니다.</li><li>체계도에서 단원을 열면 도해 배지 옆에 <b>‘정리’ 배지</b>가 있습니다. 누르면 그 단원이 속한 장의 비교표가 열립니다.</li></ol><h3>빈칸으로 외우기</h3><ul><li>왼쪽 <b>행 목차</b>를 누르면 그 가로줄이, 위쪽 <b>열 목차</b>를 누르면 그 세로줄이 가려집니다. 모서리 칸을 누르면 표 전체입니다.</li><li>내용칸 하나만 누르면 그 칸만 가려지고, 다시 누르면 도로 보입니다.</li><li><b>전부 빈칸 / 모두 보기</b> 단추로 한 번에 가리고 풀 수 있습니다. 글자 크기는 − / + 로 조절합니다(기본 120%).</li></ul><p>자세한 사용법은 <a href="/guide/${guideId}">이용 가이드 — 정리비교표</a>를 참고해 주세요. 지금은 특허법만 제공됩니다.</p><h3>이용 시 유의사항</h3><p>처음 열 때 저작권 안내가 한 번 표시됩니다. 정리비교표는 리담변리사학원이 저작권을 가진 교재의 일부입니다. 학습 목적의 열람만 허용되며 <b>복제·촬영·배포·전송은 금지</b>됩니다. 화면에는 열람자 정보가 표시되고, 열람 기록이 서버에 남습니다.</p>`;

// 1) 가이드 — 제목 매칭 upsert(미발행). --publish-guide 면 발행 전환.
const { data: g0 } = await c.from("guide_articles").select("guide_id, is_published").eq("title", GUIDE_TITLE).maybeSingle();
const guideRow = { title: GUIDE_TITLE, category: "학습과목", body_md: GUIDE_BODY, audience: "student", display_order: 4, screen_key: null, youtube_url: null, updated_at: new Date().toISOString() };
let guideId;
if (g0) {
  const { error } = await c.from("guide_articles").update({ ...guideRow, ...(publishGuide ? { is_published: true } : {}) }).eq("guide_id", g0.guide_id);
  if (error) throw error; guideId = g0.guide_id;
  console.log("가이드 갱신", guideId, publishGuide ? "(발행)" : g0.is_published ? "(발행 상태 유지)" : "(임시저장 유지)");
} else {
  const { data, error } = await c.from("guide_articles").insert({ ...guideRow, is_published: publishGuide, created_by: AUTHOR }).select("guide_id").single();
  if (error) throw error; guideId = data.guide_id;
  console.log("가이드 신규", guideId, publishGuide ? "(발행)" : "(임시저장)");
}

// 2) 공지 — 제목 매칭 upsert, 항상 초안(published_at 은 건드리지 않는다).
const { data: a0 } = await c.from("announcements").select("announcement_id, published_at").eq("title", ANN_TITLE).is("deleted_at", null).maybeSingle();
const annRow = { title: ANN_TITLE, body_html: annBody(guideId), body_md: "", audience_kind: "all", platform_scope: "study", is_pinned: true, updated_at: new Date().toISOString() };
if (a0) {
  const { error } = await c.from("announcements").update(annRow).eq("announcement_id", a0.announcement_id);
  if (error) throw error; console.log("공지 갱신", a0.announcement_id, a0.published_at ? "(발행 상태)" : "(초안)");
} else {
  const { data, error } = await c.from("announcements").insert({ ...annRow, author_id: AUTHOR, published_at: null }).select("announcement_id").single();
  if (error) throw error; console.log("공지 신규(초안)", data.announcement_id);
}
console.log("가이드 미리보기(관리자): /admin/guides · 공지 초안: /admin/announcements");
