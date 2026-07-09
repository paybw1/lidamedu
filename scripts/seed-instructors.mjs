// feat-6-012 강사소개 초기 시드 — 참고 사이트 8명 전임. 임병웅=전체, 나머지=기본(운영자 보강).
// 멱등: slug upsert. 재실행 시 기존 값 덮어씀(운영자 편집 보호하려면 --skip-existing).
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const SKIP = process.argv.includes("--skip-existing");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const rows = [
  {
    slug: "lim-byungwoong",
    name: "임병웅",
    monogram: "林",
    category: "ip_law",
    subject_label: "특허법",
    subject_codes: ["patent"],
    title: "특허법인 리담 대표변리사",
    role_label: "특허법 전임",
    headline: "제37회 합격, 스물다섯 해 넘게 특허법 수험의 길을 함께 걸었습니다.",
    metrics: [
      { value: "제37", unit: "회", label: "변리사시험 합격" },
      { value: "25", unit: "년+", label: "특허법 강의 경력" },
      { value: "9", unit: "종", label: "직접 집필 교재" },
      { value: "특허법", unit: "", label: "담당 과목" },
    ],
    education: [
      "한양대학교 법학과 박사 졸업",
      "한양대학교 법학과 석사 졸업",
      "한양대학교 전자전기공학부 졸업",
    ],
    career: [
      "특허법인 리담 대표변리사",
      "리담변리사학원 특허법 전임강사",
      "한양대학교 법학전문 겸임교수 역임",
      "다수 특허법률사무소 실무 근무",
      "제37회 변리사시험 합격",
    ],
    books: [
      { title: "리담특허법", label: "기본서" },
      { title: "도해특허법", label: "이론 도해" },
      { title: "특허법 판례집", label: "판례" },
      { title: "객관식 기출·예상문제", label: "문제집" },
      { title: "강의노트", label: "요약" },
      { title: "조문정리", label: "조문" },
      { title: "체계도", label: "구조" },
    ],
    philosophy_md:
      "지식을 나열하는 강의가 아니라, 배움의 이치를 설명하고 이해에 이르는 과정을 함께 고민하는 강의를 지향합니다.\n\n특허법은 조문·판례·문제가 서로 맞물려 하나의 체계를 이룹니다. 저는 그 연결을 눈에 보이게 만드는 데 집중합니다. 방대한 분량 앞에서 방향을 잃지 않도록, 무엇을 왜 공부하는지부터 짚어 드립니다.",
    display_order: 1,
    published: true,
  },
  bare("kim-soohwan", "김수환", "金", "ip_law", "특허법", ["patent"], "특허법 전임", 2),
  bare("kim-inbae", "김인배", "金", "ip_law", "상표법 · 디자인보호법", ["trademark", "design"], "상표·디자인 전임", 3),
  bare("kim-harim", "김하림", "金", "ip_law", "상표법", ["trademark"], "상표법 전임", 4),
  bare("kim-dongjin", "김동진", "金", "civil_law", "민법", ["civil"], "민법 전임", 5),
  bare("na-jiye", "나지예", "羅", "civil_law", "민사소송법", ["civil-procedure"], "민사소송법 전임", 6),
  bare("choi-beomseon", "최범선", "崔", "civil_law", "민사소송법", ["civil-procedure"], "민사소송법 전임", 7),
  bare("lee-junseok", "이준석", "李", "science", "물리", ["physics"], "자연과학(물리) 전임", 8),
];

function bare(slug, name, monogram, category, subject_label, subject_codes, role_label, order) {
  return {
    slug,
    name,
    monogram,
    category,
    subject_label,
    subject_codes,
    role_label,
    title: null,
    headline: `${subject_label} 전임 강사 ${name}입니다.`,
    metrics: [],
    education: [],
    career: [`리담변리사학원 ${role_label}강사`],
    books: [],
    philosophy_md: null,
    display_order: order,
    published: true,
  };
}

let ins = 0,
  upd = 0,
  skip = 0;
for (const r of rows) {
  const { data: existing } = await sb
    .from("instructors")
    .select("instructor_id")
    .eq("slug", r.slug)
    .maybeSingle();
  if (existing && SKIP) {
    skip++;
    continue;
  }
  if (existing) {
    const { error } = await sb
      .from("instructors")
      .update(r)
      .eq("instructor_id", existing.instructor_id);
    if (error) throw error;
    upd++;
  } else {
    const { error } = await sb.from("instructors").insert(r);
    if (error) throw error;
    ins++;
  }
  console.log(`  ${r.slug} — ${r.name} (${r.category})`);
}
console.log(`\n완료 — 신규 ${ins} · 갱신 ${upd} · skip ${skip}`);
