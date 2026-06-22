import {
  DEFAULT_HYDRA_SERVER_URL,
  HYDRA_SERVER_URL,
} from "../constants/HydraServer";

export async function getEmbedding(text: string): Promise<number[]> {
  const response = await fetch(
    `${DEFAULT_HYDRA_SERVER_URL}/api/ai/createEmbedding`,
    {
      method: "POST",
      body: JSON.stringify({ text }),
    },
  );
  return await response.json();
}

export async function askQuestion(
  question: string,
  docs: string[],
): Promise<{ markdown: string }> {
  const response = await fetch(`${HYDRA_SERVER_URL}/api/ai/askQuestion`, {
    method: "POST",
    body: JSON.stringify({ question, docs }),
  });
  return await response.json();
}
