#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="${ROOT_DIR}/.venv"
PYTHON_BIN="${PYTHON_BIN:-python3}"

echo "[source-pack-runtime] creating virtual environment at ${VENV_DIR}"
"${PYTHON_BIN}" -m venv "${VENV_DIR}"

echo "[source-pack-runtime] upgrading pip tooling"
"${VENV_DIR}/bin/python" -m pip install --upgrade pip setuptools wheel

echo "[source-pack-runtime] installing bundled runtime dependencies"
"${VENV_DIR}/bin/pip" install -r "${ROOT_DIR}/requirements/base.txt"
"${VENV_DIR}/bin/pip" install -e "${ROOT_DIR}/../.."

if [[ "${INSTALL_SERVE_EXTRAS:-0}" == "1" ]]; then
  echo "[source-pack-runtime] installing optional serve dependencies"
  "${VENV_DIR}/bin/pip" install -r "${ROOT_DIR}/requirements/serve.txt"
fi

cat <<EOF
[source-pack-runtime] install complete

Next steps:
1. cd source_pack/ui
2. copy one of:
   - .env.example
   - .env.agency.example
   - .env.production-company.example
   - .env.internal-digital-team.example
3. keep GAME_STUDIO_RUNTIME_MODE=artifact-only until runtime validation is complete
4. switch GAME_STUDIO_RUNTIME_MODE=bundled-cli when you are ready to invoke the packaged runtime
5. export PYTHONPATH="${ROOT_DIR}/python" if you run bundled CLI commands directly
EOF
