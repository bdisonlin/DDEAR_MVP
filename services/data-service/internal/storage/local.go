// Package storage handles file persistence on the local filesystem.
// In a cloud environment, swap LocalStorage for an S3/GCS/Azure Blob implementation.
package storage

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

// FileRecord holds metadata for a stored file.
type FileRecord struct {
	FileID     string    `json:"file_id"`
	Filename   string    `json:"filename"`
	Size       int64     `json:"size"`
	UploadTime time.Time `json:"upload_time"`
}

// LocalStorage persists files to a directory on the host filesystem.
// Mount a PersistentVolume at DataDir in Kubernetes.
type LocalStorage struct {
	DataDir string
}

func NewLocalStorage(dataDir string) (*LocalStorage, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}
	return &LocalStorage{DataDir: dataDir}, nil
}

func (s *LocalStorage) Save(fileID, filename string, r io.Reader) (*FileRecord, error) {
	dst := filepath.Join(s.DataDir, fileID+".csv")
	f, err := os.Create(dst)
	if err != nil {
		return nil, fmt.Errorf("create file: %w", err)
	}
	defer f.Close()

	size, err := io.Copy(f, r)
	if err != nil {
		return nil, fmt.Errorf("write file: %w", err)
	}

	return &FileRecord{
		FileID:     fileID,
		Filename:   filename,
		Size:       size,
		UploadTime: time.Now().UTC(),
	}, nil
}

func (s *LocalStorage) Open(fileID string) (*os.File, error) {
	path := filepath.Join(s.DataDir, fileID+".csv")
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("file not found: %s", fileID)
		}
		return nil, err
	}
	return f, nil
}

func (s *LocalStorage) Delete(fileID string) error {
	return os.Remove(filepath.Join(s.DataDir, fileID+".csv"))
}
