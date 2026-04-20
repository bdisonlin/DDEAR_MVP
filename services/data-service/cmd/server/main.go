// DDEAR Data Service — file upload / download for CSV interval data.
package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/ddear/data-service/internal/handler"
	"github.com/ddear/data-service/internal/storage"
)

func main() {
	dataDir := getEnv("DATA_DIR", "/data/uploads")
	port := getEnv("PORT", "8080")

	store, err := storage.NewLocalStorage(dataDir)
	if err != nil {
		log.Fatalf("storage init failed: %v", err)
	}

	fileHandler := handler.NewFileHandler(store)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(corsMiddleware)

	r.Get("/health", handler.Health)

	r.Route("/api/v1", func(r chi.Router) {
		r.Route("/files", func(r chi.Router) {
			r.Post("/upload", fileHandler.Upload)
			r.Get("/{fileID}", fileHandler.Download)
			r.Delete("/{fileID}", fileHandler.Delete)
		})
	})

	log.Printf("data-service listening on :%s, data dir: %s", port, dataDir)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatal(err)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	allowedOrigin := getEnv("ALLOWED_ORIGINS", "*")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
