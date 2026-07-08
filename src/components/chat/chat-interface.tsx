"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { ChatSidebar } from "./chat-sidebar";
import { ChatMessages } from "./chat-messages";
import { ChatInput } from "./chat-input";
import { MobileHeader } from "./mobile-header";

export interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
    isStreaming?: boolean;
    thinkingTime?: number;
}

export interface KnowledgeBase {
    id: string;
    name: string;
    description: string;
    color: string;
    icon: string;
}

const DEFAULT_KNOWLEDGE_BASES: KnowledgeBase[] = [{
    id: "business_basics",
    name: "业务基础知识",
    description: "产品功能、价格体系、适用场景、竞品对比",
    color: "#4A90D9",
    icon: "book"
}, {
    id: "agency_ops",
    name: "代运营知识",
    description: "小红书/抖音运营方法论、内容创作、引流技巧",
    color: "#FF6B4A",
    icon: "megaphone"
}, {
    id: "sales_conversion",
    name: "销售转化知识",
    description: "销售话术、客户跟进、转化技巧、成交策略",
    color: "#4ECDC4",
    icon: "target"
}];

const QUICK_QUESTIONS = ["小红书新手如何快速起号？", "产品价格体系是怎样的？", "客户说太贵了怎么应对？", "抖音短视频怎么提高完播率？"];

export function ChatInterface() {
    // Load messages from localStorage on initial render
    const [messages, setMessages] = useState<Message[]>(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('chat_messages');
                if (saved) {
                    return JSON.parse(saved);
                }
            } catch (e) {
                console.error('[Chat] Failed to load messages from localStorage:', e);
            }
        }
        return [];
    });
    const [inputValue, setInputValue] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [activeKnowledgeBases, setActiveKnowledgeBases] = useState<string[]>(["business_basics", "agency_ops", "sales_conversion"]);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [knowledgeBases] = useState<KnowledgeBase[]>(DEFAULT_KNOWLEDGE_BASES);
    const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>(QUICK_QUESTIONS);
    const abortControllerRef = useRef<AbortController | null>(null);
    const thinkingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Save messages to localStorage whenever they change
    useEffect(() => {
        if (typeof window !== 'undefined' && messages.length > 0) {
            try {
                localStorage.setItem('chat_messages', JSON.stringify(messages));
            } catch (e) {
                console.error('[Chat] Failed to save messages to localStorage:', e);
            }
        }
    }, [messages]);

    const toggleKnowledgeBase = useCallback((id: string) => {
        setActiveKnowledgeBases(prev => prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]);
    }, []);

    const sendMessage = useCallback(async (content: string) => {
        if (!content.trim() || isStreaming)
            return;

        const userMessage: Message = {
            id: generateId(),
            role: "user",
            content: content.trim(),
            timestamp: new Date()
        };

        const assistantMessage: Message = {
            id: generateId(),
            role: "assistant",
            content: "",
            timestamp: new Date(),
            isStreaming: true,
            thinkingTime: 0
        };

        setMessages(prev => [...prev, userMessage, assistantMessage]);
        setInputValue("");
        setIsStreaming(true);
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        // 启动思考计时器
        let thinkingSeconds = 0;
        thinkingTimerRef.current = setInterval(() => {
            thinkingSeconds += 1;
            setMessages(prev => prev.map(m => m.id === assistantMessage.id ? { ...m, thinkingTime: thinkingSeconds } : m));
        }, 1000);

        let accumulated = "";
        try {
            const chatMessages = [...messages, userMessage].map(m => ({
                role: m.role,
                content: m.content
            }));

            const response = await fetch("/api/chat", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    messages: chatMessages,
                    knowledgeBases: activeKnowledgeBases
                }),

                signal: abortController.signal
            });

            if (!response.ok)
                throw new Error("Request failed");

            const reader = response.body?.getReader();

            if (!reader)
                throw new Error("No reader available");

            const decoder = new TextDecoder();
            accumulated = "";
            let firstChunkReceived = false;

            while (true) {
                const {
                    done,
                    value
                } = await reader.read();

                if (done)
                    break;

                const text = decoder.decode(value, {
                    stream: true
                });

                const lines = text.split("\n");

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6);

                        if (data === "[DONE]")
                            continue;

                        try {
                            const parsed = JSON.parse(data);

                            if (parsed.content) {
                                // 收到第一个内容块时停止计时器
                                if (!firstChunkReceived) {
                                    firstChunkReceived = true;
                                    if (thinkingTimerRef.current) {
                                        clearInterval(thinkingTimerRef.current);
                                        thinkingTimerRef.current = null;
                                    }
                                }

                                accumulated += parsed.content;

                                setMessages(prev => prev.map(m => m.id === assistantMessage.id ? {
                                    ...m,
                                    content: accumulated
                                } : m));
                            }

                            if (parsed.error) {
                                if (thinkingTimerRef.current) {
                                    clearInterval(thinkingTimerRef.current);
                                    thinkingTimerRef.current = null;
                                }
                                setMessages(prev => prev.map(m => m.id === assistantMessage.id ? {
                                    ...m,
                                    content: parsed.error
                                } : m));
                            }
                            
                            // Extract suggestions from response
                            if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
                                console.log('[Chat] Received suggestions:', parsed.suggestions);
                                setSuggestedQuestions(parsed.suggestions);
                            }
                        } catch {}
                    }
                }
            }
        } catch (error: unknown) {
            if (thinkingTimerRef.current) {
                clearInterval(thinkingTimerRef.current);
                thinkingTimerRef.current = null;
            }
            if (error instanceof Error && error.name === "AbortError")
                return;

            setMessages(prev => prev.map(m => m.id === assistantMessage.id ? {
                ...m,
                content: "抱歉，网络出现问题，请重试。"
            } : m));
        } finally {
            if (thinkingTimerRef.current) {
                clearInterval(thinkingTimerRef.current);
                thinkingTimerRef.current = null;
            }
            setMessages(prev => prev.map(m => m.id === assistantMessage.id ? {
                ...m,
                isStreaming: false
            } : m));

            setIsStreaming(false);
            abortControllerRef.current = null;

            // 保存回答到历史记录
            if (accumulated && userMessage) {
                fetch("/api/history", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "save",
                        question: userMessage,
                        answer: accumulated,
                    }),
                }).catch(() => {}); // 静默失败
            }
        }
    }, [isStreaming, messages, activeKnowledgeBases]);

    const stopStreaming = useCallback(() => {
        abortControllerRef.current?.abort();
        setIsStreaming(false);

        setMessages(prev => prev.map(m => m.isStreaming ? {
            ...m,
            isStreaming: false
        } : m));
    }, []);

    const clearChat = useCallback(() => {
        setMessages([]);
    }, []);

    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort();
        };
    }, []);

    return (
        <div className="flex h-screen bg-[#F5F0EB] overflow-hidden">
            {}
            <div className="hidden lg:block">
                <ChatSidebar
                    knowledgeBases={knowledgeBases}
                    activeKnowledgeBases={activeKnowledgeBases}
                    onToggleKnowledgeBase={toggleKnowledgeBase}
                    onClearChat={clearChat}
                    messageCount={messages.length} />
            </div>
            {}
            {sidebarOpen && <div className="fixed inset-0 z-50 lg:hidden">
                <div
                    className="absolute inset-0 bg-black/30 backdrop-blur-sm"
                    onClick={() => setSidebarOpen(false)} />
                <div className="relative w-72 h-full">
                    <ChatSidebar
                        knowledgeBases={knowledgeBases}
                        activeKnowledgeBases={activeKnowledgeBases}
                        onToggleKnowledgeBase={toggleKnowledgeBase}
                        onClearChat={clearChat}
                        messageCount={messages.length}
                        onClose={() => setSidebarOpen(false)} />
                </div>
            </div>}
            {}
            <div className="flex-1 flex flex-col min-w-0">
                <MobileHeader onMenuClick={() => setSidebarOpen(true)} />
                {messages.length === 0 ? <WelcomeScreen onQuickQuestion={q => sendMessage(q)} knowledgeBases={knowledgeBases} /> : <ChatMessages messages={messages} isStreaming={isStreaming} />}
                <ChatInput
                    value={inputValue}
                    onChange={setInputValue}
                    onSend={sendMessage}
                    onStop={stopStreaming}
                    isStreaming={isStreaming}
                    quickQuestions={suggestedQuestions} />
            </div>
        </div>
    );
}

