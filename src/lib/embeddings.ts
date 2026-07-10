import { embed } from "@ternlight/base";

let loading = false;
let modelReady = false;

type ModelStatusCallback = (status: {
  loading: boolean;
  ready: boolean;
}) => void;
const statusCallbacks: Set<ModelStatusCallback> = new Set();

function notifyStatus() {
  const status = { loading, ready: modelReady };
  statusCallbacks.forEach((cb) => cb(status));
}

/**
 * Subscribe to model loading status changes.
 * Returns an unsubscribe function.
 */
export function onModelStatus(callback: ModelStatusCallback): () => void {
  statusCallbacks.add(callback);
  callback({ loading, ready: modelReady });
  return () => statusCallbacks.delete(callback);
}

/**
 * Initialize the embedding engine. @ternlight/base embeds synchronously and
 * ships the model inside its WASM module, so warming up means running one tiny
 * embedding once the module is imported.
 */
function warmupModel(): void {
  if (modelReady || loading) {
    return;
  }

  loading = true;
  notifyStatus();

  embed("warmup");

  loading = false;
  modelReady = true;
  notifyStatus();
}

/**
 * Preload the model in the background.
 * Call this on app startup to warm up the model.
 */
export function preloadModel(): void {
  try {
    warmupModel();
  } catch (err) {
    loading = false;
    notifyStatus();
    console.error("Failed to preload model:", err);
  }
}

/**
 * Compute embedding for a text query.
 * Returns a normalized 384-dimensional Float32Array.
 */
export async function computeEmbedding(text: string): Promise<Float32Array> {
  if (!modelReady) {
    warmupModel();
  }

  return embed(text);
}
