import { Project, Node, SyntaxKind } from "ts-morph";
import path from "node:path";

import type { Chunk } from "../types/chunk.js";
import { hashContent } from "../utils/hash.js";

const project = new Project({
  skipAddingFilesFromTsConfig: true,
});

export function chunkTypescriptFile(
  filePath: string,
  relative: string
): Chunk[] {
  const sourceFile = project.addSourceFileAtPath(filePath);

  const chunks: Chunk[] = [];

  function addChunk(
    node: Node,
    kind: Chunk["kind"],
    symbolName?: string
  ) {
    const content = node.getText().trim();

    if (!content) return;

    const startLine = node.getStartLineNumber();
    const endLine = node.getEndLineNumber();
    const numLines = endLine - startLine + 1;

    if (numLines > 300) {
      // Split with overlap for large nodes (e.g. 600-line functions)
      const lines = content.split(/\r?\n/);
      const chunkSize = 300;
      const overlap = 50;
      
      for (let i = 0; i < lines.length; i += (chunkSize - overlap)) {
        const chunkLines = lines.slice(i, i + chunkSize);
        if (chunkLines.length === 0) break;
        
        const chunkContent = chunkLines.join("\n");
        const chunkStartLine = startLine + i;
        const chunkEndLine = chunkStartLine + chunkLines.length - 1;
        
        chunks.push({
          id: `${relative}:${chunkStartLine}-${chunkEndLine}`,
          content: chunkContent,
          path: relative,
          startLine: chunkStartLine,
          endLine: chunkEndLine,
          symbolName,
          kind,
          contentHash: hashContent(chunkContent),
        });
      }
    } else {
      chunks.push({
        id: `${relative}:${startLine}-${endLine}`,
        content,
        path: relative,
        startLine,
        endLine,
        symbolName,
        kind,
        contentHash: hashContent(content),
      });
    }
  }

  // Regular functions
  sourceFile.getFunctions().forEach((fn) => {
    addChunk(fn, "function", fn.getName());
  });

  // Classes + methods
  sourceFile.getClasses().forEach((cls) => {
    addChunk(cls, "class", cls.getName());

    cls.getMethods().forEach((method) => {
      addChunk(method, "function", method.getName());
    });
  });

  // Interfaces
  sourceFile.getInterfaces().forEach((i) => {
    addChunk(i, "type", i.getName());
  });

  // Type aliases
  sourceFile.getTypeAliases().forEach((t) => {
    addChunk(t, "type", t.getName());
  });

  // Exported variables (including arrow functions)
  sourceFile.getVariableStatements().forEach((statement) => {
    if (!statement.isExported()) return;

    statement.getDeclarations().forEach((decl) => {
      const initializer = decl.getInitializer();

      if (
        initializer &&
        (initializer.getKind() === SyntaxKind.ArrowFunction ||
          initializer.getKind() === SyntaxKind.FunctionExpression)
      ) {
        addChunk(statement, "function", decl.getName());
      } else {
        addChunk(statement, "other", decl.getName());
      }
    });
  });

  // Default exported function
  const defaultExport = sourceFile.getDefaultExportSymbol();

  if (defaultExport) {
    defaultExport.getDeclarations().forEach((decl) => {
      if (Node.isFunctionDeclaration(decl)) {
        addChunk(decl, "function", decl.getName() ?? "default");
      }
    });
  }

  sourceFile.forget();

  // Sort chunks by start line to prepare for merging
  chunks.sort((a, b) => a.startLine - b.startLine);

  // Group adjacent small chunks together up to a floor of roughly 100 tokens (~400 chars)
  const mergedChunks: Chunk[] = [];
  let currentGroup: Chunk | null = null;
  const MIN_CHUNK_SIZE = 400;

  for (const chunk of chunks) {
    if (!currentGroup) {
      currentGroup = { ...chunk };
      continue;
    }

    // If the current group is still smaller than the floor, we can merge
    if (currentGroup.content.length < MIN_CHUNK_SIZE) {
      currentGroup.content += "\n\n" + chunk.content;
      currentGroup.endLine = Math.max(currentGroup.endLine, chunk.endLine);
      currentGroup.id = `${relative}:${currentGroup.startLine}-${currentGroup.endLine}`;
      
      if (chunk.symbolName) {
         if (currentGroup.symbolName) {
           currentGroup.symbolName += `, ${chunk.symbolName}`;
         } else {
           currentGroup.symbolName = chunk.symbolName;
         }
      }
      
      currentGroup.contentHash = hashContent(currentGroup.content);
    } else {
      // Current group is big enough, commit it and start a new one
      mergedChunks.push(currentGroup);
      currentGroup = { ...chunk };
    }
  }

  if (currentGroup) {
    mergedChunks.push(currentGroup);
  }

  return mergedChunks;
}