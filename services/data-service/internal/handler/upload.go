// Package handler wires HTTP endpoints to storage operations.
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/ddear/data-service/internal/storage"
)

type FileHandler struct {
	store *storage.LocalStorage
}

func NewFileHandler(s *storage.LocalStorage) *FileHandler {
	return &FileHandler{store: s}
}

// Upload accepts multipart/form-data with field "file".
func (h *FileHandler) Upload(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(64 << 20); err != nil { // 64 MB limit
		http.Error(w, "request too large", http.StatusRequestEntityTooLarge)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "missing 'file' field", http.StatusBadRequest)
		return
	}
	defer file.Close()

	fileID := uuid.New().String()[:12]
	rec, err := h.store.Save(fileID, header.Filename, file)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(rec)
}

// Download serves a stored CSV file by file_id.
func (h *FileHandler) Download(w http.ResponseWriter, r *http.Request) {
	fileID := chi.URLParam(r, "fileID")
	f, err := h.store.Open(fileID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		http.Error(w, "stat error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", `attachment; filename="`+fileID+`.csv"`)
	http.ServeContent(w, r, fileID+".csv", info.ModTime(), f)
}

// Delete removes a stored file.
func (h *FileHandler) Delete(w http.ResponseWriter, r *http.Request) {
	fileID := chi.URLParam(r, "fileID")
	if err := h.store.Delete(fileID); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
