// /community → 자유게시판으로 리다이렉트.
// 커뮤니티는 평탄한 5탭(공지사항·자유게시판·스터디모집·Q&A·합격수기) 구조 —
// 별도 허브 화면이 없다.

import { redirect } from "react-router";

export function loader() {
  return redirect("/community/free");
}

export default function Community() {
  return null;
}
