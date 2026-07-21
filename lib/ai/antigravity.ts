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
  thought: "Thinking…",
  code_execution_call: "Running code…",
  code_execution_result: "Code finished",
  google_search_call: "Searching the web…",
  google_search_result: "Search finished",
  url_context_call: "Reading a page…",
  url_context_result: "Page read",
};

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
            delta:
              "\n\n(The agent requested a tool that isn't wired up in this app yet.)",
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
      delta: "(The agent finished without returning any text output.)",
    });
  }

  if (textStarted) {
    dataStream.write({ type: "text-end", id: textPartId });
  }
}
