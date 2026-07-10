import type { EmojiDB } from "./emoji-db-types.ts";
import { dotProductQuantized } from "./similarity.ts";

export interface SearchScoringConfig {
  nameWeight: number;
  tagWeight: number;
  descriptionWeight: number;
  shortNameWeight: number;
  exactNameBoost: number;
  nameMatchBoost: number;
  tagMatchBoost: number;
  descriptionMatchBoost: number;
}

export interface RankedEmoji {
  index: number;
  score: number;
}

export const DB_SCHEMA_VERSION = 2;

export const defaultScoringConfig: SearchScoringConfig = {
  nameWeight: 1.2,
  tagWeight: 1.0,
  descriptionWeight: 0.8,
  shortNameWeight: 0.35,

  // Boosts are in approximate cosine-similarity units. The quantized int8 dot
  // product is divided by the DB's global quantization scale before these boosts
  // are applied, which keeps scoring stable if the quantization scale changes.
  exactNameBoost: 0.35,
  nameMatchBoost: 0.12,
  tagMatchBoost: 0.18,
  descriptionMatchBoost: 0.05,
};

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function nameSemanticWeight(
  name: string,
  query: string,
  config: SearchScoringConfig,
): number {
  // Very short emoji names like "a", "on", "it", and "vs" are noisy as
  // semantic sentence embeddings and can match unrelated natural-language
  // queries. Keep their exact keyword boost, but downweight fuzzy semantics.
  if (name.length <= 2 && name.toLowerCase() !== query) {
    return config.shortNameWeight;
  }

  return config.nameWeight;
}

function normalizeForKeywordMatch(text: string): string {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).join(" ");
}

function containsTokenPhrase(text: string, query: string): boolean {
  const normalizedText = normalizeForKeywordMatch(text);
  const normalizedQuery = normalizeForKeywordMatch(query);
  if (!normalizedText || !normalizedQuery) {
    return false;
  }

  return ` ${normalizedText} `.includes(` ${normalizedQuery} `);
}

function keywordBoost(
  query: string,
  name: string,
  tags: string,
  description: string,
  config: SearchScoringConfig,
): number {
  if (!query) {
    return 0;
  }

  const normalizedName = normalizeForKeywordMatch(name);
  const normalizedQuery = normalizeForKeywordMatch(query);

  let boost = 0;
  if (normalizedName === normalizedQuery) {
    boost += config.exactNameBoost;
  } else if (containsTokenPhrase(name, query)) {
    boost += config.nameMatchBoost;
  }
  if (containsTokenPhrase(tags, query)) {
    boost += config.tagMatchBoost;
  }
  if (containsTokenPhrase(description, query)) {
    boost += config.descriptionMatchBoost;
  }

  return boost;
}

export function validateDB(data: EmojiDB): void {
  if (data.metadata?.schemaVersion !== DB_SCHEMA_VERSION) {
    throw new Error("Invalid emoji database: unsupported schema version");
  }
  if (data.metadata.embeddingDim !== data.dim) {
    throw new Error("Invalid emoji database: metadata dimension mismatch");
  }
  if (
    data.metadata.quantization?.type !== "symmetric-int8" ||
    !Number.isFinite(data.metadata.quantization.scale) ||
    data.metadata.quantization.scale <= 0
  ) {
    throw new Error("Invalid emoji database: invalid quantization metadata");
  }
  if (!Number.isInteger(data.dim) || data.dim <= 0) {
    throw new Error("Invalid emoji database: invalid embedding dimension");
  }

  const count = data.chars.length;
  const expectedEmbeddingLength = count * data.dim;

  const sameLengthFields = [
    data.codes,
    data.names,
    data.tags,
    data.descriptions,
  ];
  if (sameLengthFields.some((field) => field.length !== count)) {
    throw new Error("Invalid emoji database: metadata length mismatch");
  }

  const embeddingFields = [
    data.nameEmbeddings,
    data.tagEmbeddings,
    data.descriptionEmbeddings,
  ];
  if (
    embeddingFields.some((field) => field.length !== expectedEmbeddingLength)
  ) {
    throw new Error("Invalid emoji database: embedding length mismatch");
  }
}

export function scoreEmoji(
  database: EmojiDB,
  queryEmbedding: Float32Array,
  normalizedQuery: string,
  index: number,
  config: SearchScoringConfig = defaultScoringConfig,
): number {
  const { dim, names, tags, descriptions } = database;
  const offset = index * dim;

  const nameScore = dotProductQuantized(
    queryEmbedding,
    database.nameEmbeddings,
    offset,
    dim,
  );
  const tagScore = dotProductQuantized(
    queryEmbedding,
    database.tagEmbeddings,
    offset,
    dim,
  );
  const descriptionScore = dotProductQuantized(
    queryEmbedding,
    database.descriptionEmbeddings,
    offset,
    dim,
  );

  const semanticScore = Math.max(
    nameSemanticWeight(names[index], normalizedQuery, config) * nameScore,
    config.tagWeight * tagScore,
    config.descriptionWeight * descriptionScore,
  ) / database.metadata.quantization.scale;

  return semanticScore + keywordBoost(
    normalizedQuery,
    names[index],
    tags[index],
    descriptions[index],
    config,
  );
}

export function rankEmojiDB(
  database: EmojiDB,
  queryEmbedding: Float32Array,
  normalizedQuery: string,
  topK: number,
  config: SearchScoringConfig = defaultScoringConfig,
): RankedEmoji[] {
  const scores: RankedEmoji[] = [];

  for (let i = 0; i < database.chars.length; i++) {
    scores.push({
      index: i,
      score: scoreEmoji(database, queryEmbedding, normalizedQuery, i, config),
    });
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topK);
}
