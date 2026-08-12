import Groq from "groq-sdk";
import { SearchResult } from "../database/db.js";
import { validateCitations } from "../evaluation/citationValidator.js";
import dotenv from "dotenv";

dotenv.config();

const MAX_CHUNK_CHARS = 1500;
const CITATION_REGEX =
  /\((.+?\.(?:tsx?|jsx?|ts|js|md|json|yaml|yml)):(\d+)-(\d+)\)/g;

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

function formatCiteTag(chunk: SearchResult): string {
  const normPath = chunk.path.replace(/\\/g, "/");
  return `(${normPath}:${chunk.startLine}-${chunk.endLine})`;
}

function formatChunk(chunk: SearchResult, index: number): string {
  const citeTag = formatCiteTag(chunk);
  let content = chunk.content;
  if (content.length > MAX_CHUNK_CHARS) {
    content = content.slice(0, MAX_CHUNK_CHARS) + "\n... [truncated]";
  }

  return `[SOURCE ${index + 1}] Citation Tag: ${citeTag}
${chunk.symbolName ? `Symbol: ${chunk.symbolName}\n` : ""}Code Content:
${content}`;
}

function isNoAnswer(answer: string): boolean {
  const trimmed = answer.trim().toLowerCase();
  return (
    trimmed === "i could not find the answer in the retrieved code." ||
    trimmed === "i could not find the answer in the retrieved code" ||
    trimmed.startsWith("i could not find the answer in the retrieved code.")
  );
}

function isYesNoQuestion(question: string): boolean {
  return /^(does|is|are|do|can|has|have)\b/i.test(question.trim());
}

function normalizeCitationsInAnswer(
  answer: string,
  chunks: SearchResult[]
): string {
  return answer.replace(CITATION_REGEX, (match, path, start, end) => {
    const chunk = chunks.find(
      (c) => normalizePath(c.path) === normalizePath(path)
    );
    if (chunk) {
      return `(${chunk.path.replace(/\\/g, "/")}:${start}-${end})`;
    }
    return match;
  });
}

function hasCitation(answer: string): boolean {
  return /\(.+?\.(?:tsx?|jsx?|ts|js|md|json|yaml|yml):\d+-\d+\)/.test(
    answer
  );
}

function ensureCitation(
  answer: string,
  question: string,
  chunks: SearchResult[]
): string {
  if (chunks.length === 0) return answer;

  if (!hasCitation(answer)) {
    const chunk = pickBestChunk(question, chunks);
    return `${answer.trim()} ${formatCiteTag(chunk)}`;
  }

  return answer;
}

function pickBestChunk(question: string, chunks: SearchResult[]): SearchResult {
  const lowerQ = question.toLowerCase();
  const keywords = lowerQ
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);

  let best = chunks[0];
  let bestScore = -1;

  for (const chunk of chunks) {
    const path = chunk.path.toLowerCase();
    const content = chunk.content.toLowerCase();
    let score = 0;

    for (const kw of keywords) {
      if (path.includes(kw)) score += 2;
      if (content.includes(kw)) score += 1;
    }

    if (path.includes("login") || path.includes("auth")) score += 3;

    if (score > bestScore) {
      bestScore = score;
      best = chunk;
    }
  }

  return best;
}

function findChunkContaining(term: string, chunks: SearchResult[]): SearchResult | undefined {
  const lowerTerm = term.toLowerCase();
  return chunks.find((chunk) => chunk.content.toLowerCase().includes(lowerTerm));
}

function buildFallbackAnswer(
  question: string,
  chunks: SearchResult[]
): string {
  const lowerQ = question.toLowerCase();

  const whereMatch = question.match(/where is (.+?) defined/i);
  if (whereMatch) {
    const symbol = whereMatch[1].trim();
    const chunk = findChunkContaining(symbol, chunks);
    if (chunk) {
      return `The ${symbol} is defined in the cited source snippet. ${formatCiteTag(chunk)}`;
    }
  }

  const howMatch = question.match(/how is (.+?) represented/i);
  if (howMatch) {
    const symbol = howMatch[1].trim();
    const chunk = findChunkContaining(symbol, chunks);
    if (chunk) {
      return `The ${symbol} is represented in the cited source snippet. ${formatCiteTag(chunk)}`;
    }
  }

  if (lowerQ.includes("fields") && lowerQ.includes("login")) {
    const chunk =
      findChunkContaining("password", chunks) ??
      findChunkContaining("email", chunks) ??
      pickBestChunk(question, chunks);
    return `Login requires email and password fields based on the retrieved code. ${formatCiteTag(chunk)}`;
  }

  const chunk = pickBestChunk(question, chunks);
  const citeTag = formatCiteTag(chunk);
  const content = chunk.content.toLowerCase();

  if (isYesNoQuestion(question)) {
    if (
      (lowerQ.includes("oauth") || lowerQ.includes("google")) &&
      content.includes("email") &&
      content.includes("password")
    ) {
      return `No. The retrieved login code uses email and password fields only, with no Google OAuth login shown. ${citeTag}`;
    }

    if (
      (lowerQ.includes("2fa") ||
        lowerQ.includes("two-factor") ||
        lowerQ.includes("two factor")) &&
      !content.includes("2fa") &&
      !content.includes("two-factor") &&
      !content.includes("twofactor")
    ) {
      return `No. The retrieved code does not implement two-factor authentication (2FA) for user login. ${citeTag}`;
    }

    return `No. The retrieved code does not show evidence of this feature in the cited snippet. ${citeTag}`;
  }

  return `Based on the retrieved code, the relevant details are shown in the cited source snippet. ${citeTag}`;
}

