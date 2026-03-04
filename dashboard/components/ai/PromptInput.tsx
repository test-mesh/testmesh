'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
  const [provider, setProvider] = useState<AIProviderType | ''>('');

  const handleSubmit = () => {
    if (!prompt.trim()) return;
    onSubmit(prompt, {
      provider: provider || undefined,
    });
  };

  const handleExampleClick = (example: string) => {
    setPrompt(example);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="prompt">Describe your test flow</Label>
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
            <Label htmlFor="provider">AI Provider</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as AIProviderType)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Auto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Auto (default)</SelectItem>
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
        <Button
          onClick={handleSubmit}
          disabled={!prompt.trim() || isLoading}
          className="gap-2"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Generate Flow
        </Button>

        {!prompt && (
          <div className="text-sm text-muted-foreground">
            Or try an example:
          </div>
        )}
      </div>

      {!prompt && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((example, idx) => (
            <Button
              key={idx}
              variant="outline"
              size="sm"
              onClick={() => handleExampleClick(example)}
              className="text-xs"
            >
              {example.slice(0, 50)}...
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
