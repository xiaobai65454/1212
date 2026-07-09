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

      if (validResults.length === 0 && allResults.length === 0) {
        return { context: "", sourcesUsed: [] };
      }
      
      // 合并结果（缓存优先）
      allResults.push(...validResults);
      
      // 标记使用了哪些知识库（使用中文名称便于展示）
      tableNames.forEach(id => {
        const name = KNOWLEDGE_BASE_NAMES[id] || id;
        if (!sourcesUsed.includes(name)) {
          sourcesUsed.push(name);
        }
      });

      // 使用合并后的内容
      const allContent = allResults.map((r) => r.content).join("\n\n");

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
function buildCopywritingSystemPrompt(webContext: string, knowledgeContext: string): string {
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
  
  // 随机选择写作风格
  const styles = [
    {
      name: "吐槽调侃型",
      desc: "像跟朋友吐槽一样，语气夸张带点自嘲，多用反问和感叹",
      example: "笑死，开学前我妈非让我办那个什么校园卡，说'学校推荐的肯定靠谱'。我心想这也太老土了吧...结果用了一个月，真香。流量管够，再也不用在图书馆抢wifi了。"
    },
    {
      name: "真诚走心型",
      desc: "像写日记一样真诚，分享真实感受，语气平和温暖",
      example: "大一刚来的时候特别不适应，什么都要自己操心。后来慢慢摸索出一些经验，想分享给学弟学妹们。比如这个校园卡，用了一年多了，确实挺省心的，至少不用每个月算话费。"
    },
    {
      name: "干货分享型",
      desc: "像学长学姐传授经验，直接给建议，语气自信但不说教",
      example: "说几个我踩过的坑吧。第一，别信那些'免费'的东西，最后都贵。第二，选套餐看流量别看通话，现在谁还打电话。第三，校园卡其实可以换，别被忽悠了。"
    },
    {
      name: "轻松日常型",
      desc: "像发朋友圈一样随意，想到哪说到哪，语气轻松自然",
      example: "今天室友问我怎么流量还有这么多，我说我用的那个套餐流量管够啊。她说她每个月都要买流量包，我说你咋不早说，现在换还来得及。"
    },
    {
      name: "悬念反转型",
      desc: "开头制造悬念，中间反转，结尾点题",
      example: "室友都以为我是富二代，因为我每个月话费才39...其实我只是用对了套餐而已。160G流量用到爽，100分钟通话随便打，关键是还有100条短信，现在谁还发短信啊但我偶尔会用。"
    },
  ];
  const randomStyle = styles[Math.floor(Math.random() * styles.length)];
  
  // 小红书标题公式（随机选择一个）
  const titleFormulas = [
    "数字+痛点+解决方案：如'大一新生必看！3个省钱妙招让你每月多存500'",
    "身份+场景+结果：如'学姐亲测｜用了这个套餐，流量再也不够用了'",
    "对比+反转：如'从月耗200到39，我的话费自由之路'",
    "疑问+好奇：如'为什么学长都不推荐新生办XX卡？'",
    "清单+价值：如'新生入学5件套，第3个99%的人不知道'",
  ];
  const randomTitleFormula = titleFormulas[Math.floor(Math.random() * titleFormulas.length)];

  const basePrompt = `你现在就是一个真实的大学生，刚刷完小红书想发一条笔记。你不是在"创作"，你就是在"记录"。

## 核心原则：像真人一样说话

### 真人的特点（必须模仿）
- 说话断断续续，想到哪写到哪
- 会有语气词："啊""哦""嗯""哎""吧""嘛""呢"
- 会突然想到什么就加一句，用括号补充
- 句子经常不完整，省略号很多
- 会用"就是那种...你懂吧"这种表达
- 情绪来了会连用感叹号"！！！"
- 会自嘲、会吐槽、会开玩笑

### 句式要求（严格执行）
- 短句为主，一句话不超过15个字
- 长短交错，不要每句都一样长
- 允许一句话单独成段
- 允许一段有5-6行
- 段落长度要随机，不要规律
- 不要"首先、然后、其次、最后"
- 不要"第一、第二、第三"
- 不要"一方面、另一方面"

### 开头方式（选一种，不要思考）
- 直接说事："刚办完，来分享一下"
- 吐槽式："服了，折腾半天"
- 感慨式："大一的时候怎么没人告诉我"
- 提问式："有人和我一样吗"
- 不要铺垫，不要"今天来聊聊"

### 结尾方式（选一种）
- 突然结束，没有总结
- 问一个问题："你们呢？""有同款吗？"
- 吐槽收尾："不说了，我去上课了"
- 不要"希望对你有帮助"这种

## 绝对禁止（违反作废）
- 禁止出现：校园卡、电话卡、办卡、微信号、二维码、具体价格
- 不推销，只分享，产品最多一句话带过
- 不要写成广告，要写成真实分享
- 不要有"总结""总的来说""综上所述"
- 不要有"建议收藏""记得点赞"
- 不要有"宝子们""姐妹们""家人们"开头
- 不要有"今天给大家分享""干货来了"
- 不要每段都用emoji
- 不要用"✨🌟💫🎉"这类闪亮emoji
- 不要段落工整对称
- 不要"作为一个XX""我认为""我觉得"开头

## 本次创作设定
- 切入角度：${randomAngle}
- 写作风格：${randomStyle.name}（${randomStyle.desc}）
- 参考示例："${randomStyle.example}"

## 最后检查
写完后自己读一遍，问自己：这像真人发的吗？
- 如果太工整 → 打乱顺序，加几句废话
- 如果太正式 → 改成口语，加语气词
- 如果每段都一样长 → 有的改短，有的改长
- 如果像作文 → 删掉重新写`;

  let contextParts: string[] = [];
  
  if (webContext) {
    contextParts.push(`## 网络热门内容参考\n\n${webContext}`);
  }
  
  if (knowledgeContext) {
    contextParts.push(`## 团队知识库内容\n\n${knowledgeContext}`);
  }
  
  if (contextParts.length > 0) {
    return basePrompt + "\n\n" + contextParts.join("\n\n") + "\n\n---\n请参考以上内容，创作一篇高质量小红书文案。输出格式：先输出标题，换行后输出正文。";
  }
  
  return basePrompt + "\n\n请创作一篇高质量小红书文案。输出格式：先输出标题，换行后输出正文。";
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
      
      systemPrompt = buildCopywritingSystemPrompt(webContext, knowledgeContext);
      
      const chatMessages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];
      
      console.log(`[Chat] 文案模式：调用 LLM（精简prompt+1200tokens）`);
      llmStream = streamCopywritingChat(chatMessages, { temperature: 0.8, maxTokens: 1200 });
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
