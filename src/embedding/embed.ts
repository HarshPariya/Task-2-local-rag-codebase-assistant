import { pipeline, FeatureExtractionPipeline } from "@xenova/transformers";

let embedder: FeatureExtractionPipeline | null = null;

async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
      { quantized: true }
    );
  }
  return embedder!;
}

export async function embedDocument(
  text: string
): Promise<number[]> {
  const pipe = await getEmbedder();
  const output = await pipe(text, { pooling: "mean", normalize: true }) as { data: Float32Array };
  return Array.from(output.data) as number[];
}

export async function embedQuery(
  text: string
): Promise<number[]> {
  const pipe = await getEmbedder();
  const output = await pipe(text, { pooling: "mean", normalize: true }) as { data: Float32Array };
  return Array.from(output.data) as number[];
}