// feat-7-010 후속 — 한 수강생의 플랫폼 활동 내역(질의·문의/오류신고·커뮤니티 글).
// 운영자 학생 상세에서 학습현황과 함께 노출. 호출부 manager+ 검증 필수, adminClient(RLS 우회).

import adminClient from "~/core/lib/supa-admin-client.server";

export interface StudentQnaItem {
  threadId: string;
  title: string | null;
  targetType: string;
  status: string;
  createdAt: string;
  answeredAt: string | null;
}
export interface StudentInquiryItem {
  inquiryId: string;
  displayNo: number | null;
  category: string;
  title: string;
  status: string;
  createdAt: string;
  answeredAt: string | null;
}
export interface StudentPostItem {
  postId: string;
  board: string;
  title: string;
  createdAt: string;
}
export interface StudentBugReportItem {
  reportId: string;
  message: string;
  url: string | null;
  status: string;
  createdAt: string;
}

export interface StudentActivity {
  qna: StudentQnaItem[];
  inquiries: StudentInquiryItem[];
  posts: StudentPostItem[];
  bugReports: StudentBugReportItem[];
}

export async function getStudentActivity(profileId: string): Promise<StudentActivity> {
  const [qnaRes, csRes, postRes, bugRes] = await Promise.all([
    adminClient
      .from("qna_threads")
      .select("thread_id, title, target_type, status, created_at, answered_at")
      .eq("asker_id", profileId)
      .order("created_at", { ascending: false })
      .limit(50),
    adminClient
      .from("cs_inquiries")
      .select("inquiry_id, display_no, category, title, status, created_at, answered_at")
      .eq("author_id", profileId)
      .order("created_at", { ascending: false })
      .limit(50),
    adminClient
      .from("community_posts")
      .select("post_id, board, title, created_at")
      .eq("author_id", profileId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50),
    adminClient
      .from("bug_reports")
      .select("report_id, message, url, status, created_at")
      .eq("reporter_id", profileId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return {
    qna: (qnaRes.data ?? []).map((r) => ({
      threadId: r.thread_id,
      title: r.title,
      targetType: r.target_type,
      status: r.status,
      createdAt: r.created_at,
      answeredAt: r.answered_at,
    })),
    inquiries: (csRes.data ?? []).map((r) => ({
      inquiryId: r.inquiry_id,
      displayNo: r.display_no,
      category: r.category,
      title: r.title,
      status: r.status,
      createdAt: r.created_at,
      answeredAt: r.answered_at,
    })),
    posts: (postRes.data ?? []).map((r) => ({
      postId: r.post_id,
      board: r.board,
      title: r.title,
      createdAt: r.created_at,
    })),
    bugReports: (bugRes.data ?? []).map((r) => ({
      reportId: r.report_id,
      message: r.message,
      url: r.url,
      status: r.status,
      createdAt: r.created_at,
    })),
  };
}
