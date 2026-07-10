# Emoji Search

A semantic emoji search application.

## Development

Run locally:

```bash
deno task dev
```

## Design

This application performs **semantic search** entirely in the browser using
[`@ternlight/base`](https://www.npmjs.com/package/@ternlight/base).

- **Client-Side AI**: A 384-dimensional embedding model runs locally in your
  browser via WebAssembly, with no API calls.
- **Vector Search**: Emoji descriptions are pre-computed into vector embeddings
  and stored in a compact, binary CBOR database.
- **Real-Time Matching**: When you type, the app generates an embedding for your
  query and calculates cosine similarity against the database to find the most
  relevant emojis by meaning, not just keywords.
