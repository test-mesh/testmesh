package actions

import (
	"context"
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	"github.com/chromedp/chromedp"
)

// BrowserAction handles browser automation actions
type BrowserAction struct {
	ctx        context.Context
	cancel     context.CancelFunc
	allocCtx   context.Context
	allocCancel context.CancelFunc
}

// BrowserConfig defines browser action configuration
type BrowserConfig struct {
	Action      string            `yaml:"action" json:"action"`
	URL         string            `yaml:"url,omitempty" json:"url,omitempty"`
	Selector    string            `yaml:"selector,omitempty" json:"selector,omitempty"`
	Text        string            `yaml:"text,omitempty" json:"text,omitempty"`
	Value       string            `yaml:"value,omitempty" json:"value,omitempty"`
	Attribute   string            `yaml:"attribute,omitempty" json:"attribute,omitempty"`
	Script      string            `yaml:"script,omitempty" json:"script,omitempty"`
	Timeout     string            `yaml:"timeout,omitempty" json:"timeout,omitempty"`
	Headless    bool              `yaml:"headless,omitempty" json:"headless,omitempty"`
	Screenshot  bool              `yaml:"screenshot,omitempty" json:"screenshot,omitempty"`
	FullPage    bool              `yaml:"full_page,omitempty" json:"full_page,omitempty"`
	WaitFor     string            `yaml:"wait_for,omitempty" json:"wait_for,omitempty"`
	Cookies     []CookieConfig    `yaml:"cookies,omitempty" json:"cookies,omitempty"`
	Headers     map[string]string `yaml:"headers,omitempty" json:"headers,omitempty"`
	Viewport    *ViewportConfig   `yaml:"viewport,omitempty" json:"viewport,omitempty"`
}

// CookieConfig defines a cookie to set
type CookieConfig struct {
	Name   string `yaml:"name" json:"name"`
	Value  string `yaml:"value" json:"value"`
	Domain string `yaml:"domain,omitempty" json:"domain,omitempty"`
	Path   string `yaml:"path,omitempty" json:"path,omitempty"`
}

// ViewportConfig defines viewport settings
type ViewportConfig struct {
	Width  int `yaml:"width" json:"width"`
	Height int `yaml:"height" json:"height"`
}

