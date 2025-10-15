import { LettaMessageUnion } from "@letta-ai/letta-client/api";
import { UIMessage, TextUIPart, ToolUIPart, ReasoningUIPart, FileUIPart } from "ai";

type DynamicToolType = `tool-${string}`;

interface ConvertToAiSdkMessageOptions {
  allowMessageTypes?: LettaMessageUnion["messageType"][];
}

const baseOptions: ConvertToAiSdkMessageOptions = {
  allowMessageTypes: [
    "user_message",
    "assistant_message",
    "system_message",
    "tool_call_message",
    "tool_return_message",
    "reasoning_message",
  ],
};

/**
 * Convert message content (a plain string or a structured array) into an array of UI parts.
 *
 * When `content` is a string, produces a single text part. When `content` is an array, each element must have a `type` of `"text"`, `"image_url"`, or `"input_audio"`:
 * - `"text"` elements become `TextUIPart` with the element's `text`.
 * - `"image_url"` elements use `imageUrl.url` or `imageUrl` (if a string) to produce a `FileUIPart` with `mediaType: "image/*"`.
 * - `"input_audio"` elements use `inputAudio.url` to produce a `FileUIPart` with `mediaType: "audio/*"`.
 *
 * @param content - Message content as a string or an array of typed content objects.
 * @returns An array of `TextUIPart` and/or `FileUIPart` representing the message content.
 * @throws Error if an array element's `type` is not one of the supported types.
 */
function transformMessageContent(content: string | any[]): (TextUIPart | FileUIPart)[] {
  if (Array.isArray(content)) {
    const parts: (TextUIPart | FileUIPart)[] = [];
    for (const val of content) {
      const partType = (val as any).type as string;
      if (partType === "text") {
        parts.push({ type: "text", text: (val as any).text });
      } else if (partType === "image_url") {
        const url = (val as any).imageUrl?.url ?? (val as any).imageUrl;
        if (typeof url === "string") {
          parts.push({ type: "file", url, mediaType: "image/*" });
        }
      } else if (partType === "input_audio") {
        const audio = (val as any).inputAudio;
        const url = audio?.url ?? undefined;
        if (typeof url === "string") {
          parts.push({ type: "file", url, mediaType: "audio/*" });
        }
      } else {
        throw new Error(`Content type ${String(partType)} not supported`);
      }
    }
    return parts;
  }
  // string content
  return [{ type: "text", text: content as string }];
}

/**
 * Convert an array of Letta-formatted messages into an array of UIMessage objects for the AI SDK.
 *
 * Processes supported Letta message types (system, user, assistant, reasoning, tool_call, tool_return),
 * filters by allowed message types from `options`, and assembles per-message `parts` containing
 * TextUIPart, FileUIPart, ReasoningUIPart, and ToolUIPart entries with embedded LettA metadata where applicable.
 *
 * @param messages - Array of Letta messages to convert
 * @param options - Conversion options; `allowMessageTypes` restricts which message types are included
 * @returns An array of UIMessage objects with aggregated `parts` for each message id (one UIMessage per unique message id)
 */
