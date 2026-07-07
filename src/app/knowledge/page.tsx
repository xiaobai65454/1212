"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Megaphone,
  Target,
  Plus,
  Upload,
  Link as LinkIcon,
  FileText,
  Trash2,
  Search,
  RefreshCw,
  Database,
  FileCheck,
  Clock,
  ChevronRight,
  X,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ===== Types =====
interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  documentCount: number;
}

interface DocRecord {
  id: string;
  title: string;
  knowledgeBase: string;
  knowledgeBaseName: string;
  type: "text" | "url" | "file";
  createdAt: string;
  preview: string;
}

// ===== Constants =====
const KB_CONFIG: Record<string, { name: string; color: string; icon: React.ReactNode; description: string }> = {
  business_basics: {
    name: "业务基础知识",
    color: "#4A90D9",
    icon: <BookOpen className="w-4 h-4" />,
    description: "产品功能、价格体系、适用场景、竞品对比等核心业务知识",
  },
  agency_ops: {
    name: "代运营知识",
    color: "#FF6B4A",
    icon: <Megaphone className="w-4 h-4" />,
    description: "小红书/抖音运营方法论、内容创作、引流技巧、账号运营策略",
  },
  sales_conversion: {
    name: "销售转化知识",
    color: "#4ECDC4",
    icon: <Target className="w-4 h-4" />,
    description: "销售话术、客户跟进、转化技巧、成交策略、团队协作规范",
  },
};

