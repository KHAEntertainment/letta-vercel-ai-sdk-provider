import { LanguageModelV2Prompt } from "@ai-sdk/provider";
import { MessageCreate } from "@letta-ai/letta-client/api";

/**
 * Normalize an array of content parts into an array of text-only parts.
 *
 * Filters and transforms the input `parts` so that items with `type: "text"` are returned
 * as `{ type: "text", text: string }`, items whose `type` string starts with `"tool-"` are omitted,
 * and any other part types cause an error.
 *
 * @param parts - An array of content part objects; each part must have a `type` property and text parts must include `text`.
 * @returns An array of normalized text parts of the shape `{ type: "text", text: string }`.
 */
function transformContentParts(parts: any[]): any[] {
  return parts.flatMap((part: any) => {
    switch (part.type) {
      case "text":
        return { type: "text" as const, text: part.text };
      default:
        // Skip tool invocations and unsupported parts in user inputs/system
        if (typeof part.type === "string" && part.type.startsWith("tool-")) {
          return [];
        }
        throw new Error(`Content type ${part.type} not supported`);
    }
  });
}

/**
 * Convert a LanguageModelV2Prompt into an array of Letta MessageCreate objects.
 *
 * @param prompt - The prompt (array of messages) to convert.
 * @returns An array of Letta-compatible MessageCreate objects representing each input message.
 * @throws Error if a message has role "assistant", "tool", an unsupported role, or contains unsupported content types.
 */
export function convertToLettaMessage(
  prompt: LanguageModelV2Prompt,
): MessageCreate[] {
  return prompt.map((message) => {
    if (message.role === "user") {
      const content = transformContentParts(message.content as any[]);
      return {
        role: "user" as const,
        content,
      };
    }

    if (message.role === "assistant") {
      throw new Error("Assistant role is not supported for user input");
    }

    if (message.role === "tool") {
      throw new Error("Tool role is not supported");
    }

    if (message.role === "system") {
      // Support both string and parts array for system content
      if (typeof message.content === "string") {
        return {
          role: "system" as const,
          content: message.content,
        };
      }
      const sysContent: any = message.content as any;
      const content = Array.isArray(sysContent)
        ? transformContentParts(sysContent as any[])
        : sysContent;
      return {
        role: "system" as const,
        content,
      };
    }

    throw new Error(`Message role is not supported`);
  });
}