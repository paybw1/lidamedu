// 구 경로 /lecture-note/:sourcePdfId → /note/:sourcePdfId redirect (북마크·인앱 잔여 링크 보존).
// 강의노트(교재 PDF) 경로가 신규 강의 플랫폼(/lecture/*)에 이름을 내주고 /note/* 로 이동.
import { redirect } from "react-router";

import type { Route } from "./+types/lecture-note-redirect";

export function loader({ params, request }: Route.LoaderArgs) {
  const search = new URL(request.url).search;
  throw redirect(`/note/${params.sourcePdfId}${search}`);
}

export default function LectureNoteRedirect() {
  return null;
}