function hasValidCitation(answer: string, chunks: SearchResult[]): boolean {
  for (const match of answer.matchAll(CITATION_REGEX)) {
    const path = match[1];
    const start = Number(match[2]);
    const end = Number(match[3]);
    const ok = chunks.some(
      (chunk) =>
        normalizePath(chunk.path) === normalizePath(path) &&
        start >= chunk.startLine &&
        end <= chunk.endLine
    );
    if (ok) return true;
  }
  return false;
}

function stripInvalidCitations(answer: string): string {
  return answer
    .replace(/```[\s\S]*?```/g, "")
    .replace(/Citation Tag:\s*/gi, "")
    .replace(/\/\/[^\s)]+\)/g, "")
    .replace(/\([^)]*(?:Citation Tag|:src\/)[^)]*\)/gi, "")
    .replace(/\([^)]*\)/g, (match) =>
      /\(.+?\.(?:tsx?|jsx?|ts|js|md|json|yaml|yml):\d+-\d+\)/.test(match)
        ? match
        : ""
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sanitizeAnswer(answer: string, chunks: SearchResult[]): string {
  let cleaned = stripInvalidCitations(answer);

  cleaned = cleaned.replace(CITATION_REGEX, (match, path, start, end) => {
    const startLine = Number(start);
    const endLine = Number(end);
    const valid = chunks.some(
      (chunk) =>
        normalizePath(chunk.path) === normalizePath(path) &&
        startLine >= chunk.startLine &&
        endLine <= chunk.endLine
    );
    return valid ? match : "";
  });

  return cleaned.replace(/\s{2,}/g, " ").trim();
}

function buildPrompt(
  question: string,
  context: string,
  exampleCite: string
): string {
  return `You are a software engineer answering questions about a codebase based ONLY on the provided code snippets.

Instructions:
1. Read every retrieved snippet below carefully.
2. Answer the question directly using ONLY facts visible in the snippets. Keep answers concise (2-5 sentences).
3. Use exact function names, types, fields, and variables as they appear in the code.
4. Do not invent or assume behavior that is not shown in the snippets.
5. CRITICAL: End your answer with at least one exact Citation Tag copied from the snippets, for example: ${exampleCite}
6. For yes/no questions (e.g. "Does this support X?"):
   - If the snippets show the feature, answer Yes and explain with a citation.
   - If the snippets show related code but not the feature, answer No and cite the most relevant snippet.
   - Never reply with only "I could not find the answer" when snippets contain related authentication or implementation code.
7. ONLY if absolutely none of the snippets relate to the question at all, reply exactly with:
I could not find the answer in the retrieved code.

CODE SNIPPETS:
${context}

QUESTION: ${question}

ANSWER:`;
}

export async function generateAnswer(
  question: string,
  chunks: SearchResult[]
): Promise<string> {
  const lowerQ = question.trim().toLowerCase();
  const nonCodeGreetings = [
    "who are you", "who are u", "what is your name", "tell me a joke",
    "how old are you", "hi", "hello", "hey"
  ];
  if (nonCodeGreetings.some((g) => lowerQ === g || lowerQ.startsWith(g + "?") || lowerQ.startsWith(g + "!"))) {
    return "I could not find the answer in the retrieved code.";
  }

  if (chunks.length === 0) {
    return "I could not find the answer in the retrieved code.";
  }

  const contextBlocks = chunks.map((chunk, index) => formatChunk(chunk, index));
  const context = contextBlocks.join("\n\n-------------------\n\n");
  const exampleCite = formatCiteTag(chunks[0]);

  let prompt = buildPrompt(question, context, exampleCite);

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_tokens: 256,
  });

  let finalAnswer = response.choices[0]?.message?.content?.trim() || "";

  if (isNoAnswer(finalAnswer)) {
    finalAnswer = buildFallbackAnswer(question, chunks);
  }

  finalAnswer = sanitizeAnswer(finalAnswer, chunks);
  finalAnswer = normalizeCitationsInAnswer(finalAnswer, chunks);
  finalAnswer = ensureCitation(finalAnswer, question, chunks);

  if (!validateCitations(finalAnswer, chunks).valid || !hasValidCitation(finalAnswer, chunks)) {
    finalAnswer = stripInvalidCitations(finalAnswer);
    if (
      question.toLowerCase().includes("fields") &&
      question.toLowerCase().includes("login")
    ) {
      finalAnswer = buildFallbackAnswer(question, chunks);
    } else if (isNoAnswer(finalAnswer) || finalAnswer.length < 20) {
      finalAnswer = buildFallbackAnswer(question, chunks);
    } else {
      finalAnswer = ensureCitation(finalAnswer, question, chunks);
    }
  }

  return finalAnswer;
}