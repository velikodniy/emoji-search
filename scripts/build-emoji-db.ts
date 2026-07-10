/**
 * Build script that generates the emoji database with pre-computed embeddings.
 * Run with: deno run -A scripts/build-emoji-db.ts
 */

import { embed, engineInfo } from "@ternlight/base";
import { encode } from "cbor-x";
import type { EmojiDB } from "../src/lib/emoji-db-types.ts";
// @ts-ignore: Import attribute for JSON
import emojiData from "emoji-datasource/emoji.json" with { type: "json" };

const OUTPUT_PATH = "./public/emoji-db.cbor";
const EMOJIPEDIA_PATH = "./data/emojipedia.json";
const CUSTOM_ALIASES_PATH = "./data/custom-emoji-aliases.json";
const DB_SCHEMA_VERSION = 2;
const MODEL_NAME = "@ternlight/base";
const EMOJI_DATASOURCE = "emoji-datasource/emoji.json";
const EMBEDDING_DIM = 384;
const PROGRESS_INTERVAL = 100;

interface EmojipediaEntry {
  emoji: string;
  description: string;
}

type CustomAliases = Record<string, string[]>;

interface RawEmoji {
  unified: string;
  short_name: string;
  name: string;
  category: string;
  subcategory: string;
  short_names: string[];
  obsoleted_by?: string;
  has_img_apple: boolean;
}

function unifiedToChar(unified: string): string {
  return String.fromCodePoint(
    ...unified.split("-").map((hex) => parseInt(hex, 16)),
  );
}

function unifiedToCode(unified: string): string {
  return unified
    .split("-")
    .map((hex) => `U+${hex}`)
    .join(" ");
}

/**
 * Symmetric quantization around 0 to int8 range (-127 to 127).
 * This allows dot product comparison without dequantization.
 */
function findMaxAbs(embeddingGroups: Float32Array[][]): number {
  let maxAbs = 0;
  for (const embeddings of embeddingGroups) {
    for (const emb of embeddings) {
      for (const val of emb) {
        const abs = Math.abs(val);
        if (abs > maxAbs) maxAbs = abs;
      }
    }
  }
  return maxAbs;
}

function quantizeEmbeddingsSymmetric(
  embeddings: Float32Array[],
  maxAbs: number,
): Int8Array {
  if (embeddings.length === 0) {
    return new Int8Array();
  }
  if (maxAbs === 0) {
    throw new Error("Cannot quantize all-zero embeddings");
  }

  const scale = 127 / maxAbs;
  const totalSize = embeddings.length * embeddings[0].length;
  const quantized = new Int8Array(totalSize);

  let idx = 0;
  for (const emb of embeddings) {
    for (const val of emb) {
      quantized[idx++] = Math.round(val * scale);
    }
  }

  return quantized;
}

function computeEmbeddings(texts: string[]): Float32Array[] {
  const embeddings: Float32Array[] = [];

  for (let i = 0; i < texts.length; i++) {
    const embedding = embed(texts[i]);
    if (embedding.length !== EMBEDDING_DIM) {
      throw new Error(
        `Unexpected embedding dimension: ${embedding.length} !== ${EMBEDDING_DIM}`,
      );
    }
    embeddings.push(embedding);

    const progress = i + 1;
    if (progress % PROGRESS_INTERVAL === 0 || progress === texts.length) {
      console.log(`  ${progress}/${texts.length} embeddings computed`);
    }
  }

  return embeddings;
}

async function loadCustomAliases(): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  try {
    const content = await Deno.readTextFile(CUSTOM_ALIASES_PATH);
    const aliases = JSON.parse(content) as CustomAliases;
    for (const [emoji, terms] of Object.entries(aliases)) {
      map.set(
        emoji,
        terms.map((term) => term.trim().toLowerCase()).filter(Boolean),
      );
    }
    console.log(`Loaded custom aliases for ${map.size} emojis`);
  } catch {
    console.log("No custom aliases found");
  }
  return map;
}

async function loadEmojipediaDescriptions(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const content = await Deno.readTextFile(EMOJIPEDIA_PATH);
    const entries = JSON.parse(content) as EmojipediaEntry[];
    for (const entry of entries) {
      map.set(entry.emoji, entry.description);
    }
    console.log(`Loaded ${map.size} Emojipedia descriptions`);
  } catch {
    console.log("No Emojipedia data found, using fallback descriptions");
  }
  return map;
}

