import { vectorSearch } from "../retriever/vector.js";
import { ftsSearch } from "../retriever/fts.js";
import { reciprocalRankFusion } from "../retriever/rrf.js";
import { generateAnswer } from "../generation/generate.js";
import { validateCitations } from "../evaluation/citationValidator.js";
import { judgeFaithfulness } from "../evaluation/faithfulness.js";

export async function ask(question: string) {
  // Retrieve candidate pool: 30 vector, 20 FTS
  const vector = await vectorSearch(question, 30);
  const keyword = await ftsSearch(question, 20);

  // Hybrid Retrieval with RRF + Metadata Boosting
  const retrieved = reciprocalRankFusion(vector, keyword, question).slice(0, 7);

  console.log("\nRetrieving context...");
  console.log(
    `Vector: ${vector.length} | FTS: ${keyword.length} | Final: ${retrieved.length}`
  );

  // Generate answer
  const answer = await generateAnswer(question, retrieved);

  // Citation Validation
  const citationResult = validateCitations(answer, retrieved);

  // Faithfulness Check
  const faithfulness = await judgeFaithfulness(
    question,
    answer,
    retrieved
  );

  console.log("\n========== ANSWER ==========\n");
  console.log(answer);

  console.log("\n========== CITATION CHECK ==========\n");

  if (citationResult.valid) {
    console.log("✅ PASS");
  } else {
    console.log("❌ FAIL");

    if (citationResult.invalid.length > 0) {
      console.log("\nInvalid citations:");

      for (const citation of citationResult.invalid) {
        console.log(`- ${citation}`);
      }
    }
  }

  console.log("\n========== FAITHFULNESS ==========\n");

  if (faithfulness === "YES") {
    console.log("✅ PASS");
  } else {
    console.log("❌ FAIL");
  }

  console.log("\n========== SOURCES ==========\n");

  for (const chunk of retrieved) {
    console.log(
      `${chunk.path}:${chunk.startLine}-${chunk.endLine}`
    );
  }
}