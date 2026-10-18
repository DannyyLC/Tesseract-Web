"""
Benchmark de OCR entre modelos, con la MISMA llamada que hace el gateway.

El adapter del gateway (`openai-compatible-media-processor.adapter.ts`) manda la imagen a
`POST {base}/chat/completions` con un system prompt fijo y la imagen como `image_url`. Este
script reproduce ese request para cada modelo candidato, así que mide a la vez:
- compatibilidad: si el proveedor acepta el formato tal cual (Anthropic va por su endpoint
  compatible con OpenAI);
- precisión: qué tanto de los datos clave de cada imagen aparece en la respuesta;
- costo y latencia por imagen.

Las referencias (datos clave por imagen) van en un JSON aparte que NO se versiona, porque las
imágenes de prueba son privadas:

    {"imagen.png": ["texto que debe aparecer", "otro dato", ...], ...}

Uso (desde apps/agents, con OPENAI_API_KEY / ANTHROPIC_API_KEY en el .env de la raíz):
    .venv/bin/python scripts/ocr_benchmark.py <carpeta_imagenes> <referencias.json>

Cuesta centavos, pero gasta: córrelo a propósito.
"""

import base64
import json
import mimetypes
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent


def env(name: str) -> str:
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith(f"{name}="):
            return line.split("=", 1)[1].strip().strip('"')
    return ""


OPENAI = ("https://api.openai.com/v1", env("OPENAI_API_KEY"))
ANTHROPIC = ("https://api.anthropic.com/v1", env("ANTHROPIC_API_KEY"))

# (etiqueta, modelo, proveedor, parámetros extra, precio entrada $/1M, precio salida $/1M)
CANDIDATES = [
    ("gpt-6-luna", "gpt-6-luna", OPENAI, {}, 0.10, 0.50),
    ("gpt-6-luna none", "gpt-6-luna", OPENAI, {"reasoning_effort": "none"}, 0.10, 0.50),
    ("gpt-6.1-sol low", "gpt-6.1-sol", OPENAI, {"reasoning_effort": "low"}, 2.00, 10.00),
    ("claude-haiku-5-5", "claude-haiku-5-5", ANTHROPIC, {}, 0.10, 0.50),
    ("claude-sonnet-5-5", "claude-sonnet-5-5", ANTHROPIC, {}, 2.00, 10.00),
]

# Los mismos textos que usa el adapter. El prompt "completo" es el que pondría un workflow con
# `mediaProcessing.ocrPrompt` cuando necesita todo el texto, no un resumen.
SYSTEM = (
    "Eres un extractor OCR confiable. Extrae el texto visible y una breve descripcion util "
    "de la imagen en espanol."
)
PROMPTS = {
    "default": "Extrae texto y resume contenido visual clave en maximo 6 lineas.",
    "completo": "Transcribe todo el texto visible de la imagen, tal cual aparece y en orden.",
}


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in text if not unicodedata.combining(c)).replace("\\n", " ")


def call(base: str, key: str, model: str, extra: dict, prompt: str, data_uri: str) -> dict:
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": data_uri}},
                ],
            },
        ],
        **extra,
    }
    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read())


def main() -> int:
    images_dir, refs_path = Path(sys.argv[1]), Path(sys.argv[2])
    refs: dict[str, list[str]] = json.loads(refs_path.read_text())
    out_dir = refs_path.parent / "ocr_outputs"
    out_dir.mkdir(exist_ok=True)

    for prompt_name, prompt in PROMPTS.items():
        print(f"\n=== prompt: {prompt_name} ===")
        for label, model, (base, key), extra, pin, pout in CANDIDATES:
            hits = total = 0
            cost = elapsed = 0.0
            errors = []
            for name, items in refs.items():
                path = images_dir / name
                mime = mimetypes.guess_type(path.name)[0] or "image/png"
                data_uri = f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"
                started = time.time()
                try:
                    resp = call(base, key, model, extra, prompt, data_uri)
                except urllib.error.HTTPError as e:
                    errors.append(f"{name}: HTTP {e.code} {e.read()[:160]!r}")
                    total += len(items)
                    continue
                except Exception as e:  # noqa: BLE001 — se reporta tal cual
                    errors.append(f"{name}: {type(e).__name__}: {e}")
                    total += len(items)
                    continue
                elapsed += time.time() - started
                text = resp["choices"][0]["message"].get("content") or ""
                if isinstance(text, list):
                    text = " ".join(p.get("text", "") for p in text)
                (out_dir / f"{prompt_name}__{label.replace(' ', '_')}__{name}.txt").write_text(text)
                found = sum(1 for item in items if normalize(item) in normalize(text))
                hits += found
                total += len(items)
                usage = resp.get("usage") or {}
                cost += usage.get("prompt_tokens", 0) / 1e6 * pin
                cost += usage.get("completion_tokens", 0) / 1e6 * pout

            n = len(refs)
            ok = n - len(errors)
            print(
                f"{label:<20} precision={hits}/{total} ({100 * hits / max(total, 1):.0f}%)  "
                f"costo_x_imagen=${cost / max(ok, 1):.5f}  latencia={elapsed / max(ok, 1):.1f}s  "
                f"ok={ok}/{n}"
            )
            for err in errors[:3]:
                print(f"    ERROR {err}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
