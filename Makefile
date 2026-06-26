# Makefile for Canvas Critique

.PHONY: dev build-installer build-portable clean clean-all help

# Show help by default
help:
	@echo "Available commands:"
	@echo "  make dev             - Start the frontend development server"
	@echo "  make build-installer - Build the Windows installer (.exe) from WSL"
	@echo "  make build-portable  - Build the portable Windows application (.exe) from WSL"
	@echo "  make clean           - Clean build artifacts (dist/, src-tauri/target/, src-tauri/gen/)"
	@echo "  make clean-all       - Clean everything including node_modules"

dev:
	npm run dev

build-installer:
	PATH="$$HOME/.cargo/bin:$$PATH" npm run tauri build -- --target x86_64-pc-windows-msvc --runner cargo-xwin

build-portable:
	PATH="$$HOME/.cargo/bin:$$PATH" npm run tauri build -- --target x86_64-pc-windows-msvc --runner cargo-xwin --no-bundle

clean:
	rm -rf dist
	rm -rf src-tauri/target
	rm -rf src-tauri/gen

clean-all: clean
	rm -rf node_modules
