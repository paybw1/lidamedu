// (Phase 5 진입 통합) /ai AI 챗 화면은 은퇴 — 통합 Q&A(/qna)로 일원화.
//
// AI 즉답 + 강사 확인이 이제 통합 Q&A(/qna)에서 제공된다. 옛 링크/북마크는 /qna 로 redirect.
// 멀티턴 챗 UI 원본은 git 이력에 보존(통합 Q&A 멀티턴 후속에서 참조 가능).
// 관리자용 AI Q&A 화면(/admin/ai-qna/*)과 RAG 인프라(answer/hybrid-search/usage)는 그대로 유지.
import { redirect } from "react-router";

import type { Route } from "./+types/ai-chat";

export async function loader(_args: Route.LoaderArgs) {
  throw redirect("/qna");
}

export default function AiChatRetired() {
  return null;
}
