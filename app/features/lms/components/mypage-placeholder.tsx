// 마이페이지 준비 중 화면 공용 — 증명서/결제내역/쿠폰/포인트 등 오픈 예정 기능.
import type { ReactNode } from "react";
import { Link } from "react-router";

export function MyPagePlaceholder({
  title,
  desc,
  icon,
}: {
  title: string;
  desc: string;
  icon: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center md:px-6 md:py-24">
      <div className="bg-muted text-muted-foreground mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl">
        {icon}
      </div>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-muted-foreground mx-auto mt-2.5 max-w-md text-sm leading-relaxed">
        {desc}
      </p>
      <p className="border-border text-muted-foreground mt-6 inline-flex rounded-full border border-dashed px-4 py-2 text-xs font-medium">
        곧 제공될 예정입니다
      </p>
      <div className="mt-8">
        <Link
          to="/lecture/home"
          className="text-primary text-sm font-semibold hover:underline"
        >
          ← 강의 플랫폼 홈으로
        </Link>
      </div>
    </div>
  );
}
