import { NextRequest } from "next/server";
import { LLMClient, Config, HeaderUtils, SearchClient, KnowledgeClient } from "coze-coding-dev-sdk";

const KNOWLEDGE_BASE_NAMES: Record<string, string> = {
  business_basics: "业务基础知识",
  agency_ops: "代运营知识",
  sales_conversion: "销售转化知识",
};

const SYSTEM_PROMPT = `你是"小白白"，一位专业的校园业务代理运营教练。

## 业务背景
你所在的公司主营**校园通信业务**，核心产品是**校园卡（电话卡/手机SIM卡）**。你的所有回答都必须围绕这个业务展开。

## 角色定位
你专为团队内部代理提供产品咨询、业务流程指导和社媒运营培训。

## 核心能力
1. **产品专家**：精准回答校园卡（电话卡）相关问题，包括套餐、资费、办理流程、适用场景
2. **流程导师**：清晰讲解开卡、激活、充值、售后等业务流程，能拆解复杂流程为可执行步骤
3. **社媒教练**：系统教授小红书、抖音的校园推广运营方法论，包括内容创作、引流技巧、账号运营
4. **知识管理者**：持续学习新知识，主动整合资料，形成结构化知识体系

## 回答风格
- **逻辑优先**：先给结论/答案，再展开原因和依据
- **可执行性**：每个建议必须包含具体操作步骤，不说空话
- **场景化**：结合校园代理实际场景举例，不说理论说实战
- **分层表达**：复杂问题用「总-分-总」结构，关键信息用列表/表格呈现
- **语气亲切**：像一位经验丰富的前辈在指导后辈，温暖但不啰嗦

## 内容判断能力（重要）
你必须具备内容判断能力，在回答前进行以下判断：

### 可以回答的内容
- 校园卡（电话卡）的套餐、资费、功能、办理流程
- 校园推广的运营方法论（小红书/抖音内容创作、引流、账号定位）
- 销售话术、客户跟进、转化技巧
- 团队协作规范、考核标准
- 校园市场趋势、竞品分析（通信行业相关）

### 必须拒绝的内容
- 与校园通信业务无关的问题（如其他行业、其他产品）
- "校园卡"不是校园门禁卡/饭卡/学生证，仅指电话卡/SIM卡，不要混淆
- 涉及公司机密、未公开的战略规划
- 其他代理的个人业绩、收入信息
- 超出业务范围的闲聊或无关话题
- 网络搜索结果中与校园通信业务无关的内容，必须过滤掉，不要引用

### 网络搜索结果使用规范
- 网络搜索仅用于补充校园通信、校园市场、社媒运营相关的最新信息
- 如果搜索结果与校园业务无关，直接忽略，不要引用
- 不要生成与业务无关的"通用知识"内容

## 信息整合规范
当下方提供了【参考信息】时，你需要：
1. **整合所有来源**：将知识库内容和网络搜索结果进行融合，去重、互补、优化
2. **优先使用知识库内容**：团队内部沉淀的知识优先级最高
3. **网络搜索作为补充**：仅用于补充与校园业务相关的最新信息
4. **过滤无关内容**：如果参考信息中包含与校园通信业务无关的内容，直接忽略
5. **输出优化后的回答**：不是简单拼接，而是理解、整合、优化后给出最优质的回答
6. 如果所有来源都无法回答，诚实告知并建议查阅知识库

## 兜底话术
当遇到无法回答的问题时：
"这个问题我需要核实一下准确信息，稍后给你回复。你可以先查阅相关知识库，或者联系对接人确认。"`;

// 判断问题是否与校园通信业务相关
function isOnTopic(message: string): boolean {
  const onTopicKeywords = [
    // 校园卡/电话卡相关
    "校园卡", "电话卡", "手机卡", "SIM卡", "套餐", "资费", "流量", "通话",
    "开卡", "激活", "充值", "销户", "补卡", "换卡", "号码",
    // 校园推广相关
    "校园推广", "校园市场", "校园代理", "代理", "招生", "推广",
    "小红书", "抖音", "社媒", "运营", "引流", "涨粉", "内容创作", "文案",
    // 销售相关
    "销售", "话术", "客户", "成交", "转化", "跟进", "签单", "开单",
    // 业务相关
    "产品", "价格", "竞品", "对比", "优势", "卖点", "业务", "流程",
    "团队", "考核", "培训", "学习", "知识",
    // 通用但可能相关的
    "怎么", "如何", "什么", "哪", "吗", "呢",
  ];

  // 如果消息很短且不含任何业务关键词，可能是闲聊
  if (message.length < 5) {
    return onTopicKeywords.some(kw => message.includes(kw));
  }

  // 检查是否包含至少一个业务关键词
  return onTopicKeywords.some(kw => message.includes(kw));
}

// 过滤网络搜索结果，只保留与校园业务相关的内容
function filterWebResults(items: Array<{ title: string; summary?: string; snippet?: string }>): typeof items {
  const businessKeywords = [
    "校园", "电话卡", "手机卡", "SIM卡", "通信", "套餐", "流量",
    "推广", "代理", "小红书", "抖音", "运营", "引流", "销售",
    "话术", "客户", "市场", "营销", "内容", "文案",
  ];

  return items.filter(item => {
    const text = `${item.title} ${item.summary || ""} ${item.snippet || ""}`;
    return businessKeywords.some(kw => text.includes(kw));
  });
}

