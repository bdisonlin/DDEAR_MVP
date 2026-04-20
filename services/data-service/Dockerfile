FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod ./
COPY . .
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o data-service ./cmd/server

FROM alpine:3.19
WORKDIR /app
COPY --from=builder /app/data-service .

ENV PORT=8080 \
    DATA_DIR=/data/uploads

VOLUME ["/data"]
EXPOSE 8080

ENTRYPOINT ["/app/data-service"]
