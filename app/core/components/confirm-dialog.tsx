// 확인·입력 창 호스트 — 트리에 한 번만 마운트한다 (feat-11-012 P7).
// 계약·사용법은 `~/core/hooks/use-confirm` 참조.
//
// ★shadcn alert-dialog 는 저장소에 **설치돼 있는데 사용처가 0곳**이었다. 이 파일이 그걸 깨운다.
// ★한 번에 하나만 뜬다 — 확인 창이 겹치면 어느 것에 답한 건지 알 수 없다.
// ★입력이 있는 창은 **닫히기 전에 검증**한다. 기본 prompt() 는 못 하던 일이다.

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/core/components/ui/alert-dialog";
import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { Textarea } from "~/core/components/ui/textarea";
import {
  ConfirmContext,
  type ConfirmApi,
  type PromptOptions,
} from "~/core/hooks/use-confirm";

/** 열려 있는 창 한 건. 입력이 없으면 `isPrompt: false`. */
type Open = { options: PromptOptions; isPrompt: boolean };

const FIELD_ID = "confirm-dialog-input";

export function ConfirmDialogHost({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  // 응답 통로. 닫힐 때 반드시 한 번 불린다(안 부르면 await 가 영원히 멈춘다).
  const resolveRef = useRef<((v: boolean | string | null) => void) | null>(null);

  const settle = useCallback((v: boolean | string | null) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setOpen(null);
    setError(null);
    resolve?.(v);
  }, []);

  // 열릴 때 입력 초기화.
  useEffect(() => {
    if (open) {
      setValue(open.options.defaultValue ?? "");
      setError(null);
    }
  }, [open]);

  const ask = useCallback((options: PromptOptions, isPrompt: boolean) => {
    return new Promise<boolean | string | null>((resolve) => {
      // 이미 떠 있으면 앞의 것을 취소로 닫는다 — 겹쳐 띄우지 않는다.
      resolveRef.current?.(isPrompt ? null : false);
      resolveRef.current = resolve;
      setOpen({ options, isPrompt });
    });
  }, []);

  // ★참조가 매 렌더 바뀌면 이 컨텍스트를 쓰는 트리 전체가 다시 그려진다(루트에 붙는다).
  const api = useMemo<ConfirmApi>(
    () => ({
      confirm: (options) => ask(options, false) as Promise<boolean>,
      promptValue: (options) => ask(options, true) as Promise<string | null>,
    }),
    [ask],
  );

  const submit = () => {
    if (!open) return;
    if (!open.isPrompt) {
      settle(true);
      return;
    }
    const o = open.options;
    const trimmed = value.trim();
    if (!trimmed) {
      setError("내용을 입력해 주세요.");
      return;
    }
    if (o.inputType === "number") {
      const n = Number(trimmed);
      if (!Number.isFinite(n)) {
        setError("숫자를 입력해 주세요.");
        return;
      }
      if (o.min != null && n < o.min) {
        setError(`${o.min} 이상으로 입력해 주세요.`);
        return;
      }
      if (o.max != null && n > o.max) {
        setError(`${o.max} 이하로 입력해 주세요.`);
        return;
      }
    }
    const custom = o.validate?.(trimmed) ?? null;
    if (custom) {
      setError(custom);
      return;
    }
    settle(trimmed);
  };

  const o = open?.options;
  const isPrompt = open?.isPrompt ?? false;

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      <AlertDialog
        open={open !== null}
        // ESC·바깥 클릭으로 닫히면 취소다.
        onOpenChange={(next) => {
          if (!next) settle(isPrompt ? null : false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-balance">
              {o?.title ?? ""}
            </AlertDialogTitle>
            {o?.description ? (
              <AlertDialogDescription className="leading-relaxed">
                {o.description}
              </AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>

          {isPrompt && o ? (
            <div className="space-y-1.5">
              {o.inputLabel ? (
                <Label htmlFor={FIELD_ID} className="text-[13px]">
                  {o.inputLabel}
                </Label>
              ) : null}
              {o.multiline ? (
                <Textarea
                  id={FIELD_ID}
                  autoFocus
                  rows={3}
                  value={value}
                  placeholder={o.placeholder}
                  onChange={(e) => setValue(e.target.value)}
                />
              ) : (
                <Input
                  id={FIELD_ID}
                  autoFocus
                  type={o.inputType === "number" ? "number" : "text"}
                  inputMode={o.inputType === "number" ? "numeric" : undefined}
                  min={o.min}
                  max={o.max}
                  value={value}
                  placeholder={o.placeholder}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    // 한 줄 입력은 Enter 로 확인 — 기본 prompt 와 같은 손놀림.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submit();
                    }
                  }}
                />
              )}
              {error ? (
                <p className="text-destructive text-[12px]">{error}</p>
              ) : null}
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(isPrompt ? null : false)}>
              {o?.cancelLabel ?? "취소"}
            </AlertDialogCancel>
            {/* ★AlertDialogAction 은 누르면 무조건 닫는다 — 검증에 걸려도 닫혀 버리므로
                입력 창에서는 쓸 수 없다. 평범한 버튼으로 두고 닫기는 우리가 정한다. */}
            <Button
              type="button"
              variant={o?.tone === "danger" ? "destructive" : "default"}
              onClick={submit}
            >
              {o?.confirmLabel ?? "확인"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}
