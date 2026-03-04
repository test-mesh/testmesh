'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useCreateIntegration, useUpdateIntegration, useUpdateSecrets, useTestConnection } from '@/lib/hooks/useIntegrations';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { SystemIntegration, IntegrationProvider } from '@/lib/api/integrations';

interface AIProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: IntegrationProvider | null;
  integration?: SystemIntegration | null;
}

interface FormData {
  api_key: string;
  model?: string;
  endpoint?: string;
  temperature?: number;
  max_tokens?: number;
}

type AIProviderType = 'openai' | 'anthropic' | 'local';

const PROVIDER_CONFIG: Record<AIProviderType, {
  name: string;
  models: string[];
  requiresApiKey: boolean;
  requiresEndpoint: boolean;
}> = {
  openai: {
    name: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
    requiresApiKey: true,
    requiresEndpoint: false,
  },
  anthropic: {
    name: 'Anthropic',
    models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-4-20250416', 'claude-3-5-sonnet-20241022'],
    requiresApiKey: true,
    requiresEndpoint: false,
  },
  local: {
    name: 'Local LLM',
    models: ['llama3.1', 'llama3.2', 'mistral', 'codellama', 'custom'],
    requiresApiKey: false,
    requiresEndpoint: true,
  },
};

export function AIProviderDialog({ open, onOpenChange, provider, integration }: AIProviderDialogProps) {
  const createIntegration = useCreateIntegration();
  const updateIntegration = useUpdateIntegration();
  const updateSecrets = useUpdateSecrets();
  const testConnection = useTestConnection();
  const { toast } = useToast();

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      api_key: '',
      model: '',
      endpoint: '',
      temperature: 0.7,
      max_tokens: 4096,
    },
  });

  const isEditing = !!integration;
  const isAIProvider = (p: IntegrationProvider | null): p is AIProviderType => {
    return p === 'openai' || p === 'anthropic' || p === 'local';
  };
  const providerConfig = provider && isAIProvider(provider) ? PROVIDER_CONFIG[provider] : null;

  useEffect(() => {
    if (integration && open) {
      // Populate form with integration data
      setValue('model', integration.config.model || '');
      setValue('endpoint', integration.config.endpoint || '');
      setValue('temperature', integration.config.temperature || 0.7);
      setValue('max_tokens', integration.config.max_tokens || 4096);
      setValue('api_key', ''); // Never pre-fill API key for security
    } else if (open && !isEditing) {
      reset();
    }
  }, [integration, open, isEditing, setValue, reset]);

  const onSubmit = async (data: FormData) => {
    if (!provider || !providerConfig) return;

    try {
      if (isEditing && integration) {
        // Update existing integration
        await updateIntegration.mutateAsync({
          id: integration.id,
          data: {
            config: {
              model: data.model,
              endpoint: data.endpoint,
              temperature: data.temperature,
              max_tokens: data.max_tokens,
            },
          },
        });

        // Update secrets if API key provided
        if (data.api_key) {
          await updateSecrets.mutateAsync({
            id: integration.id,
            data: {
              secrets: { api_key: data.api_key },
            },
          });
        }

        toast({
          title: 'Integration updated',
          description: `${providerConfig.name} configuration has been updated.`,
        });
      } else {
        // Create new integration
        const secrets: Record<string, string> = {};
        if (providerConfig.requiresApiKey && data.api_key) {
          secrets.api_key = data.api_key;
        }

        await createIntegration.mutateAsync({
          name: providerConfig.name,
          type: 'ai_provider',
          provider,
          config: {
            model: data.model,
            endpoint: data.endpoint,
            temperature: data.temperature,
            max_tokens: data.max_tokens,
          },
          secrets,
        });

        toast({
          title: 'Integration created',
          description: `${providerConfig.name} has been configured successfully.`,
        });
      }

      onOpenChange(false);
      reset();
    } catch (error) {
      toast({
        title: 'Failed to save',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleTestConnection = async () => {
    if (!integration) {
      toast({
        title: 'Cannot test',
        description: 'Please save the configuration first before testing.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await testConnection.mutateAsync(integration.id);

      if (result.success) {
        toast({
          title: 'Connection successful',
          description: result.message || 'Provider is configured correctly',
        });
      } else {
        toast({
          title: 'Connection failed',
          description: result.error || 'Failed to connect to provider',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Test failed',
        description: error instanceof Error ? error.message : 'Failed to test connection',
        variant: 'destructive',
      });
    }
  };

  if (!provider || !providerConfig) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Edit' : 'Configure'} {providerConfig.name}
            </DialogTitle>
            <DialogDescription>
              {providerConfig.requiresApiKey
                ? 'Enter your API key and configure the provider settings.'
                : 'Configure the local LLM endpoint and model settings.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {providerConfig.requiresApiKey && (
              <div className="space-y-2">
                <Label htmlFor="api_key">
                  API Key {!isEditing && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  id="api_key"
                  type="password"
                  placeholder={isEditing ? 'Leave empty to keep current key' : 'sk-...'}
                  {...register('api_key', {
                    required: !isEditing && 'API key is required',
                  })}
                />
                {errors.api_key && (
                  <p className="text-sm text-destructive">{errors.api_key.message}</p>
                )}
              </div>
            )}

            {providerConfig.requiresEndpoint && (
              <div className="space-y-2">
                <Label htmlFor="endpoint">
                  Endpoint URL <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="endpoint"
                  type="url"
                  placeholder="http://localhost:11434"
                  {...register('endpoint', {
                    required: 'Endpoint URL is required for local providers',
                  })}
                />
                {errors.endpoint && (
                  <p className="text-sm text-destructive">{errors.endpoint.message}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  For Ollama: http://localhost:11434
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Select
                value={watch('model')}
                onValueChange={(value) => setValue('model', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {providerConfig.models.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="temperature">Temperature</Label>
                <Input
                  id="temperature"
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  {...register('temperature', { valueAsNumber: true })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_tokens">Max Tokens</Label>
                <Input
                  id="max_tokens"
                  type="number"
                  step="1"
                  min="100"
                  max="32000"
                  {...register('max_tokens', { valueAsNumber: true })}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            {isEditing && (
              <Button
                type="button"
                variant="outline"
                onClick={handleTestConnection}
                disabled={testConnection.isPending}
              >
                {testConnection.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Testing...
                  </>
                ) : (
                  'Test Connection'
                )}
              </Button>
            )}
            <Button
              type="submit"
              disabled={createIntegration.isPending || updateIntegration.isPending}
            >
              {(createIntegration.isPending || updateIntegration.isPending) ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
