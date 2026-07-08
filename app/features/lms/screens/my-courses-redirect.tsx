// 구 경로 /me/courses → /lecture(강의 플랫폼 내 강의실) redirect. 북마크·잔여 링크 보존.
import { redirect } from "react-router";

export function loader() {
  throw redirect("/lecture");
}

export default function MyCoursesRedirect() {
  return null;
}
