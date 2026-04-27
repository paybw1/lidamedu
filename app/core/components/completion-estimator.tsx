// 📁 app/core/components/CompletionEstimator.tsx
import { format, isBefore, set } from "date-fns";
import { enUS } from "date-fns/locale";
import { useEffect, useState } from "react";

import { addBusinessDaysWithHolidays } from "~/core/lib/holidays/addBusinessDaysWithHolidays";
import { fetchKoreanHolidays } from "~/core/lib/holidays/fetchKoreanHolidays";

interface Props {
  isUrgent: boolean;
  onEstimate?: (date: Date) => void; // ✅ 예상 마감일을 부모로 전달하는 콜백
}

export function CompletionEstimator({ isUrgent, onEstimate }: Props) {
  const [koreanNow, setKoreanNow] = useState(new Date());
  const [standardDate, setStandardDate] = useState<Date | null>(null);
  const [urgentDate, setUrgentDate] = useState<Date | null>(null);
  const [canSubmitToday, setCanSubmitToday] = useState(false);
  const [localNow, setLocalNow] = useState(new Date());
  const [localDeadlineStr, setLocalDeadlineStr] = useState<string>("");

  useEffect(() => {
    async function init() {
      const nowUTC = new Date();
      const nowKST = new Date(nowUTC.getTime() + 9 * 60 * 60 * 1000);
      setKoreanNow(nowKST);

      const localNow = new Date();
      setLocalNow(localNow);

      const threePMKST = new Date(
        nowKST.getFullYear(),
        nowKST.getMonth(),
        nowKST.getDate(),
        15,
        0,
        0,
      );
      const isBefore3PMKST = isBefore(nowKST, threePMKST);
      setCanSubmitToday(isBefore3PMKST);

      const localDeadline = threePMKST.toLocaleString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      setLocalDeadlineStr(localDeadline);

      // ✅ 캐싱 적용
      const year = nowKST.getFullYear();
      const cacheKey = `holidays-${year}`;
      let holidays: Date[] = [];

      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          holidays = JSON.parse(cached).map((d: string) => new Date(d));
        } catch (e) {
          console.warn("❗공휴일 캐시 파싱 실패, 다시 불러옵니다.");
        }
      }

      if (!holidays.length) {
        try {
          holidays = await fetchKoreanHolidays(year);
          sessionStorage.setItem(cacheKey, JSON.stringify(holidays));
          // ✅ 개발 중에만 출력
          if (import.meta.env.DEV) {
            console.log(`✅ ${year}년 공휴일 총 ${holidays.length}일`);
            console.table(holidays.map((d) => d.toISOString().slice(0, 10)));
          }
        } catch (err) {
          console.error("❌ 공휴일 API 호출 실패:", err);
          holidays = [];
        }
      }

      const urgent = addBusinessDaysWithHolidays(
        nowKST,
        isBefore3PMKST ? 0 : 1,
        holidays,
      );
      const standard = addBusinessDaysWithHolidays(nowKST, 3, holidays);

      setUrgentDate(urgent);
      setStandardDate(standard);

      if (isUrgent && urgent) {
        onEstimate?.(urgent);
      } else if (!isUrgent && standard) {
        onEstimate?.(standard);
      }
    }

    init();
  }, [isUrgent]);

  return (
    <div className="mt-6 w-full max-w-xl space-y-2 rounded-lg bg-[#f5f6f8] p-4 text-sm text-gray-700 shadow-sm">
      <div>
        <strong>Current time in Korea:</strong>{" "}
        {new Intl.DateTimeFormat("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: "Asia/Seoul", // ✅ 핵심
        }).format(new Date())}
      </div>
      <div>
        <strong>Your local time:</strong>{" "}
        {new Intl.DateTimeFormat("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }).format(new Date())}
      </div>

      <div>
        <strong>Estimated completion:</strong>{" "}
        {isUrgent && urgentDate
          ? format(urgentDate, "PPP ' (1 business day)'", { locale: enUS })
          : standardDate
            ? format(standardDate, "PPP ' (3–4 business days)'", {
                locale: enUS,
              })
            : "Calculating..."}
      </div>
      {isUrgent && (
        <div className="font-mediumt mt-1 space-y-1 text-sm text-[#E2584D]">
          <div>
            If you submit now, we can file it today (before 3PM Korea time).
          </div>
          <div>
            Based on your local time, submit before:{" "}
            <strong>{localDeadlineStr}</strong> for same-day filing.
          </div>
        </div>
      )}
    </div>
  );
}
