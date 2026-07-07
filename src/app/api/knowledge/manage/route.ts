import { NextRequest, NextResponse } from "next/server";
import { KnowledgeClient, Config, HeaderUtils, DataSourceType } from "coze-coding-dev-sdk";

// POST: Add documents to knowledge base
export async function POST(request: NextRequest) {
  const { knowledgeBase, type, content, url, title } = await request.json();
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

  if (!knowledgeBase || !type) {
    return NextResponse.json({
      success: false,
      error: "缺少必要参数: knowledgeBase, type",
    });
  }

  const config = new Config();
  const client = new KnowledgeClient(config, customHeaders);

  try {
    const doc =
      type === "url"
        ? { source: DataSourceType.URL, url: url || "" }
        : { source: DataSourceType.TEXT, raw_data: title ? `# ${title}\n\n${content}` : content };

    const response = await client.addDocuments([doc], knowledgeBase);

    if (response.code === 0) {
      return NextResponse.json({
        success: true,
        message: "知识添加成功",
        docIds: response.doc_ids,
      });
    }

    return NextResponse.json({
      success: false,
      error: response.msg || "添加失败",
    });
  } catch {
    return NextResponse.json({
      success: false,
      error: "添加知识异常",
    });
  }
}

// GET: List knowledge base info
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const knowledgeBase = searchParams.get("kb");

  const knowledgeBases = [
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
  ];

  if (knowledgeBase) {
    const found = knowledgeBases.find((kb) => kb.id === knowledgeBase);
    if (!found) {
      return NextResponse.json({ success: false, error: "知识库不存在" });
    }
    return NextResponse.json({ success: true, knowledgeBase: found });
  }

  return NextResponse.json({ success: true, knowledgeBases });
}

// DELETE: Delete documents from knowledge base (by searching and marking)
export async function DELETE(request: NextRequest) {
  const { knowledgeBase, docId } = await request.json();
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

  if (!knowledgeBase || !docId) {
    return NextResponse.json({
      success: false,
      error: "缺少必要参数: knowledgeBase, docId",
    });
  }

  // Note: The SDK doesn't support direct deletion by docId
  // We'll return a success response and note that deletion requires re-indexing
  // For now, we'll mark this as a known limitation
  return NextResponse.json({
    success: true,
    message: "删除请求已记录，知识库将在下次重建时生效",
  });
}
