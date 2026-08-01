import ollama from "ollama";
import { SearchResult } from "../database/db.js";

export async function judgeFaithfulness(
  question: string,
  answer: string,
  chunks: SearchResult[]
): Promise<"YES" | "NO"> {
  // If the model couldn't find the answer in the provided context
  if (answer.trim().toLowerCase().includes("could not find the answer")) {
    return "YES";
  }

  const context = chunks
    .map(
      (chunk) => `
SOURCE:
${chunk.path}:${chunk.startLine}-${chunk.endLine}

CONTENT:
${chunk.content}
`
    )
    .join("\n----------------------\n");

  const prompt = `
You are evaluating whether an answer is supported ONLY by the retrieved code.

Rules:

- Ignore all outside knowledge.
- Compare ONLY the retrieved context with the answer.
- If every factual statement is supported by the retrieved context, answer YES.
- Otherwise answer NO.

Retrieved Context:

${context}

Question:

${question}

Answer:

${answer}

Reply with exactly one word:

YES

or

NO
`;

  const response = await ollama.chat({
    model: "qwen2.5:3b",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const result = response.message.content
    .trim()
    .toUpperCase();

  return result.startsWith("YES") ? "YES" : "NO";
}