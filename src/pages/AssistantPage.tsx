import React, { useState } from 'react';
import { Bot, Loader2, Send } from 'lucide-react';
import WorkspaceLayout from '../components/WorkspaceLayout';
import { apiFetch } from '../lib/api';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

const SUGGESTED_PROMPTS = [
  'What organisms were found in my sample?',
  'Explain my biodiversity results.',
  'Which sample has the highest Shannon index?',
  'What is the dominant phylum across my samples?',
  'What are the limitations of this dataset?',
  'Generate a concise research summary of my project findings.',
];

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: 'Hello! I am the EcoDNA AI Scientific Research Assistant. Ask me about your uploaded projects, identified organisms, Shannon/Simpson biodiversity indices, or dataset limitations—my responses are strictly grounded in your verified database records.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sendQuestion = async (questionText: string) => {
    const q = questionText.trim();
    if (!q || loading) return;
    setErrorMsg(null);
    const updatedHistory = [...messages, { role: 'user' as const, text: q }];
    setMessages(updatedHistory);
    setInput('');
    setLoading(true);

    try {
      const res = await apiFetch<{ answer: string }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          question: q,
          history: updatedHistory.slice(-8),
        }),
      });
      setMessages([...updatedHistory, { role: 'assistant', text: res.answer }]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to reach Gemini Assistant');
    } finally {
      setLoading(false);
    }
  };

  return (
    <WorkspaceLayout
      title="Gemini AI Research Assistant"
      subtitle="Grounded scientific interpretation powered by Gemini using only your verified database records"
    >
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Suggested Research Prompts</h2>
            <div className="space-y-2">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => sendQuestion(p)}
                  className="w-full text-left px-3 py-2 text-xs text-slate-700 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-900 border border-slate-200 rounded-lg transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl flex flex-col h-[580px]">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
                <div
                  className={`max-w-[82%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-emerald-700 text-white'
                      : 'bg-slate-50 border border-slate-200 text-slate-800'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
                Analyzing verified biodiversity records...
              </div>
            )}
            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {errorMsg}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendQuestion(input);
            }}
            className="p-4 border-t border-slate-200 flex gap-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your samples, Shannon index, dominant phyla, or methodology..."
              className="flex-1 px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 disabled:opacity-60"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          </form>
        </div>
      </div>
    </WorkspaceLayout>
  );
}
