import OpenAI from "openai";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

export type ChatCompletionResult = {
  message: string;
  toolCalls?: ToolCall[];
};

/**
 * Create an OpenRouter client using OpenAI SDK
 * OpenRouter provides access to multiple free models with function calling
 */
export function createOpenRouterClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is required");
  }

  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    defaultHeaders: {
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "Itinerary Planner",
    },
  });
}

/**
 * Call OpenRouter with tool/function calling support
 * Uses free models with function calling support
 */
export async function chatWithTools(
  messages: ChatMessage[],
  tools: OpenAI.Chat.ChatCompletionTool[],
  model: string = "google/gemini-3-flash-preview"
): Promise<ChatCompletionResult> {
  const client = createOpenRouterClient();

  const response = await client.chat.completions.create({
    model,
    messages: messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    tools,
    tool_choice: "auto",
    temperature: 0.7,
    max_tokens: 1000,
  });

  const choice = response.choices[0];
  const message = choice.message;

  // Extract tool calls if any
  const toolCalls: ToolCall[] = [];
  if (message.tool_calls && message.tool_calls.length > 0) {
    for (const toolCall of message.tool_calls) {
      if (toolCall.type === "function") {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          toolCalls.push({
            name: toolCall.function.name,
            arguments: args,
          });
        } catch (error) {
          console.error("Failed to parse tool call arguments:", error);
        }
      }
    }
  }

  return {
    message: message.content || "",
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

/**
 * Simple chat without tools
 */
export async function chat(
  messages: ChatMessage[],
  model: string = "google/gemini-3-flash-preview"
): Promise<string> {
  const client = createOpenRouterClient();

  const response = await client.chat.completions.create({
    model,
    messages: messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    temperature: 0.7,
    max_tokens: 1000,
  });

  return response.choices[0].message.content || "";
}
