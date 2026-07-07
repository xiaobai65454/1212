import { NextRequest, NextResponse } from "next/server";
import { KnowledgeClient, Config, HeaderUtils, DataSourceType } from "coze-coding-dev-sdk";

export async function POST(request: NextRequest) {
  const { query, knowledgeBases, topK } = await request.json();
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

  const config = new Config();
  const client = new KnowledgeClient(config, customHeaders);

  try {
    const response = await client.search(
      query || "",
      knowledgeBases && knowledgeBases.length > 0 ? knowledgeBases : undefined,
      topK || 5,
      0.3
    );

    if (response.code === 0) {
      return NextResponse.json({
        success: true,
        results: response.chunks.map((chunk: { content: string; score: number; doc_id?: string; table_name?: string }) => ({
          content: chunk.content,
          score: chunk.score,
          docId: chunk.doc_id,
          source: chunk.table_name,
        })),
      });
    }

    return NextResponse.json({
      success: false,
      error: response.msg || "搜索失败",
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "知识库搜索异常",
    });
  }
}

export async function GET() {
  return NextResponse.json({
    knowledgeBases: [
      {
        id: "business_basics",
        name: "业务基础知识",
        description: "产品功能、价格体系、适用场景、竞品对比等核心业务知识",
        color: "#4A90D9",
        icon: "book",
      },
      {
        id: "agency_ops",
        name: "代运营知识",
        description: "小红书/抖音运营方法论、内容创作、引流技巧、账号运营策略",
        color: "#FF6B4A",
        icon: "megaphone",
      },
      {
        id: "sales_conversion",
        name: "销售转化知识",
        description: "销售话术、客户跟进、转化技巧、成交策略、团队协作规范",
        color: "#4ECDC4",
        icon: "target",
      },
    ],
  });
}
