"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";

interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
}

type InputType = "text" | "url" | "file";
type DocType = "text" | "url" | "file";

interface AddedDoc {
  id: string;
  knowledgeBase: string;
  type: DocType;
  title: string;
  content: string;
  createdAt: Date;
  docIds?: string[];
}

const KNOWLEDGE_BASES: KnowledgeBase[] = [
  {
    id: "business_basics",
    name: "业务基础知识",
    description: "产品功能、价格体系、适用场景、竞品对比",
    color: "#4A90D9",
    icon: "book",
  },
  {
    id: "agency_ops",
    name: "代运营知识",
    description: "小红书/抖音运营方法论、内容创作、引流技巧",
    color: "#FF6B4A",
    icon: "megaphone",
  },
  {
    id: "sales_conversion",
    name: "销售转化知识",
    description: "销售话术、客户跟进、转化技巧、成交策略",
    color: "#4ECDC4",
    icon: "target",
  },
];

const ALLOWED_EXTENSIONS = [".txt", ".md", ".pdf", ".docx", ".doc", ".csv"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("business_basics");
  const [inputType, setInputType] = useState<InputType>("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [addedDocs, setAddedDocs] = useState<AddedDoc[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeKB = KNOWLEDGE_BASES.find((kb) => kb.id === activeTab)!;

  const handleFileSelect = useCallback((file: File) => {
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setSubmitMessage({
        type: "error",
        text: `不支持的格式: ${ext}，支持 ${ALLOWED_EXTENSIONS.join(", ")}`,
      });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setSubmitMessage({
        type: "error",
        text: `文件大小超过限制（最大 ${MAX_FILE_SIZE / 1024 / 1024}MB）`,
      });
      return;
    }
    setSelectedFile(file);
    setSubmitMessage(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (inputType === "text" && !content.trim()) {
      setSubmitMessage({ type: "error", text: "请输入知识内容" });
      return;
    }
    if (inputType === "url" && !url.trim()) {
      setSubmitMessage({ type: "error", text: "请输入URL地址" });
      return;
    }
    if (inputType === "file" && !selectedFile) {
      setSubmitMessage({ type: "error", text: "请选择要上传的文件" });
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage(null);

    try {
      let res: Response;

      if (inputType === "file" && selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("knowledgeBase", activeTab);
        if (title.trim()) formData.append("title", title.trim());

        res = await fetch("/api/knowledge/upload", {
          method: "POST",
          body: formData,
        });
      } else {
        const body =
          inputType === "url"
            ? { knowledgeBase: activeTab, type: "url", url: url.trim() }
            : { knowledgeBase: activeTab, type: "text", content: content.trim(), title: title.trim() || undefined };

        res = await fetch("/api/knowledge/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      const data = await res.json();

      if (data.success) {
        const docTitle =
          inputType === "file"
            ? selectedFile?.name.replace(/\.[^.]+$/, "") || "上传文件"
            : inputType === "url"
              ? url.trim()
              : title.trim() || "未命名文档";

        const docContent =
          inputType === "file"
            ? `文件: ${selectedFile?.name} (${(selectedFile?.size || 0 / 1024).toFixed(1)}KB)`
            : inputType === "url"
              ? url.trim()
              : content.trim().slice(0, 100) + (content.trim().length > 100 ? "..." : "");

        setSubmitMessage({ type: "success", text: data.message || "知识添加成功！智能体已学习新知识" });
        setAddedDocs((prev) => [
          {
            id: `doc_${Date.now()}`,
            knowledgeBase: activeTab,
            type: inputType as DocType,
            title: docTitle,
            content: docContent,
            createdAt: new Date(),
            docIds: data.docIds,
          },
          ...prev,
        ]);
        setTitle("");
        setContent("");
        setUrl("");
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else {
        setSubmitMessage({ type: "error", text: data.error || "添加失败" });
      }
    } catch {
      setSubmitMessage({ type: "error", text: "网络错误，请重试" });
    } finally {
      setIsSubmitting(false);
    }
  }, [activeTab, inputType, content, url, title, selectedFile]);

  const filteredDocs = addedDocs.filter((d) => d.knowledgeBase === activeTab);

  const getTypeLabel = (type: DocType) => {
    switch (type) {
      case "url": return "URL";
      case "file": return "文件";
      default: return "文本";
    }
  };

  const getTypeColor = (type: DocType) => {
    switch (type) {
      case "url": return "bg-blue-50 text-blue-600";
      case "file": return "bg-purple-50 text-purple-600";
      default: return "bg-orange-50 text-orange-600";
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F0EB]">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-[#6B7280] hover:text-[#FF6B4A] transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5" />
                <path d="M12 19l-7-7 7-7" />
              </svg>
              <span className="text-sm">返回对话</span>
            </Link>
            <div className="w-px h-5 bg-gray-200" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FF6B4A] to-[#FF8A6A] flex items-center justify-center">
                <span className="text-sm">🐾</span>
              </div>
              <div>
                <h1 className="text-base font-semibold text-[#1A1A2E]">知识库管理</h1>
                <p className="text-xs text-[#9CA3AF]">管理小白白的知识，让它越来越聪明</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Knowledge Base Tabs */}
        <div className="flex gap-3 mb-8 overflow-x-auto pb-2">
          {KNOWLEDGE_BASES.map((kb) => (
            <button
              key={kb.id}
              onClick={() => { setActiveTab(kb.id); setSubmitMessage(null); }}
              className={`flex items-center gap-3 px-5 py-3 rounded-xl border transition-all duration-200 whitespace-nowrap ${
                activeTab === kb.id
                  ? "bg-white border-gray-200 shadow-sm"
                  : "bg-transparent border-transparent hover:bg-white/50"
              }`}
            >
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: kb.color }}
              />
              <div className="text-left">
                <p className={`text-sm font-medium ${activeTab === kb.id ? "text-[#1A1A2E]" : "text-[#6B7280]"}`}>
                  {kb.name}
                </p>
                <p className="text-xs text-[#9CA3AF] hidden sm:block">{kb.description}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Add Knowledge Form */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50">
                <h2 className="text-base font-semibold text-[#1A1A2E]">
                  添加知识到「{activeKB.name}」
                </h2>
              </div>

              <div className="p-6 space-y-5">
                {/* Input Type Toggle */}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setInputType("text"); setSubmitMessage(null); }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      inputType === "text"
                        ? "bg-[#FF6B4A] text-white shadow-sm"
                        : "bg-gray-50 text-[#6B7280] hover:bg-gray-100"
                    }`}
                  >
                    文本输入
                  </button>
                  <button
                    onClick={() => { setInputType("url"); setSubmitMessage(null); }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      inputType === "url"
                        ? "bg-[#FF6B4A] text-white shadow-sm"
                        : "bg-gray-50 text-[#6B7280] hover:bg-gray-100"
                    }`}
                  >
                    URL 导入
                  </button>
                  <button
                    onClick={() => { setInputType("file"); setSubmitMessage(null); }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      inputType === "file"
                        ? "bg-[#FF6B4A] text-white shadow-sm"
                        : "bg-gray-50 text-[#6B7280] hover:bg-gray-100"
                    }`}
                  >
                    文档上传
                  </button>
                </div>

                {/* Title (for text and file) */}
                {inputType !== "url" && (
                  <div>
                    <label className="block text-sm font-medium text-[#374151] mb-1.5">
                      标题（可选）
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={inputType === "file" ? "留空则使用文件名" : "给这份知识起个名字"}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-[#1A1A2E] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#FF6B4A]/40 focus:ring-2 focus:ring-[#FF6B4A]/10 transition-all"
                    />
                  </div>
                )}

                {/* Text Input */}
                {inputType === "text" && (
                  <div>
                    <label className="block text-sm font-medium text-[#374151] mb-1.5">
                      知识内容 <span className="text-[#FF6B4A]">*</span>
                    </label>
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder={"支持 Markdown 格式，可以包含标题、列表、表格等...\n\n示例：\n## 产品功能介绍\n1. 客户管理：支持客户分级、跟进记录\n2. 内容工具：一键生成文案、图片模板"}
                      rows={10}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-[#1A1A2E] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#FF6B4A]/40 focus:ring-2 focus:ring-[#FF6B4A]/10 transition-all resize-none leading-relaxed font-mono"
                    />
                    <p className="mt-1.5 text-xs text-[#9CA3AF]">
                      内容越详细，小白白回答越准确。建议使用结构化格式（标题 + 列表）
                    </p>
                  </div>
                )}

                {/* URL Input */}
                {inputType === "url" && (
                  <div>
                    <label className="block text-sm font-medium text-[#374151] mb-1.5">
                      文档链接 <span className="text-[#FF6B4A]">*</span>
                    </label>
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://example.com/document"
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-[#1A1A2E] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#FF6B4A]/40 focus:ring-2 focus:ring-[#FF6B4A]/10 transition-all"
                    />
                    <p className="mt-1.5 text-xs text-[#9CA3AF]">
                      支持在线文档链接，小白白会自动抓取并学习内容
                    </p>
                  </div>
                )}

                {/* File Upload */}
                {inputType === "file" && (
                  <div>
                    <label className="block text-sm font-medium text-[#374151] mb-1.5">
                      上传文档 <span className="text-[#FF6B4A]">*</span>
                    </label>
                    <div
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onClick={() => fileInputRef.current?.click()}
                      className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
                        isDragging
                          ? "border-[#FF6B4A] bg-[#FF6B4A]/5"
                          : selectedFile
                            ? "border-green-300 bg-green-50/50"
                            : "border-gray-200 hover:border-[#FF6B4A]/40 hover:bg-[#FF6B4A]/5"
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={ALLOWED_EXTENSIONS.join(",")}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileSelect(file);
                        }}
                        className="hidden"
                      />

                      {selectedFile ? (
                        <div className="space-y-2">
                          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <path d="M14 2v6h6" />
                              <path d="M9 15l2 2 4-4" />
                            </svg>
                          </div>
                          <p className="text-sm font-medium text-[#1A1A2E]">{selectedFile.name}</p>
                          <p className="text-xs text-[#9CA3AF]">
                            {(selectedFile.size / 1024).toFixed(1)} KB
                          </p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFile(null);
                              if (fileInputRef.current) fileInputRef.current.value = "";
                            }}
                            className="text-xs text-[#FF6B4A] hover:underline"
                          >
                            重新选择
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mx-auto">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="17 8 12 3 7 8" />
                              <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                          </div>
                          <p className="text-sm text-[#374151]">
                            点击或拖拽文件到此处上传
                          </p>
                          <p className="text-xs text-[#9CA3AF]">
                            支持 PDF、Word、TXT、Markdown、CSV，最大 10MB
                          </p>
                        </div>
                      )}
                    </div>
                    <p className="mt-1.5 text-xs text-[#9CA3AF]">
                      上传后系统会自动解析文档内容，小白白将学习其中的知识
                    </p>
                  </div>
                )}

                {/* Submit Message */}
                {submitMessage && (
                  <div
                    className={`px-4 py-3 rounded-xl text-sm ${
                      submitMessage.type === "success"
                        ? "bg-green-50 text-green-700 border border-green-100"
                        : "bg-red-50 text-red-700 border border-red-100"
                    }`}
                  >
                    {submitMessage.text}
                  </div>
                )}

                {/* Submit Button */}
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl bg-[#FF6B4A] text-white text-sm font-medium hover:bg-[#E55A3A] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {inputType === "file" ? "正在解析并学习..." : "正在学习..."}
                    </span>
                  ) : (
                    inputType === "file" ? "上传并学习" : "添加知识"
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Recent Additions */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50">
                <h2 className="text-base font-semibold text-[#1A1A2E]">
                  最近添加
                </h2>
                <p className="text-xs text-[#9CA3AF] mt-0.5">
                  当前知识库：{activeKB.name}
                </p>
              </div>

              <div className="p-4">
                {filteredDocs.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                        <path d="M12 18v-6" />
                        <path d="M9 15h6" />
                      </svg>
                    </div>
                    <p className="text-sm text-[#9CA3AF]">暂无添加记录</p>
                    <p className="text-xs text-[#C4C8CF] mt-1">添加知识后，会显示在这里</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto">
                    {filteredDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="p-3 rounded-xl bg-gray-50 border border-gray-100"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${getTypeColor(doc.type)}`}>
                                {getTypeLabel(doc.type)}
                              </span>
                              <span className="text-sm font-medium text-[#1A1A2E] truncate">
                                {doc.title}
                              </span>
                            </div>
                            {doc.content && (
                              <p className="text-xs text-[#6B7280] mt-1.5 line-clamp-2">
                                {doc.content}
                              </p>
                            )}
                            <p className="text-xs text-[#9CA3AF] mt-1.5">
                              {doc.createdAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Tips */}
            <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-[#1A1A2E] mb-3">使用技巧</h3>
              <ul className="space-y-2.5 text-xs text-[#6B7280] leading-relaxed">
                <li className="flex gap-2">
                  <span className="text-[#FF6B4A] flex-shrink-0">1.</span>
                  <span><strong className="text-[#374151]">文档上传</strong>：支持 PDF、Word、TXT、Markdown、CSV 格式</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-[#FF6B4A] flex-shrink-0">2.</span>
                  <span>内容建议用<strong className="text-[#374151]">标题 + 列表</strong>格式，小白白理解更准确</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-[#FF6B4A] flex-shrink-0">3.</span>
                  <span>每份知识聚焦一个主题，避免内容过于混杂</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-[#FF6B4A] flex-shrink-0">4.</span>
                  <span>可以粘贴完整的<strong className="text-[#374151]">FAQ、话术脚本、操作手册</strong></span>
                </li>
                <li className="flex gap-2">
                  <span className="text-[#FF6B4A] flex-shrink-0">5.</span>
                  <span>URL 导入适合在线文档、帮助页面等公开链接</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
