import { NextRequest } from "next/server";
import { streamChat, streamCopywritingChat, isCopywritingRequest, type ChatMessage } from "@/lib/llm-client";
import { search as searchKnowledge } from "@/lib/knowledge-client";
import { searchHistory } from "@/lib/response-history";
import { SearchClient, Config } from "coze-coding-dev-sdk";

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

// 联网搜索热门内容（仅用于文案生成，带超时保护）
async function searchTrendingContent(query: string): Promise<string> {
  try {
    const config = new Config();
    const client = new SearchClient(config);
    
    // 搜索小红书/抖音相关的热门内容
    const searchQuery = `小红书 ${query} 热门笔记 爆款`;
    
    // 设置 3 秒超时，避免搜索过慢影响响应速度
    const searchPromise = client.webSearch(searchQuery, 5, true);
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("搜索超时")), 3000)
    );
    
    const response = await Promise.race([searchPromise, timeoutPromise]);
    
    if (response.web_items && response.web_items.length > 0) {
      const contents = response.web_items.map(item => {
        return `【${item.title}】\n${item.snippet}`;
      }).join("\n\n");
      
      // 如果有 AI 总结，也加上
      const summary = response.summary ? `\n\n【热门趋势总结】\n${response.summary}` : "";
      
      return contents + summary;
    }
  } catch (error) {
    // 搜索失败不影响文案生成，只是没有联网参考
    console.warn("[WebSearch] 搜索失败或超时，跳过联网:", (error as Error).message);
  }
  
  return "";
}

// 构建文案生成专用的 System Prompt
function buildCopywritingSystemPrompt(webContext: string, knowledgeContext: string): string {
  const basePrompt = `你是"小白白"，一位顶级的小红书/抖音文案创作大师，专精校园生活和新生引流内容。

## 你的文案能力
你是全网最会写学长学姐人设文案的创作者，你写的每一篇笔记都能：
- 精准吸引大一新生关注
- 自然建立信任感
- 合规引流到微信（不违规）

## 文案创作原则
1. **人设一致**：始终是学长/学姐分享校园生活，绝不暴露营销目的
2. **真实感强**：用第一人称，加入个人经历和感受，像真人分享
3. **情绪共鸣**：切中新生的焦虑、期待、好奇等情绪
4. **价值输出**：提供实用信息，让读者觉得"关注有用"
5. **合规引流**：用表情包/贴纸/私信引导，绝不直接放联系方式

## 文案格式要求
- 标题：要有数字、痛点、好奇心缺口，让人忍不住点
- 正文：开头抛痛点/共鸣 → 中间给干货/故事 → 结尾引互动
- 标签：5-10个相关标签，包含学校名、专业名、新生相关
- 表情包提示：在合适位置标注 [表情包: xxx] 用于引流

## 文案风格
- 口语化、接地气，像朋友聊天
- 适当使用 emoji 增加亲和力
- 段落短小，易于阅读
- 多用"姐妹们""宝子们""学弟学妹"等称呼

## 禁止内容
- 不能出现"校园卡""电话卡""办卡"等营销词汇
- 不能出现微信号、二维码、外链
- 不能有虚假承诺或夸大宣传`;

  let contextParts: string[] = [];
  
  if (webContext) {
    contextParts.push(`## 网络热门内容参考（学习爆款元素）\n\n${webContext}`);
  }
  
  if (knowledgeContext) {
    contextParts.push(`## 团队知识库内容（结合使用）\n\n${knowledgeContext}`);
  }
  
  if (contextParts.length > 0) {
    return basePrompt + "\n\n" + contextParts.join("\n\n") + "\n\n---\n请参考以上热门内容和知识库，创作一篇高质量的文案。要求：标题吸引人、内容有干货、风格真实、合规引流。";
  }
  
  return basePrompt;
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
- **套餐信息只说核心**：月租39元、160G流量、100分钟通话、100条短信。没有优惠活动，不要编造任何折扣或促销活动

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

    // 检测是否为文案生成请求
    const isCopywriting = isCopywritingRequest(userMessage);
    console.log(`[Chat] 文案检测: ${isCopywriting ? "是文案请求" : "普通问答"}`);

    // 1. 从知识库检索内容
    const { context: knowledgeContext, sourcesUsed } = await gatherKnowledgeContext(
      userMessage,
      knowledgeBases,
    );

    // 如果问题不在主题范围内，且知识库没有相关内容，直接拒绝回答
    // 文案请求始终允许（因为需要联网搜索）
    if (!onTopic && !knowledgeContext && !isCopywriting) {
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

    // 2. 根据是否为文案请求，使用不同的处理逻辑
    let systemPrompt: string;
    let llmStream: AsyncGenerator<string>;
    
    if (isCopywriting) {
      // 文案生成：联网搜索 + 高质量模型
      console.log(`[Chat] 文案模式：联网搜索热门内容...`);
      const webContext = await searchTrendingContent(userMessage);
      console.log(`[Chat] 联网搜索完成，内容长度: ${webContext.length}`);
      
      systemPrompt = buildCopywritingSystemPrompt(webContext, knowledgeContext);
      
      const chatMessages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];
      
      console.log(`[Chat] 使用高质量模型生成文案`);
      llmStream = streamCopywritingChat(chatMessages, { temperature: 0.8, maxTokens: 2000 });
    } else {
      // 普通问答：使用知识库 + 快速模型
      systemPrompt = buildSystemPrompt(knowledgeContext);
      
      const chatMessages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];
      
      console.log(`[Chat] 普通模式：调用 LLM, 消息数: ${chatMessages.length}, 知识库上下文长度: ${knowledgeContext.length}`);
      llmStream = streamChat(chatMessages);
    }

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
