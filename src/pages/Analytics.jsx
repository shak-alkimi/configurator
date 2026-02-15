import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Send, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

export default function AnalyticsPage() {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    initializeConversation();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const initializeConversation = async () => {
    try {
      const conv = await base44.agents.createConversation({
        agent_name: "analytics_agent",
        metadata: {
          name: "Business Analytics",
          description: "Data analysis and business intelligence"
        }
      });
      setConversation(conv);
      setMessages(conv.messages || []);
    } catch (error) {
      toast.error("Failed to start analytics session");
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !conversation) return;

    const userMessage = input;
    setInput("");
    setLoading(true);

    try {
      await base44.agents.addMessage(conversation, {
        role: "user",
        content: userMessage
      });

      const unsubscribe = base44.agents.subscribeToConversation(
        conversation.id,
        (updatedConv) => {
          setMessages(updatedConv.messages);
        }
      );

      // Give the subscription time to receive updates
      await new Promise(resolve => setTimeout(resolve, 500));
      unsubscribe();
    } catch (error) {
      toast.error("Failed to send message");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="border-b bg-white p-4">
        <div className="max-w-4xl mx-auto flex items-center gap-2">
          <Zap className="h-5 w-5 text-blue-600" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">Business Analytics</h1>
            <p className="text-xs text-slate-500">Ask questions about projects, inventory, and performance</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <Zap className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 text-sm">Ask about your business data</p>
              <div className="mt-4 space-y-2 text-xs text-slate-400">
                <p>Try: "What projects are we working on?"</p>
                <p>Or: "Which products have low inventory?"</p>
                <p>Or: "Show me Q1 revenue trends"</p>
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-2xl rounded-lg px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-slate-800 text-white"
                      : "bg-white border border-slate-200"
                  }`}
                >
                  {msg.role === "user" ? (
                    <p className="text-sm">{msg.content}</p>
                  ) : (
                    <div className="text-sm prose prose-sm prose-slate max-w-none">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="my-1">{children}</p>,
                          ul: ({ children }) => <ul className="my-2 ml-4 list-disc">{children}</ul>,
                          ol: ({ children }) => <ol className="my-2 ml-4 list-decimal">{children}</ol>,
                          li: ({ children }) => <li className="my-0.5">{children}</li>,
                          h1: ({ children }) => <h1 className="font-bold my-2">{children}</h1>,
                          h2: ({ children }) => <h2 className="font-bold my-2">{children}</h2>,
                          code: ({ children }) => (
                            <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">
                              {children}
                            </code>
                          ),
                          table: ({ children }) => (
                            <table className="border-collapse border border-slate-300 text-xs my-2">
                              {children}
                            </table>
                          ),
                          thead: ({ children }) => (
                            <thead className="bg-slate-100">{children}</thead>
                          ),
                          th: ({ children }) => (
                            <th className="border border-slate-300 px-2 py-1">{children}</th>
                          ),
                          td: ({ children }) => (
                            <td className="border border-slate-300 px-2 py-1">{children}</td>
                          ),
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span className="text-xs text-slate-500">Analyzing...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t bg-white p-4">
        <div className="max-w-4xl mx-auto flex gap-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask a question about your business..."
            disabled={loading}
            className="flex-1"
          />
          <Button
            onClick={handleSendMessage}
            disabled={loading || !input.trim()}
            className="gap-2"
            style={{ backgroundColor: "#e9ff64", color: "#000" }}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}