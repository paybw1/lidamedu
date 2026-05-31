# 학생 화면 디자인 시스템 (v1)

> **무드**: Notion·Linear형 — 담백·미니멀·고대비. 그림자 최소, 평면적, 얇은 단색 경계.
> **밀도**: 중간. 4·8 spacing 그리드, 카드 패딩 `p-4`/`p-6`.
> **테마**: 라이트·다크 모두 (CSS variables 자동 매핑).
> **디바이스**: 모바일·데스크톱 동등 (1024px container, 모바일 자동 풀폭).
> **SSoT**: `app/app.css` (CSS variables) + `app/core/components/student/*` (프리미티브).

---

## 1. 토큰 (단일 소유)

### 1.1 색 — Tailwind 의미 클래스만 사용

| 토큰 | Tailwind 클래스 | 용도 |
|---|---|---|
| `--background` / `--foreground` | `bg-background` / `text-foreground` | 페이지 배경 / 본문 |
| `--card` / `--card-foreground` | `bg-card` / `text-card-foreground` | 카드 표면 |
| `--surface-2` ★ 신규 | `bg-surface-2` | 섹션 배경 / sub-card |
| `--surface-3` ★ 신규 | `bg-surface-3` | hover / 강조 빈상태 |
| `--muted` / `--muted-foreground` | `bg-muted` / `text-muted-foreground` | 비강조 표면 / 본문 보조 |
| `--ink-soft` ★ 신규 | `text-ink-soft` | 보조 텍스트 (text-muted-foreground 보다 약간 강함) |
| `--ink-faint` ★ 신규 | `text-ink-faint` | 캡션·메타 |
| `--border` | `border-border` | 얇은 경계 |
| `--line-strong` ★ 신규 | `border-line-strong` | 표·구분선 |
| `--primary` | `bg-primary` / `text-primary` | 액센트 (도배 금지) |
| `--ring` | `focus-visible:ring-ring` | 포커스 |
| 상태 (의미적) | `bg-emerald-50`/`text-emerald-700` (light) + `dark:bg-emerald-950/40` (dark) | `Chip` 컴포넌트가 캡슐화 |

**금지**:
- raw hex (`#2D5BA8` 등) inline 사용 — `var(--primary)` 또는 `bg-primary`
- raw Tailwind palette (`text-zinc-500`/`bg-amber-50`) 직참조 — `text-ink-soft`/`Chip` 사용
- `T.*` 객체 / `BLUE_SCALE` 등 dash.tsx 자체 시스템 — 신규 화면에서 사용 금지

### 1.2 타이포 스케일

| 단계 | 클래스 | 용도 |
|---|---|---|
| 표제 (페이지) | `text-2xl font-semibold tracking-tight` (모바일) / `text-3xl` (md+) | h1 |
| 제목 (섹션) | `text-lg font-semibold tracking-tight` | h2 |
| 카드 제목 | `text-base font-semibold` | Surface 내부 h3 |
| 본문 | `text-sm leading-relaxed` | 기본 |
| 보조 | `text-xs text-ink-soft` | hint, 캡션 |
| Eyebrow | `font-mono text-[11px] font-semibold tracking-[0.08em] uppercase text-ink-faint` | `Eyebrow` 컴포넌트가 캡슐화 |

폰트: `Pretendard Variable` (한국어 우선, `app/app.css:11-14`).

### 1.3 Spacing 4·8 그리드

- 컴포넌트 내부 패딩: `p-3`(작은 chip 박스) / `p-4`(기본 sub-card) / `p-6`(메인 Surface) / `p-8`(EmptyState)
- 카드 간 간격: `space-y-3` / `space-y-4` (작은 그룹) / `mt-8` (섹션 간)
- 인라인 gap: `gap-1` / `gap-1.5` / `gap-2` / `gap-3`
- **임의 px 금지**: `text-[10px]`, `h-[42px]`, `p-[7px]` 등 — Tailwind 기본 단계 사용

### 1.4 반경 + Elevation

| 토큰 | 클래스 | 용도 |
|---|---|---|
| `--radius` (10.4px) | `rounded-lg` | 카드 |
| `rounded-xl` (calc + 4px) | `rounded-xl` | Surface 기본 |
| `rounded-full` | chip, avatar | |

