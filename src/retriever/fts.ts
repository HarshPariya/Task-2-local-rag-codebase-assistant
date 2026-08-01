import { searchFTS } from "../database/db.js";

export async function ftsSearch(
  question: string,
  topK = 5
) {
  return searchFTS(question, topK);
}