import { NextRequest } from "next/server";
import { streamChat, type ChatMessage } from "@/lib/llm-client";
import { search as searchKnowledge } from "@/lib/knowledge-client";

// 知识库名称映射（ID -> 中文名）
const KNOWLEDGE_BASE_NAMES: Record<string, string> = {
  business_basics: "业务基础知识",
  agency_ops: "代运营知识",
  sales_conversion: "销售转化知识",
};

// 判断问题是否与校园业务相关
function isOnTopic(message: string): boolean {
  // 校园业务相关关键词
  const onTopicKeywords = [
    // 校园卡/电话卡相关
    "校园卡", "电话卡", "手机卡", "sim卡", "号卡", "流量卡",
    "套餐", "月租", "流量", "通话", "话费", "资费", "办卡", "开卡", "销户",
    "移动", "联通", "电信", "运营商",
    // 学长学姐账号运营相关
    "学长", "学姐", "账号", "人设", "定位", "引流", "涨粉", "粉丝",
    "新生", "开学", "校园", "大学", "高校",
    "小红书", "抖音", "社媒", "运营", "内容", "文案", "笔记", "视频",
    "表情包", "贴纸", "私信", "评论", "关注", "点赞",
    "私域", "微信", "导流", "加微", "好友", "朋友圈",
    // 销售转化相关
    "销售", "话术", "客户", "成交", "转化", "跟进", "签单", "开单",
    "产品", "价格", "竞品", "对比", "优势", "卖点", "业务", "流程",
    "团队", "考核", "培训", "学习", "知识",
    // 违禁词相关
    "违禁词", "敏感词", "违规", "限流", "封号",
    // 通用疑问词
    "怎么", "如何", "什么", "哪", "吗", "呢",
  ];

  return onTopicKeywords.some(kw => message.toLowerCase().includes(kw.toLowerCase()));
}

