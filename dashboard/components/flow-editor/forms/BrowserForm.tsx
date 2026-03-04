'use client';

import { Chrome, MousePointer, Type, Eye, Camera } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface BrowserFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  className?: string;
}

export default function BrowserForm({
  config,
  onChange,
  className,
}: BrowserFormProps) {
  const actions = (config.actions as any[]) || [];

  const addAction = () => {
    const newAction = { type: 'navigate', url: '' };
    onChange('actions', [...actions, newAction]);
  };

  const updateAction = (index: number, updates: any) => {
    const newActions = [...actions];
    newActions[index] = { ...newActions[index], ...updates };
    onChange('actions', newActions);
  };

  const removeAction = (index: number) => {
    onChange('actions', actions.filter((_, i) => i !== index));
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <Chrome className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-medium">Browser Automation</span>
      </div>

      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
        <p className="text-sm text-blue-900 dark:text-blue-300">
          Automate browser interactions: navigate, click, type, screenshot, and validate page content.
        </p>
      </div>

      {/* Browser Type */}
      <div className="space-y-2">
        <Label htmlFor="browser">Browser</Label>
        <Select
          value={(config.browser as string) || 'chromium'}
          onValueChange={(v) => onChange('browser', v)}
        >
          <SelectTrigger id="browser">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="chromium">Chromium</SelectItem>
            <SelectItem value="firefox">Firefox</SelectItem>
            <SelectItem value="webkit">WebKit (Safari)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Initial URL */}
      <div className="space-y-2">
        <Label htmlFor="url">Initial URL</Label>
        <Input
          id="url"
          value={(config.url as string) || ''}
          onChange={(e) => onChange('url', e.target.value)}
          placeholder="https://example.com"
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Starting URL for the browser session
        </p>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Browser Actions</Label>
          <Button
            variant="ghost"
            size="sm"
            onClick={addAction}
            className="h-6 px-2 text-xs"
          >
            + Add Action
          </Button>
        </div>

        {actions.length === 0 ? (
          <div className="p-4 border rounded-lg bg-muted/30 text-center">
            <p className="text-sm text-muted-foreground">
              No actions configured. Add actions to automate browser interactions.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {actions.map((action, index) => (
              <div key={index} className="p-3 border rounded-lg space-y-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Action {index + 1}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeAction(index)}
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  >
                    ×
                  </Button>
                </div>

                {/* Action Type */}
                <div className="space-y-2">
                  <Label className="text-xs">Action Type</Label>
                  <Select
                    value={action.type || 'navigate'}
                    onValueChange={(v) => updateAction(index, { type: v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="navigate">Navigate to URL</SelectItem>
                      <SelectItem value="click">Click Element</SelectItem>
                      <SelectItem value="type">Type Text</SelectItem>
                      <SelectItem value="select">Select Option</SelectItem>
                      <SelectItem value="wait">Wait for Element</SelectItem>
                      <SelectItem value="screenshot">Take Screenshot</SelectItem>
                      <SelectItem value="assert_text">Assert Text Present</SelectItem>
                      <SelectItem value="assert_visible">Assert Element Visible</SelectItem>
                      <SelectItem value="execute_script">Execute JavaScript</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Action-specific fields */}
                {action.type === 'navigate' && (
                  <div className="space-y-2">
                    <Label className="text-xs">URL</Label>
                    <Input
                      value={action.url || ''}
                      onChange={(e) => updateAction(index, { url: e.target.value })}
                      placeholder="https://example.com/page"
                      className="font-mono text-xs h-7"
                    />
                  </div>
                )}

                {(action.type === 'click' || action.type === 'type' || action.type === 'select' ||
                  action.type === 'wait' || action.type === 'assert_visible') && (
                  <div className="space-y-2">
                    <Label className="text-xs">Selector (CSS or XPath)</Label>
                    <Input
                      value={action.selector || ''}
                      onChange={(e) => updateAction(index, { selector: e.target.value })}
                      placeholder="#submit-button or //button[@type='submit']"
                      className="font-mono text-xs h-7"
                    />
                  </div>
                )}

                {action.type === 'type' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Text to Type</Label>
                    <Input
                      value={action.text || ''}
                      onChange={(e) => updateAction(index, { text: e.target.value })}
                      placeholder="user@example.com"
                      className="font-mono text-xs h-7"
                    />
                  </div>
                )}

                {action.type === 'select' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Option Value</Label>
                    <Input
                      value={action.value || ''}
                      onChange={(e) => updateAction(index, { value: e.target.value })}
                      placeholder="option1"
                      className="font-mono text-xs h-7"
                    />
                  </div>
                )}

                {action.type === 'wait' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Timeout</Label>
                    <Input
                      value={action.timeout || '5s'}
                      onChange={(e) => updateAction(index, { timeout: e.target.value })}
                      placeholder="5s"
                      className="font-mono text-xs h-7"
                    />
                  </div>
                )}

                {action.type === 'screenshot' && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs">Filename</Label>
                      <Input
                        value={action.filename || ''}
                        onChange={(e) => updateAction(index, { filename: e.target.value })}
                        placeholder="screenshot-${timestamp}.png"
                        className="font-mono text-xs h-7"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Full Page</Label>
                      <Switch
                        checked={action.full_page ?? false}
                        onCheckedChange={(checked) => updateAction(index, { full_page: checked })}
                      />
                    </div>
                  </>
                )}

                {action.type === 'assert_text' && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs">Expected Text</Label>
                      <Input
                        value={action.text || ''}
                        onChange={(e) => updateAction(index, { text: e.target.value })}
                        placeholder="Welcome back"
                        className="font-mono text-xs h-7"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Selector (Optional)</Label>
                      <Input
                        value={action.selector || ''}
                        onChange={(e) => updateAction(index, { selector: e.target.value })}
                        placeholder="Leave empty to search entire page"
                        className="font-mono text-xs h-7"
                      />
                    </div>
                  </>
                )}

                {action.type === 'execute_script' && (
                  <div className="space-y-2">
                    <Label className="text-xs">JavaScript Code</Label>
                    <Textarea
                      value={action.script || ''}
                      onChange={(e) => updateAction(index, { script: e.target.value })}
                      placeholder="return document.title;"
                      rows={3}
                      className="font-mono text-xs"
                    />
                  </div>
                )}

                {/* Delay after action */}
                <div className="space-y-2">
                  <Label className="text-xs">Delay After Action</Label>
                  <Input
                    value={action.delay || '0s'}
                    onChange={(e) => updateAction(index, { delay: e.target.value })}
                    placeholder="0s"
                    className="font-mono text-xs h-7"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Browser Options */}
      <details className="space-y-3 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer">
          Browser Options
        </summary>
        <div className="pt-3 space-y-3">
          {/* Headless */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Headless Mode</Label>
              <p className="text-xs text-muted-foreground">
                Run browser without GUI
              </p>
            </div>
            <Switch
              checked={(config.headless as boolean) ?? true}
              onCheckedChange={(checked) => onChange('headless', checked)}
            />
          </div>

          {/* Viewport */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label className="text-xs">Width</Label>
              <Input
                type="number"
                value={(config.viewport_width as number) || 1280}
                onChange={(e) => onChange('viewport_width', parseInt(e.target.value))}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Height</Label>
              <Input
                type="number"
                value={(config.viewport_height as number) || 720}
                onChange={(e) => onChange('viewport_height', parseInt(e.target.value))}
                className="h-7 text-xs"
              />
            </div>
          </div>

          {/* User Agent */}
          <div className="space-y-2">
            <Label className="text-xs">User Agent (Optional)</Label>
            <Input
              value={(config.user_agent as string) || ''}
              onChange={(e) => onChange('user_agent', e.target.value)}
              placeholder="Leave empty for default"
              className="font-mono text-xs h-7"
            />
          </div>

          {/* Timeout */}
          <div className="space-y-2">
            <Label className="text-xs">Default Timeout</Label>
            <Input
              value={(config.timeout as string) || '30s'}
              onChange={(e) => onChange('timeout', e.target.value)}
              placeholder="30s"
              className="font-mono text-xs h-7"
            />
          </div>
        </div>
      </details>

      {/* Examples */}
      <details className="space-y-2 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer">
          Example Use Cases
        </summary>
        <div className="pt-2 space-y-3 text-xs">
          <div>
            <p className="font-medium mb-1">1. Login Flow Test</p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>1. Navigate: https://app.example.com/login</div>
              <div>2. Type: #email → user@example.com</div>
              <div>3. Type: #password → password123</div>
              <div>4. Click: #login-button</div>
              <div>5. Assert Text: "Welcome back"</div>
            </div>
          </div>

          <div>
            <p className="font-medium mb-1">2. E2E Purchase Flow</p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>1. Navigate to product page</div>
              <div>2. Click: Add to cart</div>
              <div>3. Navigate to checkout</div>
              <div>4. Fill form fields</div>
              <div>5. Screenshot: confirmation page</div>
              <div>6. Assert: Order number present</div>
            </div>
          </div>

          <div>
            <p className="font-medium mb-1">3. Visual Regression</p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>1. Navigate to page</div>
              <div>2. Wait for: .content-loaded</div>
              <div>3. Screenshot: full_page=true</div>
              <div>4. Compare with baseline</div>
            </div>
          </div>
        </div>
      </details>

      {/* Output Info */}
      <div className="p-3 bg-muted/30 border rounded-lg space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Camera className="h-4 w-4" />
          Output Format
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <div>• <span className="font-mono">screenshots</span> - Array of screenshot paths</div>
          <div>• <span className="font-mono">page_title</span> - Final page title</div>
          <div>• <span className="font-mono">page_url</span> - Final page URL</div>
          <div>• <span className="font-mono">script_results</span> - Results from execute_script actions</div>
        </div>
      </div>
    </div>
  );
}
