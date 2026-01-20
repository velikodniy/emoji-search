import {
  pipeline,
  env,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";

// Configure transformers.js for local models
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = "/models/";

let extractor: FeatureExtractionPipeline | null = null;
let loadingPromise: Promise<FeatureExtractionPipeline> | null = null;
let modelReady = false;

type ModelStatusCallback = (status: {
  loading: boolean;
  ready: boolean;
}) => void;
const statusCallbacks: Set<ModelStatusCallback> = new Set();

function notifyStatus() {
  const status = { loading: loadingPromise !== null, ready: modelReady };
  statusCallbacks.forEach((cb) => cb(status));
}

/**
 * Subscribe to model loading status changes.
 * Returns an unsubscribe function.
 */
export function onModelStatus(callback: ModelStatusCallback): () => void {
  statusCallbacks.add(callback);
  callback({ loading: loadingPromise !== null, ready: modelReady });
  return () => statusCallbacks.delete(callback);
}

/**
 * Get or initialize the embedding pipeline.
 * Uses locally hosted model files.
 */
async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (extractor) {
    return extractor;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
    dtype: "q8",
  }) as Promise<FeatureExtractionPipeline>;

  notifyStatus();

  extractor = await loadingPromise;
  loadingPromise = null;
  modelReady = true;

  notifyStatus();

  return extractor;
}

/**
 * Preload the model in the background.
 * Call this on app startup to warm up the model.
 */
export function preloadModel(): void {
  getExtractor().catch((err) => {
    console.error("Failed to preload model:", err);
  });
}

/**
 * Compute embedding for a text query.
 * Returns a normalized 384-dimensional Float32Array.
 */
export async function computeEmbedding(text: string): Promise<Float32Array> {
  const ext = await getExtractor();
  const output = await ext(text, { pooling: "mean", normalize: true });
  const data = output.tolist() as number[][];
  return new Float32Array(data[0]);
}
