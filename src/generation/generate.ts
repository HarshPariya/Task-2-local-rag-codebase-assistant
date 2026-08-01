import ollama from "ollama";
import { SearchResult } from "../database/db.js";

const MAX_CHUNK_CHARS = 1500;

function formatChunk(chunk: SearchResult, index: number): string {
  const normPath = chunk.path.replace(/\\/g, "/");
  const citeTag = `(${normPath}:${chunk.startLine}-${chunk.endLine})`;
  let content = chunk.content;
  if (content.length > MAX_CHUNK_CHARS) {
    content = content.slice(0, MAX_CHUNK_CHARS) + "\n... [truncated]";
  }

  return `[SOURCE ${index + 1}] Citation Tag to copy: ${citeTag}
${chunk.symbolName ? `Symbol: ${chunk.symbolName}\n` : ""}Code Content:
${content}`;
}

export async function generateAnswer(
  question: string,
  chunks: SearchResult[]
): Promise<string> {
  // Conversational / Non-code question guardrail
  const lowerQ = question.trim().toLowerCase();
  const nonCodeGreetings = [
    "who are you", "who are u", "what is your name", "tell me a joke",
    "how old are you", "hi", "hello", "hey"
  ];
  if (nonCodeGreetings.some((g) => lowerQ === g || lowerQ.startsWith(g + "?") || lowerQ.startsWith(g + "!"))) {
    return "I could not find the answer in the retrieved code.";
  }

  // Format chunks for Qwen3B
  const contextBlocks = chunks.map((chunk, index) => formatChunk(chunk, index));
  const context = contextBlocks.join("\n\n-------------------\n\n");

  const exampleCite = chunks.length > 0
    ? `(${chunks[0].path.replace(/\\/g, "/")}:${chunks[0].startLine}-${chunks[0].endLine})`
    : "(src/example.ts:1-10)";

  const prompt = `You are a software engineer answering questions about a codebase based ONLY on the provided code snippets.

Instructions:
1. Read every retrieved snippet below carefully.
2. If one or more snippets answer the question, write a clear and direct answer.
3. CRITICAL: At the end of every bullet point or paragraph containing factual information, you MUST copy and append the exact Citation Tag in parentheses, for example: ${exampleCite}
4. Never refuse to answer if any of the snippets contain relevant information or code.
5. ONLY if absolutely none of the snippets contain the answer, reply exactly with:
I could not find the answer in the retrieved code.

CODE SNIPPETS:
${context}

QUESTION: ${question}

ANSWER:`;

  const response = await ollama.chat({
    model: "qwen2.5:3b",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    options: {
      temperature: 0.1,
      num_predict: 512,
    },
  });

  return response.message.content.trim();
}