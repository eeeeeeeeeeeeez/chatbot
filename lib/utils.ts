import type {
  UIMessage,
  UIMessagePart,
} from 'ai';
import { type ClassValue, clsx } from 'clsx';
import { formatISO } from 'date-fns';
import { twMerge } from 'tailwind-merge';
import type { DBMessage, Document } from '@/lib/db/schema';
import { ChatbotError, type ErrorCode } from './errors';
import type { ChatMessage, ChatTools, CustomUIDataTypes } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fetcher = async (url: string) => {
  const response = await fetch(url);

  if (!response.ok) {
    const { code, cause } = await response.json();
    throw new ChatbotError(code as ErrorCode, cause);
  }

  return response.json();
};

export async function fetchWithErrorHandlers(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  try {
    const response = await fetch(input, init);

    if (!response.ok) {
      const { code, cause } = await response.json();
      throw new ChatbotError(code as ErrorCode, cause);
    }

    return response;
  } catch (error: unknown) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new ChatbotError('offline:chat');
    }

    throw error;
  }
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getDocumentTimestampByIndex(
  documents: Document[],
  index: number,
) {
  if (!documents) { return new Date(); }
  if (index > documents.length) { return new Date(); }

  return documents[index].createdAt;
}

export function sanitizeText(text: string) {
  return text.replace('<has_function_call>', '');
}

const ATTACHMENT_CONTEXT_RE =
  /<!--attachment-context-->\n([\s\S]*?)\n<!--\/attachment-context-->\n?\n?/;
const ATTACHMENT_ENTRY_RE = /^檔案：(.+)\n類型：.+\n已抽取內容：\n([\s\S]*)$/;

export type ParsedAttachmentMessage = {
  visibleText: string;
  attachmentSummaries: { name: string; charCount: number }[];
};

/**
 * The composer inlines full extracted document text into the user's
 * message (wrapped in <!--attachment-context--> sentinels) so the model
 * can read it, but showing that raw dump as the visible chat bubble is
 * a poor experience. This pulls it back out for display: a short list of
 * attached files plus the part of the message the user actually typed.
 */
export function parseAttachmentContextMessage(
  text: string
): ParsedAttachmentMessage | null {
  const match = text.match(ATTACHMENT_CONTEXT_RE);

  if (!match) {
    return null;
  }

  const attachmentSummaries = match[1]
    .split('\n\n---\n\n')
    .map((entry) => entry.match(ATTACHMENT_ENTRY_RE))
    .filter((entry): entry is RegExpMatchArray => entry !== null)
    .map((entry) => ({ name: entry[1], charCount: entry[2].length }));

  const visibleText = text
    .slice(match.index! + match[0].length)
    .replace(/^使用者要求：\n/, '')
    .trim();

  return { visibleText, attachmentSummaries };
}

export function convertToUIMessages(messages: DBMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role as 'user' | 'assistant' | 'system',
    parts: message.parts as UIMessagePart<CustomUIDataTypes, ChatTools>[],
    metadata: {
      createdAt: formatISO(message.createdAt),
    },
  }));
}

export function getTextFromMessage(message: ChatMessage | UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part as { type: 'text'; text: string}).text)
    .join('');
}
