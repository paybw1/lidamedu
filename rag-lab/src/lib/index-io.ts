/**
 * 인덱스 로드 — 단계 ⑤의 모든 CLI 가 공유한다.
 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChunk, type Chunk } from '../schema/chunk.js';
import { loadVectorStore, type VectorStore } from './vectors.js';
import { loadBm25, type Bm25Model, type Bm25Save } from './bm25.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const INDEX_DIR = join(__dirname, '..', '..', 'index');

export interface LoadedIndex {
  chunks: Chunk[];
  store: VectorStore;
  bm25: Bm25Model;
}

export async function loadIndex(): Promise<LoadedIndex> {
  const chunksRaw = await readFile(join(INDEX_DIR, 'chunks.jsonl'), 'utf8');
  const chunks = chunksRaw
    .split('\n').filter(Boolean)
    .map((line) => parseChunk(JSON.parse(line)));
  const store = loadVectorStore(join(INDEX_DIR, 'vectors.bin'));
  const bm25Raw = JSON.parse(await readFile(join(INDEX_DIR, 'bm25.json'), 'utf8')) as Bm25Save;
  const bm25 = loadBm25(bm25Raw);
  if (chunks.length !== store.N || chunks.length !== bm25.N) {
    throw new Error(
      `index size mismatch — chunks=${chunks.length} vectors=${store.N} bm25=${bm25.N}. 단계 ④ 재실행 필요.`,
    );
  }
  return { chunks, store, bm25 };
}
