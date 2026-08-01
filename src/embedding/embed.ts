import ollama from "ollama";

export async function embedDocument(
  text: string
): Promise<number[]> {
  const response = await ollama.embed({
    model: "nomic-embed-text",
    input: `search_document: ${text}`,
  });

  return response.embeddings[0];
}

export async function embedQuery(
  text: string
): Promise<number[]> {
  const response = await ollama.embed({
    model: "nomic-embed-text",
    input: `search_query: ${text}`,
  });

  return response.embeddings[0];
}