export function convertToAiSdkMessage(
  messages: LettaMessageUnion[],
  options: ConvertToAiSdkMessageOptions = baseOptions,
): UIMessage[] {
  const sdkMessageObj: Record<string, UIMessage> = {};

  const allowMessageTypeSet = new Set(options.allowMessageTypes || []);

  messages.forEach((message) => {
    if (!allowMessageTypeSet.has(message.messageType)) {
      return;
    }

    if (!sdkMessageObj[message.id]) {
      sdkMessageObj[message.id] = {
        role: "assistant",
        id: message.id,
        parts: [],
      };
    }

    if (message.messageType === "system_message") {
      sdkMessageObj[message.id].role = "system";
      const textPart: TextUIPart = {
        type: "text",
        text: message.content,
      };

      if (!sdkMessageObj[message.id].parts) {
        sdkMessageObj[message.id].parts = [];
      }

      sdkMessageObj[message.id].parts.push(textPart);
    }

    if (message.messageType === "user_message") {
      sdkMessageObj[message.id].role = "user";
      const parts = transformMessageContent(message.content as any);
      if (!sdkMessageObj[message.id].parts) {
        sdkMessageObj[message.id].parts = [];
      }
      sdkMessageObj[message.id].parts.push(...parts);
    }

    if (message.messageType === "assistant_message") {
      sdkMessageObj[message.id].role = "assistant";
      const parts = transformMessageContent(message.content as any);
      if (!sdkMessageObj[message.id].parts) {
        sdkMessageObj[message.id].parts = [];
      }
      sdkMessageObj[message.id].parts.push(...parts);
    }

    if (message.messageType === "reasoning_message") {
      if (!sdkMessageObj[message.id].parts) {
        sdkMessageObj[message.id].parts = [];
      }

      sdkMessageObj[message.id].role = "assistant";

      const reasoningPart: ReasoningUIPart = {
        type: "reasoning",
        text: message.reasoning,
        providerMetadata: {
          letta: {
            id: message.id,
            date: message.date.toISOString(),
            name: message.name ?? null,
            messageType: message.messageType,
            otid: message.otid ?? null,
            senderId: message.senderId ?? null,
            stepId: message.stepId ?? null,
            isErr: message.isErr ?? null,
            seqId: message.seqId ?? null,
            runId: message.runId ?? null,
            reasoning: message.reasoning,
            source: message.source ?? null,
          },
        },
      };

      sdkMessageObj[message.id].parts.push(reasoningPart);
    }

    if (message.messageType === "tool_call_message") {
      if (!sdkMessageObj[message.id].parts) {
        sdkMessageObj[message.id].parts = [];
      }

      sdkMessageObj[message.id].role = "assistant";

      // Use AI SDK's ToolUIPart structure
      const toolName = message.toolCall?.name || "";
      const toolInvocation: ToolUIPart = {
        // v5: typed tool name in part type
        type: (`tool-${toolName}` as DynamicToolType) as any,
        toolCallId: message.toolCall?.toolCallId || "",
        state: "output-available" as const,
        input: message.toolCall?.arguments || {},
        output: "",
      } as any;

      sdkMessageObj[message.id].parts.push(toolInvocation);
    }

    // Handle tool return messages with full Letta metadata
    if (message.messageType === "tool_return_message") {
      if (!sdkMessageObj[message.id].parts) {
        sdkMessageObj[message.id].parts = [];
      }

      sdkMessageObj[message.id].role = "assistant";

      const toolName = message.name || "";
      const state = message.status === "error" ? ("output-error" as const) : ("output-available" as const);
      const toolInvocation: ToolUIPart = {
        type: (`tool-${toolName}` as DynamicToolType) as any,
        toolCallId: message.toolCallId || "",
        state,
        input: {},
        output: message.toolReturn,
        errorText: message.status === "error" ? (typeof message.toolReturn === "string" ? message.toolReturn : JSON.stringify(message.toolReturn)) : undefined,
        callProviderMetadata: {
          letta: {
            id: message.id,
            date: message.date.toISOString(),
            name: message.name ?? null,
            messageType: message.messageType,
            otid: message.otid ?? null,
            senderId: message.senderId ?? null,
            stepId: message.stepId ?? null,
            isErr: message.isErr ?? null,
            seqId: message.seqId ?? null,
            runId: message.runId ?? null,
            toolReturn: message.toolReturn,
            status: message.status,
            toolCallId: message.toolCallId,
            stdout: message.stdout ?? null,
            stderr: message.stderr ?? null,
          },
        },
      } as any;

      sdkMessageObj[message.id].parts.push(toolInvocation);
    }
  });

  return Object.values(sdkMessageObj);
}