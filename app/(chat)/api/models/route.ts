import { chatModels, getCapabilities } from "@/lib/ai/models";

export async function GET() {
  const capabilities = await getCapabilities();

  return Response.json({ capabilities, models: chatModels });
}
