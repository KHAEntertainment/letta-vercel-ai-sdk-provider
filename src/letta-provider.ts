import { ProviderV2, LanguageModelV2 } from "@ai-sdk/provider";
import { LettaClient } from "@letta-ai/letta-client";
import { LettaChatModel } from "./letta-chat";
import { tool } from "./letta-tools";

export interface LettaProvider extends ProviderV2 {
  /**
   * Creates a language model.
   */
  (): LanguageModelV2;

  /**
   * The underlying Letta client for direct API access.
   */
  client: LettaClient;

  /**
   * Creates a tool placeholder for Letta.
   * Since Letta handles tool execution on their backend, this creates a placeholder
   * that satisfies the Vercel AI SDK's type requirements.
   *
   * @param name - The name of the tool
   * @param options - Optional configuration options for the tool
   * @returns A tool placeholder compatible with Vercel AI SDK
   *
   * @example
   * ```typescript
   * // Basic tool
   * const webSearch = lettaLocal.tool("web_search");
   *
   * // Tool with description
   * const myTool = lettaLocal.tool("my_custom_tool", {
   *   description: "Does something useful"
   * });
   *
   * // Tool with description and schema
   * const analytics = lettaLocal.tool("analytics", {
   *   description: "Track analytics events",
   *   inputSchema: z.object({
   *     event: z.string(),
   *     properties: z.record(z.any()),
   *   }),
   * });
   * ```
   */
  tool: typeof tool;
}

/**
 * Create a Letta provider callable that produces a Letta language model.
 *
 * The returned provider is a function that, when invoked with no arguments, returns
 * a LanguageModelV2 instance backed by a LettaClient. The provider also exposes
 * a `client` property containing the underlying LettaClient and a `tool` property
 * for creating Letta tool placeholders.
 *
 * @param options - Options forwarded to LettaClient. `token` defaults to the
 *   `LETTA_API_KEY` environment variable when not provided. `baseUrl` defaults to
 *   `LETTA_BASE_URL` or `"https://api.letta.com"` when not provided.
 * @returns A LettaProvider callable which produces a LettaChatModel and exposes
 *   `.client` (the LettaClient) and `.tool` (the tool placeholder helper).
 * @throws Error - The returned provider will throw if it is called with the `new`
 *   keyword.
 * @throws Error - The returned provider will throw if it is invoked with any arguments,
 *   since model configuration is managed through Letta agents rather than parameters.
 */
export function createLetta(options: LettaClient.Options = {}): LettaProvider {
  const client = new LettaClient({
    ...options,
    token: options.token || process.env.LETTA_API_KEY,
    baseUrl:
      options.baseUrl || process.env.LETTA_BASE_URL || "https://api.letta.com",
  });

  const createLettaChatModel = (): LettaChatModel => {
    return new LettaChatModel(client);
  };

  const provider = function (): LanguageModelV2 {
    if (new.target) {
      throw new Error(
        "The Letta model function cannot be called with the new keyword.",
      );
    }

    if (arguments.length > 0) {
      throw new Error(
        "The Letta provider does not accept model parameters. Model configurations is managed through your Letta agents.",
      );
    }

    // Return a language model that will extract agentId from providerOptions at runtime
    return createLettaChatModel();
  } as LettaProvider;

  provider.client = client;
  provider.tool = tool;

  return provider;
}

/**
 * Default Letta provider instance for cloud.
 */
export const lettaCloud = createLetta();

/**
 * Letta provider instance for local development.
 */
export const lettaLocal = createLetta({
  baseUrl: "http://localhost:8283",
});