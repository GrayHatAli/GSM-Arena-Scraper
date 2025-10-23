# GSM Arena Scraper - Makefile

.PHONY: help install start stop test scrape cli clean

# Default target
help:
	@echo "GSM Arena Scraper - Available Commands:"
	@echo ""
	@echo "  make install    - Install dependencies"
	@echo "  make start      - Start API server"
	@echo "  make stop       - Stop API server"
	@echo "  make test       - Test API connection"
	@echo "  make scrape     - Run CLI scraping"
	@echo "  make cli        - Run CLI scraping (alias)"
	@echo "  make clean      - Clean output files"
	@echo "  make help       - Show this help"

# Install dependencies
install:
	@echo "📦 Installing dependencies..."
	npm install
	@echo "✅ Dependencies installed"

# Start API server
start:
	@echo "🚀 Starting GSM Arena Scraper API..."
	npm start

# Stop API server (if running)
stop:
	@echo "🛑 Stopping API server..."
	@pkill -f "node src/index.js server" || echo "No server running"

# Test API connection
test:
	@echo "🧪 Testing API connection..."
	npm test

# Run CLI scraping
scrape:
	@echo "📡 Running CLI scraping..."
	npm run scrape

# Alias for scrape
cli: scrape

# Clean output files
clean:
	@echo "🧹 Cleaning output files..."
	rm -rf output/*.json
	@echo "✅ Output files cleaned"

# Development mode
dev:
	@echo "🔧 Starting development mode..."
	npm run dev

# Full setup (install + start)
setup: install start

# Quick test (install + test)
quick-test: install test