const ACCEPTED_FILE_TYPES = ".pdf,.doc,.docx,.txt,.md,.csv";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// ===== Main Page =====
export default function KnowledgePage() {
  const [activeTab, setActiveTab] = useState<"overview" | string>("overview");
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [documents, setDocuments] = useState<DocRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [kbRes, docsRes] = await Promise.all([
        fetch("/api/knowledge/manage"),
        fetch("/api/knowledge/manage?docs=true"),
      ]);
      const kbData = await kbRes.json();
      const docsData = await docsRes.json();

      if (kbData.success) setKnowledgeBases(kbData.knowledgeBases);
      if (docsData.success) setDocuments(docsData.documents);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredDocs = documents.filter((doc) => {
    const matchesSearch =
      !searchQuery ||
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.preview.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === "overview" || doc.knowledgeBase === activeTab;
    return matchesSearch && matchesTab;
  });

  const totalDocs = documents.length;

  return (
    <div className="min-h-screen bg-[#F5F0EB]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-gray-500 hover:text-[#FF6B4A] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">返回对话</span>
            </Link>
            <div className="h-6 w-px bg-gray-200" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF6B4A] to-[#FF8B6B] flex items-center justify-center">
                <Database className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-[#1A1A2E]">知识库管理系统</h1>
                <p className="text-xs text-gray-500">管理小白白的知识储备</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              title="刷新"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#FF6B4A] text-white rounded-lg hover:bg-[#FF5A3A] transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm font-medium">添加知识</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {knowledgeBases.map((kb) => {
            const config = KB_CONFIG[kb.id];
            return (
              <button
                key={kb.id}
                onClick={() => setActiveTab(activeTab === kb.id ? "overview" : kb.id)}
                className={cn(
                  "bg-white rounded-xl p-4 border-2 transition-all text-left",
                  activeTab === kb.id
                    ? "border-current shadow-md"
                    : "border-transparent shadow-sm hover:shadow-md"
                )}
                style={activeTab === kb.id ? { borderColor: config?.color } : undefined}
              >
                <div className="flex items-center justify-between mb-2">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                    style={{ backgroundColor: config?.color }}
                  >
                    {config?.icon}
                  </div>
                  <span className="text-2xl font-bold text-[#1A1A2E]">{kb.documentCount}</span>
                </div>
                <h3 className="font-medium text-[#1A1A2E]">{kb.name}</h3>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{kb.description}</p>
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div className="bg-white rounded-xl shadow-sm">
          {/* Toolbar */}
          <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-[#1A1A2E]">
                {activeTab === "overview" ? "全部文档" : KB_CONFIG[activeTab]?.name}
              </h2>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {filteredDocs.length} 篇
              </span>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜索文档..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B4A]/20 focus:border-[#FF6B4A]"
              />
            </div>
          </div>

          {/* Document List */}
          {loading ? (
            <div className="p-12 text-center text-gray-400">
              <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
              <p className="text-sm">加载中...</p>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-500 mb-1">
                {searchQuery ? "没有找到匹配的文档" : "暂无文档"}
              </p>
              <p className="text-xs text-gray-400">
                {searchQuery ? "试试其他关键词" : "点击右上角「添加知识」开始构建知识库"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filteredDocs.map((doc) => {
                const kbConfig = KB_CONFIG[doc.knowledgeBase];
                return (
                  <div
                    key={doc.id}
                    className="px-4 sm:px-6 py-4 hover:bg-gray-50/50 transition-colors group"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                        style={{ backgroundColor: `${kbConfig?.color}15` }}
                      >
                        {doc.type === "file" ? (
                          <Upload className="w-4 h-4" style={{ color: kbConfig?.color }} />
                        ) : doc.type === "url" ? (
                          <LinkIcon className="w-4 h-4" style={{ color: kbConfig?.color }} />
                        ) : (
                          <FileText className="w-4 h-4" style={{ color: kbConfig?.color }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-medium text-[#1A1A2E] truncate">
                            {doc.title}
                          </h4>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                            style={{
                              backgroundColor: `${kbConfig?.color}15`,
                              color: kbConfig?.color,
                            }}
                          >
                            {doc.knowledgeBaseName}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 line-clamp-2 mb-1.5">{doc.preview}</p>
                        <div className="flex items-center gap-3 text-[11px] text-gray-400">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(doc.createdAt).toLocaleString("zh-CN")}
                          </span>
                          <span
                            className="px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor:
                                doc.type === "file"
                                  ? "#8B5CF615"
                                  : doc.type === "url"
                                    ? "#3B82F615"
                                    : "#10B98115",
                              color:
                                doc.type === "file"
                                  ? "#8B5CF6"
                                  : doc.type === "url"
                                    ? "#3B82F6"
                                    : "#10B981",
                            }}
                          >
                            {doc.type === "file" ? "文件上传" : doc.type === "url" ? "URL 导入" : "文本输入"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tips Section */}
        <div className="mt-6 bg-white rounded-xl p-4 sm:p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-[#1A1A2E] mb-3">使用指南</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <h4 className="text-xs font-medium text-[#1A1A2E] mb-0.5">文本输入</h4>
                <p className="text-[11px] text-gray-500">粘贴 FAQ、话术、操作手册，支持 Markdown</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <LinkIcon className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h4 className="text-xs font-medium text-[#1A1A2E] mb-0.5">URL 导入</h4>
                <p className="text-[11px] text-gray-500">输入在线文档链接，自动抓取学习内容</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                <Upload className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <h4 className="text-xs font-medium text-[#1A1A2E] mb-0.5">文档上传</h4>
                <p className="text-[11px] text-gray-500">支持 PDF/Word/TXT/MD/CSV，自动解析内容</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <AddKnowledgeModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchData();
          }}
          defaultKB={activeTab !== "overview" ? activeTab : undefined}
        />
      )}
    </div>
  );
}

// ===== Add Knowledge Modal =====
function AddKnowledgeModal({
  onClose,
  onSuccess,
  defaultKB,
}: {
  onClose: () => void;
  onSuccess: () => void;
  defaultKB?: string;
}) {
  const [mode, setMode] = useState<"text" | "url" | "file">("text");
  const [selectedKB, setSelectedKB] = useState(defaultKB || "business_basics");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("请输入标题");
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (mode === "file" && file) {
        // File upload
        const formData = new FormData();
        formData.append("file", file);
        formData.append("knowledgeBase", selectedKB);
        formData.append("title", title);

        const res = await fetch("/api/knowledge/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "上传失败");
      } else if (mode === "url") {
        if (!url.trim()) {
          setError("请输入 URL");
          setLoading(false);
          return;
        }
        const res = await fetch("/api/knowledge/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            knowledgeBase: selectedKB,
            type: "url",
            title,
            url,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "导入失败");
      } else {
        if (!content.trim()) {
          setError("请输入内容");
          setLoading(false);
          return;
        }
        const res = await fetch("/api/knowledge/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            knowledgeBase: selectedKB,
            type: "text",
            title,
            content,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "添加失败");
      }

      setSuccess(true);
      setTimeout(onSuccess, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-lg font-semibold text-[#1A1A2E]">添加知识</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
            <p className="text-base font-medium text-[#1A1A2E]">添加成功</p>
            <p className="text-sm text-gray-500 mt-1">知识已入库，小白白可以学习了</p>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {/* Mode Selector */}
            <div className="flex gap-2">
              {[
                { key: "text" as const, label: "文本输入", icon: <FileText className="w-4 h-4" /> },
                { key: "url" as const, label: "URL 导入", icon: <LinkIcon className="w-4 h-4" /> },
                { key: "file" as const, label: "文档上传", icon: <Upload className="w-4 h-4" /> },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setMode(item.key)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all",
                    mode === item.key
                      ? "bg-[#FF6B4A] text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>

            {/* Knowledge Base Selector */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">目标知识库</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(KB_CONFIG).map(([id, config]) => (
                  <button
                    key={id}
                    onClick={() => setSelectedKB(id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all border",
                      selectedKB === id
                        ? "border-current shadow-sm"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    )}
                    style={selectedKB === id ? { color: config.color, borderColor: config.color, backgroundColor: `${config.color}08` } : undefined}
                  >
                    {config.icon}
                    <span className="truncate">{config.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">标题</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="输入文档标题"
                className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B4A]/20 focus:border-[#FF6B4A]"
              />
            </div>

            {/* Content based on mode */}
            {mode === "text" && (
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">内容（支持 Markdown）</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="粘贴或输入文档内容...&#10;&#10;支持 Markdown 格式：&#10;# 标题&#10;## 二级标题&#10;- 列表项&#10;**加粗**"
                  rows={8}
                  className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B4A]/20 focus:border-[#FF6B4A] resize-none"
                />
              </div>
            )}

            {mode === "url" && (
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">URL 地址</label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/document"
                  className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B4A]/20 focus:border-[#FF6B4A]"
                />
                <p className="text-[11px] text-gray-400 mt-1">系统会自动抓取网页内容并学习</p>
              </div>
            )}

            {mode === "file" && (
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">上传文件</label>
                <div
                  className={cn(
                    "border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
                    file ? "border-[#FF6B4A] bg-[#FF6B4A]/5" : "border-gray-200 hover:border-gray-300"
                  )}
                  onClick={() => document.getElementById("file-input")?.click()}
                >
                  {file ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileCheck className="w-5 h-5 text-[#FF6B4A]" />
                      <span className="text-sm text-[#1A1A2E] font-medium">{file.name}</span>
                      <span className="text-xs text-gray-400">
                        ({(file.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm text-gray-500">点击或拖拽文件到此处</p>
                      <p className="text-xs text-gray-400 mt-1">支持 PDF/Word/TXT/MD/CSV，最大 10MB</p>
                    </>
                  )}
                  <input
                    id="file-input"
                    type="file"
                    accept={ACCEPTED_FILE_TYPES}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        if (f.size > MAX_FILE_SIZE) {
                          setError("文件大小不能超过 10MB");
                          return;
                        }
                        setFile(f);
                        setError("");
                      }
                    }}
                  />
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={loading}
              className={cn(
                "w-full py-2.5 rounded-lg text-sm font-medium transition-all",
                loading
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-[#FF6B4A] text-white hover:bg-[#FF5A3A] shadow-sm"
              )}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  处理中...
                </span>
              ) : (
                "添加到知识库"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
