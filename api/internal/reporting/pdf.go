package reporting

import (
	"bytes"
	"fmt"
	"time"

	"github.com/jung-kurt/gofpdf"
)

// PDFGenerator generates PDF reports
type PDFGenerator struct {
	options *PDFOptions
}

// PDFOptions holds PDF generation options
type PDFOptions struct {
	Title       string
	Author      string
	Subject     string
	PageSize    string // A4, Letter
	Orientation string // P (portrait), L (landscape)
	FontSize    float64
	LogoPath    string
	HeaderColor []int
}

// DefaultPDFOptions returns default options
func DefaultPDFOptions() *PDFOptions {
	return &PDFOptions{
		Title:       "Test Report",
		Author:      "TestMesh",
		Subject:     "Test Execution Report",
		PageSize:    "A4",
		Orientation: "P",
		FontSize:    10,
		HeaderColor: []int{41, 128, 185}, // Blue
	}
}

// NewPDFGenerator creates a new PDF generator
func NewPDFGenerator(options *PDFOptions) *PDFGenerator {
	if options == nil {
		options = DefaultPDFOptions()
	}
	return &PDFGenerator{options: options}
}

// ExecutionReport represents data for an execution report
type ExecutionReport struct {
	ID           string
	FlowName     string
	Status       string
	StartTime    time.Time
	EndTime      time.Time
	Duration     int64
	Steps        []StepReport
	Environment  string
	Tags         []string
	Metadata     map[string]string
}

// StepReport represents a step in the report
type StepReport struct {
	Name     string
	Status   string
	Duration int64
	Error    string
	Details  map[string]interface{}
}

// Generate generates a PDF report
func (g *PDFGenerator) Generate(report *ExecutionReport) ([]byte, error) {
	pdf := gofpdf.New(g.options.Orientation, "mm", g.options.PageSize, "")
	pdf.SetTitle(g.options.Title, true)
	pdf.SetAuthor(g.options.Author, true)
	pdf.SetSubject(g.options.Subject, true)

	// Add page
	pdf.AddPage()

	// Header
	g.renderHeader(pdf, report)

	// Summary
	g.renderSummary(pdf, report)

	// Steps table
	g.renderStepsTable(pdf, report)

	// Errors section
	g.renderErrors(pdf, report)

	// Footer
	g.renderFooter(pdf)

	// Generate PDF
	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("failed to generate PDF: %w", err)
	}

	return buf.Bytes(), nil
}

func (g *PDFGenerator) renderHeader(pdf *gofpdf.Fpdf, report *ExecutionReport) {
	// Background bar
	pdf.SetFillColor(g.options.HeaderColor[0], g.options.HeaderColor[1], g.options.HeaderColor[2])
	pdf.Rect(0, 0, 210, 40, "F")

	// Title
	pdf.SetTextColor(255, 255, 255)
	pdf.SetFont("Arial", "B", 24)
	pdf.SetXY(10, 10)
	pdf.Cell(0, 10, g.options.Title)

	// Subtitle
	pdf.SetFont("Arial", "", 12)
	pdf.SetXY(10, 22)
	pdf.Cell(0, 10, fmt.Sprintf("Flow: %s", report.FlowName))

	// Status badge
	pdf.SetXY(10, 32)
	g.renderStatusBadge(pdf, report.Status)

	// Reset colors
	pdf.SetTextColor(0, 0, 0)
	pdf.SetY(50)
}

func (g *PDFGenerator) renderStatusBadge(pdf *gofpdf.Fpdf, status string) {
	var bgColor []int
	switch status {
	case "passed":
		bgColor = []int{39, 174, 96}
	case "failed":
		bgColor = []int{231, 76, 60}
	default:
		bgColor = []int{241, 196, 15}
	}

	pdf.SetFillColor(bgColor[0], bgColor[1], bgColor[2])
	pdf.SetTextColor(255, 255, 255)
	pdf.SetFont("Arial", "B", 10)

	width := pdf.GetStringWidth(status) + 10
	pdf.Rect(pdf.GetX(), pdf.GetY(), width, 7, "F")
	pdf.Cell(width, 7, status)
}

func (g *PDFGenerator) renderSummary(pdf *gofpdf.Fpdf, report *ExecutionReport) {
	pdf.SetFont("Arial", "B", 14)
	pdf.SetTextColor(0, 0, 0)
	pdf.Cell(0, 10, "Summary")
	pdf.Ln(12)

	// Summary table
	pdf.SetFont("Arial", "", g.options.FontSize)

	summaryData := [][]string{
		{"Execution ID", report.ID},
		{"Start Time", report.StartTime.Format("2006-01-02 15:04:05")},
		{"End Time", report.EndTime.Format("2006-01-02 15:04:05")},
		{"Duration", fmt.Sprintf("%d ms", report.Duration)},
		{"Environment", report.Environment},
	}

	for _, row := range summaryData {
		pdf.SetFont("Arial", "B", g.options.FontSize)
		pdf.CellFormat(50, 8, row[0], "1", 0, "L", false, 0, "")
		pdf.SetFont("Arial", "", g.options.FontSize)
		pdf.CellFormat(0, 8, row[1], "1", 1, "L", false, 0, "")
	}

	pdf.Ln(10)
}

