package codegen

import (
	"fmt"
	"strings"
)

// Generator handles code generation from flow steps
type Generator struct {
	languages map[string]LanguageGenerator
}

// LanguageGenerator interface for language-specific generators
type LanguageGenerator interface {
	Generate(step *StepConfig) (string, error)
	Name() string
	Extension() string
}

// StepConfig represents a step to generate code for
type StepConfig struct {
	Type    string                 `json:"type"`
	Method  string                 `json:"method,omitempty"`
	URL     string                 `json:"url,omitempty"`
	Headers map[string]string      `json:"headers,omitempty"`
	Body    interface{}            `json:"body,omitempty"`
	Query   map[string]string      `json:"query,omitempty"`
	Auth    *AuthConfig            `json:"auth,omitempty"`
}

// AuthConfig represents authentication configuration
type AuthConfig struct {
	Type     string `json:"type"` // "bearer", "basic", "api_key"
	Token    string `json:"token,omitempty"`
	Username string `json:"username,omitempty"`
	Password string `json:"password,omitempty"`
	Key      string `json:"key,omitempty"`
	Value    string `json:"value,omitempty"`
	In       string `json:"in,omitempty"` // "header", "query"
}

// NewGenerator creates a new code generator
func NewGenerator() *Generator {
	g := &Generator{
		languages: make(map[string]LanguageGenerator),
	}

	// Register built-in generators
	g.Register(&CurlGenerator{})
	g.Register(&PythonGenerator{})
	g.Register(&JavaScriptGenerator{})
	g.Register(&GoGenerator{})
	g.Register(&PHPGenerator{})
	g.Register(&RubyGenerator{})
	g.Register(&JavaGenerator{})
	g.Register(&CSharpGenerator{})

	return g
}

// Register registers a language generator
func (g *Generator) Register(lg LanguageGenerator) {
	g.languages[strings.ToLower(lg.Name())] = lg
}

// Generate generates code for a step in the specified language
func (g *Generator) Generate(language string, step *StepConfig) (string, error) {
	lg, ok := g.languages[strings.ToLower(language)]
	if !ok {
		return "", fmt.Errorf("unsupported language: %s", language)
	}
	return lg.Generate(step)
}

// SupportedLanguages returns list of supported languages
func (g *Generator) SupportedLanguages() []string {
	languages := make([]string, 0, len(g.languages))
	for name := range g.languages {
		languages = append(languages, name)
	}
	return languages
}

// GenerateAll generates code for all supported languages
func (g *Generator) GenerateAll(step *StepConfig) map[string]string {
	results := make(map[string]string)
	for name, lg := range g.languages {
		code, err := lg.Generate(step)
		if err == nil {
			results[name] = code
		}
	}
	return results
}

// Helper functions

func buildURL(baseURL string, query map[string]string) string {
	if len(query) == 0 {
		return baseURL
	}

	params := make([]string, 0, len(query))
	for k, v := range query {
		params = append(params, fmt.Sprintf("%s=%s", k, v))
	}
	return baseURL + "?" + strings.Join(params, "&")
}

func escapeString(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "\"", "\\\"")
	s = strings.ReplaceAll(s, "\n", "\\n")
	s = strings.ReplaceAll(s, "\t", "\\t")
	return s
}

func indentLines(s string, indent string) string {
	lines := strings.Split(s, "\n")
	for i, line := range lines {
		if line != "" {
			lines[i] = indent + line
		}
	}
	return strings.Join(lines, "\n")
}