**그림자 최소** (Notion·Linear 톤). 카드는 `border border-border` 만 사용 — `shadow-*` 사용 금지 (예외: 모달·sheet·dropdown).

### 1.5 컨테이너 폭

| ShellWidth | 클래스 | 용도 |
|---|---|---|
| `default` | `max-w-screen-lg` (1024px) | 대시보드·오늘·통계·목표 (★ 표준) |
| `wide` | `max-w-screen-xl` (1280px) | 색인·표 |
| `narrow` | `max-w-screen-md` (768px) | 단일 흐름 (긴 폼·읽기) |

**화면별 다른 `max-w-*` 금지** — `StudentShell` 컴포넌트만 사용.

---

## 2. 프리미티브 (5종 + Shell)

위치: `app/core/components/student/`. shadcn UI 와 함께 사용.

### `Surface`
카드 표면. `tone` (default/subtle/outlined/dashed) + `pad` (0/3/4/6/8). 그림자 없음, 얇은 경계만.

```tsx
<Surface tone="default" pad={6}>
  <h3 className="text-base font-semibold">제목</h3>
  <p className="text-ink-soft text-sm mt-1">내용</p>
</Surface>
```

### `Eyebrow`
섹션 라벨. 작은 caps 모노 텍스트.

```tsx
<Eyebrow>TODAY · 오늘로 가는 입구</Eyebrow>
```

### `Stat`
단일 지표 — 라벨 + 큰 숫자 + 단위 + delta. tone (neutral/positive/warn/danger).

```tsx
<Stat label="총 학습 시간" value="42" unit="h" delta="+5h" tone="positive" />
```

### `Chip`
의미 단위 작은 라벨. tone 6종 (neutral/primary/positive/warn/danger/info). 라이트·다크 모두.

```tsx
<Chip tone="warn" icon={<ClockIcon className="size-3" />}>마감 임박</Chip>
```

### `EmptyState`
"데이터 없음" 이 아니라 "다음 행동" 제시. 신규 학생 진입 시 가장 많이 보이므로 공들임.

```tsx
<EmptyState
  icon={<SparklesIcon className="size-8" />}
  title="아직 복습할 항목이 없어요"
  description="첫 학습을 시작하면 다음 날부터 복습 카드가 생깁니다."
  actions={<><Button>특허법 시작</Button><Button variant="outline">학습 목표</Button></>}
/>
```

### `StudentShell` + `StudentSection`
컨테이너 + 섹션 분리. 모바일·데스크톱 자동 반응.

```tsx
<StudentShell>
  <StudentSection eyebrow={<Eyebrow>SECTION</Eyebrow>} description="...">
    {/* content */}
  </StudentSection>
</StudentShell>
```

---

## 3. 접근성

| 항목 | 기준 |
|---|---|
| 색 대비 (WCAG AA) | text-foreground on bg-card ≥ 7:1 (검증됨). `text-ink-soft` ≥ 4.5:1 |
| 폰트 최소 | 본문 14px (text-sm). 캡션 12px (text-xs) 까지 |
| 포커스 | shadcn 기본 ring (`focus-visible:ring-ring`) 유지. 가시성 보장 |
| 터치 타깃 | Button 기본 `h-9` (36px) 이상. 작은 chip 은 link 가 아니라 라벨 (터치 불필요) |

---

## 4. 마이그레이션 정책 (점진)

- `app/features/dashboard/lib/dash.tsx` 의 `T` 객체 + inline style — **유지 (호환성)**. 신규/리디자인 화면은 사용 금지.
- 기존 화면을 한 번에 갈아엎지 말고, 화면 단위로 리디자인 시 본 시스템으로 전환.
- raw palette (`text-zinc-500` 등) 는 신규 코드에서 lint 수준으로 거부 (현재는 권고). 마이그레이션 시 함께 정리.
- 학생 화면 외(staff/admin) 는 본 시스템 강제하지 않음 — shadcn 그대로.

---

## 5. 확장

새 시각 요소가 필요하면:
1. 먼저 본 시스템 + shadcn UI 에서 조합 가능한지 확인
2. 안 되면 본 문서에 새 토큰/프리미티브 등록 후 `app/core/components/student/` 추가
3. 화면 안에 inline 정의 금지

문서·코드 동기화: 본 파일과 `app/core/components/student/*` 가 SSoT.
