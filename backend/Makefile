BINARY   := kombuwaedu-api
BUILD_DIR := ./build
CMD      := ./cmd/server

.PHONY: build run test lint tidy docker-up docker-down

## build: compile the binary
build:
	go build -o $(BUILD_DIR)/$(BINARY) $(CMD)

## run: run with .env loaded (dev only)
run:
	go run $(CMD)

## test: run all tests
##   On Linux/macOS add -race for race detection (requires CGO_ENABLED=1)
test:
	go test ./... -timeout 60s

## test-race: run tests with race detector (Linux/macOS only)
test-race:
	CGO_ENABLED=1 go test ./... -race -timeout 60s

## lint: vet + staticcheck
lint:
	go vet ./...

## tidy: tidy and verify go.mod
tidy:
	go mod tidy
	go mod verify

## migrate: run schema against DB (requires psql and .env)
migrate:
	@export $$(cat .env | xargs) && \
	  psql "postgres://$$DB_USER:$$DB_PASSWORD@$$DB_HOST:$$DB_PORT/$$DB_NAME?sslmode=disable" \
	       -f sql/schema.sql

## docker-up: start all services (api + postgres + redis)
docker-up:
	docker-compose up --build

## docker-down: stop and remove containers
docker-down:
	docker-compose down