function WelcomeScreen(
    {
        onQuickQuestion,
        knowledgeBases
    }: {
        onQuickQuestion: (q: string) => void;
        knowledgeBases: KnowledgeBase[];
    }
) {
    return (
        <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-2xl w-full text-center space-y-8">
                {}
                <div className="flex justify-center">
                    <img
                        src="/bot-avatar.jpg"
                        alt="小白白"
                        className="w-20 h-20 rounded-full object-cover shadow-lg shadow-[#FF6B4A]/20" />
                </div>
                {}
                <div className="space-y-3">
                    <h1 className="text-2xl font-semibold text-[#1A1A2E]">你好，我是小白白
                                  </h1>
                    <p className="text-[#6B7280] text-base leading-relaxed max-w-md mx-auto">你的私人小助手，随时为你解答产品、运营、销售方面的问题</p>
                </div>
                {}
                <div className="flex flex-wrap justify-center gap-3">
                    {knowledgeBases.map(kb => <div
                        key={kb.id}
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-gray-100 shadow-sm">
                        <div
                            className="w-2 h-2 rounded-full"
                            style={{
                                backgroundColor: kb.color
                            }} />
                        <span className="text-sm text-[#4B5563]">{kb.name}</span>
                    </div>)}
                </div>
                {}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto">
                    {QUICK_QUESTIONS.map(q => <button
                        key={q}
                        onClick={() => onQuickQuestion(q)}
                        className="text-left px-4 py-3 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:border-[#FF6B4A]/30 transition-all duration-200 text-sm text-[#374151] hover:text-[#FF6B4A] group">
                        <span className="text-[#9CA3AF] group-hover:text-[#FF6B4A] mr-2">→
                                          </span>
                        {q}
                    </button>)}
                </div>
            </div>
        </div>
    );
}