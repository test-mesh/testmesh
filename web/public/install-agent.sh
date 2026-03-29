#!/bin/sh
set -e

REPO="test-mesh/testmesh"
BINARY="testmesh-agent"
INSTALL_DIR="${TESTMESH_INSTALL_DIR:-/usr/local/bin}"

# Parse arguments
VERSION=""
for arg in "$@"; do
  case "$arg" in
    --version=*) VERSION="${arg#--version=}" ;;
    --version)   shift; VERSION="$1" ;;
  esac
done

# Detect OS
OS="$(uname -s)"
case "$OS" in
  Linux)  OS="linux" ;;
  Darwin) OS="macOS" ;;
  *)
    echo "Unsupported OS: $OS" >&2
    exit 1
    ;;
esac

# Detect architecture
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)         ARCH="amd64" ;;
  arm64|aarch64)  ARCH="arm64" ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

# Fetch latest version if not specified
if [ -z "$VERSION" ]; then
  VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')"
  if [ -z "$VERSION" ]; then
    echo "Failed to fetch latest version" >&2
    exit 1
  fi
fi

# Strip leading 'v' from version for archive name
VER="${VERSION#v}"

ARCHIVE="${BINARY}_${VER}_${OS}_${ARCH}"
if [ "$OS" = "linux" ] || [ "$OS" = "macOS" ]; then
  ARCHIVE="${ARCHIVE}.tar.gz"
fi

BASE_URL="https://github.com/${REPO}/releases/download/${VERSION}"
ARCHIVE_URL="${BASE_URL}/${ARCHIVE}"
CHECKSUM_URL="${BASE_URL}/checksums.txt"

echo "Installing testmesh-agent ${VERSION} (${OS}/${ARCH})..."

# Create temp directory
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# Download archive and checksums
curl -fsSL "$ARCHIVE_URL" -o "${TMP_DIR}/${ARCHIVE}"
curl -fsSL "$CHECKSUM_URL" -o "${TMP_DIR}/checksums.txt"

# Verify checksum
cd "$TMP_DIR"
grep "${ARCHIVE}" checksums.txt | sha256sum -c - 2>/dev/null || \
  grep "${ARCHIVE}" checksums.txt | shasum -a 256 -c - 2>/dev/null || {
    echo "Checksum verification failed" >&2
    exit 1
  }

# Extract binary
tar -xzf "${ARCHIVE}" "${BINARY}"

# Install binary
if [ -w "$INSTALL_DIR" ]; then
  mv "${BINARY}" "${INSTALL_DIR}/${BINARY}"
else
  sudo mv "${BINARY}" "${INSTALL_DIR}/${BINARY}"
fi

chmod +x "${INSTALL_DIR}/${BINARY}"

echo "testmesh-agent installed to ${INSTALL_DIR}/${BINARY}"
echo "Run 'testmesh-agent start --token <your-token>' to connect."
