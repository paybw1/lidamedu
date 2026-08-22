// GET /api/dohae/unit?unitId=… — 팝업 콘텐츠(블록 + 다이어그램 서명 URL + 내 주석).
// ★staff 전용: 유닛 조회는 요청 클라이언트(RLS staff SELECT)로 — 학생이면 404.
//   서명 URL 발급만 adminClient(비공개 버킷) — RLS 통과가 곧 staff 증명.

import type { Route } from "./+types/unit";

import { data } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  listHighlights,
  listHighlightsByArticleIds,
  listMemos,
  listMemosByArticleIds,
} from "~/features/annotations/queries.server";

import type { DohaeBlock, DohaeCell } from "../labels";
import { getArticleTitleMap, listDohaeUnitArticles } from "../queries.server";

// 도해특허법 = 특허법 단행본. 다른 과목 도해가 생기면 book_code 로 갈라야 한다.
const DOHAE_LAW_CODE = "patent";

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
  // ★블록 다이어그램뿐 아니라 **표 안 칸 그림**도 같은 경로로 서명한다(표를 살리고 칸만
  //   이미지로 넣는 방식 — 2026-08-22).
  const blocks = (row.blocks ?? []) as DohaeBlock[];
  const sign = async (path: string) => {
    const { data: signed, error: sErr } = await adminClient.storage
      .from("dohae")
      .createSignedUrl(path, SIGNED_URL_TTL_SEC);
    return sErr ? undefined : signed?.signedUrl;
  };
  const signCells = async (cells: DohaeCell[][]): Promise<DohaeCell[][]> =>
    Promise.all(
      cells.map((r) =>
        Promise.all(
          r.map(async (c) => ({
            ...c,
            ...(c.image ? { signedUrl: await sign(c.image) } : {}),
            ...(c.tables ? { tables: await Promise.all(c.tables.map(signCells)) } : {}),
          })),
        ),
      ),
    );
  const withUrls: DohaeBlock[] = [];
  for (const b of blocks) {
    if (b.type === "diagram" && b.image) {
      withUrls.push({ ...b, signedUrl: await sign(b.image) });
    } else if (b.type === "table") {
      withUrls.push({ ...b, cells: await signCells(b.cells) });
    } else {
      withUrls.push(b);
    }
  }

  // 이 유닛에 연결된 플랫폼 조문 — 교재 조문 박스 대신 이걸 그린다. 주석은 조문 축
  // (target_type='article')이라 메인 화면과 그대로 공유된다.
  const articles = await listDohaeUnitArticles(client, row.unit_id);
  const articleIds = articles.map((a) => a.articleId);

  const [memos, highlights, articleMemos, articleHighlights, titleMap] =
    await Promise.all([
      listMemos(client, user.id, "dohae_unit", row.unit_id),
      listHighlights(client, user.id, "dohae_unit", row.unit_id),
      listMemosByArticleIds(client, user.id, articleIds),
      listHighlightsByArticleIds(client, user.id, articleIds),
      // 관련조문 참조에 조문 제목을 붙이려면 그 법 전체 제목표가 필요하다
      // (참조는 유닛 밖 조문을 가리킬 수 있다).
      articleIds.length > 0
        ? getArticleTitleMap(client, DOHAE_LAW_CODE)
        : Promise.resolve({}),
    ]);

  return {
    articles,
    articleMemos,
    articleHighlights,
    titleMap,
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
