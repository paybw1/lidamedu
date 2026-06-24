import type { Route } from "./+types/error";

import { Link, useSearchParams } from "react-router";

import { Button } from "~/core/components/ui/button";

export const meta: Route.MetaFunction = () => {
  return [
    {
      title: `서버 오류 | 리담변리사학원`,
    },
  ];
};

export default function ErrorPage() {
  const [searchParams] = useSearchParams();
  const errorCode = searchParams.get("error_code");
  const errorDescription = searchParams.get("error_description");
  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <h1 className="text-3xl font-semibold text-red-700">오류</h1>
      <p className="text-muted-foreground">오류 코드: {errorCode}</p>
      <p className="text-muted-foreground">{errorDescription}</p>
      <Button variant={"link"} asChild>
        <Link to="/">홈으로 &rarr;</Link>
      </Button>
    </div>
  );
}
