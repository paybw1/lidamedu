// 도서 찜 하트 버튼 (feat-11 B2-1) — fetcher 토글 + 낙관적 표시.
import { HeartIcon } from "lucide-react";
import { useFetcher } from "react-router";

import { cn } from "~/core/lib/utils";

export function WishlistHeart({
  bookId,
  wishlisted,
  className,
}: {
  bookId: string;
  wishlisted: boolean;
  className?: string;
}) {
  const fetcher = useFetcher<{ wishlisted?: boolean; error?: string }>();
  // 제출 중이면 보낸 현재상태의 반대를, 응답이 있으면 그 값을, 아니면 초기값을 표시.
  const active = fetcher.formData
    ? fetcher.formData.get("wishlisted") === "0"
    : (fetcher.data?.wishlisted ?? wishlisted);

  const toggle = () => {
    const fd = new FormData();
    fd.set("bookId", bookId);
    fd.set("wishlisted", active ? "1" : "0");
    fetcher.submit(fd, { method: "post", action: "/api/lecture/wishlist" });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={active}
      aria-label={active ? "찜 해제" : "찜하기"}
      title={active ? "찜 해제" : "찜하기"}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-full transition-colors",
        "hover:bg-accent",
        className,
      )}
    >
      <HeartIcon
        className={cn(
          "size-4 transition-colors",
          active ? "fill-rose-500 text-rose-500" : "text-muted-foreground",
        )}
      />
    </button>
  );
}