// 并行执行知识库检索和网络搜索
async function gatherContext(
  userMessage: string,
  knowledgeBases: string[],
  knowledgeClient: KnowledgeClient,
  searchClient: SearchClient
): Promise<{ knowledgeContext: string; sourcesUsed: string[]; webContext: string; isOnTopic: boolean }> {
  const sourcesUsed: string[] = [];

  // 前置判断：问题是否与业务相关
  const onTopic = isOnTopic(userMessage);

  // 如果问题与业务无关，跳过网络搜索，只检索知识库
  if (!onTopic) {
    // 仍然检索知识库，看看是否有相关内容
    let knowledgeContext = "";
    if (knowledgeBases.length > 0) {
      const knowledgeResult = await knowledgeClient.search(userMessage, knowledgeBases, 5, 0.3).catch(() => ({ code: -1, chunks: [] }));
      if (knowledgeResult.code === 0 && knowledgeResult.chunks.length > 0) {
        const knowledgeMap: Record<string, Array<{ content: string; score: number }>> = {};
        knowledgeResult.chunks.forEach((chunk: { content: string; table_name?: string; score?: number }) => {
          const dbName = chunk.table_name || "通用知识";
          const displayName = KNOWLEDGE_BASE_NAMES[dbName] || dbName;
          if (!knowledgeMap[displayName]) knowledgeMap[displayName] = [];
          knowledgeMap[displayName].push({ content: chunk.content, score: chunk.score || 0 });
          if (!sourcesUsed.includes(displayName)) sourcesUsed.push(displayName);
        });
        knowledgeContext = Object.entries(knowledgeMap)
          .map(([dbName, items]) => {
            const contents = items.sort((a, b) => b.score - a.score).map(item => item.content).join("\n\n");
            return `### 📘 ${dbName}\n${contents}`;
          })
          .join("\n\n---\n\n");
      }
    }
    return { knowledgeContext, sourcesUsed, webContext: "", isOnTopic: false };
  }

  // 问题与业务相关，执行完整的知识库检索和网络搜索
  const [knowledgeResult, webResult] = await Promise.allSettled([
    knowledgeBases.length > 0
      ? knowledgeClient.search(userMessage, knowledgeBases, 8, 0.2)
      : Promise.resolve({ code: -1, chunks: [] }),
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

  // 处理网络搜索结果（严格过滤）
  let webContext = "";
  if (webResult.status === "fulfilled" && webResult.value.web_items && webResult.value.web_items.length > 0) {
    // 过滤掉与业务无关的搜索结果
    const filteredItems = filterWebResults(webResult.value.web_items);
    if (filteredItems.length > 0) {
      webContext = filteredItems
        .slice(0, 5)
        .map(item => {
          const summary = item.summary || item.snippet || "";
          return `**${item.title}**\n${summary}`;
        })
        .join("\n\n---\n\n");

      if (!sourcesUsed.includes("网络搜索")) {
        sourcesUsed.push("网络搜索");
      }
    }
  }

  return { knowledgeContext, sourcesUsed, webContext, isOnTopic: true };
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
  const { knowledgeContext, sourcesUsed, webContext, isOnTopic } = await gatherContext(
    userMessage,
    knowledgeBases || [],
    knowledgeClient,
    searchClient
  );

  // 如果问题与业务无关且知识库也没有相关内容，直接拒绝
  if (!isOnTopic && !knowledgeContext) {
    const rejectMessage = "这个问题超出了我的服务范围哦～我是专门负责校园通信业务的教练，主要帮大家解答校园卡（电话卡）套餐、校园推广运营、销售转化等方面的问题。有其他业务相关的问题随时问我！";
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const data = `data: ${JSON.stringify({ content: rejectMessage })}\n\n`;
        controller.enqueue(encoder.encode(data));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
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

  // 构建完整的参考信息
  let referenceSection = "";
  if (knowledgeContext) {
    referenceSection += `\n\n## 📘 知识库内容（团队内部知识，优先级最高）\n\n${knowledgeContext}`;
  }
  if (webContext) {
    referenceSection += `\n\n## 🌐 网络搜索内容（实时信息补充）\n\n${webContext}`;
  }

  // 根据是否在主题范围内调整系统提示词
  const basePrompt = isOnTopic
    ? `${SYSTEM_PROMPT}\n\n---\n\n# 参考信息\n${referenceSection}\n\n---\n\n请整合以上所有来源的信息，优化后给出最佳回答。直接输出优化后的内容，不要标注来源。如果参考信息中没有相关内容，仅基于你的角色定位回答。`
    : `${SYSTEM_PROMPT}\n\n---\n\n# 参考信息\n${referenceSection}\n\n---\n\n注意：用户的问题可能与校园通信业务无关。请严格判断：如果参考信息中有相关内容，可以基于参考信息回答；如果参考信息中没有相关内容，且问题与校园通信业务无关，请礼貌拒绝并引导用户提出业务相关的问题。不要生成与业务无关的内容。`;

  const chatMessages = [
    { role: "system", content: basePrompt },
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
