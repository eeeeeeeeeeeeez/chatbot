import type { UIMessageStreamWriter } from "ai";
import { generateUUID } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";
import { antigravityAgentId } from "./models";

const INTERACTIONS_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/interactions";
// Interactions API is in preview; the schema is pinned to a specific revision.
const API_REVISION = "2026-05-20";

type AntigravityStepDelta = { type: string; [key: string]: unknown };

type AntigravityStreamEvent =
  | {
      event_type: "interaction.created";
      interaction: { id: string; status: string };
    }
  | { event_type: "interaction.status_update"; status: string }
  | {
      event_type: "step.start";
      index: number;
      step: { type: string; [key: string]: unknown };
    }
  | { event_type: "step.delta"; index: number; delta: AntigravityStepDelta }
  | { event_type: "step.stop"; index: number }
  | {
      event_type: "interaction.completed";
      interaction: { status: string; [key: string]: unknown };
    }
  | { event_type: "error"; error: { message: string; code: string } };

// Human-readable labels for the agent's server-side tool steps, shown as
// transient status updates while the sandbox is working.
const STEP_LABELS: Record<string, string> = {
  thought: "思考中…",
  code_execution_call: "執行程式碼中…",
  code_execution_result: "程式碼執行完成",
  google_search_call: "搜尋網路中…",
  google_search_result: "搜尋完成",
  url_context_call: "讀取頁面中…",
  url_context_result: "頁面讀取完成",
};

// The Interactions API's managed Antigravity agent has no persistent system
// prompt of its own — every call is a fresh session, and without an explicit
// system_instruction it tends to drift language mid-reply (e.g. slipping into
// Simplified Chinese or English) whenever its tool output, search results, or
// code comments happen to be in another language. Pinning it here keeps
// replies consistently in Traditional Chinese regardless of what the agent
// reads or executes along the way.
const ANTIGRAVITY_SYSTEM_INSTRUCTION = "你是 Hengbo AI 的 Antigravity 代理，運作於一個具備程式碼執行、網頁搜尋與檔案操作能力的沙盒環境。\n\n語言規則（最高優先，必須嚴格遵守）：\n- 一律使用「繁體中文」回覆使用者，不論使用者訊息、搜尋結果、程式碼註解、工具輸出或環境訊息使用何種語言。\n- 絕對不要切換成簡體中文或英文，除非使用者在訊息中明確要求你使用其他語言回覆。\n- 專有名詞、程式碼、指令、檔案路徑、函式庫名稱等可保留原文，但說明文字一律使用繁體中文。\n- 即使思考或執行工具時參考了英文資料，最終呈現給使用者的回覆內容仍必須是繁體中文。\n\n回覆風格：保持精簡、直接、可立即執行；優先提供具體結果、步驟或程式碼，而非空泛建議。";

function getApiKey(): string {
  const apiKey =
    process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Gemini API key is missing or invalid. Please set GEMINI_API_KEY in your environment."
    );
  }
  return apiKey;
}

/**
 * Parses an SSE byte stream into Interactions API events. The Interactions
 * API uses named `event:` lines paired with JSON `data:` lines, separated by
 * blank lines, per https://ai.google.dev/gemini-api/docs/interactions/streaming
 */
async function* parseSseEvents(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<AntigravityStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        let data = "";
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data:")) {
            data += line.slice(5).trim();
          }
        }
        if (!data || data === "[DONE]") {
          continue;
        }
        try {
          yield JSON.parse(data) as AntigravityStreamEvent;
        } catch {
          // Ignore malformed/unrecognized events rather than failing the
          // whole stream (the API's versioning policy expects this).
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Runs the Antigravity managed agent for a single turn and streams its
 * output text into the given UI message stream writer.
 *
 * Note: unlike the standard chat models, this is a single-turn call using
 * only the latest user message as `input` — the Interactions API supports
 * multi-turn via `previous_interaction_id`, which isn't wired up yet.
 */
export async function runAntigravityAgent({
  dataStream,
  input,
}: {
  dataStream: UIMessageStreamWriter<ChatMessage>;
  input: string;
}): Promise<void> {
  const response = await fetch(INTERACTIONS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": getApiKey(),
      "Api-Revision": API_REVISION,
    },
    body: JSON.stringify({
      agent: antigravityAgentId,
      input,
      system_instruction: ANTIGRAVITY_SYSTEM_INSTRUCTION,
      environment: "remote",
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Antigravity agent request failed (${response.status}): ${errorText}`
    );
  }

  const textPartId = generateUUID();
  let textStarted = false;
  let sawAnyText = false;

  const ensureTextStarted = () => {
    if (!textStarted) {
      dataStream.write({ type: "text-start", id: textPartId });
      textStarted = true;
    }
  };

  for await (const event of parseSseEvents(response.body)) {
    switch (event.event_type) {
      case "step.start": {
        const label = STEP_LABELS[event.step.type];
        if (label) {
          dataStream.write({ type: "data-agent-status", data: label });
        }
        break;
      }
      case "step.delta": {
        if (event.delta.type === "text" && typeof event.delta.text === "string") {
          ensureTextStarted();
          sawAnyText = true;
          dataStream.write({
            type: "text-delta",
            id: textPartId,
            delta: event.delta.text,
          });
        }
        break;
      }
      case "error": {
        throw new Error(event.error.message);
      }
      case "interaction.completed": {
        if (event.interaction.status === "requires_action") {
          // The agent asked for a client-side function call; app-level
          // tools aren't bridged yet, so surface this clearly instead of
          // silently returning an empty response.
          ensureTextStarted();
          dataStream.write({
            type: "text-delta",
            id: textPartId,
            delta: "\n\n（此代理請求了一個尚未串接到本應用程式的工具。）",
          });
        }
        break;
      }
      default:
        break;
    }
  }

  if (!sawAnyText) {
    ensureTextStarted();
    dataStream.write({
      type: "text-delta",
      id: textPartId,
      delta: "（此代理執行完畢，但未產生任何文字回覆。）",
    });
  }

  if (textStarted) {
    dataStream.write({ type: "text-end", id: textPartId });
  }
}
