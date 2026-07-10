import { NextRequest } from "next/server";
import { streamChat, streamCopywritingChat, isCopywritingRequest, type ChatMessage } from "@/lib/llm-client";
import { search as searchKnowledge, addDocuments } from "@/lib/knowledge-client";
import { searchHistory } from "@/lib/response-history";
import { SearchClient, Config } from "coze-coding-dev-sdk";

// 知识库名称映射（ID -> 中文名）
const KNOWLEDGE_BASE_NAMES: Record<string, string> = {
  business_basics: "校园卡业务知识",
  agency_ops: "引流运营知识",
  sales_conversion: "校园卡销售知识",
  web_search_cache: "联网搜索缓存",
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

// 过滤垃圾内容：太短的、代码片段等
function isValidKnowledgeContent(content: string): boolean {
  // 太短的内容（少于15个字符）
  if (content.trim().length < 15) return false;
  
  // 只过滤明显的代码内容，不过滤正常文本
  const codePatterns = [
    /\{[^}]{200,}\}/,          // 超长 JSON 块（放宽到200字符）
    /function\s*\([^)]*\)\s*\{/, // 函数定义
    /import\s+.*from\s+['"]/,   // import 语句
    /export\s+(default\s+)?/,   // export 语句
    /<script[^>]*>[\s\S]*<\/script>/, // 完整 script 标签
  ];
  
  const codeMatches = codePatterns.filter(p => p.test(content)).length;
  if (codeMatches >= 2) return false;  // 匹配2个以上代码模式则过滤
  
  return true;
}

// 仅从知识库检索内容
async function gatherKnowledgeContext(
  userMessage: string,
  knowledgeBases: string[],
  topK: number = 5,
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

    // 优先搜索联网搜索缓存知识库
    let allResults: any[] = [];
    
    // 先搜索缓存知识库
    try {
      const cacheResults = await searchKnowledge(userMessage, ["web_search_cache"], 3);
      if (cacheResults && cacheResults.length > 0) {
        const validCacheResults = cacheResults.filter(r => isValidKnowledgeContent(r.content));
        if (validCacheResults.length > 0) {
          allResults.push(...validCacheResults);
          sourcesUsed.push("联网搜索缓存");
          console.log(`[Knowledge] 从缓存找到 ${validCacheResults.length} 条相关内容`);
        }
      }
    } catch (cacheErr) {
      // 缓存知识库可能不存在，忽略错误
      console.log("[Knowledge] 缓存知识库未找到或为空");
    }

    // 再搜索常规知识库（使用传入的 topK）
    const regularResults = await searchKnowledge(userMessage, tableNames, topK);

    if (regularResults && regularResults.length > 0) {
      console.log(`[Knowledge] Raw results: ${regularResults.length} chunks`);
      regularResults.forEach((r, i) => {
        console.log(`[Knowledge] Chunk ${i}: score=${r.score}, content_len=${r.content.length}, preview="${r.content.substring(0, 50)}..."`);
      });
      
      // 过滤垃圾内容
      const validResults = regularResults.filter(r => isValidKnowledgeContent(r.content));
      
      console.log(`[Knowledge] After filtering: ${validResults.length} valid chunks`);

      // 合并结果（缓存优先）
      allResults.push(...validResults);
      
      // 标记使用了哪些知识库（使用中文名称便于展示）
      tableNames.forEach(id => {
        const name = KNOWLEDGE_BASE_NAMES[id] || id;
        if (!sourcesUsed.includes(name)) {
          sourcesUsed.push(name);
        }
      });
    }

    // 如果有任何结果（缓存或常规），返回内容
    if (allResults.length > 0) {
      const allContent = allResults.map((r) => r.content).join("\n\n");
      console.log(`[Knowledge] 最终返回 ${allResults.length} 条结果，总字数: ${allContent.length}`);
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

// 联网搜索热门内容（用于文案生成和普通校园问答）
// 缓存命中直接返回；缓存未命中时不阻塞，后台异步搜索并写入缓存供下次使用
async function searchTrendingContent(query: string): Promise<string> {
  // 先查联网搜索缓存（24小时内有效）
  try {
    const cachedResults = await searchKnowledge(query, ["web_search_cache"], 1);
    if (cachedResults && cachedResults.length > 0) {
      const cached = cachedResults[0];
      if (cached.createdAt) {
        const cacheAge = Date.now() - new Date(cached.createdAt).getTime();
        const CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时
        if (cacheAge < CACHE_TTL) {
          console.log(`[WebSearch] 命中缓存（${Math.round(cacheAge / 60000)}分钟前），跳过联网搜索`);
          return cached.content;
        }
        console.log(`[WebSearch] 缓存已过期（${Math.round(cacheAge / 3600000)}小时前），触发后台更新`);
      } else {
        console.log(`[WebSearch] 命中缓存（无时间戳），跳过联网搜索`);
        return cached.content;
      }
    }
  } catch (cacheErr) {
    console.log("[WebSearch] 缓存知识库未找到，触发后台搜索");
  }

  // 缓存未命中或已过期：不阻塞当前请求，后台异步搜索并写缓存
  console.log("[WebSearch] 缓存未命中，后台异步搜索（不阻塞文案生成）");
  runBackgroundSearch(query).catch(err => {
    console.warn("[WebSearch] 后台搜索失败:", (err as Error).message);
  });
  
  return "";
}

// 后台异步执行联网搜索并写入缓存
async function runBackgroundSearch(query: string): Promise<void> {
  try {
    const config = new Config();
    const client = new SearchClient(config);
    const searchQuery = `小红书 ${query} 热门笔记 爆款`;
    
    const searchPromise = client.webSearch(searchQuery, 3, false);
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("搜索超时")), 3000)
    );
    
    const response = await Promise.race([searchPromise, timeoutPromise]);
    
    if (response.web_items && response.web_items.length > 0) {
      const contents = response.web_items.map(item => {
        return `【${item.title}】\n${item.snippet}`;
      }).join("\n\n");
      
      await saveSearchToKnowledge(query, contents, response.web_items);
      console.log("[WebSearch] 后台搜索完成，已写入缓存");
    }
  } catch (error) {
    console.warn("[WebSearch] 后台搜索失败:", (error as Error).message);
  }
}