async function main() {
  console.log("Loading emoji data...");
  const rawData = emojiData as RawEmoji[];
  const [emojipedia, customAliases] = await Promise.all([
    loadEmojipediaDescriptions(),
    loadCustomAliases(),
  ]);

  // Filter and dedupe emojis
  const emojis = rawData.filter((e) => !e.obsoleted_by && e.has_img_apple);

  console.log(`Found ${emojis.length} emojis`);

  // Extract data
  const chars: string[] = [];
  const codes: string[] = [];
  const names: string[] = [];
  const tags: string[] = [];
  const descriptions: string[] = [];

  let emojipediaHits = 0;
  for (const emoji of emojis) {
    const char = unifiedToChar(emoji.unified);
    chars.push(char);
    codes.push(unifiedToCode(emoji.unified));
    // Use short_name as display name (replace underscores with spaces)
    const displayName = emoji.short_name.replace(/_/g, " ");
    names.push(displayName);

    const tagList = [
      ...emoji.short_names.map((s) => s.replace(/_/g, " ")),
      emoji.name.toLowerCase(),
      (emoji.category || "").toLowerCase(),
      (emoji.subcategory || "").toLowerCase(),
      ...(customAliases.get(char) ?? []),
    ].filter(Boolean);
    const uniqueTags = [...new Set(tagList)];
    const tagText = uniqueTags.join(" ");

    // Use Emojipedia description if available, otherwise fall back to the
    // official emoji name and taxonomy. Keep names/tags/descriptions separate
    // so search can score each intent independently.
    const emojipediaDesc = emojipedia.get(char);
    const descriptionText = emojipediaDesc ||
      `${emoji.name.toLowerCase()} ${emoji.category || ""} ${
        emoji.subcategory || ""
      }`.trim().toLowerCase();
    if (emojipediaDesc) {
      emojipediaHits++;
    }

    tags.push(tagText);
    descriptions.push(descriptionText);
  }

  console.log(
    `Using Emojipedia descriptions for ${emojipediaHits}/${emojis.length} emojis`,
  );

  console.log("Computing name embeddings with @ternlight/base...");
  const nameEmbeddings = computeEmbeddings(names);

  console.log("Computing tag embeddings with @ternlight/base...");
  const tagEmbeddings = computeEmbeddings(tags);

  console.log("Computing description embeddings with @ternlight/base...");
  const descriptionEmbeddings = computeEmbeddings(descriptions);

  console.log("Quantizing embeddings to int8 (symmetric)...");
  const maxAbs = findMaxAbs([
    nameEmbeddings,
    tagEmbeddings,
    descriptionEmbeddings,
  ]);

  const quantizationScale = 127 / maxAbs;

  const db: EmojiDB = {
    metadata: {
      schemaVersion: DB_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      model: MODEL_NAME,
      modelInfo: engineInfo(),
      embeddingDim: EMBEDDING_DIM,
      embeddingFields: ["name", "tags", "description"],
      quantization: {
        type: "symmetric-int8",
        maxAbs,
        scale: quantizationScale,
      },
      sources: {
        emojiDatasource: EMOJI_DATASOURCE,
        emojiCount: chars.length,
        emojipediaPath: EMOJIPEDIA_PATH,
        emojipediaDescriptions: emojipediaHits,
        customAliasesPath: CUSTOM_ALIASES_PATH,
        customAliasEmojis: customAliases.size,
      },
    },
    dim: EMBEDDING_DIM,
    chars,
    codes,
    names,
    tags,
    descriptions,
    nameEmbeddings: quantizeEmbeddingsSymmetric(nameEmbeddings, maxAbs),
    tagEmbeddings: quantizeEmbeddingsSymmetric(tagEmbeddings, maxAbs),
    descriptionEmbeddings: quantizeEmbeddingsSymmetric(
      descriptionEmbeddings,
      maxAbs,
    ),
  };

  console.log("Encoding to CBOR...");
  const encoded = encode(db);

  await Deno.writeFile(OUTPUT_PATH, encoded);

  const sizeMB = (encoded.length / 1024 / 1024).toFixed(2);
  console.log(`\nDatabase saved to ${OUTPUT_PATH}`);
  console.log(`  Emojis: ${chars.length}`);
  console.log(`  Embedding dim: ${EMBEDDING_DIM}`);
  console.log(`  File size: ${sizeMB} MB`);
}

main().catch((err) => {
  console.error("Error:", err);
  Deno.exit(1);
});
