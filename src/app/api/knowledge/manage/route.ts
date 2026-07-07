import { NextRequest, NextResponse } from "next/server";
import { KnowledgeClient, Config, HeaderUtils, DataSourceType } from "coze-coding-dev-sdk";
import { addDocument, removeDocumentsByDocIds, getDocumentsByKnowledgeBase, getAllDocuments } from "@/lib/knowledge-store";

const KNOWLEDGE_BASES = [
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
    const rawContent = type === "url" 
      ? `# ${title || url}\n\n来源: ${url}`
      : title 
        ? `# ${title}\n\n${content}` 
        : content;

    const doc =
      type === "url"
        ? { source: DataSourceType.URL, url: url || "" }
        : { source: DataSourceType.TEXT, raw_data: rawContent };

    const response = await client.addDocuments([doc], knowledgeBase);

    if (response.code === 0) {
      // 记录文档元数据
      const preview = (content || url || "").slice(0, 200);
      addDocument({
        title: title || (type === "url" ? url : "未命名文档"),
        knowledgeBase,
        type,
        preview,
        docIds: response.doc_ids || [],
      });

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

// GET: List knowledge base info or documents
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const knowledgeBase = searchParams.get("kb");
  const listDocs = searchParams.get("docs");

  // 如果请求列出文档
  if (listDocs === "true") {
    const docs = knowledgeBase 
      ? getDocumentsByKnowledgeBase(knowledgeBase)
      : getAllDocuments();
    
    return NextResponse.json({
      success: true,
      documents: docs,
      total: docs.length,
    });
  }

  // 否则返回知识库基本信息
  if (knowledgeBase) {
    const found = KNOWLEDGE_BASES.find((kb) => kb.id === knowledgeBase);
    if (!found) {
      return NextResponse.json({ success: false, error: "知识库不存在" });
    }

    const docs = getDocumentsByKnowledgeBase(knowledgeBase);
    return NextResponse.json({
      success: true,
      knowledgeBase: { ...found, documentCount: docs.length },
    });
  }

  // 返回所有知识库信息（包含文档数量）
  const basesWithCount = KNOWLEDGE_BASES.map(kb => ({
    ...kb,
    documentCount: getDocumentsByKnowledgeBase(kb.id).length,
  }));

  return NextResponse.json({
    success: true,
    knowledgeBases: basesWithCount,
  });
}

// DELETE: Remove document metadata (note: SDK doesn't support deleting from vector store)
export async function DELETE(request: NextRequest) {
  const { docIds } = await request.json();

  if (!docIds || !Array.isArray(docIds) || docIds.length === 0) {
    return NextResponse.json({
      success: false,
      error: "缺少必要参数: docIds",
    });
  }

  try {
    // 只删除本地元数据记录
    removeDocumentsByDocIds(docIds);

    return NextResponse.json({
      success: true,
      message: "知识记录已删除（注：向量存储中的内容无法通过 API 删除，但不会再被检索到）",
    });
  } catch {
    return NextResponse.json({
      success: false,
      error: "删除知识异常",
    });
  }
}
