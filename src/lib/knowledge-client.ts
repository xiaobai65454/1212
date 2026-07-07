/**
 * 本地知识库客户端 - 支持外部部署
 * 使用本地 JSON 文件存储知识，支持简单的文本匹配搜索
 */

import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "knowledge");

export interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  knowledgeBase: string;
  createdAt: string;
}

export interface SearchResult {
  content: string;
  score: number;
  docId: string;
  title: string;
}

// 确保数据目录存在
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// 获取知识库文件路径
function getKBFilePath(knowledgeBase: string): string {
  return path.join(DATA_DIR, `${knowledgeBase}.json`);
}

// 读取知识库文档
function readKBDocs(knowledgeBase: string): KnowledgeDoc[] {
  const filePath = getKBFilePath(knowledgeBase);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// 写入知识库文档
function writeKBDocs(knowledgeBase: string, docs: KnowledgeDoc[]) {
  ensureDataDir();
  const filePath = getKBFilePath(knowledgeBase);
  fs.writeFileSync(filePath, JSON.stringify(docs, null, 2));
}

/**
 * 添加文档到知识库
 */
export async function addDocuments(
  knowledgeBase: string,
  docs: Array<{ title: string; content: string }>
): Promise<string[]> {
  const existingDocs = readKBDocs(knowledgeBase);
  const newDocIds: string[] = [];

  for (const doc of docs) {
    const id = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    existingDocs.push({
      id,
      title: doc.title,
      content: doc.content,
      knowledgeBase,
      createdAt: new Date().toISOString(),
    });
    newDocIds.push(id);
  }

  writeKBDocs(knowledgeBase, existingDocs);
  return newDocIds;
}

/**
 * 简单的文本相似度计算（基于关键词匹配）
 */
function calculateSimilarity(query: string, content: string): number {
  const queryWords = query.toLowerCase().split(/[\s,，。！？、]+/).filter(w => w.length > 1);
  const contentLower = content.toLowerCase();
  
  let matchCount = 0;
  for (const word of queryWords) {
    if (contentLower.includes(word)) {
      matchCount++;
    }
  }
  
  return queryWords.length > 0 ? matchCount / queryWords.length : 0;
}

/**
 * 搜索知识库
 */
export async function search(
  query: string,
  knowledgeBases?: string[],
  topK: number = 10
): Promise<SearchResult[]> {
  ensureDataDir();
  
  // 获取所有知识库
  let kbNames = knowledgeBases || [];
  if (kbNames.length === 0) {
    // 读取所有知识库
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".json"));
    kbNames = files.map(f => f.replace(".json", ""));
  }

  const results: SearchResult[] = [];

  for (const kb of kbNames) {
    const docs = readKBDocs(kb);
    
    for (const doc of docs) {
      const score = calculateSimilarity(query, doc.content);
      if (score > 0.1) {
        results.push({
          content: doc.content,
          score,
          docId: doc.id,
          title: doc.title,
        });
      }
    }
  }

  // 按分数排序，返回 top K
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/**
 * 删除文档
 */
export async function deleteDocument(knowledgeBase: string, docId: string): Promise<boolean> {
  const docs = readKBDocs(knowledgeBase);
  const filtered = docs.filter(d => d.id !== docId);
  
  if (filtered.length === docs.length) {
    return false;
  }
  
  writeKBDocs(knowledgeBase, filtered);
  return true;
}

/**
 * 获取知识库列表
 */
export async function listKnowledgeBases(): Promise<Array<{ id: string; name: string; docCount: number }>> {
  ensureDataDir();
  
  const kbNames: Record<string, string> = {
    business_basics: "业务基础知识",
    agency_ops: "代运营知识",
    sales_conversion: "销售转化知识",
  };

  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".json"));
  
  return files.map(f => {
    const id = f.replace(".json", "");
    const docs = readKBDocs(id);
    return {
      id,
      name: kbNames[id] || id,
      docCount: docs.length,
    };
  });
}

/**
 * 获取知识库中的所有文档
 */
export async function listDocuments(knowledgeBase: string): Promise<KnowledgeDoc[]> {
  return readKBDocs(knowledgeBase);
}
