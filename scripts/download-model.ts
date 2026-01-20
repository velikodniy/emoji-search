/**
 * Downloads the all-MiniLM-L6-v2 model files from Hugging Face
 * for self-hosting with Transformers.js
 */

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const BASE_URL = `https://huggingface.co/${MODEL_ID}/resolve/main`;
const OUTPUT_DIR = `./public/models/${MODEL_ID}`;

const FILES = [
  "onnx/model_quantized.onnx",
  "tokenizer.json",
  "tokenizer_config.json",
  "config.json",
];

async function downloadFile(file: string): Promise<void> {
  const url = `${BASE_URL}/${file}`;
  const outputPath = `${OUTPUT_DIR}/${file}`;

  // Create subdirectory if needed
  const dir = outputPath.substring(0, outputPath.lastIndexOf("/"));
  await Deno.mkdir(dir, { recursive: true });

  console.log(`Downloading ${file}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${file}: ${response.statusText}`);
  }

  const data = new Uint8Array(await response.arrayBuffer());
  await Deno.writeFile(outputPath, data);

  const sizeMB = (data.length / 1024 / 1024).toFixed(2);
  console.log(`  Saved to ${outputPath} (${sizeMB} MB)`);
}

async function main() {
  console.log(`Downloading model: ${MODEL_ID}`);
  console.log(`Output directory: ${OUTPUT_DIR}\n`);

  await Deno.mkdir(OUTPUT_DIR, { recursive: true });

  for (const file of FILES) {
    await downloadFile(file);
  }

  console.log("\nModel download complete!");
}

main().catch((err) => {
  console.error("Error:", err.message);
  Deno.exit(1);
});
