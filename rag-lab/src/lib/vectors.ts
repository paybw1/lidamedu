/**
 * 벡터 저장·코사인 검색 (brute force).
 *
 * 청크 수 ~7000 × 1024 dim float32 = ~27 MB. 메모리·검색 비용 모두 사소.
 * HNSW 같은 ANN 은 필요 시 단계 ⑤ 이후 교체. (interface 가 동일하므로 hot-swap 가능)
 */
import { writeFileSync, readFileSync } from 'node:fs';

export interface VectorStore {
  N: number;
  dim: number;
  matrix: Float32Array;  // length = N * dim, row-major
}

export function buildVectorStore(vectors: Float32Array[], dim: number): VectorStore {
  const N = vectors.length;
  const matrix = new Float32Array(N * dim);
  for (let i = 0; i < N; i++) {
    const v = vectors[i];
    if (!v || v.length !== dim) {
      throw new Error(`vector[${i}] 길이 mismatch: ${v?.length} != ${dim}`);
    }
    // L2 정규화 — 코사인 = dot product 로 단순화
    let norm = 0;
    for (let d = 0; d < dim; d++) norm += (v[d] ?? 0) * (v[d] ?? 0);
    norm = Math.sqrt(norm) || 1;
    for (let d = 0; d < dim; d++) {
      matrix[i * dim + d] = (v[d] ?? 0) / norm;
    }
  }
  return { N, dim, matrix };
}

export function saveVectorStore(store: VectorStore, path: string): void {
  // header: [N(u32 LE), dim(u32 LE)] + matrix(float32 LE)
  const header = new ArrayBuffer(8);
  const view = new DataView(header);
  view.setUint32(0, store.N, true);
  view.setUint32(4, store.dim, true);
  const buf = Buffer.concat([
    Buffer.from(header),
    Buffer.from(store.matrix.buffer, store.matrix.byteOffset, store.matrix.byteLength),
  ]);
  writeFileSync(path, buf);
}

export function loadVectorStore(path: string): VectorStore {
  const buf = readFileSync(path);
  const view = new DataView(buf.buffer, buf.byteOffset, 8);
  const N = view.getUint32(0, true);
  const dim = view.getUint32(4, true);
  const matrixBytes = buf.subarray(8);
  const matrix = new Float32Array(matrixBytes.buffer, matrixBytes.byteOffset, N * dim);
  // 복사본 — buffer 가 GC 되면 view 무효화 위험
  return { N, dim, matrix: new Float32Array(matrix) };
}

/** L2-정규화된 query 벡터로 top-k 코사인 검색. */
export function vectorSearch(
  store: VectorStore,
  query: Float32Array,
  k: number,
): { idx: number; score: number }[] {
  if (query.length !== store.dim) {
    throw new Error(`query dim mismatch: ${query.length} != ${store.dim}`);
  }
  // L2 정규화
  let qn = 0;
  for (let d = 0; d < store.dim; d++) qn += (query[d] ?? 0) * (query[d] ?? 0);
  qn = Math.sqrt(qn) || 1;
  const qNorm = new Float32Array(store.dim);
  for (let d = 0; d < store.dim; d++) qNorm[d] = (query[d] ?? 0) / qn;

  const N = store.N;
  const dim = store.dim;
  const scores: { idx: number; score: number }[] = new Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    const off = i * dim;
    for (let d = 0; d < dim; d++) {
      s += (store.matrix[off + d] ?? 0) * (qNorm[d] ?? 0);
    }
    scores[i] = { idx: i, score: s };
  }
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, k);
}
