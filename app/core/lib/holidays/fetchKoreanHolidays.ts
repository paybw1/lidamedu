// 📁 app/core/lib/holidays/fetchKoreanHolidays.ts

/**
 * 한국천문연구원 OpenAPI를 통해 특정 연도의 공휴일 목록을 가져옵니다.
 * 반환된 날짜는 UTC 기준으로 생성되어 로컬 타임존 영향을 받지 않습니다.
 */

export async function fetchKoreanHolidays(year: number): Promise<Date[]> {
  const serviceKey = import.meta.env.VITE_HOLIDAY_API_KEY;
  const holidays: Date[] = [];

  for (let month = 1; month <= 12; month++) {
    const solMonth = String(month).padStart(2, "0");

    const url = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getHoliDeInfo?ServiceKey=${serviceKey}&solYear=${year}&solMonth=${solMonth}`;

    try {
      const res = await fetch(url);
      const xml = await res.text();

      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xml, "text/xml");

      const items = Array.from(xmlDoc.getElementsByTagName("item"));

      items.forEach((item) => {
        const dateStr = item.getElementsByTagName("locdate")[0]?.textContent;
        const isHoliday =
          item.getElementsByTagName("isHoliday")[0]?.textContent;

        if (dateStr && isHoliday === "Y") {
          const yyyy = +dateStr.slice(0, 4);
          const mm = +dateStr.slice(4, 6) - 1;
          const dd = +dateStr.slice(6, 8);

          // ✅ 로컬 타임존 오차 방지를 위해 UTC 날짜 생성
          const date = new Date(Date.UTC(yyyy, mm, dd));
          holidays.push(date);
        }
      });
    } catch (err) {
      console.error(`[공휴일 API 오류 - ${year}-${solMonth}]:`, err);
    }
  }

  // ✅ 결과 출력 (디버깅용)
  console.log(`✅ ${year}년 공휴일 총 ${holidays.length}일:`);
  console.table(holidays.map((d) => d.toISOString().slice(0, 10)));

  return holidays;
}
