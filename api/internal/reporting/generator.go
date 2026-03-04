package reporting

import (
	"bytes"
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"html/template"
	"os"
	"path/filepath"
	"time"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// Generator handles report generation
type Generator struct {
	db         *gorm.DB
	reportRepo *repository.ReportingRepository
	execRepo   *repository.ExecutionRepository
	flowRepo   *repository.FlowRepository
	logger     *zap.Logger
	outputDir  string
}

// NewGenerator creates a new report generator
func NewGenerator(
	db *gorm.DB,
	reportRepo *repository.ReportingRepository,
	execRepo *repository.ExecutionRepository,
	flowRepo *repository.FlowRepository,
	logger *zap.Logger,
	outputDir string,
) *Generator {
	// Ensure output directory exists
	os.MkdirAll(outputDir, 0755)
	return &Generator{
		db:         db,
		reportRepo: reportRepo,
		execRepo:   execRepo,
		flowRepo:   flowRepo,
		logger:     logger,
		outputDir:  outputDir,
	}
}

// ReportData holds aggregated data for report generation
type ReportData struct {
	ReportID    string                  `json:"report_id"`
	Name        string                  `json:"name"`
	GeneratedAt time.Time               `json:"generated_at"`
	StartDate   time.Time               `json:"start_date"`
	EndDate     time.Time               `json:"end_date"`
	Filters     models.ReportFilters    `json:"filters"`
	Summary     ReportSummary           `json:"summary"`
	DailyStats  []DailyStats            `json:"daily_stats"`
	FlowResults []FlowResult            `json:"flow_results"`
	FlakyTests  []FlakyTest             `json:"flaky_tests"`
	TopFailures []StepFailure           `json:"top_failures"`
}

// ReportSummary contains overall statistics
type ReportSummary struct {
	TotalFlows      int     `json:"total_flows"`
	TotalExecutions int     `json:"total_executions"`
	PassedExecs     int     `json:"passed_executions"`
	FailedExecs     int     `json:"failed_executions"`
	PassRate        float64 `json:"pass_rate"`
	AvgDurationMs   int64   `json:"avg_duration_ms"`
	TotalDurationMs int64   `json:"total_duration_ms"`
	FlakyCount      int     `json:"flaky_count"`
}

// DailyStats holds per-day statistics
type DailyStats struct {
	Date          string  `json:"date"`
	Executions    int     `json:"executions"`
	Passed        int     `json:"passed"`
	Failed        int     `json:"failed"`
	PassRate      float64 `json:"pass_rate"`
	AvgDurationMs int64   `json:"avg_duration_ms"`
}

// FlowResult holds per-flow execution results
type FlowResult struct {
	FlowID        string      `json:"flow_id"`
	FlowName      string      `json:"flow_name"`
	Suite         string      `json:"suite"`
	Executions    int         `json:"executions"`
	Passed        int         `json:"passed"`
	Failed        int         `json:"failed"`
	PassRate      float64     `json:"pass_rate"`
	AvgDurationMs int64       `json:"avg_duration_ms"`
	LastExecution *time.Time  `json:"last_execution,omitempty"`
	LastStatus    string      `json:"last_status"`
	IsFlaky       bool        `json:"is_flaky"`
	StepResults   []StepResult `json:"step_results,omitempty"`
}

// StepResult holds per-step results
type StepResult struct {
	StepID        string  `json:"step_id"`
	StepName      string  `json:"step_name"`
	Action        string  `json:"action"`
	Passed        int     `json:"passed"`
	Failed        int     `json:"failed"`
	PassRate      float64 `json:"pass_rate"`
	AvgDurationMs int64   `json:"avg_duration_ms"`
}

// FlakyTest holds flaky test information
type FlakyTest struct {
	FlowID          string   `json:"flow_id"`
	FlowName        string   `json:"flow_name"`
	FlakinessScore  float64  `json:"flakiness_score"`
	Transitions     int      `json:"transitions"`
	TotalExecs      int      `json:"total_executions"`
	FailurePatterns []string `json:"failure_patterns"`
}

// StepFailure holds step failure information
type StepFailure struct {
	FlowName      string `json:"flow_name"`
	StepID        string `json:"step_id"`
	StepName      string `json:"step_name"`
	Action        string `json:"action"`
	FailureCount  int    `json:"failure_count"`
	FailureRate   float64 `json:"failure_rate"`
	CommonError   string `json:"common_error"`
}

// GenerateReport creates a report in the specified format
func (g *Generator) GenerateReport(ctx context.Context, report *models.Report) error {
	// Update status to generating
	report.Status = models.ReportStatusGenerating
	if err := g.reportRepo.UpdateReport(report); err != nil {
		return err
	}

	// Collect report data
	data, err := g.collectReportData(ctx, report)
	if err != nil {
		report.Status = models.ReportStatusFailed
		report.Error = err.Error()
		g.reportRepo.UpdateReport(report)
		return err
	}

	// Generate report in specified format
	var filePath string
	var fileSize int64

	switch report.Format {
	case models.ReportFormatHTML:
		filePath, fileSize, err = g.generateHTML(data, report.ID.String())
	case models.ReportFormatJSON:
		filePath, fileSize, err = g.generateJSON(data, report.ID.String())
	case models.ReportFormatJUnit:
		filePath, fileSize, err = g.generateJUnit(data, report.ID.String())
	default:
		err = fmt.Errorf("unsupported report format: %s", report.Format)
	}

	if err != nil {
		report.Status = models.ReportStatusFailed
		report.Error = err.Error()
		g.reportRepo.UpdateReport(report)
		return err
	}

	// Update report with file info
	now := time.Now()
	expiresAt := now.Add(7 * 24 * time.Hour) // Reports expire after 7 days
	report.Status = models.ReportStatusCompleted
	report.FilePath = filePath
	report.FileSize = fileSize
	report.GeneratedAt = &now
	report.ExpiresAt = &expiresAt

	return g.reportRepo.UpdateReport(report)
}

func (g *Generator) collectReportData(ctx context.Context, report *models.Report) (*ReportData, error) {
	data := &ReportData{
		ReportID:    report.ID.String(),
		Name:        report.Name,
		GeneratedAt: time.Now(),
		StartDate:   report.StartDate,
		EndDate:     report.EndDate,
		Filters:     report.Filters,
	}

	// Get daily metrics
	dailyMetrics, err := g.reportRepo.GetDailyMetrics(report.StartDate, report.EndDate, "")
	if err != nil && err != gorm.ErrRecordNotFound {
		return nil, err
	}

	// Build daily stats
	var totalExecs, passedExecs, failedExecs int
	var totalDuration int64
	for _, dm := range dailyMetrics {
		data.DailyStats = append(data.DailyStats, DailyStats{
			Date:          dm.Date.Format("2006-01-02"),
			Executions:    dm.TotalExecs,
			Passed:        dm.PassedExecs,
			Failed:        dm.FailedExecs,
			PassRate:      dm.PassRate,
			AvgDurationMs: dm.AvgDurationMs,
		})
		totalExecs += dm.TotalExecs
		passedExecs += dm.PassedExecs
		failedExecs += dm.FailedExecs
		totalDuration += dm.AvgDurationMs * int64(dm.TotalExecs)
	}

	// Get flow results from executions
	flowResults, err := g.getFlowResults(report)
	if err != nil {
		return nil, err
	}
	data.FlowResults = flowResults

	// Get flaky tests
	flakyMetrics, _, err := g.reportRepo.GetFlakyFlows(20, 0)
	if err == nil {
		for _, fm := range flakyMetrics {
			flowName := ""
			if fm.Flow != nil {
				flowName = fm.Flow.Name
			}
			data.FlakyTests = append(data.FlakyTests, FlakyTest{
				FlowID:          fm.FlowID.String(),
				FlowName:        flowName,
				FlakinessScore:  fm.FlakinessScore,
				Transitions:     fm.Transitions,
				TotalExecs:      fm.TotalExecs,
				FailurePatterns: fm.FailurePatterns,
			})
		}
	}

	// Get top failures
	topFailures, err := g.reportRepo.GetMostFailingSteps(10, report.StartDate, report.EndDate)
	if err == nil {
		for _, tf := range topFailures {
			flowName := ""
			if tf.Flow != nil {
				flowName = tf.Flow.Name
			}
			commonError := ""
			if len(tf.CommonErrors) > 0 {
				commonError = tf.CommonErrors[0]
			}
			failureRate := float64(0)
			if tf.ExecutionCount > 0 {
				failureRate = float64(tf.FailedCount) / float64(tf.ExecutionCount) * 100
			}
			data.TopFailures = append(data.TopFailures, StepFailure{
				FlowName:     flowName,
				StepID:       tf.StepID,
				StepName:     tf.StepName,
				Action:       tf.Action,
				FailureCount: tf.FailedCount,
				FailureRate:  failureRate,
				CommonError:  commonError,
			})
		}
	}

	// Calculate summary
	var avgDuration int64
	if totalExecs > 0 {
		avgDuration = totalDuration / int64(totalExecs)
	}
	var passRate float64
	if totalExecs > 0 {
		passRate = float64(passedExecs) / float64(totalExecs) * 100
	}

	data.Summary = ReportSummary{
		TotalFlows:      len(flowResults),
		TotalExecutions: totalExecs,
		PassedExecs:     passedExecs,
		FailedExecs:     failedExecs,
		PassRate:        passRate,
		AvgDurationMs:   avgDuration,
		TotalDurationMs: totalDuration,
		FlakyCount:      len(data.FlakyTests),
	}

	return data, nil
}

func (g *Generator) getFlowResults(report *models.Report) ([]FlowResult, error) {
	var results []struct {
		FlowID        uuid.UUID
		FlowName      string
		Suite         string
		TotalExecs    int
		PassedExecs   int
		FailedExecs   int
		AvgDurationMs float64
		LastExecution time.Time
		LastStatus    string
	}

	query := g.db.Table("executions.executions e").
		Select(`
			e.flow_id,
			f.name as flow_name,
			COALESCE(f.suite, 'default') as suite,
			COUNT(*) as total_execs,
			SUM(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) as passed_execs,
			SUM(CASE WHEN e.status = 'failed' THEN 1 ELSE 0 END) as failed_execs,
			AVG(e.duration_ms) as avg_duration_ms,
			MAX(e.created_at) as last_execution,
			(SELECT status FROM executions.executions WHERE flow_id = e.flow_id ORDER BY created_at DESC LIMIT 1) as last_status
		`).
		Joins("JOIN flows.flows f ON e.flow_id = f.id").
		Where("e.created_at >= ? AND e.created_at <= ? AND e.status IN ?",
			report.StartDate, report.EndDate, []string{"completed", "failed"})

	// Apply filters
	if len(report.Filters.Suites) > 0 {
		query = query.Where("f.suite IN ?", report.Filters.Suites)
	}
	if len(report.Filters.FlowIDs) > 0 {
		query = query.Where("e.flow_id IN ?", report.Filters.FlowIDs)
	}
	if len(report.Filters.Environments) > 0 {
		query = query.Where("e.environment IN ?", report.Filters.Environments)
	}

	if err := query.Group("e.flow_id, f.name, f.suite").Scan(&results).Error; err != nil {
		return nil, err
	}

	var flowResults []FlowResult
	for _, r := range results {
		var passRate float64
		if r.TotalExecs > 0 {
			passRate = float64(r.PassedExecs) / float64(r.TotalExecs) * 100
		}

		// Check if this flow is marked as flaky
		var isFlaky bool
		flakinessMetric, err := g.reportRepo.GetLatestFlakinessForFlow(r.FlowID)
		if err == nil && flakinessMetric != nil {
			isFlaky = flakinessMetric.IsFlaky
		}

		lastExec := r.LastExecution
		flowResults = append(flowResults, FlowResult{
			FlowID:        r.FlowID.String(),
			FlowName:      r.FlowName,
			Suite:         r.Suite,
			Executions:    r.TotalExecs,
			Passed:        r.PassedExecs,
			Failed:        r.FailedExecs,
			PassRate:      passRate,
			AvgDurationMs: int64(r.AvgDurationMs),
			LastExecution: &lastExec,
			LastStatus:    r.LastStatus,
			IsFlaky:       isFlaky,
		})
	}

	return flowResults, nil
}

// generateHTML generates an HTML report with embedded charts
func (g *Generator) generateHTML(data *ReportData, reportID string) (string, int64, error) {
	funcMap := template.FuncMap{
		"divFloat": func(a int64, b int64) float64 { return float64(a) / float64(b) },
		"mulFloat": func(a float64, b float64) float64 { return a * b },
	}
	tmpl := template.Must(template.New("report").Funcs(funcMap).Parse(htmlReportTemplate))

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", 0, err
	}

	filePath := filepath.Join(g.outputDir, fmt.Sprintf("%s.html", reportID))
	if err := os.WriteFile(filePath, buf.Bytes(), 0644); err != nil {
		return "", 0, err
	}

	info, _ := os.Stat(filePath)
	return filePath, info.Size(), nil
}

