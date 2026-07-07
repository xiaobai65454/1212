import { NextRequest } from "next/server";
import { LLMClient, Config, HeaderUtils, SearchClient, KnowledgeClient } from "coze-coding-dev-sdk";

const KNOWLEDGE_BASE_NAMES: Record<string, string> = {
  business_basics: "业务基础知识",
  agency_ops: "代运营知识",
  sales_conversion: "销售转化知识",
};

const SYSTEM_PROMPT = `你是"小白白"，一位专业的代理运营教练。

## 角色定位
你专为团队内部代理提供产品咨询、业务流程指导和社媒运营培训。

## 核心能力
1. **产品专家**：精准回答产品/服务相关问题，包括功能、价格、适用场景、竞品对比
2. **流程导师**：清晰讲解业务流程、操作步骤、注意事项，能拆解复杂流程为可执行步骤
3. **社媒教练**：系统教授小红书、抖音的运营方法论，包括内容创作、引流技巧、账号运营
4. **知识管理者**：持续学习新知识，主动整合资料，形成结构化知识体系

## 回答风格
- **逻辑优先**：先给结论/答案，再展开原因和依据
- **可执行性**：每个建议必须包含具体操作步骤，不说空话
- **场景化**：结合代理实际场景举例，不说理论说实战
- **分层表达**：复杂问题用「总-分-总」结构，关键信息用列表/表格呈现
- **语气亲切**：像一位经验丰富的前辈在指导后辈，温暖但不啰嗦

## 能力边界
可以回答：产品功能、价格、使用场景、业务流程、操作步骤、小红书/抖音运营方法论、团队协作规范
拒绝回答：涉及公司机密、未公开的战略规划、其他代理的个人业绩/收入信息、超出业务范围的闲聊

## 信息整合规范
当下方提供了【参考信息】时，你需要：
1. **整合所有来源**：将知识库内容和网络搜索结果进行融合，去重、互补、优化
2. **优先使用知识库内容**：团队内部沉淀的知识优先级最高
3. **网络搜索作为补充**：用于补充知识库中缺失的信息，特别是最新趋势、行业动态
4. **明确标注来源**：
   - 📘 来自知识库：团队内部沉淀的专业知识
   - 🌐 来自网络搜索：实时获取的行业信息
   - 💡 综合分析：基于多来源整合的优化建议
5. **输出优化后的回答**：不是简单拼接，而是理解、整合、优化后给出最优质的回答
6. 如果所有来源都无法回答，诚实告知并建议查阅知识库

## 兜底话术
当遇到无法回答的问题时：
"这个问题我需要核实一下准确信息，稍后给你回复。你可以先查阅相关知识库，或者联系对接人确认。"`;

// 并行执行知识库检索和网络搜索
async function gatherContext(
  userMessage: string,
  knowledgeBases: string[],
  knowledgeClient: KnowledgeClient,
  searchClient: SearchClient
): Promise<{ knowledgeContext: string; sourcesUsed: string[]; webContext: string }> {
  const sourcesUsed: string[] = [];

  // 并行执行知识库检索和网络搜索
  const [knowledgeResult, webResult] = await Promise.allSettled([
    // 知识库检索
    knowledgeBases.length > 0
      ? knowledgeClient.search(userMessage, knowledgeBases, 8, 0.2)
      : Promise.resolve({ code: -1, chunks: [] }),
    // 网络搜索
    searchClient.webSearch(userMessage, 5, true),
  ]);

  // 处理知识库结果
  let knowledgeContext = "";
  if (knowledgeResult.status === "fulfilled" && knowledgeResult.value.code === 0 && knowledgeResult.value.chunks.length > 0) {
    const knowledgeMap: Record<string, Array<{ content: string; score: number }>> = {};

    knowledgeResult.value.chunks.forEach((chunk: { content: string; table_name?: string; score?: number }) => {
      const dbName = chunk.table_name || "通用知识";
      const displayName = KNOWLEDGE_BASE_NAMES[dbName] || dbName;

      if (!knowledgeMap[displayName]) knowledgeMap[displayName] = [];
      knowledgeMap[displayName].push({
        content: chunk.content,
        score: chunk.score || 0,
      });

      if (!sourcesUsed.includes(displayName)) {
        sourcesUsed.push(displayName);
      }
    });

    knowledgeContext = Object.entries(knowledgeMap)
      .map(([dbName, items]) => {
        const contents = items
          .sort((a, b) => b.score - a.score)
          .map(item => item.content)
          .join("\n\n");
        return `### 📘 ${dbName}\n${contents}`;
      })
      .join("\n\n---\n\n");
  }

  // 处理网络搜索结果
  let webContext = "";
  if (webResult.status === "fulfilled" && webResult.value.web_items && webResult.value.web_items.length > 0) {
    const webItems = webResult.value.web_items.slice(0, 5);
    webContext = webItems
      .map(item => {
        const summary = item.summary || item.snippet || "";
        return `**${item.title}**\n${summary}`;
      })
      .join("\n\n---\n\n");

    if (!sourcesUsed.includes("网络搜索")) {
      sourcesUsed.push("网络搜索");
    }
  }

  return { knowledgeContext, sourcesUsed, webContext };
}

export async function POST(request: NextRequest) {
  const { messages, knowledgeBases } = await request.json();
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

  const config = new Config();
  const llmClient = new LLMClient(config, customHeaders);
  const knowledgeClient = new KnowledgeClient(config, customHeaders);
  const searchClient = new SearchClient(config, customHeaders);

  const userMessage = messages[messages.length - 1]?.content || "";

  // 并行获取知识库和网络搜索内容
  const { knowledgeContext, sourcesUsed, webContext } = await gatherContext(
    userMessage,
    knowledgeBases || [],
    knowledgeClient,
    searchClient
  );

  // 构建完整的参考信息
  let referenceSection = "";
  if (knowledgeContext) {
    referenceSection += `\n\n## 📘 知识库内容（团队内部知识，优先级最高）\n\n${knowledgeContext}`;
  }
  if (webContext) {
    referenceSection += `\n\n## 🌐 网络搜索内容（实时信息补充）\n\n${webContext}`;
  }

  const fullSystemPrompt = referenceSection
    ? `${SYSTEM_PROMPT}\n\n---\n\n# 参考信息\n${referenceSection}\n\n---\n\n请整合以上所有来源的信息，优化后给出最佳回答。`
    : SYSTEM_PROMPT;

  const chatMessages = [
    { role: "system", content: fullSystemPrompt },
    ...messages,
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 先发送来源信息
        if (sourcesUsed.length > 0) {
          const sourcesData = `data: ${JSON.stringify({ sources: sourcesUsed })}\n\n`;
          controller.enqueue(encoder.encode(sourcesData));
        }

        const llmStream = llmClient.stream(chatMessages, {
          model: "doubao-seed-2-0-lite-260215",
          temperature: 0.7,
        });

        for await (const chunk of llmStream) {
          if (chunk.content) {
            const data = `data: ${JSON.stringify({ content: chunk.content.toString() })}\n\n`;
            controller.enqueue(encoder.encode(data));
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch {
        const errorData = `data: ${JSON.stringify({ error: "抱歉，我遇到了一些问题，请稍后重试" })}\n\n`;
        controller.enqueue(encoder.encode(errorData));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
