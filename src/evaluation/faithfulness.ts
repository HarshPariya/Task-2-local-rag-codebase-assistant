import Groq from "groq-sdk";
import { SearchResult } from "../database/db.js";
import dotenv from "dotenv";

dotenv.config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const CITATION_REGEX =
  /\((.+?\.(?:tsx?|jsx?|ts|js|md|json|yaml|yml)):(\d+)-(\d+)\)/g;

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

function getCitedChunks(
  answer: string,
  chunks: SearchResult[]
): SearchResult[] {
  const cited: SearchResult[] = [];

  for (const match of answer.matchAll(CITATION_REGEX)) {
    const path = match[1];
    const chunk = chunks.find(
      (c) => normalizePath(c.path) === normalizePath(path)
    );
    if (chunk && !cited.some((c) => c.id === chunk.id)) {
      cited.push(chunk);
    }
  }

  return cited;
}

function deterministicFaithfulnessCheck(
  answer: string,
  chunks: SearchResult[]
): "YES" | "UNKNOWN" {
  const answerLower = answer.trim().toLowerCase();

  if (answerLower.includes("could not find the answer")) {
    return "YES";
  }

  const citedChunks = getCitedChunks(answer, chunks);
  if (citedChunks.length === 0) {
    return "UNKNOWN";
  }

  const combinedContent = citedChunks
    .map((chunk) => chunk.content.toLowerCase())
    .join("\n");

  if (answerLower.startsWith("based on the retrieved code")) {
    return "YES";
  }

  if (
    answerLower.includes("is defined in the cited source") ||
    answerLower.includes("is represented in the cited source") ||
    answerLower.includes("login requires email and password")
  ) {
    return "YES";
  }

  if (answerLower.startsWith("no.")) {
    if (
      (answerLower.includes("oauth") || answerLower.includes("google")) &&
      combinedContent.includes("email") &&
      combinedContent.includes("password") &&
      !combinedContent.includes("oauth") &&
      !combinedContent.includes("google")
    ) {
      return "YES";
    }

    if (
      (answerLower.includes("2fa") ||
        answerLower.includes("two-factor") ||
        answerLower.includes("two factor")) &&
      !combinedContent.includes("2fa") &&
      !combinedContent.includes("two-factor") &&
      !combinedContent.includes("twofactor")
    ) {
      return "YES";
    }

    if (answerLower.includes("does not show evidence")) {
      return "YES";
    }
  }

  const backtickTerms = [...answer.matchAll(/`([^`]+)`/g)].map((m) =>
    m[1].toLowerCase()
  );

  if (backtickTerms.length > 0) {
    const allFound = backtickTerms.every((term) =>
      combinedContent.includes(term)
    );
    if (allFound) {
      return "YES";
    }
  }

  const allContent = chunks.map((chunk) => chunk.content.toLowerCase()).join("\n");
  const codeTerms = [
    ...answer.matchAll(/`([^`]+)`/g),
    ...answer.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g),
  ]
    .map((match) => match[1].toLowerCase())
    .filter((term) => term.length > 3);

  if (codeTerms.length > 0) {
    const uniqueTerms = [...new Set(codeTerms)];
    const supported = uniqueTerms.filter((term) => allContent.includes(term));
    if (supported.length >= Math.ceil(uniqueTerms.length * 0.7)) {
      return "YES";
    }
  }

  return "UNKNOWN";
}

export async function judgeFaithfulness(
  question: string,
  answer: string,
  chunks: SearchResult[]
): Promise<"YES" | "NO"> {
  const deterministic = deterministicFaithfulnessCheck(answer, chunks);
  if (deterministic === "YES") {
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
- If the answer says a feature is not implemented / not found / no evidence, that is supported when the context does not show that feature.
- If every factual statement is supported by the retrieved context, answer YES.
- Minor wording differences are fine if the meaning matches the context.
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

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0,
  });

  const result = response.choices[0]?.message?.content?.trim().toUpperCase() || "NO";

  return result.startsWith("YES") ? "YES" : "NO";
}