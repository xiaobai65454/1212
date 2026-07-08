/**
 * 通用 LLM 客户端 - 支持外部部署
 * 使用 OpenAI 兼容的 API 格式
 */

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// 获取配置（运行时读取环境变量）
function getConfig(): LLMConfig {
  return {
    apiKey: process.env.LLM_API_KEY || process.env.DOUBAO_API_KEY || "",
    baseUrl: process.env.LLM_BASE_URL || process.env.DOUBAO_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
    model: process.env.LLM_MODEL || process.env.DOUBAO_MODEL || "doubao-seed-2-0-lite-260215",
  };
}

/**
 * 流式调用 LLM
 */
export async function* streamChat(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number; signal?: AbortSignal } = {}
): AsyncGenerator<string> {
  const config = getConfig();

  if (!config.apiKey) {
    throw new Error("LLM_API_KEY 或 DOUBAO_API_KEY 环境变量未设置");
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1000,  // 减少 max_tokens 以提高响应速度
    }),
    signal: options.signal,  // 支持取消请求
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM API 错误: ${response.status} - ${error}`);
  }

  if (!response.body) {
    throw new Error("LLM API 返回空响应");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") return;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 非流式调用 LLM
 */
export async function chat(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const config = DEFAULT_CONFIG;

  if (!config.apiKey) {
    throw new Error("LLM_API_KEY 环境变量未设置");
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: false,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM API 错误: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}
