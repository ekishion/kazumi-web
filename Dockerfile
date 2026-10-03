# Stage 1: Build Go Server
FROM golang:1.26-alpine AS backend-builder
WORKDIR /app/server
RUN apk add --no-cache ca-certificates git
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o kazumi-web ./cmd/server

# Stage 2: Minimal Runtime
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app

ENV PORT=8080
ENV DATA_DIR=/app/data
VOLUME /app/data

COPY --from=backend-builder /app/server/kazumi-web /app/kazumi-web

EXPOSE 8080
ENTRYPOINT ["/app/kazumi-web"]
