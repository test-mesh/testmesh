package handlers

import (
	"net/http"

	"github.com/georgi-georgiev/testmesh/internal/codegen"
	"github.com/gin-gonic/gin"
)

// CodegenHandler handles code generation requests
type CodegenHandler struct {
	generator *codegen.Generator
}

// NewCodegenHandler creates a new codegen handler
func NewCodegenHandler() *CodegenHandler {
	return &CodegenHandler{
		generator: codegen.NewGenerator(),
	}
}

// GenerateCodeRequest represents a code generation request
type GenerateCodeRequest struct {
	Language string             `json:"language"`
	Step     *codegen.StepConfig `json:"step"`
}

// GenerateCodeResponse represents a code generation response
type GenerateCodeResponse struct {
	Language  string `json:"language"`
	Code      string `json:"code"`
	Extension string `json:"extension"`
}

// Generate generates code for a step
func (h *CodegenHandler) Generate(c *gin.Context) {
	var req GenerateCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Step == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "step is required"})
		return
	}

	code, err := h.generator.Generate(req.Language, req.Step)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, GenerateCodeResponse{
		Language:  req.Language,
		Code:      code,
		Extension: getExtension(req.Language),
	})
}

// GenerateAll generates code for all supported languages
func (h *CodegenHandler) GenerateAll(c *gin.Context) {
	var step codegen.StepConfig
	if err := c.ShouldBindJSON(&step); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	results := h.generator.GenerateAll(&step)

	response := make([]GenerateCodeResponse, 0, len(results))
	for lang, code := range results {
		response = append(response, GenerateCodeResponse{
			Language:  lang,
			Code:      code,
			Extension: getExtension(lang),
		})
	}

	c.JSON(http.StatusOK, gin.H{"snippets": response})
}

// GetLanguages returns supported languages
func (h *CodegenHandler) GetLanguages(c *gin.Context) {
	languages := h.generator.SupportedLanguages()
	c.JSON(http.StatusOK, gin.H{"languages": languages})
}

func getExtension(language string) string {
	extensions := map[string]string{
		"curl":       ".sh",
		"python":     ".py",
		"javascript": ".js",
		"nodejs":     ".js",
		"go":         ".go",
		"php":        ".php",
		"ruby":       ".rb",
		"java":       ".java",
		"csharp":     ".cs",
	}
	if ext, ok := extensions[language]; ok {
		return ext
	}
	return ".txt"
}
