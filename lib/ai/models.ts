export const DEFAULT_CHAT_MODEL = "gemini-3.5-flash";

export const titleModel = {
  id: "gemini-3.5-flash",
  name: "Tvivl 1.5 Beta",
  provider: "google",
  description: "Fast Tvivl model for title generation",
};

export type ModelCapabilities = {
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
};

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
};

export const chatModels: ChatModel[] = [
  {
    id: "gemini-3.5-flash",
    name: "Tvivl 1.5 Beta",
    provider: "google",
    description: "Fast Tvivl model with tool use and multimodal input",
  },
];

export async function getCapabilities(): Promise<
  Record<string, ModelCapabilities>
> {
  return Object.fromEntries(
    chatModels.map((model) => [
      model.id,
      { tools: true, vision: true, reasoning: false },
    ])
  );
}

export const isDemo = process.env.IS_DEMO === "1";

export type GatewayModelWithCapabilities = ChatModel & {
  capabilities: ModelCapabilities;
};

export async function getAllGatewayModels(): Promise<
  GatewayModelWithCapabilities[]
> {
  const capabilities = await getCapabilities();

  return chatModels.map((model) => ({
    ...model,
    capabilities: capabilities[model.id] ?? {
      tools: true,
      vision: true,
      reasoning: false,
    },
  }));
}

export function getActiveModels(): ChatModel[] {
  return chatModels;
}

export const allowedModelIds = new Set(chatModels.map((m) => m.id));

export const modelsByProvider = chatModels.reduce(
  (acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  },
  {} as Record<string, ChatModel[]>
);
