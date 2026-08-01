export interface RetrievedChunk {
  path: string;
  startLine: number;
  endLine: number;
}

export function validateCitations(
  answer: string,
  chunks: RetrievedChunk[]
) {
  // If the model correctly says it doesn't know,
  // don't require citations.
  if (answer.trim().toLowerCase().includes("could not find the answer")) {
    return {
      valid: true,
      total: 0,
      matched: 0,
      invalid: [],
    };
  }

  const regex = /\(([^:)]+):(\d+)-(\d+)\)/g;

  const citations = [...answer.matchAll(regex)];

  if (citations.length === 0) {
    return {
      valid: false,
      total: 0,
      matched: 0,
      invalid: ["No citations found"],
    };
  }

  const invalid: string[] = [];
  let matched = 0;

  for (const citation of citations) {
    const path = citation[1];
    const start = Number(citation[2]);
    const end = Number(citation[3]);

    const normalize = (p: string) => p.replace(/\\/g, "/");
    
    const ok = chunks.some(
      (chunk) =>
        normalize(chunk.path) === normalize(path) &&
        start >= chunk.startLine &&
        end <= chunk.endLine
    );

    if (ok) {
      matched++;
    } else {
      invalid.push(citation[0]);
    }
  }

  return {
    valid: invalid.length === 0,
    total: citations.length,
    matched,
    invalid,
  };
}