import { NextRequest, NextResponse } from "next/server";
import { saveToHistory, searchHistory, getHistoryStats, clearHistory } from "@/lib/response-history";

// POST /api/history - 保存回答到历史
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, question, answer } = body;

    if (action === "save") {
      if (!question || !answer) {
        return NextResponse.json({ error: "缺少问题或回答" }, { status: 400 });
      }
      saveToHistory(question, answer);
      return NextResponse.json({ success: true });
    }

    if (action === "search") {
      if (!question) {
        return NextResponse.json({ error: "缺少问题" }, { status: 400 });
      }
      const match = searchHistory(question, 0.6);
      return NextResponse.json({ success: true, match });
    }

    if (action === "stats") {
      const stats = getHistoryStats();
      return NextResponse.json({ success: true, stats });
    }

    if (action === "clear") {
      clearHistory();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    console.error("[History API] Error:", error);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}

// GET /api/history - 获取历史统计
export async function GET() {
  const stats = getHistoryStats();
  return NextResponse.json({ success: true, stats });
}
