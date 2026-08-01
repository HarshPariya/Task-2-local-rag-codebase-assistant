import { ingest } from "./commands/ingest.js";
import { buildEmbeddings } from "./commands/embed.js";
import { ask } from "./commands/ask.js";
import { runEvaluation } from "./commands/eval.js";

async function main() {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case "ingest": {
      const projectPath = args[0];

      if (!projectPath) {
        console.error(
          "Usage: npm run dev -- ingest <project-path>"
        );
        process.exit(1);
      }

      await ingest(projectPath);
      break;
    }

    case "embed": {
      await buildEmbeddings();
      break;
    }

    case "ask": {
      const question = args.join(" ");

      if (!question) {
        console.error(
          'Usage: npm run dev -- ask "your question"'
        );
        process.exit(1);
      }

      await ask(question);
      break;
    }

    case "eval": {
      await runEvaluation();
      break;
    }

    default: {
      console.log("Task 2 - Local RAG");
      console.log("");
      console.log("Commands:");
      console.log("  ingest <project-path>");
      console.log("  embed");
      console.log('  ask "question"');
      console.log("  eval");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});