import path from "node:path";

import {
  getProjectFiles,
  readTextFile,
  relativeFilePath,
} from "../utils/file.js";

import { chunkTypescriptFile } from "../chunker/chunker.js";
import { chunkMarkdown } from "../chunker/markdown.js";

import {
  insertChunk,
  getAllChunkIds,
  getChunkHash,
  deleteChunk,
} from "../database/db.js";

export async function ingest(projectPath: string): Promise<void> {
  const start = performance.now();

  console.log("\n========== INGEST ==========\n");

  const root = path.resolve(projectPath);

  const files = await getProjectFiles(root);

  const existingIds = new Set(getAllChunkIds());

  let totalChunks = 0;
  let newOrUpdated = 0;

  for (const file of files) {
    const relative = relativeFilePath(root, file);

    let chunks = [];

    if (file.endsWith(".md")) {
      chunks = chunkMarkdown(
        readTextFile(file),
        relative
      );
    } else {
      chunks = chunkTypescriptFile(
        file,
        relative
      );
    }

    for (const chunk of chunks) {
      totalChunks++;
      existingIds.delete(chunk.id);

      const currentHash = getChunkHash(chunk.id);
      if (currentHash !== chunk.contentHash) {
        insertChunk(chunk);
        newOrUpdated++;
      }
    }
  }

  let deleted = 0;
  for (const id of existingIds) {
    deleteChunk(id);
    deleted++;
  }

  const elapsed = performance.now() - start;

  console.log(`Files scanned : ${files.length}`);
  console.log(`Total chunks  : ${totalChunks}`);
  console.log(`New/Updated   : ${newOrUpdated}`);
  console.log(`Deleted       : ${deleted}`);
  console.log(`Time          : ${elapsed.toFixed(1)} ms`);
}