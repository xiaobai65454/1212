import { NextRequest, NextResponse } from "next/server";
import { addDocuments as addDocumentsToKnowledge } from "@/lib/knowledge-client";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = [".txt", ".md", ".pdf", ".docx", ".doc", ".csv"];

/**
 * 清理文档内容，过滤代码、JSON、网页源码等无效内容
 */
function cleanDocumentContent(content: string): string {
  // 按行分割
  const lines = content.split("\n");
  const cleanLines: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // 跳过空行
    if (!trimmed) continue;
    
    // 跳过代码行（包含大量特殊字符）
    if (/[{}[\]<>;:=]/.test(trimmed) && /[a-zA-Z_]/.test(trimmed)) {
      // 如果一行中特殊字符占比过高，认为是代码
      const specialChars = (trimmed.match(/[{}[\]<>;:=()"']/g) || []).length;
      if (specialChars > trimmed.length * 0.15) continue;
    }
    
    // 跳过 JSON 行
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) continue;
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) continue;
    
    // 跳过 URL 行
    if (/^https?:\/\//.test(trimmed)) continue;
    
    // 跳过纯数字/符号行
    if (/^[\d\s\-\+\*\./,]+$/.test(trimmed)) continue;
    
    // 跳过过短的行（少于3个字符，且不是中文）
    if (trimmed.length < 3 && !/[\u4e00-\u9fa5]/.test(trimmed)) continue;
    
    cleanLines.push(trimmed);
  }
  
  return cleanLines.join("\n");
}

async function parseFileContent(buffer: Buffer, fileName: string): Promise<string> {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));

  switch (ext) {
    case ".txt":
    case ".md":
    case ".csv":
      return buffer.toString("utf-8");

    case ".pdf": {
      try {
        const { getDocumentProxy, extractText } = await import("unpdf");
        const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        const pdf = await getDocumentProxy(uint8);
        const result = await extractText(pdf, { mergePages: true });
        return result.text;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[PDF Parse Error]", msg);
        throw new Error(`PDF 解析失败: ${msg}`);
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
    const rawContent = await parseFileContent(buffer, fileName);

    if (!rawContent || rawContent.trim().length === 0) {
      return NextResponse.json({
        success: false,
        error: "文件内容为空或无法提取文本",
      });
    }

    // Clean content - remove code, JSON, and garbage
    const content = cleanDocumentContent(rawContent);
    
    if (!content || content.trim().length < 10) {
      return NextResponse.json({
        success: false,
        error: "文件内容过滤后为空或过短，请确认文件包含有效文本内容",
      });
    }

    // Build document with title
    const docTitle = title?.trim() || fileName.replace(/\.[^.]+$/, "");
    const fullContent = `# ${docTitle}\n\n${content.trim()}`;

    // Add to knowledge base
    const docIds = await addDocumentsToKnowledge(knowledgeBase, [{
      title: docTitle,
      content: fullContent,
    }]);

    return NextResponse.json({
      success: true,
      message: `文件「${fileName}」已成功导入知识库`,
      docIds,
      fileName,
      contentLength: content.length,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "文件上传异常";
    return NextResponse.json({
      success: false,
      error: errorMessage,
    });
  }
}
