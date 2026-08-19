#!/usr/bin/env bash
#
# Compara las variables de entorno de un servicio de Cloud Run contra lo declarado en el
# repo. Sirve para dos cosas:
#
#   1. ANTES del primer deploy declarativo: confirmar que los archivos versionados
#      reproducen exactamente lo que hay hoy en producción. `--env-vars-file` y
#      `--set-secrets` REEMPLAZAN su conjunto completo, así que una variable que falte
#      aquí se borra del servicio.
#   2. DESPUÉS: detectar que alguien tocó algo a mano desde la consola.
#
# Uso:  pnpm run env:diff gateway        (o ./scripts/diff-env.sh [gateway|agents])
#
# Salida 0 = el servicio coincide con el repo. Salida 1 = hay diferencias.

set -euo pipefail

SERVICE="${1:-gateway}"
REGION="${REGION:-us-central1}"
PROJECT="${PROJECT:-fractal-tesseract}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/infrastructure/gcp/$SERVICE.env.yaml"
BUILD_FILE="$ROOT/infrastructure/gcp/cloudbuild.yaml"

for f in "$ENV_FILE" "$BUILD_FILE"; do
  [[ -f "$f" ]] || { echo "No existe $f" >&2; exit 2; }
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ── Lo que hay desplegado ─────────────────────────────────────────────────────
gcloud run services describe "$SERVICE" \
  --region="$REGION" --project="$PROJECT" --format=json \
  > "$TMP/live.json"

jq -r '.spec.template.spec.containers[0].env[]? | select(.value != null)
  | "\(.name)=\(.value)"' "$TMP/live.json" | sort > "$TMP/live.plain"

jq -r '.spec.template.spec.containers[0].env[]? | select(.valueFrom != null)
  | "\(.name)=\(.valueFrom.secretKeyRef.name):\(.valueFrom.secretKeyRef.key)"' \
  "$TMP/live.json" | sort > "$TMP/live.secrets"

# ── Lo que dice el repo ───────────────────────────────────────────────────────
# El .env.yaml lo escribimos nosotros con un formato fijo (`CLAVE: "valor"`), así que
# basta sed. `{}` es el YAML vacío válido que espera gcloud cuando no hay planas.
grep -vE '^\s*(#|$|\{\}\s*$)' "$ENV_FILE" \
  | sed -E 's/^([A-Za-z0-9_]+): *"(.*)"$/\1=\2/' \
  | sort > "$TMP/repo.plain"

# Del cloudbuild.yaml se extrae el --set-secrets del paso de deploy correspondiente.
awk -v svc="deploy-$SERVICE" '
  $0 ~ ("id: ." svc)  { inside = 1 }
  inside && /^  - name:/ && !/cloud-sdk/ { inside = 0 }
  inside && /--set-secrets=/ {
    sub(/^.*--set-secrets=/, ""); print; exit
  }
' "$BUILD_FILE" | tr ',' '\n' | grep -v '^$' | sort > "$TMP/repo.secrets"

# ── Comparación ───────────────────────────────────────────────────────────────
status=0

report() {
  local label="$1" repo="$2" live="$3"
  if diff -q "$repo" "$live" >/dev/null; then
    printf '  OK   %-8s %s entradas\n' "$label" "$(wc -l < "$repo" | tr -d ' ')"
  else
    status=1
    printf '  DIFF %s\n' "$label"
    diff --label "repo" --label "desplegado" -u "$repo" "$live" \
      | sed -n '3,$p' | sed 's/^/       /'
  fi
}

echo "Servicio: $SERVICE ($PROJECT / $REGION)"
report "planas"  "$TMP/repo.plain"   "$TMP/live.plain"
report "secretos" "$TMP/repo.secrets" "$TMP/live.secrets"

if [[ $status -eq 0 ]]; then
  echo "El servicio coincide con el repo."
else
  echo
  echo "Hay diferencias. '-' = solo en el repo, '+' = solo en el servicio."
  echo "Un '+' significa que esa variable SE VA A BORRAR en el próximo deploy."
fi

exit $status
