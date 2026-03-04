package browser

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/chromedp/cdproto/cdp"
	"github.com/chromedp/cdproto/network"
	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
)

// Driver manages browser automation using chromedp
type Driver struct {
	ctx        context.Context
	cancel     context.CancelFunc
	allocCtx   context.Context
	allocCancel context.CancelFunc
	timeout    time.Duration
	headless   bool
	mu         sync.Mutex
}

// Config holds browser driver configuration
type Config struct {
	Headless        bool
	Timeout         time.Duration
	WindowWidth     int
	WindowHeight    int
	UserAgent       string
	ProxyURL        string
	IgnoreHTTPSErrors bool
}

// DefaultConfig returns sensible defaults
func DefaultConfig() *Config {
	return &Config{
		Headless:     true,
		Timeout:      30 * time.Second,
		WindowWidth:  1920,
		WindowHeight: 1080,
	}
}

// NewDriver creates a new browser driver
func NewDriver(config *Config) (*Driver, error) {
	if config == nil {
		config = DefaultConfig()
	}

	opts := []chromedp.ExecAllocatorOption{
		chromedp.NoFirstRun,
		chromedp.NoDefaultBrowserCheck,
		chromedp.WindowSize(config.WindowWidth, config.WindowHeight),
	}

	if config.Headless {
		opts = append(opts, chromedp.Headless)
	}

	if config.UserAgent != "" {
		opts = append(opts, chromedp.UserAgent(config.UserAgent))
	}

	if config.ProxyURL != "" {
		opts = append(opts, chromedp.ProxyServer(config.ProxyURL))
	}

	if config.IgnoreHTTPSErrors {
		opts = append(opts, chromedp.Flag("ignore-certificate-errors", true))
	}

	allocCtx, allocCancel := chromedp.NewExecAllocator(context.Background(), opts...)
	ctx, cancel := chromedp.NewContext(allocCtx)

	// Set timeout
	ctx, cancel = context.WithTimeout(ctx, config.Timeout)

	return &Driver{
		ctx:         ctx,
		cancel:      cancel,
		allocCtx:    allocCtx,
		allocCancel: allocCancel,
		timeout:     config.Timeout,
		headless:    config.Headless,
	}, nil
}

// Close closes the browser
func (d *Driver) Close() {
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.cancel != nil {
		d.cancel()
	}
	if d.allocCancel != nil {
		d.allocCancel()
	}
}

// Navigate navigates to a URL
func (d *Driver) Navigate(url string) error {
	return chromedp.Run(d.ctx, chromedp.Navigate(url))
}

// WaitVisible waits for an element to be visible
func (d *Driver) WaitVisible(selector string, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(d.ctx, timeout)
	defer cancel()
	return chromedp.Run(ctx, chromedp.WaitVisible(selector))
}

// WaitReady waits for an element to be ready
func (d *Driver) WaitReady(selector string, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(d.ctx, timeout)
	defer cancel()
	return chromedp.Run(ctx, chromedp.WaitReady(selector))
}

// Click clicks an element
func (d *Driver) Click(selector string) error {
	return chromedp.Run(d.ctx, chromedp.Click(selector))
}

// DoubleClick double-clicks an element
func (d *Driver) DoubleClick(selector string) error {
	return chromedp.Run(d.ctx, chromedp.DoubleClick(selector))
}

// Type types text into an element
func (d *Driver) Type(selector, text string) error {
	return chromedp.Run(d.ctx, chromedp.SendKeys(selector, text))
}

// Clear clears an input element
func (d *Driver) Clear(selector string) error {
	return chromedp.Run(d.ctx, chromedp.Clear(selector))
}

// SetValue sets the value of an input element
func (d *Driver) SetValue(selector, value string) error {
	return chromedp.Run(d.ctx, chromedp.SetValue(selector, value))
}

// Submit submits a form
func (d *Driver) Submit(selector string) error {
	return chromedp.Run(d.ctx, chromedp.Submit(selector))
}

// Focus focuses an element
func (d *Driver) Focus(selector string) error {
	return chromedp.Run(d.ctx, chromedp.Focus(selector))
}

// Blur removes focus from an element
func (d *Driver) Blur(selector string) error {
	return chromedp.Run(d.ctx, chromedp.Blur(selector))
}

// ScrollIntoView scrolls an element into view
func (d *Driver) ScrollIntoView(selector string) error {
	return chromedp.Run(d.ctx, chromedp.ScrollIntoView(selector))
}

// GetText gets the text content of an element
func (d *Driver) GetText(selector string) (string, error) {
	var text string
	err := chromedp.Run(d.ctx, chromedp.Text(selector, &text))
	return text, err
}

// GetValue gets the value of an input element
func (d *Driver) GetValue(selector string) (string, error) {
	var value string
	err := chromedp.Run(d.ctx, chromedp.Value(selector, &value))
	return value, err
}

// GetAttribute gets an attribute of an element
func (d *Driver) GetAttribute(selector, name string) (string, error) {
	var value string
	err := chromedp.Run(d.ctx, chromedp.AttributeValue(selector, name, &value, nil))
	return value, err
}

// GetHTML gets the outer HTML of an element
func (d *Driver) GetHTML(selector string) (string, error) {
	var html string
	err := chromedp.Run(d.ctx, chromedp.OuterHTML(selector, &html))
	return html, err
}

// Evaluate evaluates JavaScript and returns the result
func (d *Driver) Evaluate(expression string) (interface{}, error) {
	var result interface{}
	err := chromedp.Run(d.ctx, chromedp.Evaluate(expression, &result))
	return result, err
}

