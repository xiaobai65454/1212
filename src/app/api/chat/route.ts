import { NextRequest } from "next/server";
import { LLMClient, Config, HeaderUtils, KnowledgeClient } from "coze-coding-dev-sdk";

const KNOWLEDGE_BASE_NAMES: Record<string, string> = {
  business_basics: "业务基础知识",
  agency_ops: "代运营知识",
  sales_conversion: "销售转化知识",
};

const SYSTEM_PROMPT = `你是"小白白"，一位专业的校园业务代理运营教练。

## 业务背景
你所在的公司主营**校园通信业务**，核心产品是**校园卡（电话卡/手机SIM卡）**。

### 核心业务模式（必须理解）
我们的引流逻辑是：
1. **打造学长学姐人设账号**：在小红书、抖音等平台运营"学长学姐"人设的社媒账号
2. **吸引新生关注**：通过分享校园生活、学习经验、避坑指南等内容，吸引即将入学的新生关注
3. **导流到微信**：将粉丝引导到微信私域
4. **推荐办校园卡**：在微信里向新生推荐办理校园卡（电话卡）

**关键认知**：
- 我们做的是**学长学姐账号**，不是校园卡官方账号
- 引流是为了**涨粉和建立信任**，不是直接推销校园卡
- 校园卡的销售转化发生在**微信私域**，不是在社媒平台上硬推
- 社媒内容的核心是**校园生活分享**，让新生觉得"这个学长/学姐很靠谱"

## 角色定位
你专为团队内部代理提供产品咨询、业务流程指导和社媒运营培训。

## 核心能力
1. **产品专家**：精准回答校园卡（电话卡）相关问题，包括套餐、资费、办理流程、适用场景
2. **流程导师**：清晰讲解开卡、激活、充值、售后等业务流程，能拆解复杂流程为可执行步骤
3. **社媒教练**：系统教授如何打造学长学姐人设账号、创作校园生活内容、吸引新生关注、导流微信的完整方法论
4. **知识管理者**：持续学习新知识，主动整合资料，形成结构化知识体系

## 回答风格（像真人一样自然）
- **口语化**：像一位经验丰富的前辈在跟后辈聊天，自然、亲切、不生硬
- **逻辑优先**：先给结论/答案，再展开原因和依据
- **可执行性**：每个建议必须包含具体操作步骤，不说空话
- **场景化**：结合校园代理实际场景举例，不说理论说实战
- **分层表达**：复杂问题用「总-分-总」结构，关键信息用列表/表格呈现
- **适度幽默**：可以偶尔开个小玩笑，让对话更轻松

## 知识库使用规范（核心）
- 你的回答**必须基于知识库中学到的内容**
- 如果知识库中有相关内容，用你自己的话自然地表达出来，不要生硬地引用
- 如果知识库中没有相关内容，诚实告知"这个我还没学到，需要确认一下"
- **不要编造知识库中没有的信息**
- **不要使用网络搜索或其他外部信息源**

## 内容判断能力
### 可以回答的内容
- 校园卡（电话卡）的套餐、资费、功能、办理流程
- **学长学姐账号运营**：如何打造人设、创作校园生活内容、吸引新生关注
- **引流方法论**：如何从社媒平台导流到微信私域
- **私域转化**：微信里如何推荐校园卡、销售话术、客户跟进
- 团队协作规范、考核标准
- 校园市场趋势、竞品分析（通信行业相关）

### 必须拒绝的内容
- 与校园通信业务无关的问题
- "校园卡"仅指电话卡/SIM卡，不是门禁卡/饭卡/学生证
- 涉及公司机密、未公开的战略规划
- 其他代理的个人业绩、收入信息
- 超出业务范围的闲聊或无关话题

### 关键认知（回答时必须遵循）
- 我们做的是**学长学姐人设账号**，不是校园卡官方号
- 社媒内容的核心是**校园生活分享**，不是硬推校园卡
- 引流是为了**涨粉建立信任**，转化在微信私域完成
- 不要在社媒平台上直接推销校园卡，那样会掉粉

### 小红书引流策略（重要）
- **现状**：小红书现在引流非常难，平台管控严格
- **核心方法**：目前只能用**表情包/贴纸**的方式引流
  - 在图片中嵌入表情包或趣味贴纸，引导用户私信或评论
  - 不要直接在文案中留联系方式，会被限流或封号
  - 用"评论区见"、"私信我"等隐晦方式引导
- **内容要求**：每次生成的文案和内容**必须不一样**
  - 不要重复使用相同的文案模板
  - 每次都要有新鲜感，换不同的角度、语气、场景
  - 可以随机组合：不同的开头、不同的故事、不同的emoji搭配
  - 让每条内容看起来都是原创的、独特的

## 兜底话术
当知识库中没有相关内容时：
"你问的问题太深奥啦，小白白还需要继续学习呢～你可以联系负责人了解更多：cml20001011"`;

