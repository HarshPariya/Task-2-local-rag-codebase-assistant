import { embedQuery } from "../embedding/embed.js";
import { searchVectors } from "../database/db.js";

export async function vectorSearch(
  question: string,
  topK = 5
) {
  const queryEmbedding = await embedQuery(question);

  return searchVectors(
    queryEmbedding,
    topK
  );
}