/**
 * Build script that generates the emoji database with pre-computed embeddings.
 * Run with: deno task build:db
 */

import { pipeline } from "@huggingface/transformers";
import { encode } from "cbor-x";
// @ts-ignore: Import attribute for JSON
import emojiData from "npm:emoji-datasource/emoji.json" with { type: "json" };

const OUTPUT_PATH = "./public/emoji-db.cbor";

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

interface EmojiDB {
  dim: number;
  chars: string[];
  codes: string[];
  names: string[];
  embeddings: Int8Array;
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
function quantizeEmbeddingsSymmetric(embeddings: Float32Array[]): Int8Array {
  // Find global max absolute value
  let maxAbs = 0;
  for (const emb of embeddings) {
    for (const val of emb) {
      const abs = Math.abs(val);
      if (abs > maxAbs) maxAbs = abs;
    }
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

async function main() {
  console.log("Loading emoji data...");
  const rawData = emojiData as RawEmoji[];

  // Filter and dedupe emojis
  const emojis = rawData.filter((e) => !e.obsoleted_by && e.has_img_apple);

  console.log(`Found ${emojis.length} emojis`);

  // Extract data
  const chars: string[] = [];
  const codes: string[] = [];
  const names: string[] = [];
  const descriptions: string[] = [];

  for (const emoji of emojis) {
    chars.push(unifiedToChar(emoji.unified));
    codes.push(unifiedToCode(emoji.unified));
    // Use short_name as display name (replace underscores with spaces)
    const displayName = emoji.short_name.replace(/_/g, " ");
    names.push(displayName);

    // For embedding, combine multiple fields for better semantics
    const keywords = [
      displayName,
      emoji.name.toLowerCase(),
      (emoji.category || "").toLowerCase(),
      (emoji.subcategory || "").toLowerCase(),
      ...emoji.short_names.map((s) => s.replace(/_/g, " ")),
    ];
    // Deduplicate
    const uniqueKeywords = [...new Set(keywords)];
    descriptions.push(uniqueKeywords.join(" "));
  }

  console.log("Loading embedding model...");
  const extractor = await pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2",
    { dtype: "q8" },
  );

  console.log("Computing embeddings...");
  const batchSize = 64;
  const allEmbeddings: Float32Array[] = [];

  for (let i = 0; i < descriptions.length; i += batchSize) {
    const batch = descriptions.slice(i, i + batchSize);
    const output = await extractor(batch, { pooling: "mean", normalize: true });
    const data = output.tolist() as number[][];

    for (const emb of data) {
      allEmbeddings.push(new Float32Array(emb));
    }

    const progress = Math.min(i + batchSize, descriptions.length);
    console.log(`  ${progress}/${descriptions.length} embeddings computed`);
  }

  console.log("Quantizing embeddings to int8 (symmetric)...");
  const quantized = quantizeEmbeddingsSymmetric(allEmbeddings);

  const db: EmojiDB = {
    dim: 384,
    chars,
    codes,
    names,
    embeddings: quantized,
  };

  console.log("Encoding to CBOR...");
  const encoded = encode(db);

  await Deno.writeFile(OUTPUT_PATH, encoded);

  const sizeMB = (encoded.length / 1024 / 1024).toFixed(2);
  console.log(`\nDatabase saved to ${OUTPUT_PATH}`);
  console.log(`  Emojis: ${chars.length}`);
  console.log(`  Embedding dim: 384`);
  console.log(`  File size: ${sizeMB} MB`);
}

main().catch((err) => {
  console.error("Error:", err);
  Deno.exit(1);
});
