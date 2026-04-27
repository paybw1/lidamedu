import { ConstructionIcon } from "lucide-react";

export default function ComingSoon({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <ConstructionIcon className="text-muted-foreground size-12" />
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="text-muted-foreground max-w-md text-base">
        {description ?? "이 메뉴는 준비 중입니다. 곧 공개됩니다."}
      </p>
    </div>
  );
}
