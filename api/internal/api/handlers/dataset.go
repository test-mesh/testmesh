package handlers

import (
	"io"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/api/middleware"
	"github.com/test-mesh/testmesh/internal/filestorage"
	"github.com/test-mesh/testmesh/internal/runner"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"github.com/test-mesh/testmesh/internal/storage/repository"
	"go.uber.org/zap"
)

const maxUploadSize = 50 << 20 // 50 MB

// DatasetHandler handles dataset CRUD and file download.
type DatasetHandler struct {
	repo   *repository.DatasetRepository
	s3     *filestorage.Client
	logger *zap.Logger
}

func NewDatasetHandler(repo *repository.DatasetRepository, s3 *filestorage.Client, logger *zap.Logger) *DatasetHandler {
	return &DatasetHandler{repo: repo, s3: s3, logger: logger}
}

// Upload handles POST /datasets/upload (multipart form)
func (h *DatasetHandler) Upload(c *gin.Context) {
	if h.s3 == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "file storage not configured (MinIO)"})
		return
	}

	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file required"})
		return
	}
	defer file.Close()

	if header.Size > maxUploadSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file too large (max 50 MB)"})
		return
	}

	name := c.PostForm("name")
	if name == "" {
		name = header.Filename
	}
	description := c.PostForm("description")

	// Detect file type
	fileType := ""
	switch {
	case header.Header.Get("Content-Type") == "text/csv",
		len(header.Filename) > 4 && header.Filename[len(header.Filename)-4:] == ".csv":
		fileType = "csv"
	case header.Header.Get("Content-Type") == "application/json",
		len(header.Filename) > 5 && header.Filename[len(header.Filename)-5:] == ".json":
		fileType = "json"
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported file type (csv or json only)"})
		return
	}

	// Read content for parsing metadata
	content, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
		return
	}

	// Parse to get columns and row count
	src := &runner.DataSource{Type: fileType, Content: string(content)}
	_, columns, parseErr := runner.GetDataPreview(src, 1)
	var rowCount int
	if parseErr == nil {
		switch fileType {
		case "csv":
			rows, _ := runner.ParseCSV(string(content))
			rowCount = len(rows)
		case "json":
			rows, _ := runner.ParseJSON(string(content))
			rowCount = len(rows)
		}
	}

	// Create dataset record
	dsID := uuid.New()
	s3Key := filestorage.ObjectKey(workspaceID.String(), dsID.String(), header.Filename)

	ds := &models.Dataset{
		ID:          dsID,
		WorkspaceID: workspaceID,
		Name:        name,
		Description: description,
		FileName:    header.Filename,
		FileType:    fileType,
		MimeType:    header.Header.Get("Content-Type"),
		SizeBytes:   header.Size,
		RowCount:    rowCount,
		Columns:     columns,
		S3Key:       s3Key,
	}

	// Upload to MinIO
	if err := h.s3.Upload(c.Request.Context(), s3Key, newBytesReader(content), int64(len(content)), ds.MimeType); err != nil {
		h.logger.Error("Failed to upload to MinIO", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to store file"})
		return
	}

	// Save metadata to database
	if err := h.repo.Create(ds); err != nil {
		// Clean up the uploaded file on DB failure
		_ = h.s3.Delete(c.Request.Context(), s3Key)
		h.logger.Error("Failed to save dataset", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save dataset"})
		return
	}

	c.JSON(http.StatusCreated, ds)
}

// List handles GET /datasets
func (h *DatasetHandler) List(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	datasets, total, err := h.repo.List(workspaceID, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"datasets": datasets,
		"total":    total,
	})
}

// Get handles GET /datasets/:id
func (h *DatasetHandler) Get(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid dataset id"})
		return
	}

	ds, err := h.repo.GetByID(id, workspaceID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "dataset not found"})
		return
	}

	c.JSON(http.StatusOK, ds)
}

// Download handles GET /datasets/:id/download
func (h *DatasetHandler) Download(c *gin.Context) {
	if h.s3 == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "file storage not configured (MinIO)"})
		return
	}
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid dataset id"})
		return
	}

	ds, err := h.repo.GetByID(id, workspaceID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "dataset not found"})
		return
	}

	reader, err := h.s3.Download(c.Request.Context(), ds.S3Key)
	if err != nil {
		h.logger.Error("Failed to download from MinIO", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch file"})
		return
	}
	defer reader.Close()

	c.Header("Content-Disposition", "attachment; filename=\""+ds.FileName+"\"")
	c.Header("Content-Type", ds.MimeType)
	io.Copy(c.Writer, reader)
}

// GetContent handles GET /datasets/:id/content — returns the raw file content as text.
// Used by the runner to load a stored dataset without downloading to disk.
func (h *DatasetHandler) GetContent(c *gin.Context) {
	if h.s3 == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "file storage not configured (MinIO)"})
		return
	}
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid dataset id"})
		return
	}

	ds, err := h.repo.GetByID(id, workspaceID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "dataset not found"})
		return
	}

	reader, err := h.s3.Download(c.Request.Context(), ds.S3Key)
	if err != nil {
		h.logger.Error("Failed to download from MinIO", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch file"})
		return
	}
	defer reader.Close()

	content, err := io.ReadAll(reader)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"content":   string(content),
		"file_type": ds.FileType,
		"file_name": ds.FileName,
		"row_count": ds.RowCount,
		"columns":   ds.Columns,
	})
}

// Delete handles DELETE /datasets/:id
func (h *DatasetHandler) Delete(c *gin.Context) {
	if h.s3 == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "file storage not configured (MinIO)"})
		return
	}
	workspaceID := middleware.GetWorkspaceID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid dataset id"})
		return
	}

	ds, err := h.repo.GetByID(id, workspaceID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "dataset not found"})
		return
	}

	// Delete from MinIO
	if err := h.s3.Delete(c.Request.Context(), ds.S3Key); err != nil {
		h.logger.Warn("Failed to delete from MinIO (continuing)", zap.Error(err))
	}

	// Delete from database
	if err := h.repo.Delete(id, workspaceID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "dataset deleted"})
}

// bytesReader wraps a byte slice to implement io.Reader.
type bytesReader struct {
	data []byte
	pos  int
}

func newBytesReader(data []byte) *bytesReader {
	return &bytesReader{data: data}
}

func (r *bytesReader) Read(p []byte) (int, error) {
	if r.pos >= len(r.data) {
		return 0, io.EOF
	}
	n := copy(p, r.data[r.pos:])
	r.pos += n
	return n, nil
}
