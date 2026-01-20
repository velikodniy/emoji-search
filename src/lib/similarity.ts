/**
 * Compute dot product between a float32 query and int8 quantized embeddings.
 * Since both are normalized and symmetrically quantized, the dot product
 * is proportional to cosine similarity - no dequantization needed.
 */
export function dotProductQuantized(
  query: Float32Array,
  quantized: Int8Array,
  offset: number,
  dim: number,
): number {
  let sum = 0;
  for (let i = 0; i < dim; i++) {
    sum += query[i] * quantized[offset + i];
  }
  return sum;
}
