/**
 * 回答历史记录存储模块
 * 保存每次AI回答，支持相似问题检索，命中时直接返回历史回答
 */

import fs from 'fs';
import path from 'path';

interface HistoryEntry {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  timestamp: number;
  hitCount: number; // 被复用次数
}

const DATA_DIR = process.env.KNOWLEDGE_BASE_PATH || './data/knowledge';
const HISTORY_FILE = path.join(process.cwd(), DATA_DIR, 'response_history.json');

// 确保目录存在
function ensureDir(): void {
  const dir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 读取历史记录
function loadHistory(): HistoryEntry[] {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[ResponseHistory] 加载历史记录失败:', error);
  }
  return [];
}

// 保存历史记录
function saveHistory(entries: HistoryEntry[]): void {
  try {
    ensureDir();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(entries, null, 2), 'utf-8');
  } catch (error) {
    console.error('[ResponseHistory] 保存历史记录失败:', error);
  }
}

// 简单的中文分词（按标点和空格分割，保留2字以上的词）
function tokenize(text: string): string[] {
  return text
    .replace(/[，。！？、；：""''（）【】《》\s\n\r]+/g, ' ')
    .split(' ')
    .map(w => w.trim())
    .filter(w => w.length >= 2);
}

// 计算相似度（Jaccard + 关键词重叠）
function calcSimilarity(q1: string, q2: string): number {
  const tokens1 = new Set(tokenize(q1.toLowerCase()));
  const tokens2 = new Set(tokenize(q2.toLowerCase()));

  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  // Jaccard 相似度
  let intersection = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) intersection++;
  }
  const union = tokens1.size + tokens2.size - intersection;
  const jaccard = union > 0 ? intersection / union : 0;

  // 完全包含加分（短问题被长问题包含）
  const shorter = q1.length < q2.length ? q1 : q2;
  const longer = q1.length < q2.length ? q2 : q1;
  const containsBonus = longer.includes(shorter) ? 0.2 : 0;

  return Math.min(jaccard + containsBonus, 1);
}

// 搜索历史回答
export function searchHistory(question: string, threshold: number = 0.5): HistoryEntry | null {
  const history = loadHistory();
  if (history.length === 0) return null;

  let bestMatch: HistoryEntry | null = null;
  let bestScore = 0;

  for (const entry of history) {
    const score = calcSimilarity(question, entry.question);
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  if (bestMatch) {
    console.log(`[ResponseHistory] 命中历史回答 (相似度: ${bestScore.toFixed(2)}): "${question}" -> "${bestMatch.question}"`);
    // 更新命中次数
    bestMatch.hitCount++;
    saveHistory(history);
  }

  return bestMatch;
}

// 保存回答到历史
export function saveToHistory(question: string, answer: string): void {
  const history = loadHistory();

  const entry: HistoryEntry = {
    id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    question: question.trim(),
    answer: answer.trim(),
    keywords: tokenize(question),
    timestamp: Date.now(),
    hitCount: 0,
  };

  history.push(entry);

  // 限制历史记录数量，保留最近的 500 条
  if (history.length > 500) {
    // 按命中次数和时间的综合排序，保留最有价值的
    history.sort((a, b) => {
      const scoreA = a.hitCount * 10 + (a.timestamp / 1000000000);
      const scoreB = b.hitCount * 10 + (b.timestamp / 1000000000);
      return scoreB - scoreA;
    });
    history.splice(500);
  }

  saveHistory(history);
  console.log(`[ResponseHistory] 已保存回答到历史 (共 ${history.length} 条)`);
}

// 获取历史统计
export function getHistoryStats(): { total: number; totalHits: number; recentEntries: number } {
  const history = loadHistory();
  const totalHits = history.reduce((sum, e) => sum + e.hitCount, 0);
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentEntries = history.filter(e => e.timestamp > oneDayAgo).length;

  return { total: history.length, totalHits, recentEntries };
}

// 清空历史记录
export function clearHistory(): void {
  saveHistory([]);
  console.log('[ResponseHistory] 历史记录已清空');
}
