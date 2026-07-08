import { NextResponse } from 'next/server';
import { chat, ChatMessage } from '@/lib/llm-client';

export async function POST(request: Request) {
  try {
    const { question, history = [] } = await request.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: '问题不能为空' }, { status: 400 });
    }

    // 构建提示词，让 AI 生成相关的快捷问题
    const systemPrompt = `你是一个校园业务运营教练，专门帮助代理提升抖音和小红书引流新生的能力。

根据用户的问题，生成 3-5 个相关的快捷问题建议。这些问题应该：
1. 与用户当前问题相关
2. 围绕校园卡业务核心：学长学姐账号打造、小红书/抖音合规引流、微信成交话术、客户跟进、校园卡套餐等
3. 实用且具体，能帮助用户解决实际问题
4. 每个问题控制在 15 字以内

直接返回问题列表，每行一个问题，不要编号，不要其他内容。`;

    const userMessage = `用户问题：${question}

请生成相关的快捷问题建议：`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-4),
      { role: 'user', content: userMessage },
    ];

    const response = await chat(messages, { maxTokens: 300, temperature: 0.8 });

    const suggestions = response
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0 && line.length <= 20)
      .slice(0, 5);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('[Suggest API] Error:', error);
    return NextResponse.json(
      { error: '生成建议失败', suggestions: [] },
      { status: 500 }
    );
  }
}
