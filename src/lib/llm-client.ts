/**
 * 通用 LLM 客户端 - 支持外部部署
 * 使用 OpenAI 兼容的 API 格式
 * Node.js 18+ 的 fetch 已内置连接池（基于 undici），自动复用 TCP 连接
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
function getConfig(modelOverride?: string): LLMConfig {
  return {
    apiKey: process.env.LLM_API_KEY || process.env.DOUBAO_API_KEY || "",
    baseUrl: process.env.LLM_BASE_URL || process.env.DOUBAO_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
    model: modelOverride || process.env.LLM_MODEL || process.env.DOUBAO_MODEL || "doubao-1-5-lite-32k-250115",
  };
}

// 公共请求头（复用对象，减少内存分配）
function getHeaders(config: LLMConfig) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
    "Connection": "keep-alive",
  };
}

/**
 * 流式调用 LLM
 */
export async function* streamChat(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number; signal?: AbortSignal; model?: string } = {}
): AsyncGenerator<string> {
  const config = getConfig(options.model);

  if (!config.apiKey) {
    throw new Error("LLM_API_KEY 或 DOUBAO_API_KEY 环境变量未设置");
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: getHeaders(config),
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1000,
    }),
    signal: options.signal,
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
 * 生成文案（使用更强的模型提升文案质量）
 */
export async function* streamCopywritingChat(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number; signal?: AbortSignal } = {}
): AsyncGenerator<string> {
  // 使用专门的文案模型（更强的模型）
  const copywritingModel = process.env.DOUBAO_COPYWRITING_MODEL || process.env.DOUBAO_MODEL || "doubao-seed-2-0";
  const apiKey = process.env.DOUBAO_API_KEY;
  
  if (!apiKey) {
    throw new Error("DOUBAO_API_KEY environment variable is required");
  }

  const baseUrl = "https://ark.cn-beijing.volces.com/api/v3";
  const url = `${baseUrl}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
  };

  const body = {
    model: copywritingModel,
    messages,
    stream: true,
    temperature: options.temperature ?? 0.8,
    max_tokens: options.maxTokens ?? 2000,
  };

  console.log(`[LLM] 文案生成使用模型: ${copywritingModel}`);

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API error ${response.status}: ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

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
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // Skip invalid JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 检测是否为文案生成请求
 */
export function isCopywritingRequest(message: string): boolean {
  const msg = message.toLowerCase();
  
  // 强文案意图关键词（直接触发）
  const strongKeywords = [
    "文案", "写一篇", "帮我写", "生成文案", "写个文案", 
    "小红书文案", "抖音文案", "笔记文案", "推广文案", "营销文案",
    "爆款标题", "封面文案", "引流文案", "种草文案",
    "写个笔记", "内容创作",
  ];
  
  // 检查是否包含强文案关键词
  const hasStrongKeyword = strongKeywords.some(kw => msg.includes(kw));
  if (hasStrongKeyword) return true;
  
  // 弱意图关键词（需要配合其他条件）
  const weakKeywords = ["标题", "写一段", "帮我编", "创作"];
  const hasWeakKeyword = weakKeywords.some(kw => msg.includes(kw));
  
  // 检查是否是明确要求生成内容的句式
  const strongPatterns = [
    /帮我.*写.*(文案|笔记|标题|内容)/,
    /生成.*(文案|内容)/,
    /写.*(小红书|抖音).*(文案|笔记)/,
    /来.*一[篇段].*(文案|笔记)/,
  ];
  
  const hasStrongPattern = strongPatterns.some(p => p.test(msg));
  
  // 平台 + 明确的创作意图
  const platforms = ["小红书", "抖音"];
  const hasPlatform = platforms.some(p => msg.includes(p));
  const contentActions = ["写", "创作", "生成", "编"];
  const hasAction = contentActions.some(a => msg.includes(a));
  
  // 必须同时满足：平台 + 动作 + (弱关键词 或 其他内容指示词)
  const hasContentIntent = hasPlatform && hasAction && (hasWeakKeyword || msg.includes("内容") || msg.includes("一篇"));
  
  return hasStrongPattern || hasContentIntent;
}

/**
 * 非流式调用 LLM
 */
export async function chat(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const config = getConfig();

  if (!config.apiKey) {
    throw new Error("LLM_API_KEY 环境变量未设置");
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: getHeaders(config),
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

/**
 * 测试 LLM 连接
 */
export async function testConnection(): Promise<{ success: boolean; model?: string; error?: string }> {
  try {
    const config = getConfig();
    if (!config.apiKey) {
      return { success: false, error: "API Key 未设置" };
    }

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: getHeaders(config),
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `API 错误: ${response.status} - ${error}` };
    }

    return { success: true, model: config.model };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
