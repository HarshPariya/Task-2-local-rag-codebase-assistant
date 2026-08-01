import BM25 from "wink-bm25-text-search";
import nlp from "wink-nlp-utils";

import { getAllChunks } from "../database/db.js";

const engine = BM25();

let indexed = false;

function tokenize(text: string): string[] {
  return nlp.string.tokenize0(text.toLowerCase());
}

export function buildBM25Index() {
  if (indexed) return;

  engine.defineConfig({
    fldWeights: {
      content: 1,
    },
    bm25Params: {
      k1: 1.2,
      b: 0.75,
      k: 1,
    },
  });

  engine.definePrepTasks([
    tokenize,
  ]);

  engine.defineField("content");

  engine.defineRef("id");

  const chunks = getAllChunks();

  for (const chunk of chunks) {
    engine.addDoc({
      id: chunk.id,
      content: chunk.content,
    });
  }

  engine.consolidate();

  indexed = true;
}

export function bm25Search(
  query: string,
  limit = 5
) {
  buildBM25Index();

  return engine.search(query).slice(0, limit);
}