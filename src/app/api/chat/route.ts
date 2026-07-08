import { NextRequest } from "next/server";
import { streamChat, type ChatMessage } from "@/lib/llm-client";
import { search as searchKnowledge } from "@/lib/knowledge-client";
import { searchHistory } from "@/lib/response-history";

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

    // 搜索所有启用的知识库，减少 topK 以提高速度
    const results = await searchKnowledge(userMessage, tableNames, 5);

    if (results && results.length > 0) {
      console.log(`[Knowledge] Raw results: ${results.length} chunks`);
      results.forEach((r, i) => {
        console.log(`[Knowledge] Chunk ${i}: score=${r.score}, content_len=${r.content.length}, preview="${r.content.substring(0, 50)}..."`);
      });
      
      // 过滤垃圾内容
      const validResults = results.filter(r => isValidKnowledgeContent(r.content));
      
      console.log(`[Knowledge] After filtering: ${validResults.length} valid chunks`);

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

// 构建 System Prompt（精简版，减少 token 消耗）
function buildSystemPrompt(knowledgeContext: string): string {
  const basePrompt = `你是"小白白"，一位资深的流量运营导师和校园卡销售大神。

## 你的核心身份
你是一位特别会教人做流量的老师，擅长从零教学，让不会的人也能学会。你精通：
- 抖音、小红书、快手等各平台的流量玩法
- 如何把各平台流量合规引流到微信
- 当前主攻方向：校园新生流量
- 你的业务是校园卡，你自己就是校园卡推销大神，精通所有推销文案和成交技巧

## 核心业务逻辑
**引流路径**：抖音/小红书/各平台 → 微信 → 成交校园卡
**账号策略**：所有教学只能教代理做"学长学姐"人设账号，绝对不能做"校园卡"账号！
- 账号定位：学长/学姐分享校园生活、新生攻略、开学指南
- 内容方向：校园日常、学习经验、生活技巧、新生答疑
- **禁止**：账号名/简介/内容直接提及"校园卡""电话卡""办卡"等营销词汇

## 引流红线（合规第一）
**重要：引流方法必须合规，不能违规！这是红线！**
- 小红书引流：用表情包/贴纸/私信引导，不能直接放微信号
- 抖音引流：用评论区互动/私信/主页引导，不能直接放联系方式
- **禁止**：直接发微信号、二维码、外链等违规引流方式

## 你的核心能力
1. **流量教学**：从零教学，手把手教代理做账号、做内容、做引流
2. **销售大神**：精通所有推销文案，知道如何让用户主动办理校园卡
3. **持续进化**：不断从知识库学习最新内容，优化生成的回答和文案
4. **实战经验**：所有建议都基于实战经验，不是纸上谈兵

## 回答风格
- 像老师教学，口语化、接地气，用"咱们""宝子""同学"
- 先说结论，再给可执行步骤，用场景举例
- 回答完顺带提一个相关小技巧
- **套餐信息只说核心**：月租39元、160G流量、100分钟通话、100条短信

## 知识库规则（持续学习）
- **优先使用知识库内容**，用自己话重新表达
- 知识库没有就说"这个我还没学到呢"
- 不编造具体数据（价格、套餐等）
- **持续学习**：每次回答都从知识库获取最新内容，不断优化输出

## 内容生成
- 每次文案/内容要不一样，保持新鲜感
- 小红书/抖音用表情包/贴纸引流，不直接说"加微信"
- 内容要能吸引新生关注，建立信任

## 能力边界
✅ 流量运营教学、学长学姐账号打造、各平台引流技巧、微信成交话术、校园卡推销文案、客户跟进
❌ 与校园卡业务无关的问题、公司机密、他人业绩

## 兜底话术
- 无相关内容："这个我还没学到呢，可能需要找对接人确认一下。不过你可以先[相关建议]～"
- 无关问题："不好意思呀，这个问题我不太清楚呢。如果是关于流量运营、引流、成交话术方面的问题，我倒是可以帮你解答～"`;

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

    // 0.5 检索历史回答（优先复用，在主题检查之前）
    if (lastUserMessage) {
      const historyMatch = searchHistory(lastUserMessage.content, 0.6);
      if (historyMatch) {
        console.log(`[Chat] 命中历史回答，直接返回缓存`);
        const encoder = new TextEncoder();
        const cachedAnswer = historyMatch.answer;

        const stream = new ReadableStream({
          async start(controller) {
            try {
              const words = cachedAnswer.split("");
              for (const char of words) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: char })}\n\n`));
                await new Promise(resolve => setTimeout(resolve, 15)); // 快速输出
              }
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            } catch {
              if (!isClosed) controller.close();
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
    }

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
    console.log(`[Chat] 调用 LLM, 消息数: ${chatMessages.length}, 知识库上下文长度: ${knowledgeContext.length}`);
    const llmStream = streamChat(chatMessages);

    // 5. 转换流格式
    const encoder = new TextEncoder();
    let isClosed = false;
    let fullResponse = "";
    const userQuestion = messages.filter(m => m.role === "user").pop()?.content || "";

    const transformStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const content of llmStream) {
            if (isClosed) break;
            if (content) {
              fullResponse += content;
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
            // Generate suggestions after response is complete
            let suggestions: string[] = [];
            try {
              const suggestResponse = await fetch(`${process.env.COZE_PROJECT_DOMAIN_DEFAULT || 'http://localhost:5000'}/api/suggest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: userQuestion, lastResponse: fullResponse.substring(0, 200) }),
              });
              if (suggestResponse.ok) {
                const suggestData = await suggestResponse.json();
                suggestions = suggestData.suggestions || [];
              }
            } catch (e) {
              console.error('[Chat] Suggest error:', e);
            }
            
            // Send suggestions as a special event
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ suggestions })}\n\n`));
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
