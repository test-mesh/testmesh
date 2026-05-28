'use client';

import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sparkles, Loader2 } from 'lucide-react';
import type { AIProviderType } from '@/lib/api/types';

interface PromptInputProps {
  onSubmit: (prompt: string, options: PromptOptions) => void;
  isLoading?: boolean;
  placeholder?: string;
  providers?: AIProviderType[];
  showOptions?: boolean;
}

interface PromptOptions {
  provider?: AIProviderType;
  model?: string;
}

const EXAMPLE_PROMPTS = [
  'Create a test flow that verifies user registration with email validation',
  'Generate an API test that checks product listing with pagination',
  'Build a flow that tests login, creates an order, and verifies payment',
  'Create a health check test for microservices endpoints',
];

export function PromptInput({
  onSubmit,
  isLoading = false,
  placeholder = 'Describe the test flow you want to create...',
  providers = [],
  showOptions = true,
}: PromptInputProps) {
  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState<AIProviderType | 'auto'>('auto');

  const handleSubmit = () => {
    if (!prompt.trim()) return;
    onSubmit(prompt, {
      provider: provider === 'auto' ? undefined : provider,
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="prompt" className="text-xs">Describe your test flow</Label>
        <Textarea
          id="prompt"
          placeholder={placeholder}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-h-32 resize-none"
          disabled={isLoading}
        />
      </div>

      {showOptions && providers.length > 0 && (
        <div className="flex items-center gap-4">
          <div className="space-y-2">
            <Label htmlFor="provider" className="text-xs">AI Provider</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as AIProviderType | 'auto')}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Auto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (default)</SelectItem>
                {providers.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={handleSubmit}
          disabled={!prompt.trim() || isLoading}
          className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Generate Flow
        </button>

        {!prompt && (
          <span className="text-xs text-[#4a6480]">Or try an example:</span>
        )}
      </div>

      {!prompt && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((example, idx) => (
            <button
              key={idx}
              onClick={() => setPrompt(example)}
              className="h-7 px-2 rounded-lg text-xs border border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
            >
              {example.slice(0, 50)}...
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
