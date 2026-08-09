#!/usr/bin/env bash
#
# Cuenta líneas de código del repo, agrupadas por extensión.
#
# El inventario de archivos sale de `git ls-files`, así que hereda el .gitignore:
# node_modules, dist, .next, .venv y demás quedan fuera solos. Se incluyen los
# archivos nuevos todavía sin commitear (--others --exclude-standard) para que el
# conteo refleje el árbol de trabajo, no el último commit.
#
# Uso:
#   scripts/loc.sh                  # todo el repo
#   scripts/loc.sh apps/gateway     # solo esa ruta (pathspec relativo a la raíz)
#   scripts/loc.sh apps packages

set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  sed -n '3,13p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "loc.sh: esto no es un repo git" >&2
  exit 1
}
cd "$ROOT"

# Cosas que sí están versionadas pero no las escribimos nosotros, o que son
# binarios donde "línea" no significa nada.
should_skip() {
  case "$1" in
    */__pycache__/*|*.pyc) return 0 ;;      # bytecode de Python
    *.lock|pnpm-lock.yaml) return 0 ;;      # lockfiles generados
    LICENSE|*/LICENSE) return 0 ;;          # texto de licencia estándar
    *.min.js|*.min.css) return 0 ;;         # bundles minificados
    next-env.d.ts|*/next-env.d.ts) return 0 ;;
  esac
  case "${1##*.}" in
    png|jpg|jpeg|gif|ico|svg|webp|avif|woff|woff2|ttf|otf|eot|pdf|zip|gz|tgz|tar|mp4|mp3)
      return 0 ;;
  esac
  return 1
}

LIST=$(mktemp)
trap 'rm -f "$LIST"' EXIT

skipped=0
while IFS= read -r -d '' file; do
  if should_skip "$file"; then
    skipped=$((skipped + 1))
    continue
  fi
  # Red de seguridad: si el archivo trae bytes binarios, fuera.
  if ! grep -Iq . -- "$file" 2>/dev/null; then
    # Vacío o binario. Los vacíos sí cuentan como archivo, los binarios no.
    if [[ -s "$file" ]]; then
      skipped=$((skipped + 1))
      continue
    fi
  fi
  printf '%s\n' "$file" >>"$LIST"
done < <(git ls-files -z --cached --others --exclude-standard -- "$@")

awk -v listfile="$LIST" -v skipped="$skipped" '
function keyof(path,   base, ext) {
  base = path
  sub(/^.*\//, "", base)
  if (base ~ /^Dockerfile/) return "Dockerfile"
  if (base == "Makefile")   return "Makefile"
  if (base !~ /\./)         return "(sin extensión)"
  ext = base
  sub(/^.*\./, "", ext)
  return "." tolower(ext)
}

function nameof(k) {
  return (k in LANG) ? LANG[k] : "—"
}

BEGIN {
  LANG[".ts"]     = "TypeScript"
  LANG[".tsx"]    = "TypeScript (React)"
  LANG[".js"]     = "JavaScript"
  LANG[".mjs"]    = "JavaScript (ESM)"
  LANG[".jsx"]    = "JavaScript (React)"
  LANG[".py"]     = "Python"
  LANG[".sql"]    = "SQL"
  LANG[".prisma"] = "Prisma"
  LANG[".proto"]  = "Protobuf"
  LANG[".json"]   = "JSON"
  LANG[".yaml"]   = "YAML"
  LANG[".yml"]    = "YAML"
  LANG[".toml"]   = "TOML"
  LANG[".ini"]    = "INI"
  LANG[".css"]    = "CSS"
  LANG[".scss"]   = "Sass"
  LANG[".html"]   = "HTML"
  LANG[".hbs"]    = "Handlebars"
  LANG[".md"]     = "Markdown"
  LANG[".sh"]     = "Shell"
  LANG[".bash"]   = "Shell"
  LANG[".fish"]   = "Fish"
  LANG["Dockerfile"] = "Docker"
  LANG["Makefile"]   = "Make"

  while ((getline path < listfile) > 0) {
    k = keyof(path)
    files[k]++
    nfiles++
    while ((getline line < path) > 0) {
      lines[k]++
      total++
      if (line ~ /^[ \t\r]*$/) blank[k]++
    }
    close(path)
  }

  if (nfiles == 0) {
    print "No hay archivos que contar con ese filtro."
    exit 1
  }

  fmt = "%-22s %-16s %8s %10s %11s %7s\n"
  printf fmt, "LENGUAJE", "EXT", "ARCHIVOS", "LÍNEAS", "EN BLANCO", "%"
  printf "%s\n", sep(78)

  n = 0
  for (k in lines) order[++n] = k
  # Orden descendente por líneas (inserción; son un par de docenas de filas).
  for (i = 2; i <= n; i++) {
    tmp = order[i]
    for (j = i - 1; j >= 1 && lines[order[j]] < lines[tmp]; j--) order[j + 1] = order[j]
    order[j + 1] = tmp
  }

  for (i = 1; i <= n; i++) {
    k = order[i]
    printf fmt, nameof(k), k, files[k], group(lines[k]), group(blank[k] + 0),
      sprintf("%.1f", lines[k] * 100 / total)
  }

  printf "%s\n", sep(78)
  printf fmt, "TOTAL", "", nfiles, group(total), "", "100.0"

  if (skipped > 0)
    printf "\n(%d archivos omitidos: binarios, lockfiles y generados)\n", skipped
}

function sep(n,   s) { while (length(s) < n) s = s "-"; return s }

# Separador de miles, para que 40000 no se lea como 4000.
function group(x,   s, out, len, i) {
  s = sprintf("%d", x)
  len = length(s)
  for (i = 1; i <= len; i++) {
    out = out substr(s, i, 1)
    if ((len - i) % 3 == 0 && i < len) out = out ","
  }
  return out
}
'