// 将联网搜索结果保存到知识库
async function saveSearchToKnowledge(query: string, content: string, webItems: any[]) {
  // 提取标签
  const tags = extractTags(query);
  
  // 简化内容：只保留标题和关键信息
  const simplifiedContent = webItems.slice(0, 3).map(item => {
    return `【${item.title}】${item.snippet}`;
  }).join("\n\n");
  
  // 生成标题
  const title = `联网搜索：${query}`;
  
  // 保存到知识库（使用专门的联网搜索知识库）
  await addDocuments("web_search_cache", [{
    title,
    content: simplifiedContent,
    tags,
    source: "web_search",
  }]);
  
  console.log(`[WebSearch] 已保存到知识库，标签: ${tags.join(", ")}`);
}

// 从查询中提取标签
function extractTags(query: string): string[] {
  const tags: string[] = [];
  
  // 平台标签
  if (query.includes("小红书")) tags.push("小红书");
  if (query.includes("抖音")) tags.push("抖音");
  
  // 内容类型标签
  if (query.includes("文案") || query.includes("写")) tags.push("文案");
  if (query.includes("引流")) tags.push("引流");
  if (query.includes("校园卡")) tags.push("校园卡");
  if (query.includes("套餐")) tags.push("套餐");
  if (query.includes("话术")) tags.push("话术");
  
  // 默认标签
  if (tags.length === 0) tags.push("通用");
  
  return tags;
}

// 构建文案生成专用的 System Prompt
function buildCopywritingSystemPrompt(webContext: string, knowledgeContext: string, userQuery: string): string {
  // 随机选择切入角度，避免千篇一律
  const angles = [
    "新生入学焦虑/期待",
    "宿舍生活小妙招", 
    "学长学姐的后悔事",
    "校园隐藏福利",
    "对比其他学校的优势",
    "毕业后的回忆",
    "省钱攻略",
    "社交/脱单技巧",
    "开学必备清单",
    "校园美食探店",
    "图书馆/自习室攻略",
    "社团活动推荐",
  ];
  const randomAngle = angles[Math.floor(Math.random() * angles.length)];
  
  // 随机选择写作风格（更简洁的描述）
  const styles = [
    { name: "吐槽调侃", desc: "语气夸张带点自嘲，多用反问和感叹" },
    { name: "真诚走心", desc: "像写日记一样真诚，语气平和温暖" },
    { name: "干货分享", desc: "直接给建议，语气自信但不说教" },
    { name: "轻松日常", desc: "像发朋友圈一样随意，想到哪说到哪" },
    { name: "悬念反转", desc: "开头制造悬念，中间反转" },
    { name: "碎碎念", desc: "想到什么说什么，东一句西一句" },
    { name: "回忆杀", desc: "回忆过去，感慨现在" },
  ];
  const randomStyle = styles[Math.floor(Math.random() * styles.length)];
  
  // 小红书标题公式（随机选择一个）
  const titleFormulas = [
    "数字+痛点+解决方案",
    "身份+场景+结果",
    "对比+反转",
    "疑问+好奇",
    "清单+价值",
    "情绪+共鸣",
    "反差+意外",
  ];
  const randomTitleFormula = titleFormulas[Math.floor(Math.random() * titleFormulas.length)];

  const basePrompt = `你是真实大学生，在小红书分享生活。不是AI，不是写手。

写：${userQuery}
风格：${randomStyle.name}（${randomStyle.desc}）
角度：${randomAngle}
标题公式：${randomTitleFormula}

要求：
- 300-500字，必须有故事有细节
- 语气词：啊、哦、嗯、哎、吧、嘛、呢、啦
- 允许不完整句子，用省略号
- 会突然想到什么就加一句（用括号）
- 情绪来了会连用感叹号！！！
- 会自嘲、会吐槽

禁止：
- ❌ 列表形式、每行emoji
- ❌ "首先然后其次最后"
- ❌ "宝子们""姐妹们"开头
- ❌ "今天给大家分享""干货来了"
- ❌ 段落工整对称
- ❌ 校园卡、电话卡、办卡、微信号、二维码、具体价格

知识库：${knowledgeContext || "无"}
热点：${webContext || "无"}

记住：你不是在创作，你是在记录真实的生活。先输出标题，换行后输出正文。`;

  return basePrompt;
}

