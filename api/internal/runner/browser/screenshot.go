package browser

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"time"
)

// ScreenshotManager handles screenshot operations
type ScreenshotManager struct {
	outputDir string
	format    string
	quality   int
}

// NewScreenshotManager creates a new screenshot manager
func NewScreenshotManager(outputDir string) *ScreenshotManager {
	return &ScreenshotManager{
		outputDir: outputDir,
		format:    "png",
		quality:   100,
	}
}

// Screenshot represents a captured screenshot
type Screenshot struct {
	Data      []byte
	Path      string
	Timestamp time.Time
	Width     int
	Height    int
	Format    string
}

// Save saves a screenshot to disk
func (sm *ScreenshotManager) Save(data []byte, name string) (*Screenshot, error) {
	if sm.outputDir != "" {
		if err := os.MkdirAll(sm.outputDir, 0755); err != nil {
			return nil, fmt.Errorf("failed to create output directory: %w", err)
		}
	}

	timestamp := time.Now()
	filename := fmt.Sprintf("%s_%s.%s", name, timestamp.Format("20060102_150405"), sm.format)
	path := filepath.Join(sm.outputDir, filename)

	if err := os.WriteFile(path, data, 0644); err != nil {
		return nil, fmt.Errorf("failed to save screenshot: %w", err)
	}

	// Get dimensions
	width, height := sm.getDimensions(data)

	return &Screenshot{
		Data:      data,
		Path:      path,
		Timestamp: timestamp,
		Width:     width,
		Height:    height,
		Format:    sm.format,
	}, nil
}

// ToBase64 converts screenshot data to base64
func (sm *ScreenshotManager) ToBase64(data []byte) string {
	return base64.StdEncoding.EncodeToString(data)
}

// FromBase64 converts base64 string to screenshot data
func (sm *ScreenshotManager) FromBase64(encoded string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(encoded)
}

// getDimensions extracts image dimensions from PNG data
func (sm *ScreenshotManager) getDimensions(data []byte) (int, int) {
	img, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		return 0, 0
	}
	bounds := img.Bounds()
	return bounds.Dx(), bounds.Dy()
}

// Compare compares two screenshots and returns difference percentage
func (sm *ScreenshotManager) Compare(img1, img2 []byte) (float64, error) {
	image1, err := png.Decode(bytes.NewReader(img1))
	if err != nil {
		return 0, fmt.Errorf("failed to decode first image: %w", err)
	}

	image2, err := png.Decode(bytes.NewReader(img2))
	if err != nil {
		return 0, fmt.Errorf("failed to decode second image: %w", err)
	}

	bounds1 := image1.Bounds()
	bounds2 := image2.Bounds()

	if bounds1.Dx() != bounds2.Dx() || bounds1.Dy() != bounds2.Dy() {
		return 100, nil // Completely different sizes
	}

	var diffPixels int
	totalPixels := bounds1.Dx() * bounds1.Dy()

	for y := bounds1.Min.Y; y < bounds1.Max.Y; y++ {
		for x := bounds1.Min.X; x < bounds1.Max.X; x++ {
			r1, g1, b1, _ := image1.At(x, y).RGBA()
			r2, g2, b2, _ := image2.At(x, y).RGBA()

			if r1 != r2 || g1 != g2 || b1 != b2 {
				diffPixels++
			}
		}
	}

	return float64(diffPixels) / float64(totalPixels) * 100, nil
}

// Diff creates a diff image highlighting differences
func (sm *ScreenshotManager) Diff(img1, img2 []byte) ([]byte, error) {
	image1, err := png.Decode(bytes.NewReader(img1))
	if err != nil {
		return nil, fmt.Errorf("failed to decode first image: %w", err)
	}

	image2, err := png.Decode(bytes.NewReader(img2))
	if err != nil {
		return nil, fmt.Errorf("failed to decode second image: %w", err)
	}

	bounds := image1.Bounds()
	diffImg := image.NewRGBA(bounds)

	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r1, g1, b1, a1 := image1.At(x, y).RGBA()
			r2, g2, b2, _ := image2.At(x, y).RGBA()

			if r1 != r2 || g1 != g2 || b1 != b2 {
				// Highlight difference in red
				diffImg.Set(x, y, color.RGBA{R: 255, G: 0, B: 0, A: uint8(a1 >> 8)})
			} else {
				// Keep original with reduced opacity
				diffImg.Set(x, y, image1.At(x, y))
			}
		}
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, diffImg); err != nil {
		return nil, fmt.Errorf("failed to encode diff image: %w", err)
	}

	return buf.Bytes(), nil
}
