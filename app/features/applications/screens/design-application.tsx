/**
 * Design Application Screen
 *
 * 디자인 출원을 위한 페이지입니다.
 */
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";

export const meta = () => {
  return [
    {
      title: `Design Application | ${import.meta.env.VITE_APP_NAME}`,
    },
  ];
};

export default function DesignApplication() {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">
            Design Application
          </CardTitle>
        </CardHeader>
        <CardContent>{/* 컨텐츠는 추후 추가 예정 */}</CardContent>
      </Card>
    </div>
  );
}
