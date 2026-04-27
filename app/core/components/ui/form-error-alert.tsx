/**
 * 폼 에러 Alert 컴포넌트
 *
 * 폼 유효성 검사 에러를 표시하는 재사용 가능한 Alert 컴포넌트입니다.
 * Daisy UI의 corporate 테마와 일관된 디자인을 적용합니다.
 */
import { AlertCircleIcon } from "lucide-react";
import React from "react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "~/core/components/ui/alert";

interface FormErrorAlertProps {
  /** 에러 제목 */
  title: string;
  /** 에러 설명 */
  description: string;
  /** 커스텀 아이콘 (기본값: AlertCircleIcon) */
  icon?: React.ReactNode;
  /** 추가 CSS 클래스 */
  className?: string;
  /** Alert variant (기본값: destructive) */
  variant?: "default" | "destructive";
}

export function FormErrorAlert({
  title,
  description,
  icon = <AlertCircleIcon />,
  className = "mt-2",
  variant = "destructive",
}: FormErrorAlertProps) {
  return (
    <Alert variant={variant} className={className}>
      {icon}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}
