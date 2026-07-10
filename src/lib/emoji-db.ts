import { decode } from "cbor-x";
import { computeEmbedding } from "./embeddings.ts";
import type { EmojiDB } from "./emoji-db-types.ts";
import { normalizeQuery, rankEmojiDB, validateDB } from "./search-scoring.ts";

export interface EmojiResult {
  char: string;
  code: string;
  name: string;
  score: number;
}

const DB_PATH = "/emoji-db.cbor";

let db: EmojiDB | null = null;
let loadingPromise: Promise<EmojiDB> | null = null;

function loadDB(): Promise<EmojiDB> {
  if (db) {
    return db;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    const response = await fetch(DB_PATH);
    if (!response.ok) {
      throw new Error(`Failed to load emoji database: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const data = decode(new Uint8Array(buffer)) as EmojiDB;
    validateDB(data);
    db = data;
    return data;
  })().catch((error) => {
    loadingPromise = null;
    throw error;
  });

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
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery || topK <= 0) {
    return [];
  }

  const [database, queryEmbedding] = await Promise.all([
    loadDB(),
    computeEmbedding(normalizedQuery),
  ]);

  return rankEmojiDB(database, queryEmbedding, normalizedQuery, topK).map(
    ({ index, score }) => ({
      char: database.chars[index],
      code: database.codes[index],
      name: database.names[index],
      score,
    }),
  );
}
