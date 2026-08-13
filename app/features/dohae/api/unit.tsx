// GET /api/dohae/unit?unitId=… — 팝업 콘텐츠(블록 + 다이어그램 서명 URL + 내 주석).
// ★staff 전용: 유닛 조회는 요청 클라이언트(RLS staff SELECT)로 — 학생이면 404.
//   서명 URL 발급만 adminClient(비공개 버킷) — RLS 통과가 곧 staff 증명.

import type { Route } from "./+types/unit";

import { data } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { listHighlights, listMemos } from "~/features/annotations/queries.server";

import type { DohaeBlock } from "../labels";

const SIGNED_URL_TTL_SEC = 3600;

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const unitId = url.searchParams.get("unitId") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(unitId)) throw data("Bad unitId", { status: 400 });

  const { data: row, error } = await client
    .from("dohae_units")
    .select(
      "unit_id, unit_key, kind, title, chapter_no, chapter_title, unit_no, ref_no, pdf_page, blocks",
    )
    .eq("unit_id", unitId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw data("Not found", { status: 404 }); // 학생 = RLS 0행 → 동일 404

  // 다이어그램 서명 URL 주입 — 비공개 버킷이라 공개 URL 없음.
  const blocks = (row.blocks ?? []) as DohaeBlock[];
  const withUrls: DohaeBlock[] = [];
  for (const b of blocks) {
    if (b.type === "diagram" && b.image) {
      const { data: signed, error: sErr } = await adminClient.storage
        .from("dohae")
        .createSignedUrl(b.image, SIGNED_URL_TTL_SEC);
      withUrls.push({ ...b, signedUrl: sErr ? undefined : signed?.signedUrl });
    } else {
      withUrls.push(b);
    }
  }

  const [memos, highlights] = await Promise.all([
    listMemos(client, user.id, "dohae_unit", row.unit_id),
    listHighlights(client, user.id, "dohae_unit", row.unit_id),
  ]);

  return {
    unit: {
      unitId: row.unit_id,
      unitKey: row.unit_key,
      kind: row.kind as "topic" | "reference",
      title: row.title,
      chapterNo: row.chapter_no,
      chapterTitle: row.chapter_title,
      unitNo: row.unit_no,
      refNo: row.ref_no,
      pdfPage: row.pdf_page,
      blocks: withUrls,
    },
    memos,
    highlights,
  };
}