// generateJSON generates a JSON report
func (g *Generator) generateJSON(data *ReportData, reportID string) (string, int64, error) {
	jsonBytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return "", 0, err
	}

	filePath := filepath.Join(g.outputDir, fmt.Sprintf("%s.json", reportID))
	if err := os.WriteFile(filePath, jsonBytes, 0644); err != nil {
		return "", 0, err
	}

	info, _ := os.Stat(filePath)
	return filePath, info.Size(), nil
}

// generateJUnit generates a JUnit XML report (CI/CD compatible)
func (g *Generator) generateJUnit(data *ReportData, reportID string) (string, int64, error) {
	testSuites := JUnitTestSuites{
		Name:     data.Name,
		Tests:    data.Summary.TotalExecutions,
		Failures: data.Summary.FailedExecs,
		Time:     float64(data.Summary.TotalDurationMs) / 1000.0,
	}

	// Group flows by suite
	suiteMap := make(map[string][]FlowResult)
	for _, fr := range data.FlowResults {
		suiteMap[fr.Suite] = append(suiteMap[fr.Suite], fr)
	}

	for suiteName, flows := range suiteMap {
		suite := JUnitTestSuite{
			Name: suiteName,
		}

		for _, fr := range flows {
			var totalTime float64
			totalTime = float64(fr.AvgDurationMs*int64(fr.Executions)) / 1000.0

			testCase := JUnitTestCase{
				Name:      fr.FlowName,
				Classname: suiteName,
				Time:      totalTime,
			}

			if fr.Failed > 0 {
				testCase.Failure = &JUnitFailure{
					Message: fmt.Sprintf("%d out of %d executions failed", fr.Failed, fr.Executions),
					Type:    "AssertionError",
				}
			}

			suite.TestCases = append(suite.TestCases, testCase)
			suite.Tests += fr.Executions
			suite.Failures += fr.Failed
			suite.Time += totalTime
		}

		testSuites.TestSuites = append(testSuites.TestSuites, suite)
	}

	xmlBytes, err := xml.MarshalIndent(testSuites, "", "  ")
	if err != nil {
		return "", 0, err
	}

	// Add XML header
	xmlContent := []byte(xml.Header + string(xmlBytes))

	filePath := filepath.Join(g.outputDir, fmt.Sprintf("%s.xml", reportID))
	if err := os.WriteFile(filePath, xmlContent, 0644); err != nil {
		return "", 0, err
	}

	info, _ := os.Stat(filePath)
	return filePath, info.Size(), nil
}

