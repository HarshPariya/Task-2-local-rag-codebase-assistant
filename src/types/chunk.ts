export type ChunkKind =
  | "function"
  | "class"
  | "type"
  | "markdown-section"
  | "other";

export interface Chunk {
  id: string;

  content: string;

  path: string;

  startLine: number;

  endLine: number;

  symbolName?: string;

  kind: ChunkKind;

  contentHash: string;
}