import fs from "node:fs";
import path from "node:path";

import { vectorSearch } from "../retriever/vector.js";
import { ftsSearch } from "../retriever/fts.js";
import { reciprocalRankFusion } from "../retriever/rrf.js";

interface GoldenQuestion {
  id: string;
  question: string;
  expectedSources: string[];
  expectedFacts: string[];
  difficulty: string;
}

function normalize(p: string) {
  return p.replace(/\\/g, "/");
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);

  const index = Math.ceil((p / 100) * sorted.length) - 1;

  return sorted[Math.max(0, index)];
}

export async function runEvaluation() {
  const file = path.resolve("evals", "golden.jsonl");

  const questions: GoldenQuestion[] = fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));

  console.log("");
  console.log("Evaluation");
  console.log("==========");
  console.log("");

  let recall5 = 0;
  let recall10 = 0;
  let reciprocalRankSum = 0;

  const queryLatencies: number[] = [];

  for (const q of questions) {
    const start = performance.now();

    // Retrieve with a larger pool for better coverage before RRF
    const vector = await vectorSearch(q.question, 20);
    const fts = await ftsSearch(q.question, 20);

    const results = reciprocalRankFusion(vector, fts);

    const elapsed = performance.now() - start;

    queryLatencies.push(elapsed);

    const top5 = results.slice(0, 5);
    const top10 = results.slice(0, 10);

    let hit5 = false;
    let hit10 = false;

    if (q.expectedSources.length === 0) {
      hit5 = true;
      hit10 = true;
    } else {
      hit5 = top5.some((r) =>
        q.expectedSources.some(
          (s) => normalize(s) === normalize(r.path)
        )
      );

      hit10 = top10.some((r) =>
        q.expectedSources.some(
          (s) => normalize(s) === normalize(r.path)
        )
      );
    }

    if (hit5) recall5++;
    if (hit10) recall10++;

    let rank = 0;

    if (q.expectedSources.length === 0) {
      rank = 1;
    } else {
      for (let i = 0; i < results.length; i++) {
        const ok = q.expectedSources.some(
          (s) => normalize(s) === normalize(results[i].path)
        );

        if (ok) {
          rank = i + 1;
          break;
        }
      }
    }

    if (rank > 0) {
      reciprocalRankSum += 1 / rank;
    }

    console.log(
      `${q.id.padEnd(10)} ${hit5 ? "✓" : "✗"} (${elapsed.toFixed(0)} ms)`
    );
  }

  const recallAt5 = (recall5 / questions.length) * 100;
  const recallAt10 = (recall10 / questions.length) * 100;
  const mrr = reciprocalRankSum / questions.length;

  const p50 = percentile(queryLatencies, 50);
  const p95 = percentile(queryLatencies, 95);

  console.log("");
  console.log("=========================");
  console.log("");

  console.log(`Recall@5 : ${recallAt5.toFixed(1)}%`);
  console.log(`Recall@10: ${recallAt10.toFixed(1)}%`);
  console.log(`MRR       : ${mrr.toFixed(3)}`);

  console.log("");
  console.log("Latency");
  console.log("========");
  console.log("");

  console.log(`Query p50 : ${p50.toFixed(1)} ms`);
  console.log(`Query p95 : ${p95.toFixed(1)} ms`);
}