// GetReportFile retrieves the file content for a report
func (g *Generator) GetReportFile(reportID uuid.UUID) ([]byte, string, error) {
	report, err := g.reportRepo.GetReportByID(reportID)
	if err != nil {
		return nil, "", err
	}

	if report.Status != models.ReportStatusCompleted {
		return nil, "", fmt.Errorf("report is not ready: status=%s", report.Status)
	}

	content, err := os.ReadFile(report.FilePath)
	if err != nil {
		return nil, "", err
	}

	// Determine content type
	var contentType string
	switch report.Format {
	case models.ReportFormatHTML:
		contentType = "text/html"
	case models.ReportFormatJSON:
		contentType = "application/json"
	case models.ReportFormatJUnit:
		contentType = "application/xml"
	}

	return content, contentType, nil
}

// JUnit XML structures
type JUnitTestSuites struct {
	XMLName    xml.Name         `xml:"testsuites"`
	Name       string           `xml:"name,attr"`
	Tests      int              `xml:"tests,attr"`
	Failures   int              `xml:"failures,attr"`
	Time       float64          `xml:"time,attr"`
	TestSuites []JUnitTestSuite `xml:"testsuite"`
}

type JUnitTestSuite struct {
	Name      string          `xml:"name,attr"`
	Tests     int             `xml:"tests,attr"`
	Failures  int             `xml:"failures,attr"`
	Time      float64         `xml:"time,attr"`
	TestCases []JUnitTestCase `xml:"testcase"`
}

