/**
 * Join Screen
 *
 * 카카오 전용 인증으로 통일하면서 회원가입은 별도 화면이 없다.
 * 카카오 OAuth 는 신규/기존 가입자를 동일 흐름으로 처리하므로 /login 으로 합류시킨다.
 */
import { redirect } from "react-router";

export function loader() {
  return redirect("/login");
}

export default function Join() {
  return null;
}
