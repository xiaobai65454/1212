/**
 * 本地知识库客户端 - 支持外部部署
 * 使用本地 JSON 文件存储知识，支持内存缓存 + 倒排索引加速搜索
 */

import * as fs from "fs";
import * as path from "path";

// 支持通过环境变量配置数据目录，默认使用项目根目录下的 data/knowledge
const DATA_DIR = process.env.KNOWLEDGE_BASE_PATH 
  ? path.resolve(process.env.KNOWLEDGE_BASE_PATH)
  : path.join(process.cwd(), "data", "knowledge");

export interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  knowledgeBase: string;
  tags?: string[];
  source?: string;
  createdAt: string;
}

export interface SearchResult {
  content: string;
  score: number;
  docId: string;
  title: string;
}

// ========== 内存缓存 ==========
interface CacheEntry {
  docs: KnowledgeDoc[];
  loadedAt: number;
}

// 内存缓存：知识库ID -> 文档列表
const memoryCache = new Map<string, CacheEntry>();
// 倒排索引：关键词 -> 包含该词的文档ID列表
const invertedIndex = new Map<string, Set<string>>();
// 文档索引：文档ID -> 文档内容（用于快速查找）
const docIndex = new Map<string, KnowledgeDoc>();
// 缓存是否已初始化
let cacheInitialized = false;

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

// 读取知识库文档（带缓存）
function readKBDocs(knowledgeBase: string): KnowledgeDoc[] {
  const cached = memoryCache.get(knowledgeBase);
  if (cached) {
    return cached.docs;
  }
  
  const filePath = getKBFilePath(knowledgeBase);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    const docs = JSON.parse(data);
    memoryCache.set(knowledgeBase, { docs, loadedAt: Date.now() });
    return docs;
  } catch {
    return [];
  }
}

// 写入知识库文档（并更新缓存）
function writeKBDocs(knowledgeBase: string, docs: KnowledgeDoc[]) {
  ensureDataDir();
  const filePath = getKBFilePath(knowledgeBase);
  fs.writeFileSync(filePath, JSON.stringify(docs, null, 2));
  // 更新内存缓存
  memoryCache.set(knowledgeBase, { docs, loadedAt: Date.now() });
  // 重建倒排索引
  rebuildInvertedIndex();
}

// ========== 倒排索引 ==========

// 从文本中提取关键词（中文分词简化版）
function extractKeywords(text: string): string[] {
  const keywords = new Set<string>();
  const lower = text.toLowerCase();
  
  // 提取长度 >= 2 的连续字符序列作为关键词
  // 对于中文，提取 2-4 字的片段
  const words = lower.split(/[\s,，。！？、；：""''【】《》\(\)\[\]\{\}<>\/\\|`~!@#\$%\^&\*\-=\+_\.?]+/).filter(w => w.length >= 2);
  
  for (const word of words) {
    keywords.add(word);
    // 对于较长的词，也添加其子串（2-3字）
    if (word.length > 3) {
      for (let i = 0; i <= word.length - 2; i++) {
        keywords.add(word.substring(i, i + 2));
        if (word.length > 4) {
          keywords.add(word.substring(i, i + 3));
        }
      }
    }
  }
  
  return Array.from(keywords);
}

// 重建倒排索引
function rebuildInvertedIndex() {
  invertedIndex.clear();
  docIndex.clear();
  
  for (const [, entry] of memoryCache) {
    for (const doc of entry.docs) {
      docIndex.set(doc.id, doc);
      const keywords = extractKeywords(doc.content + " " + doc.title);
      for (const keyword of keywords) {
        if (!invertedIndex.has(keyword)) {
          invertedIndex.set(keyword, new Set());
        }
        invertedIndex.get(keyword)!.add(doc.id);
      }
    }
  }
}

// 初始化缓存（加载所有知识库到内存）
function initCache() {
  if (cacheInitialized) return;
  
  ensureDataDir();
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".json"));
  
  for (const file of files) {
    const kbId = file.replace(".json", "");
    readKBDocs(kbId);
  }
  
  rebuildInvertedIndex();
  cacheInitialized = true;
  console.log(`[KnowledgeCache] 已加载 ${docIndex.size} 个文档到内存，倒排索引 ${invertedIndex.size} 个关键词`);
}

// 使缓存失效（当文件被外部修改时调用）
export function invalidateCache() {
  memoryCache.clear();
  invertedIndex.clear();
  docIndex.clear();
  cacheInitialized = false;
}

/**
 * 添加文档到知识库（支持标签）
 */
export async function addDocuments(
  knowledgeBase: string,
  docs: Array<{ title: string; content: string; tags?: string[]; source?: string }>
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
      tags: doc.tags || [],
      source: doc.source || "",
      createdAt: new Date().toISOString(),
    });
    newDocIds.push(id);
  }

  writeKBDocs(knowledgeBase, existingDocs);
  return newDocIds;
}

/**
 * 搜索知识库 - 使用倒排索引加速
 */
export async function search(
  query: string,
  knowledgeBases?: string[],
  topK: number = 10
): Promise<SearchResult[]> {
  // 确保缓存已初始化
  initCache();
  
  const queryKeywords = extractKeywords(query);
  if (queryKeywords.length === 0) return [];
  
  // 使用倒排索引快速找到候选文档
  const candidateDocIds = new Set<string>();
  for (const keyword of queryKeywords) {
    const docIds = invertedIndex.get(keyword);
    if (docIds) {
      for (const docId of docIds) {
        candidateDocIds.add(docId);
      }
    }
  }
  
  // 如果倒排索引没有找到候选文档，回退到全量扫描
  const candidates = candidateDocIds.size > 0 
    ? Array.from(candidateDocIds).map(id => docIndex.get(id)).filter(Boolean) as KnowledgeDoc[]
    : Array.from(docIndex.values());
  
  // 过滤知识库
  const filteredCandidates = knowledgeBases && knowledgeBases.length > 0
    ? candidates.filter(doc => knowledgeBases.includes(doc.knowledgeBase))
    : candidates;
  
  // 计算相似度
  const results: SearchResult[] = [];
  for (const doc of filteredCandidates) {
    const score = calculateSimilarity(query, doc.content, queryKeywords);
    if (score > 0.1) {
      results.push({
        content: doc.content,
        score,
        docId: doc.id,
        title: doc.title,
      });
    }
  }

  // 按分数排序，返回 top K
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/**
 * 优化的相似度计算（使用预提取的关键词）
 */
function calculateSimilarity(query: string, content: string, queryKeywords?: string[]): number {
  const keywords = queryKeywords || extractKeywords(query);
  if (keywords.length === 0) return 0;
  
  const contentLower = content.toLowerCase();
  let matchCount = 0;
  
  for (const keyword of keywords) {
    if (contentLower.includes(keyword)) {
      matchCount++;
    }
  }
  
  const score = matchCount / keywords.length;
  return score > 0.15 ? score : 0;
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
