import { NextRequest, NextResponse } from "next/server";
import { KnowledgeClient, Config, HeaderUtils, DataSourceType } from "coze-coding-dev-sdk";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = [".txt", ".md", ".pdf", ".docx", ".doc", ".csv"];

async function parseFileContent(buffer: Buffer, fileName: string): Promise<string> {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));

  switch (ext) {
    case ".txt":
    case ".md":
    case ".csv":
      return buffer.toString("utf-8");

    case ".pdf": {
      try {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: buffer });
        const textResult = await parser.getText();
        await parser.destroy();
        return textResult.text;
      } catch {
        throw new Error("PDF 解析失败，请确认文件格式正确");
      }
    }

    case ".docx":
    case ".doc": {
      try {
        const mammoth = (await import("mammoth")).default;
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
      } catch {
        throw new Error("Word 文档解析失败，请确认文件格式正确");
      }
    }

    default:
      throw new Error(`不支持的文件格式: ${ext}，支持 ${ALLOWED_EXTENSIONS.join(", ")}`);
  }
}

export async function POST(request: NextRequest) {
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const knowledgeBase = formData.get("knowledgeBase") as string;
    const title = formData.get("title") as string | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "请选择要上传的文件" });
    }

    if (!knowledgeBase) {
      return NextResponse.json({ success: false, error: "请选择目标知识库" });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({
        success: false,
        error: `文件大小超过限制（最大 ${MAX_FILE_SIZE / 1024 / 1024}MB）`,
      });
    }

    // Validate file extension
    const fileName = file.name;
    const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({
        success: false,
        error: `不支持的文件格式: ${ext}，支持 ${ALLOWED_EXTENSIONS.join(", ")}`,
      });
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse file content
    const content = await parseFileContent(buffer, fileName);

    if (!content || content.trim().length === 0) {
      return NextResponse.json({
        success: false,
        error: "文件内容为空或无法提取文本",
      });
    }

    // Build document with title
    const docTitle = title?.trim() || fileName.replace(/\.[^.]+$/, "");
    const fullContent = `# ${docTitle}\n\n> 来源文件: ${fileName}\n\n${content.trim()}`;

    // Add to knowledge base
    const config = new Config();
    const client = new KnowledgeClient(config, customHeaders);

    const doc = {
      source: DataSourceType.TEXT,
      raw_data: fullContent,
    };

    const response = await client.addDocuments([doc], knowledgeBase);

    if (response.code === 0) {
      return NextResponse.json({
        success: true,
        message: `文件「${fileName}」已成功导入知识库`,
        docIds: response.doc_ids,
        fileName,
        contentLength: content.length,
      });
    }

    return NextResponse.json({
      success: false,
      error: response.msg || "导入失败",
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "文件上传异常";
    return NextResponse.json({
      success: false,
      error: errorMessage,
    });
  }
}
