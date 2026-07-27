// feat-11-007 #4 — 콜러스 재생키를 upload_file_key → media_content_key 로 정규화(백필·병합).
//   채널 API 로 upload_file_key → media_content_key 매핑을 만든 뒤:
//   - video_contents(kollus) 중 content_key 가 옛 upload_file_key 형식인 행을 처리:
//       · 같은 media_content_key 행이 이미 있으면 = 중복 → lesson_videos 를 mck 행으로 재지정하고
//         옛 중복 행은 soft-delete(deleted_at).
//       · 없으면 = 그 행을 in-place 정규화(content_key=mck, upload_file_key=옛값).
//   - lesson_videos.drm_video_id 가 옛 upload_file_key 형식이면 mck 로 치환(재생키 정규화).
//   dry-run 기본, `--commit` 로 실제 반영.
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const COMMIT = process.argv.includes("--commit");
const OLD_FMT = /^\d{8}-[0-9a-f]{12,}$/; // 업로드 파일키 형식(YYYYMMDD-hex)
const token = process.env.KOLLUS_API_TOKEN;
const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const API_HOST = process.env.KOLLUS_API_HOST || "https://api.kr.kollus.com";

function normItems(f) {
  const it = f && f.item;
  if (!it) return [];
  return Array.isArray(it) ? it : [it];
}
async function channelKey() {
  if (process.env.KOLLUS_CHANNEL_KEY) return process.env.KOLLUS_CHANNEL_KEY;
  const r = await fetch(
    `${API_HOST}/0/media/channel?access_token=${token}&per_page=50`,
  ).then((x) => x.json());
  const c = normItems(r?.result?.items)[0];
  if (!c?.key) throw new Error("채널 없음");
  return String(c.key);
}
async function fetchMap() {
  const ck = await channelKey();
  const map = new Map(); // upload_file_key → media_content_key
  for (let page = 1; page <= 50; page++) {
    const r = await fetch(
      `${API_HOST}/0/media/channel/media_content.json?access_token=${token}&channel_key=${ck}&page=${page}&per_page=100`,
    ).then((x) => x.json());
    const items = normItems(r?.result?.items);
    for (const it of items) {
      const ufk = String(it.upload_file_key ?? "").trim();
      const mck = String(it.media_content_key ?? "").trim();
      if (ufk && mck) map.set(ufk, mck);
    }
    if (items.length < 100) break;
  }
  return map;
}

async function main() {
  const map = await fetchMap();
  console.log(`채널 매핑 ${map.size}건 (upload_file_key→media_content_key)`);

  const { data: vcs } = await admin
    .from("video_contents")
    .select("content_id, content_key, upload_file_key, deleted_at")
    .eq("drm_provider", "kollus");
  const byKey = new Map(vcs.map((r) => [r.content_key, r]));

  const plan = { normalize: [], mergeDelete: [], lessonRepoint: [], lessonKey: [] };

  for (const vc of vcs) {
    if (!OLD_FMT.test(vc.content_key)) continue; // 이미 mck
    const mck = map.get(vc.content_key);
    if (!mck) {
      console.warn(`⚠ 매핑 없음(채널에 없음): ${vc.content_key} — skip`);
      continue;
    }
    const existing = byKey.get(mck);
    if (existing && existing.content_id !== vc.content_id) {
      // 중복 — lesson_videos 를 mck 행으로 재지정 후 옛 행 soft-delete.
      plan.mergeDelete.push({ old: vc.content_id, oldKey: vc.content_key, mck, keep: existing.content_id });
    } else {
      plan.normalize.push({ content_id: vc.content_id, from: vc.content_key, to: mck });
    }
  }

  // lesson_videos — content_id 재지정 + drm_video_id 를 mck 로.
  const { data: lvs } = await admin
    .from("lesson_videos")
    .select("video_id, content_id, drm_video_id, is_active")
    .eq("drm_provider", "kollus");
  const mergeByOldContent = new Map(plan.mergeDelete.map((m) => [m.old, m]));
  for (const lv of lvs) {
    const m = mergeByOldContent.get(lv.content_id);
    if (m) plan.lessonRepoint.push({ video_id: lv.video_id, toContent: m.keep, mck: m.mck, active: lv.is_active });
    // drm_video_id 옛 형식이면 mck 로(병합 대상은 위에서 mck 지정, 그 외 in-place 도).
    if (OLD_FMT.test(lv.drm_video_id ?? "")) {
      const mck = map.get(lv.drm_video_id);
      if (mck && !m) plan.lessonKey.push({ video_id: lv.video_id, from: lv.drm_video_id, to: mck, active: lv.is_active });
    }
  }

  console.log("\n=== 계획 ===");
  console.log(`in-place 정규화 video_contents: ${plan.normalize.length}`);
  plan.normalize.forEach((p) => console.log(`  ${p.from} → ${p.to}`));
  console.log(`중복 병합(soft-delete 옛 행): ${plan.mergeDelete.length}`);
  plan.mergeDelete.forEach((p) => console.log(`  del ${p.oldKey}(${p.old.slice(0, 8)}) → keep ${p.mck}(${p.keep.slice(0, 8)})`));
  console.log(`lesson content_id 재지정: ${plan.lessonRepoint.length} (active ${plan.lessonRepoint.filter((x) => x.active).length})`);
  console.log(`lesson drm_video_id 키 치환: ${plan.lessonKey.length} (active ${plan.lessonKey.filter((x) => x.active).length})`);

  if (!COMMIT) {
    console.log("\n[dry-run] --commit 로 반영.");
    return;
  }

  // 1) lesson_videos 재지정(content_id + drm_video_id).
  for (const l of plan.lessonRepoint)
    await admin.from("lesson_videos").update({ content_id: l.toContent, drm_video_id: l.mck }).eq("video_id", l.video_id);
  for (const l of plan.lessonKey)
    await admin.from("lesson_videos").update({ drm_video_id: l.to }).eq("video_id", l.video_id);
  // 2) in-place 정규화.
  for (const p of plan.normalize)
    await admin.from("video_contents").update({ content_key: p.to, upload_file_key: p.from }).eq("content_id", p.content_id);
  // 3) 유지 행에 upload_file_key 보존 + 옛 중복 행 soft-delete.
  for (const m of plan.mergeDelete) {
    await admin.from("video_contents").update({ upload_file_key: m.oldKey }).eq("content_id", m.keep);
    await admin.from("video_contents").update({ deleted_at: new Date().toISOString() }).eq("content_id", m.old);
  }
  console.log("\n[commit] 완료.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
