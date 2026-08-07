// feat-11-008 P2 — 공개 풀페이지: /page/:code. 운영자 제작 HTML(신뢰 콘텐츠)을 그대로 렌더.
// 중지 상태: 404 대신 '준비 중' 안내(기공유 URL 대비, 260807 요청서) + noindex. RLS 가
// 비 staff 에게 use 만 노출하므로 중지 페이지는 비 staff 조회 시 null → 안내로 수렴.
import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";

import { getCustomPageByCode } from "../queries.server";

import type { Route } from "./+types/page-view";

export const meta: Route.MetaFunction = ({ data: d }) => {
  const metas: Array<Record<string, string>> = [
    { title: `${d?.page?.title ?? "안내"} | 리담변리사학원` },
  ];
  // 중지·미존재 안내 페이지는 검색엔진 색인 제외.
  if (!d?.page || d.page.status !== "use")
    metas.push({ name: "robots", content: "noindex" });
  return metas;
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const page = await getCustomPageByCode(client, params.code ?? "");
  // staff 는 중지 페이지도 조회됨(RLS) — 화면에서 미리보기 배너로 구분.
  return data({ page }, { headers });
}

export default function PageView({ loaderData }: Route.ComponentProps) {
  const { page } = loaderData;
  if (!page) {
    return (
      <div className="mx-auto flex min-h-[50vh] w-full max-w-xl flex-col items-center justify-center gap-3 px-4 py-16 text-center">
        <h1 className="text-xl font-bold">준비 중인 페이지입니다</h1>
        <p className="text-muted-foreground text-sm">
          요청하신 페이지가 아직 공개되지 않았거나 종료되었습니다.
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6">
      {page.status !== "use" ? (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          중지 상태 페이지 — 운영자 미리보기입니다(사용자에게는 준비 중 안내가 표시됩니다).
        </div>
      ) : null}
      {/* 운영자 작성 신뢰 HTML — HtmlEditor 원본 보존 정책과 짝. 반응형 보정은 공용 클래스. */}
      <div
        className="lecture-detail-html"
        dangerouslySetInnerHTML={{ __html: page.bodyHtml }}
      />
    </div>
  );
}
