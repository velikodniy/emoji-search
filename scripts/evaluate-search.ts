import { embed } from "@ternlight/base";
import { decode } from "cbor-x";
import type { EmojiDB } from "../src/lib/emoji-db-types.ts";
import {
  defaultScoringConfig,
  normalizeQuery,
  rankEmojiDB,
  validateDB,
} from "../src/lib/search-scoring.ts";

const DEFAULT_DB_PATH = "./public/emoji-db.cbor";
const DEFAULT_EVAL_PATH = "./data/search-eval.json";
const DEFAULT_TOP_K = 10;

interface EvalQuery {
  query: string;
  ratings: Record<string, number>;
}

interface EvalFile {
  version: number;
  description?: string;
  queries: EvalQuery[];
}

interface QueryMetrics {
  query: string;
  reciprocalRank: number;
  ndcg: number;
  hit: number;
  topResults: string[];
}

function argValue(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const arg = Deno.args.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function hasFlag(name: string): boolean {
  return Deno.args.includes(`--${name}`);
}

function optionalNumberArg(name: string): number | null {
  const value = argValue(name, "");
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`--${name} must be a number`);
  }
  return parsed;
}

function assertMetricThreshold(
  name: string,
  value: number,
  threshold: number | null,
): void {
  if (threshold === null) {
    return;
  }

  console.log(`${name} threshold: ${threshold.toFixed(4)}`);
  if (value < threshold) {
    throw new Error(
      `${name} ${value.toFixed(4)} is below threshold ${threshold.toFixed(4)}`,
    );
  }
}

async function loadDB(path: string): Promise<EmojiDB> {
  const db = decode(await Deno.readFile(path)) as EmojiDB;
  validateDB(db);
  return db;
}

async function loadEvalFile(path: string): Promise<EvalFile> {
  const data = JSON.parse(await Deno.readTextFile(path)) as EvalFile;
  if (!Array.isArray(data.queries) || data.queries.length === 0) {
    throw new Error("Evaluation file must contain a non-empty queries array");
  }
  return data;
}

function reciprocalRankAt(
  rankedChars: string[],
  ratings: Record<string, number>,
  topK: number,
): number {
  const limit = Math.min(topK, rankedChars.length);
  for (let i = 0; i < limit; i++) {
    if ((ratings[rankedChars[i]] ?? 0) > 0) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

function dcgAt(
  rankedChars: string[],
  ratings: Record<string, number>,
  topK: number,
): number {
  const limit = Math.min(topK, rankedChars.length);
  let dcg = 0;
  for (let i = 0; i < limit; i++) {
    const relevance = ratings[rankedChars[i]] ?? 0;
    if (relevance > 0) {
      dcg += (2 ** relevance - 1) / Math.log2(i + 2);
    }
  }
  return dcg;
}

function idealDcgAt(ratings: Record<string, number>, topK: number): number {
  const idealRelevances = Object.values(ratings)
    .filter((rating) => rating > 0)
    .sort((a, b) => b - a)
    .slice(0, topK);

  return idealRelevances.reduce(
    (sum, relevance, index) =>
      sum + (2 ** relevance - 1) / Math.log2(index + 2),
    0,
  );
}

function ndcgAt(
  rankedChars: string[],
  ratings: Record<string, number>,
  topK: number,
): number {
  const ideal = idealDcgAt(ratings, topK);
  return ideal === 0 ? 0 : dcgAt(rankedChars, ratings, topK) / ideal;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function validateEvalQueries(db: EmojiDB, queries: EvalQuery[]): void {
  const knownChars = new Set(db.chars);
  const unknown: string[] = [];

  for (const item of queries) {
    for (const char of Object.keys(item.ratings)) {
      if (!knownChars.has(char)) {
        unknown.push(`${char} (${item.query})`);
      }
    }
  }

  if (unknown.length > 0) {
    console.warn(
      `Warning: ${unknown.length} rated emojis are not present in the DB: ${
        unknown.join(", ")
      }`,
    );
  }
}

function evaluateQuery(
  db: EmojiDB,
  item: EvalQuery,
  topK: number,
): QueryMetrics {
  const normalized = normalizeQuery(item.query);
  const queryEmbedding = embed(normalized);
  const ranked = rankEmojiDB(
    db,
    queryEmbedding,
    normalized,
    topK,
    defaultScoringConfig,
  );
  const rankedChars = ranked.map(({ index }) => db.chars[index]);

  return {
    query: item.query,
    reciprocalRank: reciprocalRankAt(rankedChars, item.ratings, topK),
    ndcg: ndcgAt(rankedChars, item.ratings, topK),
    hit: rankedChars.some((char) => (item.ratings[char] ?? 0) > 0) ? 1 : 0,
    topResults: ranked.map(({ index, score }) => {
      const char = db.chars[index];
      const relevance = item.ratings[char] ?? 0;
      const marker = relevance > 0 ? ` rel=${relevance}` : "";
      return `${char} ${db.names[index]} (${score.toFixed(3)}${marker})`;
    }),
  };
}

async function main() {
  const dbPath = argValue("db", DEFAULT_DB_PATH);
  const evalPath = argValue("eval", DEFAULT_EVAL_PATH);
  const topK = Number(argValue("topK", String(DEFAULT_TOP_K)));
  const details = hasFlag("details");
  const minMRR = optionalNumberArg("minMRR");
  const minNDCG = optionalNumberArg("minNDCG");
  const minHit = optionalNumberArg("minHit");

  if (!Number.isInteger(topK) || topK <= 0) {
    throw new Error("--topK must be a positive integer");
  }

  const [db, evalFile] = await Promise.all([
    loadDB(dbPath),
    loadEvalFile(evalPath),
  ]);
  validateEvalQueries(db, evalFile.queries);

  const metrics = evalFile.queries.map((item) => evaluateQuery(db, item, topK));

  const mrr = mean(metrics.map((m) => m.reciprocalRank));
  const ndcg = mean(metrics.map((m) => m.ndcg));
  const hit = mean(metrics.map((m) => m.hit));

  console.log(`Evaluation file: ${evalPath}`);
  console.log(`Queries: ${metrics.length}`);
  console.log(`Top K: ${topK}`);
  console.log(`Scoring config: ${JSON.stringify(defaultScoringConfig)}`);
  console.log(`MRR@${topK}: ${mrr.toFixed(4)}`);
  console.log(`nDCG@${topK}: ${ndcg.toFixed(4)}`);
  console.log(`Hit@${topK}: ${hit.toFixed(4)}`);

  assertMetricThreshold(`MRR@${topK}`, mrr, minMRR);
  assertMetricThreshold(`nDCG@${topK}`, ndcg, minNDCG);
  assertMetricThreshold(`Hit@${topK}`, hit, minHit);

  if (details) {
    console.log("\nPer-query results:");
    for (const metric of metrics) {
      console.log(
        `\n${metric.query}: RR=${metric.reciprocalRank.toFixed(3)} nDCG=${
          metric.ndcg.toFixed(3)
        }`,
      );
      metric.topResults.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result}`);
      });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  Deno.exit(1);
});
