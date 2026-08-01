import fs from "node:fs";
import path from "node:path";

import { vectorSearch } from "../src/retriever/vector.js";
import { ftsSearch } from "../src/retriever/fts.js";
import { reciprocalRankFusion } from "../src/retriever/rrf.js";
import { generateAnswer } from "../src/generation/generate.js";
import { validateCitations } from "../src/evaluation/citationValidator.js";
import { judgeFaithfulness } from "../src/evaluation/faithfulness.js";

interface GoldenQuestion {
  id: string;
  question: string;
  expectedSources: string[];
  expectedFacts: string[];
  difficulty: string;
}

async function main() {
  const file = path.resolve("evals", "golden.jsonl");
  const questions: GoldenQuestion[] = fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));

  let noAnswer = 0;
  let citationFail = 0;
  let faithFail = 0;

  for (const q of questions) {
    const vector = await vectorSearch(q.question, 30);
    const keyword = await ftsSearch(q.question, 20);
    const retrieved = reciprocalRankFusion(vector, keyword, q.question).slice(0, 7);

    const answer = await generateAnswer(q.question, retrieved);
    const citationResult = validateCitations(answer, retrieved);
    const faithfulness = await judgeFaithfulness(q.question, answer, retrieved);

    const isNoAnswer =
      answer.trim().toLowerCase() === "i could not find the answer in the retrieved code." ||
      answer.trim().toLowerCase().startsWith("i could not find the answer in the retrieved code.");
    const citeOk = citationResult.valid;
    const faithOk = faithfulness === "YES";

    if (isNoAnswer) noAnswer++;
    if (!citeOk) citationFail++;
    if (!faithOk) faithFail++;

    const status = [
      isNoAnswer ? "NO_ANS" : "OK",
      citeOk ? "CITE✓" : "CITE✗",
      faithOk ? "FAITH✓" : "FAITH✗",
    ].join(" | ");

    console.log(`${q.id.padEnd(12)} ${status}`);
    if (isNoAnswer || !citeOk || !faithOk) {
      console.log(`  Q: ${q.question}`);
      console.log(`  A: ${answer.slice(0, 120)}${answer.length > 120 ? "..." : ""}`);
      if (!citeOk) console.log(`  Invalid: ${citationResult.invalid.join(", ")}`);
    }
  }

  console.log("\n========== SUMMARY ==========");
  console.log(`Total: ${questions.length}`);
  console.log(`No answer: ${noAnswer}`);
  console.log(`Citation fail: ${citationFail}`);
  console.log(`Faithfulness fail: ${faithFail}`);
}

main().catch(console.error);
