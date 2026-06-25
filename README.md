# CanvasCritique

A handwriting practice application built with Svelte 5, Vite, and Tauri v2.

## WSL Development & Windows Build Guide

To develop this project inside WSL (Windows Subsystem for Linux) and compile it into a native Windows executable (`.exe`), follow this guide.

### Prerequisites (WSL)

Run the following commands inside your WSL terminal to set up the build tools:

1. **Install Node.js & npm:**
   Ensure you have Node.js (LTS version recommended) and npm installed.

2. **Install Rust:**
   Install Rust via rustup if you haven't already:
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source $HOME/.cargo/env
   ```

3. **Install Debian Packages:**
   Install the required cross-compilation packages (`clang`, `lld`, and optionally `nsis` to build the setup installer):
   ```bash
   sudo apt update
   sudo apt install -y lld clang nsis
   ```

4. **Add the Windows MSVC Target to Rust:**
   ```bash
   rustup target add x86_64-pc-windows-msvc
   ```

5. **Install `cargo-xwin`:**
   Installs the tool that fetches and configures the Windows SDK headers:
   ```bash
   cargo install --locked cargo-xwin
   ```

6. **Link the LLVM Resource Compiler:**
   Tauri relies on `llvm-rc` to compile Windows resource files. Link your versioned LLVM resource compiler into Cargo's binary path:
   ```bash
   ln -sf /usr/bin/llvm-rc-18 $HOME/.cargo/bin/llvm-rc
   ```

---

### Commands

This project includes a `Makefile` to quickly run commands:

* **Start the development server:**
  ```bash
  make dev
  ```

* **Build the Windows Application (.exe):**
  ```bash
  make build
  ```

* **Clean build output files:**
  ```bash
  make clean
  ```

* **Perform a deep clean (including node_modules):**
  ```bash
  make clean-all
  ```

---

### Where to Find the Build Artifacts

After running `make build`, the outputs are located at:

* **Raw Standalone Executable (`canvascritique.exe`):**
  `src-tauri/target/x86_64-pc-windows-msvc/release/canvascritique.exe`
  *(You can run this `.exe` directly on your Windows host by navigating to `\\wsl.localhost\Ubuntu\home\franz\dev\handwritig-corrector\src-tauri\target\x86_64-pc-windows-msvc\release\`)*

* **Setup Installer (`CanvasCritique_<version>_x64-setup.exe`):**
  `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`