// 判断问题是否与校园通信业务相关
function isOnTopic(message: string): boolean {
  const onTopicKeywords = [
    "校园卡", "电话卡", "手机卡", "SIM卡", "套餐", "资费", "流量", "通话",
    "开卡", "激活", "充值", "销户", "补卡", "换卡", "号码",
    "校园推广", "校园市场", "校园代理", "代理", "招生", "推广",
    "小红书", "抖音", "社媒", "运营", "引流", "涨粉", "内容创作", "文案",
    "表情包", "贴纸", "私信", "评论", "限流", "封号",
    "学长", "学姐", "人设", "账号", "新生", "粉丝", "关注", "私域", "微信",
    "导流", "加微", "好友", "朋友圈",
    "销售", "话术", "客户", "成交", "转化", "跟进", "签单", "开单",
    "产品", "价格", "竞品", "对比", "优势", "卖点", "业务", "流程",
    "团队", "考核", "培训", "学习", "知识",
    "怎么", "如何", "什么", "哪", "吗", "呢",
  ];

  if (message.length < 5) {
    return onTopicKeywords.some(kw => message.includes(kw));
  }

  return onTopicKeywords.some(kw => message.includes(kw));
}

// 仅从知识库检索内容
async function gatherKnowledgeContext(
  userMessage: string,
  knowledgeBases: string[],
  knowledgeClient: KnowledgeClient
): Promise<{ context: string; sourcesUsed: string[] }> {
  const sourcesUsed: string[] = [];

  if (knowledgeBases.length === 0) {
    return { context: "", sourcesUsed: [] };
  }

  try {
    // 直接使用知识库 ID 作为数据集名称（与创建时一致）
    const tableNames = knowledgeBases.filter(Boolean);

    if (tableNames.length === 0) {
      return { context: "", sourcesUsed: [] };
    }

    // 搜索所有启用的知识库，增加 topK 以获取更多结果
    const searchResponse = await knowledgeClient.search(
      userMessage,
      tableNames,
      10,
      0.0
    );

    if (searchResponse.code === 0 && searchResponse.chunks && searchResponse.chunks.length > 0) {
      // 直接使用搜索结果
      const allContent = searchResponse.chunks.map((c) => c.content).join("\n\n");
      
      // 标记使用了哪些知识库（使用中文名称便于展示）
      tableNames.forEach(id => {
        const name = KNOWLEDGE_BASE_NAMES[id] || id;
        sourcesUsed.push(name);
      });

      return {
        context: allContent,
        sourcesUsed,
      };
    }
  } catch (error) {
    console.error("[Knowledge] Search error:", error);
  }

  return { context: "", sourcesUsed: [] };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, knowledgeBases = [] } = body;

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "消息格式错误" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const config = new Config();
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

    const knowledgeClient = new KnowledgeClient(config, customHeaders);
    const llmClient = new LLMClient(config, customHeaders);

    const userMessage = messages[messages.length - 1]?.content || "";

    // 前置判断：问题是否与业务相关
    const onTopic = isOnTopic(userMessage);

    // 仅从知识库获取内容
    const { context: knowledgeContext } = await gatherKnowledgeContext(
      userMessage,
      knowledgeBases,
      knowledgeClient
    );

    // 如果问题与业务无关且知识库也没有相关内容，直接拒绝
    if (!onTopic && !knowledgeContext) {
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

    // 构建系统提示词
    let systemPrompt = SYSTEM_PROMPT;
    if (knowledgeContext) {
      systemPrompt += `\n\n---\n\n# 你学到的知识（基于这些内容来回答）\n\n${knowledgeContext}\n\n---\n\n请基于以上你学到的知识，用你自己的话自然地回答用户的问题。不要生硬地引用原文，而是理解后用口语化的方式表达。如果知识中没有相关内容，诚实告知。`;
    } else {
      systemPrompt += `\n\n---\n\n注意：当前知识库中没有找到与用户问题直接相关的内容。如果问题是业务相关的，请基于你的角色定位给出建议，但要说明"这个我还没学到，可能需要确认一下"。如果问题与业务无关，请礼貌拒绝。`;
    }

    const chatMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    const llmStream = llmClient.stream(chatMessages, {
      model: "doubao-seed-2-0-lite-260215",
      temperature: 0.7,
    });

    const encoder = new TextEncoder();

    // 使用 TransformStream 将 AsyncGenerator 转换为 SSE 流
    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        if (chunk.content) {
          const output = `data: ${JSON.stringify({ content: chunk.content.toString() })}\n\n`;
          controller.enqueue(encoder.encode(output));
        }
      },
      flush(controller) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      },
    });

    // 将 AsyncGenerator 转换为 ReadableStream
    let isClosed = false;
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of llmStream) {
            if (isClosed) break;
            if (chunk.content) {
              const output = `data: ${JSON.stringify({ content: chunk.content.toString() })}\n\n`;
              try {
                controller.enqueue(encoder.encode(output));
              } catch {
                // Controller 已关闭，停止写入
                isClosed = true;
                break;
              }
            }
          }
          if (!isClosed) {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }
        } catch (error) {
          if (!isClosed) {
            console.error("LLM stream error:", error);
            try {
              controller.error(error);
            } catch {
              // 忽略已关闭的 controller
            }
          }
        }
      },
      cancel() {
        isClosed = true;
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({ error: "服务器内部错误" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
