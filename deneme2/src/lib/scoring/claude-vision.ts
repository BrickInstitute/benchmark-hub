import Anthropic from "@anthropic-ai/sdk";

interface ClaudeVisionResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export async function scoreWithClaude(
  imageBase64: string,
  mimeType: string,
  prompt: string,
  model?: string,
  htmlContent?: string
): Promise<ClaudeVisionResponse> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // Build message content: image + optional HTML + prompt
  const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [
    {
      type: "image",
      source: {
        type: "base64",
        media_type: mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        data: imageBase64,
      },
    },
  ];

  // If HTML is available, add it as context before the prompt
  if (htmlContent) {
    // Truncate HTML to ~30k chars to stay within token limits
    const truncatedHtml = htmlContent.length > 30000
      ? htmlContent.slice(0, 30000) + "\n<!-- ... truncated ... -->"
      : htmlContent;

    content.push({
      type: "text",
      text: `Here is the HTML source code of the page shown in the screenshot above:\n\n\`\`\`html\n${truncatedHtml}\n\`\`\``,
    });
  }

  content.push({
    type: "text",
    text: prompt,
  });

  const response = await client.messages.create({
    model: model || process.env.AI_MODEL || "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const responseContent = textBlock && "text" in textBlock ? textBlock.text : "";

  return {
    content: responseContent,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
