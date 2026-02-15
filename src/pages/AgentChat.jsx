import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Send, Loader2 } from 'lucide-react';

export default function AgentChat() {
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Initialize conversation
  useEffect(() => {
    const initializeChat = async () => {
      const conversation = await base44.agents.createConversation({
        agent_name: 'customer_support',
        metadata: {
          name: 'Customer Chat',
          description: 'Customer support chat session'
        }
      });
      setConversationId(conversation.id);
      setMessages(conversation.messages || []);
    };

    initializeChat();
  }, []);

  // Subscribe to conversation updates
  useEffect(() => {
    if (!conversationId) return;

    const unsubscribe = base44.agents.subscribeToConversation(conversationId, (data) => {
      setMessages(data.messages);
      setIsLoading(false);
    });

    return unsubscribe;
  }, [conversationId]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !conversationId || isLoading) return;

    const userMessage = inputValue;
    setInputValue('');
    setIsLoading(true);

    const conversation = await base44.agents.getConversation(conversationId);
    await base44.agents.addMessage(conversation, {
      role: 'user',
      content: userMessage
    });
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white">
        <div className="pt-10 pb-2 pr-6 pl-0">
          <img 
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698fc81203f85a20f281d9dc/f2bc037c5_Screenshot2026-02-14160229.png" 
            alt="ALKIMI Logo"
            className="h-12 mb-1"
            style={{ filter: 'invert(1)' }}
          />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-slate-500 mb-2">Start a conversation with our support agent</p>
              <p className="text-xs text-slate-400">Ask about your projects, quotes, or products</p>
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-xl rounded-lg px-4 py-2 ${
                  msg.role === 'user'
                    ? 'bg-slate-800 text-white'
                    : 'bg-white border border-slate-200 text-slate-900'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-lg px-4 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t bg-white p-6">
        <div className="max-w-6xl mx-auto flex gap-3">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Type your message..."
            disabled={isLoading || !conversationId}
            className="flex-1"
          />
          <Button
            size="sm"
            onClick={handleSendMessage}
            disabled={isLoading || !conversationId || !inputValue.trim()}
            style={{ backgroundColor: '#e9ff64', color: '#000' }}
            className="gap-2 text-xs h-8 hover:opacity-90"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}