// Screenshot takes a screenshot of the page
func (d *Driver) Screenshot() ([]byte, error) {
	var buf []byte
	err := chromedp.Run(d.ctx, chromedp.CaptureScreenshot(&buf))
	return buf, err
}

// FullPageScreenshot takes a full page screenshot
func (d *Driver) FullPageScreenshot() ([]byte, error) {
	var buf []byte
	err := chromedp.Run(d.ctx, chromedp.FullScreenshot(&buf, 100))
	return buf, err
}

// ElementScreenshot takes a screenshot of a specific element
func (d *Driver) ElementScreenshot(selector string) ([]byte, error) {
	var buf []byte
	err := chromedp.Run(d.ctx, chromedp.Screenshot(selector, &buf))
	return buf, err
}

// GetTitle gets the page title
func (d *Driver) GetTitle() (string, error) {
	var title string
	err := chromedp.Run(d.ctx, chromedp.Title(&title))
	return title, err
}

// GetURL gets the current URL
func (d *Driver) GetURL() (string, error) {
	var url string
	err := chromedp.Run(d.ctx, chromedp.Location(&url))
	return url, err
}

// SelectOption selects an option from a dropdown
func (d *Driver) SelectOption(selector, value string) error {
	return chromedp.Run(d.ctx, chromedp.SetValue(selector, value))
}

// Check checks a checkbox
func (d *Driver) Check(selector string) error {
	return chromedp.Run(d.ctx, chromedp.SetAttributeValue(selector, "checked", "checked"))
}

// Uncheck unchecks a checkbox
func (d *Driver) Uncheck(selector string) error {
	return chromedp.Run(d.ctx, chromedp.RemoveAttribute(selector, "checked"))
}

// Hover hovers over an element
func (d *Driver) Hover(selector string) error {
	return chromedp.Run(d.ctx, chromedp.MouseClickXY(0, 0)) // Reset position first
}

// Press presses a keyboard key
func (d *Driver) Press(key string) error {
	return chromedp.Run(d.ctx, chromedp.KeyEvent(key))
}

// SetCookie sets a cookie
func (d *Driver) SetCookie(name, value, domain, path string) error {
	return chromedp.Run(d.ctx, chromedp.ActionFunc(func(ctx context.Context) error {
		expr := cdp.TimeSinceEpoch(time.Now().Add(24 * time.Hour))
		return network.SetCookie(name, value).
			WithDomain(domain).
			WithPath(path).
			WithExpires(&expr).
			Do(ctx)
	}))
}

// GetCookies gets all cookies
func (d *Driver) GetCookies() ([]*network.Cookie, error) {
	var cookies []*network.Cookie
	err := chromedp.Run(d.ctx, chromedp.ActionFunc(func(ctx context.Context) error {
		var err error
		cookies, err = network.GetCookies().Do(ctx)
		return err
	}))
	return cookies, err
}

// ClearCookies clears all cookies
func (d *Driver) ClearCookies() error {
	return chromedp.Run(d.ctx, chromedp.ActionFunc(func(ctx context.Context) error {
		return network.ClearBrowserCookies().Do(ctx)
	}))
}

// SetLocalStorage sets a localStorage item
func (d *Driver) SetLocalStorage(key, value string) error {
	_, err := d.Evaluate(fmt.Sprintf(`localStorage.setItem(%q, %q)`, key, value))
	return err
}

// GetLocalStorage gets a localStorage item
func (d *Driver) GetLocalStorage(key string) (string, error) {
	result, err := d.Evaluate(fmt.Sprintf(`localStorage.getItem(%q)`, key))
	if err != nil {
		return "", err
	}
	if result == nil {
		return "", nil
	}
	return fmt.Sprintf("%v", result), nil
}

// ClearLocalStorage clears localStorage
func (d *Driver) ClearLocalStorage() error {
	_, err := d.Evaluate(`localStorage.clear()`)
	return err
}

// WaitForNavigation waits for a navigation to complete
func (d *Driver) WaitForNavigation(timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(d.ctx, timeout)
	defer cancel()

	return chromedp.Run(ctx, chromedp.ActionFunc(func(ctx context.Context) error {
		ch := make(chan struct{})
		chromedp.ListenTarget(ctx, func(ev interface{}) {
			if _, ok := ev.(*page.EventLoadEventFired); ok {
				close(ch)
			}
		})
		select {
		case <-ch:
			return nil
		case <-ctx.Done():
			return ctx.Err()
		}
	}))
}

// Reload reloads the page
func (d *Driver) Reload() error {
	return chromedp.Run(d.ctx, chromedp.Reload())
}

// Back navigates back
func (d *Driver) Back() error {
	return chromedp.Run(d.ctx, chromedp.NavigateBack())
}

// Forward navigates forward
func (d *Driver) Forward() error {
	return chromedp.Run(d.ctx, chromedp.NavigateForward())
}

// ElementExists checks if an element exists
func (d *Driver) ElementExists(selector string) (bool, error) {
	var nodes []*cdp.Node
	err := chromedp.Run(d.ctx, chromedp.Nodes(selector, &nodes))
	if err != nil {
		return false, err
	}
	return len(nodes) > 0, nil
}

// WaitForElement waits for element to appear
func (d *Driver) WaitForElement(selector string, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(d.ctx, timeout)
	defer cancel()
	return chromedp.Run(ctx, chromedp.WaitVisible(selector))
}
