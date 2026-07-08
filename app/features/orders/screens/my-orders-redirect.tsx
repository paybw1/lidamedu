// 구 경로 /me/orders → /lecture/orders(강의 플랫폼 주문·배송) redirect. 잔여 링크·북마크 보존.
import { redirect } from "react-router";

export function loader() {
  throw redirect("/lecture/orders");
}

export default function MyOrdersRedirect() {
  return null;
}