func (g *PDFGenerator) renderStepsTable(pdf *gofpdf.Fpdf, report *ExecutionReport) {
	pdf.SetFont("Arial", "B", 14)
	pdf.Cell(0, 10, "Steps")
	pdf.Ln(12)

	// Count results
	passed := 0
	failed := 0
	for _, step := range report.Steps {
		if step.Status == "passed" {
			passed++
		} else {
			failed++
		}
	}

	// Summary bar
	pdf.SetFont("Arial", "", g.options.FontSize)
	pdf.Cell(0, 6, fmt.Sprintf("Total: %d | Passed: %d | Failed: %d", len(report.Steps), passed, failed))
	pdf.Ln(10)

	// Table header
	pdf.SetFillColor(240, 240, 240)
	pdf.SetFont("Arial", "B", g.options.FontSize)
	pdf.CellFormat(10, 8, "#", "1", 0, "C", true, 0, "")
	pdf.CellFormat(80, 8, "Step Name", "1", 0, "L", true, 0, "")
	pdf.CellFormat(25, 8, "Status", "1", 0, "C", true, 0, "")
	pdf.CellFormat(30, 8, "Duration", "1", 1, "C", true, 0, "")

	// Table rows
	pdf.SetFont("Arial", "", g.options.FontSize)
	for i, step := range report.Steps {
		// Alternate row colors
		if i%2 == 0 {
			pdf.SetFillColor(255, 255, 255)
		} else {
			pdf.SetFillColor(248, 248, 248)
		}

		pdf.CellFormat(10, 7, fmt.Sprintf("%d", i+1), "1", 0, "C", true, 0, "")

		// Truncate name if too long
		name := step.Name
		if len(name) > 40 {
			name = name[:37] + "..."
		}
		pdf.CellFormat(80, 7, name, "1", 0, "L", true, 0, "")

		// Status with color
		if step.Status == "passed" {
			pdf.SetTextColor(39, 174, 96)
		} else {
			pdf.SetTextColor(231, 76, 60)
		}
		pdf.CellFormat(25, 7, step.Status, "1", 0, "C", true, 0, "")
		pdf.SetTextColor(0, 0, 0)

		pdf.CellFormat(30, 7, fmt.Sprintf("%d ms", step.Duration), "1", 1, "C", true, 0, "")
	}

	pdf.Ln(10)
}

func (g *PDFGenerator) renderErrors(pdf *gofpdf.Fpdf, report *ExecutionReport) {
	// Collect errors
	var errors []StepReport
	for _, step := range report.Steps {
		if step.Error != "" {
			errors = append(errors, step)
		}
	}

	if len(errors) == 0 {
		return
	}

	// Check if we need a new page
	if pdf.GetY() > 240 {
		pdf.AddPage()
	}

	pdf.SetFont("Arial", "B", 14)
	pdf.SetTextColor(231, 76, 60)
	pdf.Cell(0, 10, "Errors")
	pdf.SetTextColor(0, 0, 0)
	pdf.Ln(12)

	for _, step := range errors {
		pdf.SetFont("Arial", "B", g.options.FontSize)
		pdf.Cell(0, 6, step.Name)
		pdf.Ln(7)

		pdf.SetFillColor(255, 245, 245)
		pdf.SetFont("Arial", "", g.options.FontSize-1)

		// Word wrap error message
		errorText := step.Error
		if len(errorText) > 200 {
			errorText = errorText[:197] + "..."
		}
		pdf.MultiCell(0, 5, errorText, "1", "L", true)
		pdf.Ln(5)
	}
}

func (g *PDFGenerator) renderFooter(pdf *gofpdf.Fpdf) {
	pdf.SetY(-20)
	pdf.SetFont("Arial", "I", 8)
	pdf.SetTextColor(128, 128, 128)
	pdf.Cell(0, 10, fmt.Sprintf("Generated by TestMesh on %s", time.Now().Format("2006-01-02 15:04:05")))
}

// GenerateMultiple generates a combined report for multiple executions
func (g *PDFGenerator) GenerateMultiple(reports []*ExecutionReport) ([]byte, error) {
	pdf := gofpdf.New(g.options.Orientation, "mm", g.options.PageSize, "")
	pdf.SetTitle(g.options.Title, true)

	for i, report := range reports {
		pdf.AddPage()

		if i > 0 {
			pdf.SetFont("Arial", "", 8)
			pdf.SetTextColor(128, 128, 128)
			pdf.Cell(0, 5, fmt.Sprintf("Report %d of %d", i+1, len(reports)))
			pdf.Ln(10)
		}

		g.renderHeader(pdf, report)
		g.renderSummary(pdf, report)
		g.renderStepsTable(pdf, report)
		g.renderErrors(pdf, report)
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}
