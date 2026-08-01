import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";

const SUPPORTED_EXTENSIONS = [".ts", ".tsx", ".md"];

export async function getProjectFiles(projectRoot: string): Promise<string[]> {
  const files = await fg("**/*", {
    cwd: projectRoot,
    absolute: true,
    onlyFiles: true,
    ignore: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/.git/**",
      "**/coverage/**",
      "**/build/**"
    ]
  });

  return files.filter(file =>
    SUPPORTED_EXTENSIONS.includes(path.extname(file))
  );
}

export function readTextFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

export function relativeFilePath(
  projectRoot: string,
  absolutePath: string
): string {
  let rel = path.relative(projectRoot, absolutePath);
  
  // Strip 'website/' prefix if the user ingests the parent directory instead of the website directory
  if (rel.startsWith("website/") || rel.startsWith("website\\")) {
    rel = rel.substring(8);
  }
  
  return rel;
}