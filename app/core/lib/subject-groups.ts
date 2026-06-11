// 학습과목 nav dropdown 의 과목 데이터.
// 최상위 축은 시험 차수 — 1차(객관식) / 2차(주관식). 그 아래 법별 그룹.
// 산업재산권법(특허·상표·디자인)은 1·2차 공통이라 양쪽 섹션에 모두 들어간다.
// 민법은 1차 전용, 민사소송법은 2차 전용.
// label 은 사용자 노출 한국어 — 번역·재띄어쓰기 금지.

export type SubjectItem = {
  /** 한국어 표시명 (사용자 노출). */
  name: string;
  /** 프로덕션 라우트 경로. */
  href: string;
  /** chip 아래/옆에 표시할 메타 문자열 (조문·판례 수 등). 선택. */
  meta?: string;
};

export type SubjectGroup = {
  /** 내부 안정 id (key, analytics 용). */
  id: "ip" | "civil" | "civilproc" | "science";
  /** 각 row 좌측에 표시되는 그룹 라벨. */
  label: string;
  /** 그룹 라벨 아래 한 줄 부제. */
  sub: string;
  items: SubjectItem[];
};

export type ExamSection = {
  /** 내부 안정 id — 1차 / 2차. */
  exam: "first" | "second";
  /** 섹션 헤더 라벨 (사용자 노출). */
  label: string;
  groups: SubjectGroup[];
};

// --- 법별 그룹 정의 (섹션에서 참조) ---

// 산업재산권법 — 1·2차 공통. 두 섹션에서 같은 객체를 참조한다.
const IP_GROUP: SubjectGroup = {
  id: "ip",
  label: "산업재산권법",
  sub: "변리사 핵심 3법 · 1·2차 공통",
  items: [
    { name: "특허법", href: "/subjects/patent", meta: "조문 232 · 판례 1.8k" },
    { name: "상표법", href: "/subjects/trademark", meta: "조문 99 · 판례 940" },
    {
      name: "디자인보호법",
      href: "/subjects/design",
      meta: "조문 233 · 판례 612",
    },
  ],
};

const CIVIL_GROUP: SubjectGroup = {
  id: "civil",
  label: "민법",
  sub: "1차 전용 · 시험 공통 기초",
  items: [
    { name: "민법", href: "/subjects/civil", meta: "조문 1118 · 판례 4.2k" },
  ],
};

// 자연과학 4과목 — nav 에는 단일 "자연과학" 진입점만 노출하고, 4과목은
// /subjects/science 허브 화면에서 한꺼번에 보여준다(허브가 이 배열을 사용).
export const SCIENCE_SUBJECTS: SubjectItem[] = [
  { name: "물리", href: "/subjects/science/physics", meta: "문제 1.2k" },
  { name: "화학", href: "/subjects/science/chemistry", meta: "문제 980" },
  { name: "생물", href: "/subjects/science/biology", meta: "문제 1.1k" },
  { name: "지구과학", href: "/subjects/science/earth-science", meta: "문제 740" },
];

const SCIENCE_GROUP: SubjectGroup = {
  id: "science",
  label: "자연과학",
  sub: "1차 필수 4과목 · 객관식",
  // nav 는 4과목을 나열하지 않고 허브로 단일 진입 — 클릭 시 4과목 한 화면.
  items: [
    {
      name: "전체 4과목",
      href: "/subjects/science",
      meta: "물리·화학·생물·지구과학",
    },
  ],
};

const CIVILPROC_GROUP: SubjectGroup = {
  id: "civilproc",
  label: "민사소송법",
  sub: "2차 전용 · 쟁점·판례 중심",
  items: [
    {
      name: "민사소송법",
      href: "/subjects/civil-procedure",
      meta: "조문 502 · 판례 2.1k",
    },
  ],
};

// nav dropdown 은 1차 → 2차 두 섹션. 산업재산권법은 양쪽에 노출된다.
export const SUBJECT_SECTIONS: ReadonlyArray<ExamSection> = [
  {
    exam: "first",
    label: "1차 · 객관식",
    groups: [IP_GROUP, CIVIL_GROUP, SCIENCE_GROUP],
  },
  {
    exam: "second",
    label: "2차 · 주관식",
    groups: [IP_GROUP, CIVILPROC_GROUP],
  },
] as const;