// 构建 System Prompt（精简版，减少 token 消耗）
function buildSystemPrompt(knowledgeContext: string, webContext: string = ""): string {
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

  let prompt = basePrompt;

  if (webContext) {
    prompt += `\n\n## 以下是联网搜索到的最新信息（可参考补充）\n\n${webContext}`;
  }

  if (!knowledgeContext) {
    return prompt + `\n\n注意：当前没有检索到相关知识库内容，如果用户问的是具体业务问题，请诚实告知"这个我还没学到呢"。`;
  }

  return prompt + `\n\n## 以下是从团队知识库中检索到的相关内容（优先使用这些内容回答）\n\n${knowledgeContext}\n\n---\n请基于以上知识库内容，用你自己的话回答用户的问题。如果知识库内容已经足够回答，就直接回答；如果知识库内容不足以完整回答，可以补充你的专业知识，但要标注哪些是知识库内容，哪些是你的补充。`;
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

    // 判断问题是否在主题范围内（用于非文案请求的过滤）

    // 检测是否为文案生成请求
    const isCopywriting = isCopywritingRequest(userMessage);
    console.log(`[Chat] 文案检测: ${isCopywriting ? "是文案请求" : "普通问答"}`);

    // 方案①：根据模式选择不同的检索策略
    let knowledgeContext = "";
    let sourcesUsed: string[] = [];
    let webContext = "";

    if (isCopywriting) {
      // 文案模式：减少知识库注入（只取2条最相关的），避免固定模板导致千篇一律
      const [knowledgeResult, webResult] = await Promise.all([
        gatherKnowledgeContext(userMessage, knowledgeBases, 2),
        searchTrendingContent(userMessage),
      ]);
      knowledgeContext = knowledgeResult.context;
      sourcesUsed = knowledgeResult.sourcesUsed;
      webContext = webResult;
      console.log(`[Chat] 文案模式并行检索完成 - 知识库: ${knowledgeContext.length}字, 联网: ${webContext.length}字`);
    } else {
      // 普通问答：知识库 + 联网并行
      const [knowledgeResult, webResult] = await Promise.all([
        gatherKnowledgeContext(userMessage, knowledgeBases),
        searchTrendingContent(userMessage),
      ]);
      knowledgeContext = knowledgeResult.context;
      sourcesUsed = knowledgeResult.sourcesUsed;
      webContext = webResult;
      console.log(`[Chat] 普通问答并行检索完成 - 知识库: ${knowledgeContext.length}字, 联网: ${webContext.length}字`);
    }

    // 如果问题不在主题范围内，且知识库没有相关内容，直接拒绝回答
    // 文案请求始终允许（因为需要联网搜索）
    if (!isOnTopic(userMessage) && !knowledgeContext && !isCopywriting) {
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
      // 文案生成：使用已并行获取的联网结果 + 知识库结果
      console.log(`[Chat] 文案模式：联网内容 ${webContext.length}字，知识库内容 ${knowledgeContext.length}字`);
      
      systemPrompt = buildCopywritingSystemPrompt(webContext, knowledgeContext, userMessage);
      
      const chatMessages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];
      
      console.log(`[Chat] 文案模式：调用 LLM（完整prompt+2000tokens）`);
      llmStream = streamCopywritingChat(chatMessages, { temperature: 1.0, maxTokens: 4000 });
    } else {
      // 普通问答：使用知识库 + 快速模型
      systemPrompt = buildSystemPrompt(knowledgeContext, webContext);
      
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
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ suggestions })}\n\n`));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            } catch {
              // Controller already closed
            }
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
