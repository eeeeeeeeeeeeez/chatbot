export const DEFAULT_CHAT_MODEL = "gemini-3.1-flash-lite";

export const titleModel = {
  id: "gemini-3.1-flash-lite",
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

export const antigravityAgentId = "antigravity-preview-05-2026";

/**
 * The Antigravity agent runs through Google's Interactions API
 * (client.interactions.create), not the standard generateContent chat
 * completion API. It gets its own execution path in the chat route rather
 * than going through getLanguageModel()/streamText().
 */
export function isAntigravityAgent(modelId: string): boolean {
  return modelId === antigravityAgentId;
}

export const chatModels: ChatModel[] = [
  {
    id: "gemini-3.1-flash-lite",
    name: "Tvivl 1.5 Beta",
    provider: "google",
    description: "Fast Tvivl model with tool use and multimodal input",
  },
  {
    id: antigravityAgentId,
    name: "Antigravity Agent",
    provider: "google-antigravity",
    description:
      "Agentic assistant with its own sandbox: code execution, web search, and file access (preview)",
  },
];

export async function getCapabilities(): Promise<
  Record<string, ModelCapabilities>
> {
  return Object.fromEntries(
    chatModels.map((model) => [
      model.id,
      isAntigravityAgent(model.id)
        ? // No app-level function calling yet; the agent uses its own
          // sandboxed tools (code execution, search, filesystem) instead.
          { tools: false, vision: true, reasoning: true }
        : { tools: true, vision: true, reasoning: false },
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
