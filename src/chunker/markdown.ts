import { Chunk } from "../types/chunk.js";
import { hashContent } from "../utils/hash.js";

export function chunkMarkdown(
  text: string,
  relativePath: string
): Chunk[] {
  const lines = text.split("\n");

  const chunks: Chunk[] = [];

  let currentHeading: string[] = [];
  let currentContent: string[] = [];
  let startLine = 1;

  function pushChunk(endLine: number) {
    if (currentContent.length === 0) return;

    let content = currentContent.join("\n").trim();

    if (!content) return;

    const headingPath = currentHeading.join(" > ");
    if (headingPath) {
      content = `${headingPath}\n\n${content}`;
    }

    chunks.push({
      id: `${relativePath}:${startLine}-${endLine}`,
      content,
      path: relativePath,
      startLine,
      endLine,
      symbolName: currentHeading.join(" > "),
      kind: "markdown-section",
      contentHash: hashContent(content)
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const match = /^(#{1,6})\s+(.*)$/.exec(line);

    if (match) {
      pushChunk(i);

      const level = match[1].length;

      currentHeading = currentHeading.slice(0, level - 1);

      currentHeading[level - 1] = match[2].trim();

      currentContent = [line];

      startLine = i + 1;
    } else {
      currentContent.push(line);
    }
  }

  pushChunk(lines.length);

  return chunks;
}