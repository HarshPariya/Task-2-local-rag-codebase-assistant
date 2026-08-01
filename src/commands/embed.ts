import {
  getChunksWithoutEmbedding,
  insertEmbedding,
} from "../database/db.js";

import { embedDocument } from "../embedding/embed.js";

export async function buildEmbeddings() {
  const start = performance.now();

  const chunks = getChunksWithoutEmbedding();

  console.log("\n========== EMBEDDING ==========\n");

  console.log(`Found ${chunks.length} chunks to embed`);

  let count = 0;

  for (const chunk of chunks) {
    const embedding = await embedDocument(
      chunk.content
    );

    insertEmbedding(
      chunk.id,
      embedding
    );

    count++;

    if (count % 50 === 0) {
      console.log(
        `${count}/${chunks.length} embedded`
      );
    }
  }

  const elapsed = performance.now() - start;

  console.log("");

  console.log("Embedding completed.");

  console.log(
    `Embedding Time : ${elapsed.toFixed(1)} ms`
  );
}