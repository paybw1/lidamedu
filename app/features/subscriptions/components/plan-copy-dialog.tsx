// feat-11-013 P2-D7 — 상품 복사 대화상자. 강의개설 목록의 행 액션 [복사]에서 연다.
// 「판매중지 → 복사 → 새 유형으로 신규 등록」(요청서 §5). 제출은 /api/admin/plan intent=copy 한 경로.
import { CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/core/components/ui/dialog";
import { Input } from "~/core/components/ui/input";
import {
  COURSE_FORMATS,
  COURSE_FORMAT_LABEL,
  type CourseFormat,
} from "~/features/lms/lib/course-format";

export function PlanCopyDialog({
  planId,
  code,
  name,
  courseFormat,
}: {
  planId: string;
  code: string;
  name: string;
  courseFormat: CourseFormat | null;
}) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<{ ok?: true; planId?: string; error?: string }>();
  const navigate = useNavigate();
  const submitting = fetcher.state !== "idle";
  const error = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok && fetcher.data.planId) {
      setOpen(false);
      // 복사본은 숨김·비활성으로 만들어지므로 바로 수정 폼으로 데려간다.
      navigate(`/admin/pricing?plan=${fetcher.data.planId}`);
    }
  }, [fetcher.state, fetcher.data, navigate]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-link inline-flex items-center gap-1 hover:underline"
      >
        <CopyIcon className="size-3" /> 복사
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <fetcher.Form method="post" action="/api/admin/plan" className="space-y-3">
            <input type="hidden" name="intent" value="copy" />
            <input type="hidden" name="sourcePlanId" value={planId} />
            <DialogHeader>
              <DialogTitle>상품 복사 · {name}</DialogTitle>
              <DialogDescription>
                기본정보와 강의·교재 구성을 복사해 새 상품을 만듭니다. 주문·수강생·결제
                내역은 복사되지 않습니다. 복사본은 숨김 상태로 만들어지며, 저장 뒤 수정
                폼에서 판매 상태를 바꿔 주세요.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground text-[11px] font-semibold">
                  새 코드 * (영소문자·숫자·_)
                </span>
                <Input
                  name="code"
                  required
                  maxLength={40}
                  defaultValue={`${code}_copy`.slice(0, 40)}
                  className="h-8 text-xs"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground text-[11px] font-semibold">새 이름 *</span>
                <Input
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={`${name} (복사)`.slice(0, 100)}
                  className="h-8 text-xs"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs sm:col-span-2">
                <span className="text-muted-foreground text-[11px] font-semibold">과정 유형</span>
                <select
                  name="courseFormat"
                  defaultValue={courseFormat ?? ""}
                  className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
                >
                  {COURSE_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {COURSE_FORMAT_LABEL[f]}
                      {f === courseFormat ? " (원본과 동일)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs">
                <input type="checkbox" name="copyPrice" value="1" defaultChecked className="size-3.5" />
                가격(판매가·정상가) 복사
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs">
                <input type="checkbox" name="copyPolicy" value="1" defaultChecked className="size-3.5" />
                수강 정책(기간·배수·일시정지·연장) 복사
              </label>
            </div>
            {error ? <p className="text-destructive text-xs">{error}</p> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                취소
              </Button>
              <Button type="submit" size="sm" disabled={submitting}>
                <CopyIcon className="size-3.5" /> 복사해서 만들기
              </Button>
            </DialogFooter>
          </fetcher.Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
