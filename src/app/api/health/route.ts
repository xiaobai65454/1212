import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

export async function GET() {
  const checks: Record<string, unknown> = {};

  // 1. 检查环境变量
  checks.env = {
    DOUBAO_API_KEY: process.env.DOUBAO_API_KEY ? `已设置 (${process.env.DOUBAO_API_KEY.slice(0, 8)}...)` : "未设置",
    LLM_API_KEY: process.env.LLM_API_KEY ? `已设置 (${process.env.LLM_API_KEY.slice(0, 8)}...)` : "未设置",
    KNOWLEDGE_BASE_PATH: process.env.KNOWLEDGE_BASE_PATH || "未设置（使用默认路径）",
    NODE_ENV: process.env.NODE_ENV,
  };

  // 2. 检查知识库数据目录
  const dataDir = process.env.KNOWLEDGE_BASE_PATH 
    ? path.resolve(process.env.KNOWLEDGE_BASE_PATH)
    : path.join(process.cwd(), "data", "knowledge");
  
  checks.dataDir = {
    path: dataDir,
    exists: fs.existsSync(dataDir),
    cwd: process.cwd(),
  };

  if (fs.existsSync(dataDir)) {
    const files = fs.readdirSync(dataDir);
    checks.knowledgeFiles = files.map(f => {
      const filePath = path.join(dataDir, f);
      const stat = fs.statSync(filePath);
      let docCount = 0;
      try {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        docCount = Array.isArray(data) ? data.length : 0;
      } catch { /* ignore */ }
      return { name: f, size: stat.size, docCount };
    });
  } else {
    checks.knowledgeFiles = "数据目录不存在";
  }

  // 3. 测试豆包 API 连通性
  const apiKey = process.env.LLM_API_KEY || process.env.DOUBAO_API_KEY || "";
  if (apiKey) {
    try {
      const baseUrl = process.env.LLM_BASE_URL || process.env.DOUBAO_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
      const testResponse = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.LLM_MODEL || process.env.DOUBAO_MODEL || "doubao-lite-4k",
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 5,
        }),
      });
      
      if (testResponse.ok) {
        const data = await testResponse.json();
        checks.llmApi = { status: "正常", response: data.choices?.[0]?.message?.content || "ok" };
      } else {
        const errorText = await testResponse.text();
        checks.llmApi = { status: "异常", code: testResponse.status, error: errorText.slice(0, 200) };
      }
    } catch (error) {
      checks.llmApi = { status: "连接失败", error: error instanceof Error ? error.message : "未知错误" };
    }
  } else {
    checks.llmApi = { status: "未配置 API Key" };
  }

  return NextResponse.json({ 
    success: true, 
    timestamp: new Date().toISOString(),
    checks 
  });
}