type JUnitTestCase struct {
	Name      string        `xml:"name,attr"`
	Classname string        `xml:"classname,attr"`
	Time      float64       `xml:"time,attr"`
	Failure   *JUnitFailure `xml:"failure,omitempty"`
}

type JUnitFailure struct {
	Message string `xml:"message,attr"`
	Type    string `xml:"type,attr"`
	Content string `xml:",chardata"`
}

// HTML template
const htmlReportTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{.Name}} - TestMesh Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; background: #f5f5f5; color: #333; line-height: 1.6; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        h1 { font-size: 2rem; margin-bottom: 10px; }
        h2 { font-size: 1.5rem; margin: 30px 0 15px; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px; }
        .meta { color: #666; margin-bottom: 20px; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .card h3 { font-size: 0.9rem; color: #666; text-transform: uppercase; margin-bottom: 5px; }
        .card .value { font-size: 2rem; font-weight: bold; }
        .card .value.success { color: #22c55e; }
        .card .value.error { color: #ef4444; }
        .card .value.warning { color: #f59e0b; }
        .chart-container { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 30px; }
        table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #e0e0e0; }
        th { background: #f8f8f8; font-weight: 600; }
        tr:last-child td { border-bottom: none; }
        .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 500; }
        .badge.passed { background: #dcfce7; color: #166534; }
        .badge.failed { background: #fee2e2; color: #991b1b; }
        .badge.flaky { background: #fef3c7; color: #92400e; }
        .progress-bar { width: 100px; height: 8px; background: #e0e0e0; border-radius: 4px; overflow: hidden; }
        .progress-bar .fill { height: 100%; background: #22c55e; }
        footer { text-align: center; padding: 20px; color: #666; font-size: 0.9rem; }
    </style>
</head>
<body>
    <div class="container">
        <h1>{{.Name}}</h1>
        <p class="meta">Generated: {{.GeneratedAt.Format "2006-01-02 15:04:05 UTC"}} | Period: {{.StartDate.Format "2006-01-02"}} to {{.EndDate.Format "2006-01-02"}}</p>

        <h2>Summary</h2>
        <div class="summary-grid">
            <div class="card">
                <h3>Total Executions</h3>
                <div class="value">{{.Summary.TotalExecutions}}</div>
            </div>
            <div class="card">
                <h3>Pass Rate</h3>
                <div class="value {{if ge .Summary.PassRate 90.0}}success{{else if ge .Summary.PassRate 70.0}}warning{{else}}error{{end}}">{{printf "%.1f" .Summary.PassRate}}%</div>
            </div>
            <div class="card">
                <h3>Passed</h3>
                <div class="value success">{{.Summary.PassedExecs}}</div>
            </div>
            <div class="card">
                <h3>Failed</h3>
                <div class="value {{if gt .Summary.FailedExecs 0}}error{{end}}">{{.Summary.FailedExecs}}</div>
            </div>
            <div class="card">
                <h3>Flaky Tests</h3>
                <div class="value {{if gt .Summary.FlakyCount 0}}warning{{end}}">{{.Summary.FlakyCount}}</div>
            </div>
            <div class="card">
                <h3>Avg Duration</h3>
                <div class="value">{{printf "%.2f" (divFloat .Summary.AvgDurationMs 1000)}}s</div>
            </div>
        </div>

        <h2>Daily Trend</h2>
        <div class="chart-container">
            <canvas id="trendChart" height="100"></canvas>
        </div>

        <h2>Flow Results</h2>
        <table>
            <thead>
                <tr>
                    <th>Flow</th>
                    <th>Suite</th>
                    <th>Executions</th>
                    <th>Pass Rate</th>
                    <th>Status</th>
                    <th>Avg Duration</th>
                </tr>
            </thead>
            <tbody>
                {{range .FlowResults}}
                <tr>
                    <td>{{.FlowName}}</td>
                    <td>{{.Suite}}</td>
                    <td>{{.Executions}}</td>
                    <td>
                        <div class="progress-bar"><div class="fill" style="width: {{printf "%.0f" .PassRate}}%"></div></div>
                        {{printf "%.1f" .PassRate}}%
                    </td>
                    <td>
                        {{if .IsFlaky}}<span class="badge flaky">Flaky</span>{{end}}
                        {{if eq .LastStatus "completed"}}<span class="badge passed">Passed</span>{{else}}<span class="badge failed">Failed</span>{{end}}
                    </td>
                    <td>{{printf "%.2f" (divFloat .AvgDurationMs 1000)}}s</td>
                </tr>
                {{end}}
            </tbody>
        </table>

        {{if .FlakyTests}}
        <h2>Flaky Tests</h2>
        <table>
            <thead>
                <tr>
                    <th>Flow</th>
                    <th>Flakiness Score</th>
                    <th>Transitions</th>
                    <th>Total Executions</th>
                </tr>
            </thead>
            <tbody>
                {{range .FlakyTests}}
                <tr>
                    <td>{{.FlowName}}</td>
                    <td>{{printf "%.2f" (mulFloat .FlakinessScore 100)}}%</td>
                    <td>{{.Transitions}}</td>
                    <td>{{.TotalExecs}}</td>
                </tr>
                {{end}}
            </tbody>
        </table>
        {{end}}

        {{if .TopFailures}}
        <h2>Top Failures</h2>
        <table>
            <thead>
                <tr>
                    <th>Flow</th>
                    <th>Step</th>
                    <th>Action</th>
                    <th>Failures</th>
                    <th>Failure Rate</th>
                </tr>
            </thead>
            <tbody>
                {{range .TopFailures}}
                <tr>
                    <td>{{.FlowName}}</td>
                    <td>{{.StepName}}</td>
                    <td>{{.Action}}</td>
                    <td>{{.FailureCount}}</td>
                    <td>{{printf "%.1f" .FailureRate}}%</td>
                </tr>
                {{end}}
            </tbody>
        </table>
        {{end}}

        <footer>
            Generated by TestMesh | Report ID: {{.ReportID}}
        </footer>
    </div>

    <script>
        const ctx = document.getElementById('trendChart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: [{{range .DailyStats}}'{{.Date}}',{{end}}],
                datasets: [{
                    label: 'Pass Rate',
                    data: [{{range .DailyStats}}{{printf "%.1f" .PassRate}},{{end}}],
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true, max: 100, title: { display: true, text: 'Pass Rate (%)' } }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    </script>
</body>
</html>`

