import { NextRequest } from "next/server";
import { LLMClient, Config, HeaderUtils } from "coze-coding-dev-sdk";
import { KnowledgeClient, DataSourceType } from "coze-coding-dev-sdk";

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

## 兜底话术
当遇到无法回答的问题时：
"这个问题我需要核实一下准确信息，稍后给你回复。你可以先查阅相关知识库，或者联系对接人确认。"

## 知识库参考
以下是从知识库中检索到的相关内容，请优先基于这些内容回答，如果知识库内容不足以回答，可以结合你的通用知识补充，但要标注哪些是知识库内容、哪些是补充信息。`;

export async function POST(request: NextRequest) {
  const { messages, knowledgeBases } = await request.json();
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

  const config = new Config();
  const llmClient = new LLMClient(config, customHeaders);
  const knowledgeClient = new KnowledgeClient(config, customHeaders);

  const userMessage = messages[messages.length - 1]?.content || "";

  let knowledgeContext = "";

  if (knowledgeBases && knowledgeBases.length > 0) {
    try {
      const searchResults = await knowledgeClient.search(
        userMessage,
        knowledgeBases,
        5,
        0.3
      );

      if (searchResults.code === 0 && searchResults.chunks.length > 0) {
        const knowledgeMap: Record<string, string[]> = {};
        searchResults.chunks.forEach((chunk: { content: string; table_name?: string }) => {
          const dbName = chunk.table_name || "通用知识";
          if (!knowledgeMap[dbName]) knowledgeMap[dbName] = [];
          knowledgeMap[dbName].push(chunk.content);
        });

        knowledgeContext = Object.entries(knowledgeMap)
          .map(([dbName, contents]) => {
            return `\n### ${dbName}\n${contents.join("\n---\n")}`;
          })
          .join("\n");
      }
    } catch {
      console.error("Knowledge search failed, proceeding without context");
    }
  }

  const fullSystemPrompt = knowledgeContext
    ? `${SYSTEM_PROMPT}\n${knowledgeContext}`
    : SYSTEM_PROMPT;

  const chatMessages = [
    { role: "system", content: fullSystemPrompt },
    ...messages,
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
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
      } catch (error) {
        const errorMsg = `data: ${JSON.stringify({ error: "抱歉，我遇到了一些问题，请稍后再试。" })}\n\n`;
        controller.enqueue(encoder.encode(errorMsg));
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
