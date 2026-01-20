import { decode } from "cbor-x";
import { computeEmbedding } from "./embeddings";
import { dotProductQuantized } from "./similarity";

export interface EmojiResult {
  char: string;
  code: string;
  name: string;
  score: number;
}

interface EmojiDB {
  dim: number;
  chars: string[];
  codes: string[];
  names: string[];
  embeddings: Int8Array;
}

let db: EmojiDB | null = null;
let loadingPromise: Promise<EmojiDB> | null = null;

async function loadDB(): Promise<EmojiDB> {
  if (db) {
    return db;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    const response = await fetch("/emoji-db.cbor");
    const buffer = await response.arrayBuffer();
    const data = decode(new Uint8Array(buffer)) as EmojiDB;
    db = data;
    return data;
  })();

  return loadingPromise;
}

/**
 * Search for emojis matching the given query.
 * Returns top K results sorted by semantic similarity.
 */
export async function searchEmojis(
  query: string,
  topK: number = 10,
): Promise<EmojiResult[]> {
  const [database, queryEmbedding] = await Promise.all([
    loadDB(),
    computeEmbedding(query),
  ]);

  const { dim, chars, codes, names, embeddings } = database;
  const numEmojis = chars.length;

  // Compute similarities (dot product is proportional to cosine similarity
  // since embeddings are normalized and symmetrically quantized)
  const scores: Array<{ index: number; score: number }> = [];

  for (let i = 0; i < numEmojis; i++) {
    const offset = i * dim;
    const score = dotProductQuantized(queryEmbedding, embeddings, offset, dim);
    scores.push({ index: i, score });
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  // Return top K results
  return scores.slice(0, topK).map(({ index, score }) => ({
    char: chars[index],
    code: codes[index],
    name: names[index],
    score,
  }));
}
