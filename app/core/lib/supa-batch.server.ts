// PostgREST 전량 조회 헬퍼 — 두 상한을 동시에 우회한다.
//   ① 응답 행수 상한(max-rows=1000): 명시 .range 를 줘도 요청당 1000행에서 잘린다.
//   ② .in() id 개수 상한: id 를 너무 많이 넣으면 URL 길이 초과로 400.
// ★페이지네이션 정합을 위해 makeQuery 는 안정 정렬(.order — 유일키 권장)을 포함해야 한다.
//   정렬 없는 .range 페이징은 페이지 간 행 누락/중복이 생길 수 있다.

interface PageResult<Row> {
  data: Row[] | null;
  error: { message: string } | null;
}
interface RangeQuery<Row> {
  range(from: number, to: number): PromiseLike<PageResult<Row>>;
}

const PAGE_SIZE = 1000;

/** 단일 조건 쿼리를 1000행 페이지로 끝까지 조회. makeQuery 는 호출마다 새 빌더를 만들어야 한다. */
export async function fetchAllPages<Row>(
  makeQuery: () => RangeQuery<Row>,
): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await makeQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) return out;
  }
}

/** id 배열을 batch 개씩 .in() 조각으로 나누고, 조각마다 1000행 페이지네이션까지 수행. */
export async function fetchAllIn<Row>(
  ids: readonly string[],
  makeQuery: (slice: string[]) => RangeQuery<Row>,
  batch = 100,
): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += batch) {
    const slice = ids.slice(i, i + batch);
    out.push(...(await fetchAllPages(() => makeQuery(slice))));
  }
  return out;
}
