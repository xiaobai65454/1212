import fs from "fs";
import path from "path";

export interface KnowledgeDocument {
  id: string;
  title: string;
  knowledgeBase: string;
  type: "text" | "url" | "file";
  createdAt: string;
  preview: string;
  docIds: string[];
}

const STORE_PATH = path.join(process.env.COZE_WORKSPACE_PATH || "/workspace/projects", "data", "knowledge-store.json");

function ensureStoreDir(): void {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readStore(): KnowledgeDocument[] {
  ensureStoreDir();
  if (!fs.existsSync(STORE_PATH)) {
    return [];
  }
  try {
    const data = fs.readFileSync(STORE_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function writeStore(docs: KnowledgeDocument[]): void {
  ensureStoreDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(docs, null, 2), "utf-8");
}

export function addDocument(doc: Omit<KnowledgeDocument, "id" | "createdAt">): KnowledgeDocument {
  const docs = readStore();
  const newDoc: KnowledgeDocument = {
    ...doc,
    id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  docs.unshift(newDoc);
  writeStore(docs);
  return newDoc;
}

export function removeDocument(docId: string): boolean {
  const docs = readStore();
  const filtered = docs.filter(d => d.id !== docId);
  if (filtered.length === docs.length) return false;
  writeStore(filtered);
  return true;
}

export function removeDocumentsByDocIds(docIds: string[]): void {
  const docs = readStore();
  const filtered = docs.filter(d => !d.docIds.some(id => docIds.includes(id)));
  writeStore(filtered);
}

export function getDocumentsByKnowledgeBase(knowledgeBase: string): KnowledgeDocument[] {
  return readStore().filter(d => d.knowledgeBase === knowledgeBase);
}

export function getAllDocuments(): KnowledgeDocument[] {
  return readStore();
}

export function getDocumentById(id: string): KnowledgeDocument | undefined {
  return readStore().find(d => d.id === id);
}
