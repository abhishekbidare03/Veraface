/**
 * embeddingUtils.ts  (v2)
 * Utilities for face embedding math — cosine similarity, L2 norm, serialization, matching.
 */

// ─── Cosine Similarity ────────────────────────────────────────────────────────

/**
 * Cosine similarity between two L2-normalized vectors.
 * Returns value in [-1, 1]. Threshold for recognition: ≥ 0.65.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── L2 Normalization ─────────────────────────────────────────────────────────

/** L2-normalize a vector to unit length. Returns new array. */
export function l2Normalize(vec: number[]): number[] {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return [...vec];
  return vec.map(v => v / norm);
}

// ─── Embedding Averaging ──────────────────────────────────────────────────────

/**
 * Average multiple embeddings (e.g. from 5 enrollment frames) and L2-normalize.
 * More stable than single-frame embedding.
 */
export function averageEmbeddings(embeddings: number[][]): number[] {
  if (embeddings.length === 0) throw new Error('No embeddings to average');
  const dim = embeddings[0].length;
  const avg = new Array(dim).fill(0);
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) avg[i] += emb[i];
  }
  for (let i = 0; i < dim; i++) avg[i] /= embeddings.length;
  return l2Normalize(avg);
}

// base64 encoding/decoding (Hermes-compatible)
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64Encode(bytes: Uint8Array): string {
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    result += B64_CHARS[b0 >> 2];
    result += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < len ? B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < len ? B64_CHARS[b2 & 63] : '=';
  }
  return result;
}

function base64Decode(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const len   = (clean.length * 3) >> 2;
  const out   = new Uint8Array(len);
  let idx = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64_CHARS.indexOf(clean[i]);
    const b = B64_CHARS.indexOf(clean[i + 1]);
    const c = B64_CHARS.indexOf(clean[i + 2]);
    const d = B64_CHARS.indexOf(clean[i + 3]);
    out[idx++] = (a << 2) | (b >> 4);
    if (c !== -1) out[idx++] = ((b & 15) << 4) | (c >> 2);
    if (d !== -1) out[idx++] = ((c &  3) << 6) | d;
  }
  return out.slice(0, idx);
}

// ─── Serialization ────────────────────────────────────────────────────────────

/**
 * Encode a 128-dim float32 embedding to base64 for SQLite BLOB storage.
 * Output: 512 bytes → ~684 base64 chars.
 */
export function embeddingToBase64(embedding: number[]): string {
  const buf  = new ArrayBuffer(embedding.length * 4);
  const view = new DataView(buf);
  embedding.forEach((v, i) => view.setFloat32(i * 4, v, true));
  return base64Encode(new Uint8Array(buf));
}

/**
 * Decode a base64 string back to a float32 embedding array.
 */
export function base64ToEmbedding(b64: string): number[] {
  const bytes  = base64Decode(b64);
  const view   = new DataView(bytes.buffer);
  const result: number[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    result.push(view.getFloat32(i, true));
  }
  return result;
}



/** Recognition threshold — tune after live testing */
export const RECOGNITION_THRESHOLD = 0.65;

interface PersonRecord {
  id:        string;
  name:      string;
  emp_id:    string;
  embedding: number[];
}

interface MatchResult {
  id:         string;
  name:       string;
  empId:      string;
  similarity: number;
}

/**
 * Find the best-matching person above RECOGNITION_THRESHOLD.
 * Returns null if no match found (unknown person).
 */
export function findBestMatch(
  query: number[],
  persons: PersonRecord[],
): MatchResult | null {
  let best: MatchResult | null = null;

  for (const p of persons) {
    const sim = cosineSimilarity(query, p.embedding);
    if (sim >= RECOGNITION_THRESHOLD && (!best || sim > best.similarity)) {
      best = { id: p.id, name: p.name, empId: p.emp_id, similarity: sim };
    }
  }

  return best;
}
