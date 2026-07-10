export interface EmojiDBMetadata {
  schemaVersion: number;
  createdAt: string;
  model: string;
  modelInfo: string;
  embeddingDim: number;
  embeddingFields: string[];
  quantization: {
    type: "symmetric-int8";
    maxAbs: number;
    scale: number;
  };
  sources: {
    emojiDatasource: string;
    emojiCount: number;
    emojipediaPath: string;
    emojipediaDescriptions: number;
    customAliasesPath?: string;
    customAliasEmojis?: number;
  };
}

export interface EmojiDB {
  metadata: EmojiDBMetadata;
  dim: number;
  chars: string[];
  codes: string[];
  names: string[];
  tags: string[];
  descriptions: string[];
  nameEmbeddings: Int8Array;
  tagEmbeddings: Int8Array;
  descriptionEmbeddings: Int8Array;
}
