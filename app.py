import os
import json
from pathlib import Path
from flask import Flask, render_template, send_file, jsonify, request, abort

app = Flask(__name__)

CONFIG_FILE = Path(__file__).parent / ".comics_config.json"


def _load_config() -> dict:
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE, "r") as f:
            return json.load(f)
    return {}


def _save_config(cfg: dict) -> None:
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f, indent=2)


_config = _load_config()
# ── Configure this to your comics root folder ──────────────────────────────
COMICS_DIR = Path(_config.get("comics_dir") or os.environ.get("COMICS_DIR") or "./comics").expanduser().resolve()
# ───────────────────────────────────────────────────────────────────────────

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp"}


def is_image(p: Path) -> bool:
    return p.is_file() and p.suffix.lower() in IMAGE_EXTS


def scan_entry(path: Path) -> dict | None:
    """Return metadata for one comic entry (folder or one-shot dir)."""
    if not path.is_dir():
        return None

    children = sorted(path.iterdir())
    images = [c for c in children if is_image(c)]
    chapters = [c for c in children if c.is_dir()]

    if images and not chapters:
        # One-shot: images sit directly inside
        cover = images[0]
        return {
            "name": path.name,
            "type": "oneshot",
            "cover": f"/img/{path.relative_to(COMICS_DIR)}/{cover.name}",
            "pages": len(images),
            "chapters": 0,
        }
    elif chapters:
        # Multi-chapter: sub-folders are chapters
        # Try to find a cover in the first chapter
        first_ch = sorted(chapters)[0]
        ch_images = sorted(p for p in first_ch.iterdir() if is_image(p))
        cover = ch_images[0] if ch_images else None
        return {
            "name": path.name,
            "type": "series",
            "cover": (
                f"/img/{first_ch.relative_to(COMICS_DIR)}/{cover.name}"
                if cover
                else None
            ),
            "pages": 0,
            "chapters": len(chapters),
        }
    return None


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/library")
def api_library():
    if not COMICS_DIR.exists():
        return jsonify([])
    entries = []
    for child in sorted(COMICS_DIR.iterdir()):
        meta = scan_entry(child)
        if meta:
            entries.append(meta)
    return jsonify(entries)


@app.route("/api/chapters/<path:comic_path>")
def api_chapters(comic_path):
    base = COMICS_DIR / comic_path
    if not base.is_dir():
        abort(404)
    chapters = sorted(c for c in base.iterdir() if c.is_dir())
    result = []
    for ch in chapters:
        imgs = sorted(p for p in ch.iterdir() if is_image(p))
        result.append(
            {
                "name": ch.name,
                "path": f"{comic_path}/{ch.name}",
                "pages": len(imgs),
                "cover": (
                    f"/img/{ch.relative_to(COMICS_DIR)}/{imgs[0].name}"
                    if imgs
                    else None
                ),
            }
        )
    return jsonify(result)


@app.route("/api/pages/<path:chapter_path>")
def api_pages(chapter_path):
    base = COMICS_DIR / chapter_path
    if not base.is_dir():
        abort(404)
    imgs = sorted(p for p in base.iterdir() if is_image(p))
    return jsonify(
        [f"/img/{chapter_path}/{img.name}" for img in imgs]
    )


@app.route("/img/<path:rel>")
def serve_image(rel):
    full = COMICS_DIR / rel
    if not full.is_file() or not is_image(full):
        abort(404)
    return send_file(full)


@app.route("/read/<path:read_path>")
def reader(read_path):
    return render_template("reader.html", read_path=read_path)


@app.route("/series/<path:series_path>")
def series(series_path):
    return render_template("series.html", series_path=series_path)


@app.route("/api/config", methods=["GET"])
def api_get_config():
    return jsonify({"comics_dir": str(COMICS_DIR.resolve())})


@app.route("/api/config", methods=["POST"])
def api_set_config():
    global COMICS_DIR
    data = request.get_json(silent=True) or {}
    new_path = data.get("comics_dir", "").strip()
    if not new_path:
        return jsonify({"error": "No path provided"}), 400
    p = Path(new_path).expanduser().resolve()
    if not p.exists():
        return jsonify({"error": "Path does not exist"}), 400
    if not p.is_dir():
        return jsonify({"error": "Path is not a directory"}), 400
    COMICS_DIR = p
    _save_config({"comics_dir": str(p)})
    return jsonify({"comics_dir": str(p)})


if __name__ == "__main__":
    COMICS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"📚  Comics dir : {COMICS_DIR.resolve()}")
    print(f"🌐  Open       : http://localhost:5000")
    app.run(debug=True, port=5000)