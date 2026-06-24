const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_MODEL = "@cf/baai/bge-m3";

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set");
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${CF_API_TOKEN}` },
      body: JSON.stringify({ text: [text.slice(0, 8192)] }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cloudflare AI error ${res.status}: ${body}`);
  }
  const json = (await res.json()) as { result: { data: number[][] } };
  return json.result.data[0]!;
}
