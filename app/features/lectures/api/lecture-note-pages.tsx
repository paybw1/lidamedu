// 강의노트 페이지 이미지 signed URL 창(window) 발급 — 유출방지 ①.
// 원본 PDF 는 클라이언트에 전달하지 않고, 사전 렌더된 페이지 WebP 만 짧은 TTL 로 서명.
// 뷰어(/lecture-note/:id)가 페이지 이동 시 창 단위로 요청한다.
import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  countRecentUniquePages,
  logLectureNoteView,
  STUDENT_WARN_PAGES,
  STUDENT_WARN_WINDOW_MIN,
} from "~/features/lectures/abuse.server";
import { getLectureNotePageUrls } from "~/features/lectures/queries.server";
import { getPdfLocationsEnabled } from "~/features/lectures/settings.server";

import type { Route } from "./+types/lecture-note-pages";

// 창 크기 상한 — 남용(전 페이지 일괄 서명) 방지.
const MAX_WINDOW = 30;

const schema = z.object({
  kind: z.enum(["src", "res"]),
  id: z.string().uuid(),
  from: z.coerce.number().int().min(1),
  to: z.coerce.number().int().min(1),
});

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const parsed = schema.safeParse({
    kind: sp.get("kind"),
    id: sp.get("id"),
    from: sp.get("from"),
    to: sp.get("to"),
  });
  if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
  const { kind, id, from, to } = parsed.data;
  if (to < from || to - from + 1 > MAX_WINDOW) {
    return data({ error: "Invalid window" }, { status: 400 });
  }

  // 뷰어와 동일 게이트 — 학생 노출 플래그 OFF 면 staff 만.
  const [staffRole, flagOn] = await Promise.all([
    getStaffRole(client, user.id),
    getPdfLocationsEnabled(client),
  ]);
  if (staffRole === null && !flagOn) {
    return data({ error: "Forbidden" }, { status: 403 });
  }

  // 대상 존재·페이지 범위 검증 (임의 id 서명 방지 — RLS 적용 조회).
  let totalPages: number | null = null;
  if (kind === "src") {
    const { data: src } = await client
      .from("lecture_source_pdfs")
      .select("total_pages")
      .eq("source_pdf_id", id)
      .maybeSingle();
    totalPages = src?.total_pages ?? null;
  } else {
    const { data: res } = await client
      .from("lecture_resources")
      .select("page_count")
      .eq("resource_id", id)
      .is("deleted_at", null)
      .maybeSingle();
    totalPages = res?.page_count ?? null;
  }
  if (!totalPages) return data({ error: "Not found" }, { status: 404 });

  const clampedTo = Math.min(to, totalPages);
  if (from > clampedTo) return data({ error: "Invalid range" }, { status: 400 });

  const urls = await getLectureNotePageUrls(kind, id, from, clampedTo);

  // 유출방지 ③ — 열람 로그 + 이상 패턴 감지(응답 후 best-effort).
  // staff 는 운영 검수 작업이 대량 열람과 구분되지 않아 기록·감지 대상에서 제외.
  let abnormal = false;
  if (staffRole === null) {
    // 학생 본인 경고 — 최근 10분 고유 페이지가 임계 넘으면 뷰어에 '감지 중' 안내를 띄운다.
    const recentPages = await countRecentUniquePages(
      user.id,
      STUDENT_WARN_WINDOW_MIN,
    );
    abnormal = recentPages >= STUDENT_WARN_PAGES;
    runAfterResponse(
      logLectureNoteView({
        profileId: user.id,
        kind,
        targetId: id,
        fromPage: from,
        toPage: clampedTo,
      }),
    );
  }

  return data({ urls, abnormal });
}
