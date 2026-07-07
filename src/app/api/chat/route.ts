import { NextRequest } from "next/server";
import { LLMClient, Config, HeaderUtils } from "coze-coding-dev-sdk";
import { KnowledgeClient } from "coze-coding-dev-sdk";

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

## 知识库使用规范
当下方提供了【知识库参考内容】时：
1. **优先使用知识库内容**回答，这是团队内部沉淀的专业知识
2. 在回答中**明确标注来源**，例如："根据知识库中的..."、"在XX知识库中提到..."
3. 如果知识库内容不足以完整回答，可以补充通用知识，但要**区分标注**：
   - 📘 知识库内容：来自团队内部知识库
   - 💡 补充说明：来自通用知识的补充
4. 如果完全没有相关知识库内容，诚实告知并建议查阅知识库

## 兜底话术
当遇到无法回答的问题时：
"这个问题我需要核实一下准确信息，稍后给你回复。你可以先查阅相关知识库，或者联系对接人确认。"`;

export async function POST(request: NextRequest) {
  const { messages, knowledgeBases } = await request.json();
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

  const config = new Config();
  const llmClient = new LLMClient(config, customHeaders);
  const knowledgeClient = new KnowledgeClient(config, customHeaders);

  const userMessage = messages[messages.length - 1]?.content || "";

  let knowledgeContext = "";
  const sourcesUsed: string[] = [];

  if (knowledgeBases && knowledgeBases.length > 0) {
    try {
      const searchResults = await knowledgeClient.search(
        userMessage,
        knowledgeBases,
        8,  // 增加检索数量
        0.2  // 降低阈值，获取更多相关内容
      );

      if (searchResults.code === 0 && searchResults.chunks.length > 0) {
        const knowledgeMap: Record<string, Array<{ content: string; score: number }>> = {};
        
        searchResults.chunks.forEach((chunk: { content: string; table_name?: string; score?: number }) => {
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

        knowledgeContext = "\n\n---\n\n## 📘 知识库参考内容\n\n" + Object.entries(knowledgeMap)
          .map(([dbName, items]) => {
            const contents = items
              .sort((a, b) => b.score - a.score)
              .map(item => item.content)
              .join("\n\n---\n\n");
            return `### 📚 ${dbName}\n\n${contents}`;
          })
          .join("\n\n");
      }
    } catch (error) {
      console.error("Knowledge search failed:", error);
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
        // 先发送知识库来源信息
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