// 过滤垃圾内容：太短的、代码片段、JSON、URL等
function isValidKnowledgeContent(content: string): boolean {
  // 太短的内容（少于15个字符）
  if (content.trim().length < 15) return false;
  
  // 包含大量代码特征的内容
  const codePatterns = [
    /\{[^}]{50,}\}/,           // 长 JSON 块
    /https?:\/\/[^\s]+/,       // URL
    /[a-zA-Z_]+\s*:\s*"/,      // JSON 键值对
    /function\s*\(/,           // 函数定义
    /import\s+|export\s+/,     // import/export
    /<script|<style|<div/,     // HTML 标签
    /npm:\s*\{/,               // npm 配置
    /"@tencent/,               // 腾讯 SDK 引用
    /docs\.qq\.com/,           // QQ文档链接
    /feedback.*qq\.com/,       // QQ反馈链接
  ];
  
  const codeMatches = codePatterns.filter(p => p.test(content)).length;
  if (codeMatches >= 2) return false;  // 匹配2个以上代码模式则过滤
  
  // 中文字符占比太低（可能是代码或乱码）
  const chineseChars = content.match(/[\u4e00-\u9fa5]/g) || [];
  const chineseRatio = chineseChars.length / content.length;
  if (chineseRatio < 0.3 && content.length > 50) return false;
  
  // 纯标点或无意义内容
  const meaningless = ["是的", "吗？", "没有", "不好意思", "好的", "嗯"];
  if (meaningless.includes(content.trim())) return false;
  
  return true;
}

// 仅从知识库检索内容
async function gatherKnowledgeContext(
  userMessage: string,
  knowledgeBases: string[],
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
    const results = await searchKnowledge(userMessage, tableNames, 20);

    if (results && results.length > 0) {
      // 过滤垃圾内容
      const validResults = results.filter(r => isValidKnowledgeContent(r.content));
      
      console.log(`[Knowledge] Found ${results.length} chunks, ${validResults.length} valid after filtering`);

      if (validResults.length === 0) {
        return { context: "", sourcesUsed: [] };
      }
      
      // 使用过滤后的内容
      const allContent = validResults.map((r) => r.content).join("\n\n");
      
      // 标记使用了哪些知识库（使用中文名称便于展示）
      tableNames.forEach(id => {
        const name = KNOWLEDGE_BASE_NAMES[id] || id;
        if (!sourcesUsed.includes(name)) {
          sourcesUsed.push(name);
        }
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

// 构建 System Prompt
function buildSystemPrompt(knowledgeContext: string): string {
  const basePrompt = `你是"小白白"，一位校园业务代理团队的运营教练和知心学姐。

## 核心业务背景（必须理解）
我们的业务模式是：
1. 在小红书/抖音上运营"学长学姐"人设的账号（不是校园卡官方号！）
2. 通过分享校园生活、新生攻略等内容吸引新生关注
3. 把关注的新生导流到微信私域
4. 在微信里推荐他们办理校园电话卡

**关键认知**：
- 我们做的是"学长学姐"账号，不是"校园卡"账号
- 社媒内容核心是校园生活分享，不是硬推校园卡
- 引流目的是为了涨粉和建立信任，转化在微信私域完成

## 你的角色定位
- 身份：团队里的运营前辈，经验丰富但很亲切
- 语气：像学姐带学弟学妹聊天，口语化、接地气
- 称呼：可以用"咱们""我们""宝子""同学"等亲切称呼
- 风格：直接给干货，不说废话，但语气温和

## 回答原则
1. **像真人聊天**：口语化表达，可以用"嗯""哦""哈哈""～"等语气词
2. **先说结论**：直接给答案/建议，再解释原因
3. **给可执行步骤**：不要说空话，每个建议要有具体操作
4. **用场景举例**：说"比如你可以这样发笔记..."而不是讲理论
5. **主动延伸**：回答完问题后，顺带提一个相关的小技巧

## 知识库使用规则（最高优先级）
- 知识库里的内容是团队内部资料，回答时必须优先使用
- 用自己的话重新表达，不要照搬原文
- 如果知识库有相关信息，一定要基于知识库回答
- 如果知识库没有相关内容，诚实说"这个我还没学到呢"
- 绝对不要编造知识库里没有的具体数据（如价格、套餐详情）

## 内容生成要求（重要）
- 每次生成的文案/内容必须不一样，保持新鲜感
- 换不同角度、语气、场景来写
- 小红书/抖音内容要配合表情包/贴纸风格

## 小红书/抖音引流策略（最新）
- 现在平台管控非常严格，直接留联系方式会被限流/封号
- **只能用表情包/贴纸引流**，这是目前最有效的方式
- 不要在文案中直接写"加微信""加V"等敏感词
- 引导方式：用隐晦的方式，如"评论区见""私信我""看主页"
- 内容要自然，像真实学长学姐分享，不要像广告

## 能力边界
✅ 可以回答：
- 校园电话卡套餐、资费、办理流程
- 学长学姐账号运营、内容创作、引流技巧
- 小红书/抖音运营方法论（表情包引流、内容创作、账号定位）
- 销售话术、客户跟进、转化技巧
- 团队协作、考核标准

❌ 拒绝回答：
- 与校园业务无关的问题（如天气、新闻、娱乐八卦）
- 涉及公司机密、未公开的战略规划
- 其他代理的个人业绩、收入信息
- 无法确认准确性的信息

## 兜底话术
当知识库没有相关内容时：
"这个我还没学到呢，可能需要找对接人确认一下。不过你可以先[相关建议]～"

当问题与业务无关时：
"不好意思呀，这个我不太清楚呢。如果是关于校园卡、账号运营或者销售方面的问题，我倒是可以帮你解答～"`;

  if (!knowledgeContext) {
    return basePrompt + `\n\n注意：当前没有检索到相关知识库内容，如果用户问的是具体业务问题，请诚实告知"这个我还没学到呢"。`;
  }

  return basePrompt + `\n\n## 以下是从团队知识库中检索到的相关内容（优先使用这些内容回答）\n\n${knowledgeContext}\n\n---\n请基于以上知识库内容，用你自己的话回答用户的问题。如果知识库内容已经足够回答，就直接回答；如果知识库内容不足以完整回答，可以补充你的专业知识，但要标注哪些是知识库内容，哪些是你的补充。`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, knowledgeBases = [] } = body as {
      messages: Array<{ role: string; content: string }>;
      knowledgeBases?: string[];
    };

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: "消息列表不能为空" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 获取最后一条用户消息
    const lastUserMessage = messages.filter(m => m.role === "user").pop();
    const userMessage = lastUserMessage?.content || "";

    // 判断问题是否在主题范围内
    const onTopic = isOnTopic(userMessage);

    // 1. 仅从知识库检索内容（不使用网络搜索）
    const { context: knowledgeContext, sourcesUsed } = await gatherKnowledgeContext(
      userMessage,
      knowledgeBases,
    );

    // 如果问题不在主题范围内，且知识库没有相关内容，直接拒绝回答
    if (!onTopic && !knowledgeContext) {
      const rejectResponse = "不好意思呀，这个问题我不太清楚呢。我是小白白，主要负责校园卡业务、学长学姐账号运营、销售转化这些方面。如果是关于这些方面的问题，我很乐意帮你解答～";
      
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const words = rejectResponse.split("");
          for (const char of words) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: char })}\n\n`));
            await new Promise(resolve => setTimeout(resolve, 30));
          }
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

    // 2. 构建 System Prompt（根据是否有知识库内容使用不同策略）
    const systemPrompt = buildSystemPrompt(knowledgeContext);

    // 3. 构建消息列表
    const chatMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    // 4. 调用 LLM 流式生成
    const llmStream = streamChat(chatMessages);

    // 5. 转换流格式
    const encoder = new TextEncoder();
    let isClosed = false;

    const transformStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const content of llmStream) {
            if (isClosed) break;
            if (content) {
              try {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                );
              } catch {
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
          console.error("LLM stream error:", error);
          if (!isClosed) {
            try {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    content: "\n\n抱歉，生成回答时出现了问题，请重试。",
                  })}\n\n`
                )
              );
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            } catch {
              // Controller already closed
            }
          }
        }
      },
      cancel() {
        isClosed = true;
      },
    });

    return new Response(transformStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({ error: "服务器内部错误，请稍后重试" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
