import { Link } from "react-router";

import { Button } from "../components/ui/button";

export default function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-2.5">
      <h1 className="text-5xl font-semibold">페이지를 찾을 수 없습니다</h1>
      <h2 className="text-2xl">요청하신 페이지가 존재하지 않습니다.</h2>
      <Button variant="outline" asChild>
        <Link to="/">홈으로 &rarr;</Link>
      </Button>
    </div>
  );
}