// BrowserResult holds the result of a browser action
type BrowserResult struct {
	Success    bool                   `json:"success"`
	Action     string                 `json:"action"`
	URL        string                 `json:"url,omitempty"`
	Title      string                 `json:"title,omitempty"`
	Text       string                 `json:"text,omitempty"`
	Value      string                 `json:"value,omitempty"`
	Attribute  string                 `json:"attribute,omitempty"`
	HTML       string                 `json:"html,omitempty"`
	Screenshot string                 `json:"screenshot,omitempty"` // Base64 encoded
	Cookies    []map[string]string    `json:"cookies,omitempty"`
	EvalResult interface{}            `json:"eval_result,omitempty"`
	Error      string                 `json:"error,omitempty"`
	Duration   int64                  `json:"duration_ms"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
}

// NewBrowserAction creates a new browser action handler
func NewBrowserAction() (*BrowserAction, error) {
	opts := []chromedp.ExecAllocatorOption{
		chromedp.NoFirstRun,
		chromedp.NoDefaultBrowserCheck,
		chromedp.Headless,
		chromedp.DisableGPU,
		chromedp.WindowSize(1920, 1080),
	}

	allocCtx, allocCancel := chromedp.NewExecAllocator(context.Background(), opts...)
	ctx, cancel := chromedp.NewContext(allocCtx)

	return &BrowserAction{
		ctx:         ctx,
		cancel:      cancel,
		allocCtx:    allocCtx,
		allocCancel: allocCancel,
	}, nil
}

// Close closes the browser
func (b *BrowserAction) Close() {
	if b.cancel != nil {
		b.cancel()
	}
	if b.allocCancel != nil {
		b.allocCancel()
	}
}

// Execute executes a browser action
func (b *BrowserAction) Execute(config *BrowserConfig) (*BrowserResult, error) {
	start := time.Now()
	result := &BrowserResult{
		Action:   config.Action,
		Metadata: make(map[string]interface{}),
	}

	// Parse timeout
	timeout := 30 * time.Second
	if config.Timeout != "" {
		if parsed, err := time.ParseDuration(config.Timeout); err == nil {
			timeout = parsed
		}
	}

	ctx, cancel := context.WithTimeout(b.ctx, timeout)
	defer cancel()

	var err error

	switch strings.ToLower(config.Action) {
	case "navigate", "goto", "open":
		err = b.navigate(ctx, config, result)

	case "click":
		err = b.click(ctx, config, result)

	case "type", "input", "fill":
		err = b.typeText(ctx, config, result)

	case "clear":
		err = b.clear(ctx, config, result)

	case "select":
		err = b.selectOption(ctx, config, result)

	case "check":
		err = b.check(ctx, config, result)

	case "uncheck":
		err = b.uncheck(ctx, config, result)

	case "submit":
		err = b.submit(ctx, config, result)

	case "wait":
		err = b.wait(ctx, config, result)

	case "screenshot":
		err = b.screenshot(ctx, config, result)

	case "evaluate", "eval", "script":
		err = b.evaluate(ctx, config, result)

	case "get_text", "text":
		err = b.getText(ctx, config, result)

	case "get_value", "value":
		err = b.getValue(ctx, config, result)

	case "get_attribute", "attribute":
		err = b.getAttribute(ctx, config, result)

	case "get_html", "html":
		err = b.getHTML(ctx, config, result)

	case "get_title", "title":
		err = b.getTitle(ctx, result)

	case "get_url", "url":
		err = b.getURL(ctx, result)

	case "scroll":
		err = b.scroll(ctx, config, result)

	case "hover":
		err = b.hover(ctx, config, result)

	case "focus":
		err = b.focus(ctx, config, result)

	case "press", "key":
		err = b.pressKey(ctx, config, result)

	case "reload", "refresh":
		err = b.reload(ctx, result)

	case "back":
		err = b.back(ctx, result)

	case "forward":
		err = b.forward(ctx, result)

	case "set_cookie":
		err = b.setCookie(ctx, config, result)

	case "get_cookies":
		err = b.getCookies(ctx, result)

	case "clear_cookies":
		err = b.clearCookies(ctx, result)

	case "assert_visible":
		err = b.assertVisible(ctx, config, result)

	case "assert_text":
		err = b.assertText(ctx, config, result)

	case "assert_url":
		err = b.assertURL(ctx, config, result)

	case "assert_title":
		err = b.assertTitle(ctx, config, result)

	default:
		err = fmt.Errorf("unknown browser action: %s", config.Action)
	}

	result.Duration = time.Since(start).Milliseconds()
	result.Success = err == nil

	if err != nil {
		result.Error = err.Error()
		return result, err
	}

	// Take screenshot if requested
	if config.Screenshot && result.Screenshot == "" {
		screenshotErr := b.screenshot(ctx, config, result)
		if screenshotErr != nil {
			result.Metadata["screenshot_error"] = screenshotErr.Error()
		}
	}

	return result, nil
}

func (b *BrowserAction) navigate(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	if config.URL == "" {
		return fmt.Errorf("URL is required for navigate action")
	}

	err := chromedp.Run(ctx, chromedp.Navigate(config.URL))
	if err != nil {
		return err
	}

	// Wait for page load
	if config.WaitFor != "" {
		err = chromedp.Run(ctx, chromedp.WaitVisible(config.WaitFor))
	}

	result.URL = config.URL
	return err
}

func (b *BrowserAction) click(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	if config.Selector == "" {
		return fmt.Errorf("selector is required for click action")
	}
	return chromedp.Run(ctx, chromedp.Click(config.Selector))
}

func (b *BrowserAction) typeText(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	if config.Selector == "" {
		return fmt.Errorf("selector is required for type action")
	}
	return chromedp.Run(ctx, chromedp.SendKeys(config.Selector, config.Text))
}

func (b *BrowserAction) clear(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	if config.Selector == "" {
		return fmt.Errorf("selector is required for clear action")
	}
	return chromedp.Run(ctx, chromedp.Clear(config.Selector))
}

func (b *BrowserAction) selectOption(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	if config.Selector == "" {
		return fmt.Errorf("selector is required for select action")
	}
	return chromedp.Run(ctx, chromedp.SetValue(config.Selector, config.Value))
}

func (b *BrowserAction) check(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	if config.Selector == "" {
		return fmt.Errorf("selector is required for check action")
	}
	return chromedp.Run(ctx, chromedp.SetAttributeValue(config.Selector, "checked", "checked"))
}

func (b *BrowserAction) uncheck(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	if config.Selector == "" {
		return fmt.Errorf("selector is required for uncheck action")
	}
	return chromedp.Run(ctx, chromedp.RemoveAttribute(config.Selector, "checked"))
}

func (b *BrowserAction) submit(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	if config.Selector == "" {
		return fmt.Errorf("selector is required for submit action")
	}
	return chromedp.Run(ctx, chromedp.Submit(config.Selector))
}

func (b *BrowserAction) wait(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	if config.Selector != "" {
		return chromedp.Run(ctx, chromedp.WaitVisible(config.Selector))
	}
	if config.Timeout != "" {
		duration, err := time.ParseDuration(config.Timeout)
		if err != nil {
			return err
		}
		time.Sleep(duration)
		return nil
	}
	return fmt.Errorf("selector or timeout required for wait action")
}

func (b *BrowserAction) screenshot(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	var buf []byte
	var err error

	if config.FullPage {
		err = chromedp.Run(ctx, chromedp.FullScreenshot(&buf, 100))
	} else if config.Selector != "" {
		err = chromedp.Run(ctx, chromedp.Screenshot(config.Selector, &buf))
	} else {
		err = chromedp.Run(ctx, chromedp.CaptureScreenshot(&buf))
	}

	if err != nil {
		return err
	}

	result.Screenshot = base64.StdEncoding.EncodeToString(buf)
	return nil
}

func (b *BrowserAction) evaluate(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	if config.Script == "" {
		return fmt.Errorf("script is required for evaluate action")
	}
	var evalResult interface{}
	err := chromedp.Run(ctx, chromedp.Evaluate(config.Script, &evalResult))
	result.EvalResult = evalResult
	return err
}

func (b *BrowserAction) getText(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	if config.Selector == "" {
		return fmt.Errorf("selector is required for get_text action")
	}
	return chromedp.Run(ctx, chromedp.Text(config.Selector, &result.Text))
}

func (b *BrowserAction) getValue(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	if config.Selector == "" {
		return fmt.Errorf("selector is required for get_value action")
	}
	return chromedp.Run(ctx, chromedp.Value(config.Selector, &result.Value))
}

func (b *BrowserAction) getAttribute(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	if config.Selector == "" || config.Attribute == "" {
		return fmt.Errorf("selector and attribute are required for get_attribute action")
	}
	var ok bool
	return chromedp.Run(ctx, chromedp.AttributeValue(config.Selector, config.Attribute, &result.Attribute, &ok))
}

func (b *BrowserAction) getHTML(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	if config.Selector == "" {
		return fmt.Errorf("selector is required for get_html action")
	}
	return chromedp.Run(ctx, chromedp.OuterHTML(config.Selector, &result.HTML))
}

func (b *BrowserAction) getTitle(ctx context.Context, result *BrowserResult) error {
	return chromedp.Run(ctx, chromedp.Title(&result.Title))
}

func (b *BrowserAction) getURL(ctx context.Context, result *BrowserResult) error {
	return chromedp.Run(ctx, chromedp.Location(&result.URL))
}

func (b *BrowserAction) scroll(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	if config.Selector != "" {
		return chromedp.Run(ctx, chromedp.ScrollIntoView(config.Selector))
	}
	return chromedp.Run(ctx, chromedp.Evaluate(`window.scrollTo(0, document.body.scrollHeight)`, nil))
}

func (b *BrowserAction) hover(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	if config.Selector == "" {
		return fmt.Errorf("selector is required for hover action")
	}
	return chromedp.Run(ctx, chromedp.MouseClickXY(0, 0)) // Simplified hover
}

func (b *BrowserAction) focus(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	if config.Selector == "" {
		return fmt.Errorf("selector is required for focus action")
	}
	return chromedp.Run(ctx, chromedp.Focus(config.Selector))
}

func (b *BrowserAction) pressKey(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	if config.Text == "" {
		return fmt.Errorf("text (key) is required for press action")
	}
	return chromedp.Run(ctx, chromedp.KeyEvent(config.Text))
}

func (b *BrowserAction) reload(ctx context.Context, result *BrowserResult) error {
	return chromedp.Run(ctx, chromedp.Reload())
}

func (b *BrowserAction) back(ctx context.Context, result *BrowserResult) error {
	return chromedp.Run(ctx, chromedp.NavigateBack())
}

func (b *BrowserAction) forward(ctx context.Context, result *BrowserResult) error {
	return chromedp.Run(ctx, chromedp.NavigateForward())
}

func (b *BrowserAction) setCookie(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	// Set cookies via JavaScript for simplicity
	for _, cookie := range config.Cookies {
		script := fmt.Sprintf(`document.cookie = "%s=%s; path=%s"`,
			cookie.Name, cookie.Value, cookie.Path)
		if err := chromedp.Run(ctx, chromedp.Evaluate(script, nil)); err != nil {
			return err
		}
	}
	return nil
}

func (b *BrowserAction) getCookies(ctx context.Context, result *BrowserResult) error {
	var cookieStr string
	err := chromedp.Run(ctx, chromedp.Evaluate(`document.cookie`, &cookieStr))
	if err != nil {
		return err
	}

	// Parse cookies
	cookies := []map[string]string{}
	for _, c := range strings.Split(cookieStr, ";") {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		parts := strings.SplitN(c, "=", 2)
		if len(parts) == 2 {
			cookies = append(cookies, map[string]string{
				"name":  strings.TrimSpace(parts[0]),
				"value": strings.TrimSpace(parts[1]),
			})
		}
	}
	result.Cookies = cookies
	return nil
}

func (b *BrowserAction) clearCookies(ctx context.Context, result *BrowserResult) error {
	script := `
		document.cookie.split(";").forEach(function(c) {
			document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
		});
	`
	return chromedp.Run(ctx, chromedp.Evaluate(script, nil))
}

func (b *BrowserAction) assertVisible(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	if config.Selector == "" {
		return fmt.Errorf("selector is required for assert_visible")
	}
	return chromedp.Run(ctx, chromedp.WaitVisible(config.Selector))
}

func (b *BrowserAction) assertText(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	if config.Selector == "" || config.Text == "" {
		return fmt.Errorf("selector and text are required for assert_text")
	}
	var text string
	if err := chromedp.Run(ctx, chromedp.Text(config.Selector, &text)); err != nil {
		return err
	}
	if !strings.Contains(text, config.Text) {
		return fmt.Errorf("expected text '%s' not found in element, got '%s'", config.Text, text)
	}
	result.Text = text
	return nil
}

func (b *BrowserAction) assertURL(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	if config.URL == "" {
		return fmt.Errorf("url is required for assert_url")
	}
	var url string
	if err := chromedp.Run(ctx, chromedp.Location(&url)); err != nil {
		return err
	}
	if !strings.Contains(url, config.URL) {
		return fmt.Errorf("expected URL to contain '%s', got '%s'", config.URL, url)
	}
	result.URL = url
	return nil
}

func (b *BrowserAction) assertTitle(ctx context.Context, config *BrowserConfig, result *BrowserResult) error {
	if config.Text == "" {
		return fmt.Errorf("text (expected title) is required for assert_title")
	}
	var title string
	if err := chromedp.Run(ctx, chromedp.Title(&title)); err != nil {
		return err
	}
	if !strings.Contains(title, config.Text) {
		return fmt.Errorf("expected title to contain '%s', got '%s'", config.Text, title)
	}
	result.Title = title
	return nil
}
