import os
import json
from pathlib import Path
from flask import Flask, render_template, send_file, jsonify, request, abort, redirect, url_for

app = Flask(__name__)

CONFIG_FILE = Path(__file__).parent / ".comics_config.json"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp"}


def _load_config() -> dict:
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE, "r") as f:
            return json.load(f)
    return {}


def _save_config(cfg: dict) -> None:
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f, indent=2)


def _resolve_dirs(raw: dict) -> list[Path]:
    """Resolve the comics_dirs list from config (handles legacy single-path too)."""
    dirs = raw.get("comics_dirs")
    if dirs:
        return [Path(d).expanduser().resolve() for d in dirs]

    # legacy single-path
    single = raw.get("comics_dir") or os.environ.get("COMICS_DIR")
    if single:
        return [Path(single).expanduser().resolve()]

    return [Path("./comics").expanduser().resolve()]


_config = _load_config()
COMICS_DIRS = _resolve_dirs(_config)


def is_image(p: Path) -> bool:
    return p.is_file() and p.suffix.lower() in IMAGE_EXTS


def scan_entry(path: Path) -> dict | None:
    """Return metadata for one comic entry (folder or one-shot dir)."""
    if not path.is_dir():
        return None

    children = sorted(p for p in path.iterdir() if not p.name.startswith('.'))
    images = [c for c in children if is_image(c)]
    
    chapters = []
    for c in children:
        if c.is_dir():
            try:
                if next((p for p in c.rglob("*") if is_image(p) and not any(part.startswith('.') for part in p.relative_to(c).parts)), None):
                    chapters.append(c)
            except Exception:
                pass
                
    if images and not chapters:
        cover = images[0]
        return {
            "name": path.name,
            "type": "oneshot",
            "pages": len(images),
            "chapters": 0,
            "cover_path": cover.name,
        }
    elif chapters:
        first_ch = chapters[0]
        ch_images = []
        try:
            for p in sorted(first_ch.rglob("*")):
                if is_image(p) and not any(part.startswith('.') for part in p.relative_to(first_ch).parts):
                    ch_images.append(p)
        except Exception:
            pass
            
        cover = ch_images[0] if ch_images else None
        cover_rel_str = str(cover.relative_to(path)).replace('\\', '/') if cover else None
        
        return {
            "name": path.name,
            "type": "series",
            "pages": 0,
            "chapters": len(chapters),
            "cover_path": cover_rel_str,
        }
    return None


# ── Routes ────────────────────────────────────────────────────

@app.route("/")
def index():
    if not COMICS_DIRS:
        return redirect(url_for("setup"))
    return render_template("index.html")


@app.route("/setup")
def setup():
    return render_template("setup.html")


@app.route("/api/library")
def api_library():
    entries = []
    for di, root in enumerate(COMICS_DIRS):
        if not root.exists():
            print(f"  ! Lỗi: Không tồn tại đường dẫn {root}")
            continue
            
        added_any = False
        for child in sorted(p for p in root.iterdir() if not p.name.startswith('.')):
            meta = scan_entry(child)
            if meta:
                meta["dir_index"] = di
                meta["dir_path"] = str(root)
                if meta.get("cover_path"):
                    meta["cover"] = f"/img/{di}/{meta['name']}/{meta['cover_path']}"
                entries.append(meta)
                added_any = True
                
        if not added_any:
            print(f"  -> Không có truyện con, quét thử chính gốc '{root.name}'...")
            meta = scan_entry(root)
            if meta:
                meta["dir_index"] = di
                meta["dir_path"] = str(root)
                if meta.get("cover_path"):
                    meta["cover"] = f"/img/{di}/{meta['name']}/{meta['cover_path']}"
                entries.append(meta)
    print(f"--- Quét xong: Hiển thị {len(entries)} truyện ---\n")
    return jsonify(entries)


@app.route("/api/chapters/<int:dir_index>/<path:comic_path>")
def api_chapters(dir_index, comic_path):
    if dir_index >= len(COMICS_DIRS):
        abort(404)
    base = COMICS_DIRS[dir_index] / comic_path
    if not base.is_dir():
        parts = Path(comic_path).parts
        if parts and parts[0] == COMICS_DIRS[dir_index].name:
            base = COMICS_DIRS[dir_index] / Path(*parts[1:])
        if not base.is_dir():
            abort(404)
            
    chapters = []
    for c in sorted(p for p in base.iterdir() if not p.name.startswith('.')):
        if c.is_dir():
            try:
                if next((p for p in c.rglob("*") if is_image(p) and not any(part.startswith('.') for part in p.relative_to(c).parts)), None):
                    chapters.append(c)
            except Exception:
                pass
                
    result = []
    for ch in chapters:
        imgs = []
        try:
            for p in sorted(ch.rglob("*")):
                if is_image(p) and not any(part.startswith('.') for part in p.relative_to(ch).parts):
                    imgs.append(p)
        except Exception:
            pass
            
        if imgs:
            cover_img_rel = imgs[0].relative_to(base)
            cover_img_str = str(cover_img_rel).replace('\\', '/')
            cover_url = f"/img/{dir_index}/{comic_path}/{cover_img_str}"
        else:
            cover_url = None
            
        result.append(
            {
                "name": ch.name,
                "dir_index": dir_index,
                "path": f"{comic_path}/{ch.name}",
                "pages": len(imgs),
                "cover": cover_url,
            }
        )
    return jsonify(result)


@app.route("/api/pages/<int:dir_index>/<path:chapter_path>")
def api_pages(dir_index, chapter_path):
    if dir_index >= len(COMICS_DIRS):
        abort(404)
    base = COMICS_DIRS[dir_index] / chapter_path
    if not base.is_dir():
        parts = Path(chapter_path).parts
        if parts and parts[0] == COMICS_DIRS[dir_index].name:
            base = COMICS_DIRS[dir_index] / Path(*parts[1:])
        if not base.is_dir():
            abort(404)
            
    imgs = []
    try:
        for p in sorted(base.rglob("*")):
            if is_image(p) and not any(part.startswith('.') for part in p.relative_to(base).parts):
                imgs.append(p)
    except Exception:
        pass
        
    return jsonify([f"/img/{dir_index}/{chapter_path}/{img.relative_to(base).as_posix()}" for img in imgs])


@app.route("/img/<int:dir_index>/<path:rel>")
def serve_image(dir_index, rel):
    if dir_index >= len(COMICS_DIRS):
        abort(404)
    full = COMICS_DIRS[dir_index] / rel
    if not full.is_file() or not is_image(full):
        parts = Path(rel).parts
        if parts and parts[0] == COMICS_DIRS[dir_index].name:
            full = COMICS_DIRS[dir_index] / Path(*parts[1:])
        if not full.is_file() or not is_image(full):
            abort(404)
    return send_file(full)


@app.route("/read/<int:dir_index>/<path:read_path>")
def reader(dir_index, read_path):
    return render_template("reader.html", dir_index=dir_index, read_path=read_path)


@app.route("/series/<int:dir_index>/<path:series_path>")
def series(dir_index, series_path):
    return render_template("series.html", dir_index=dir_index, series_path=series_path)


@app.route("/api/config", methods=["GET"])
def api_get_config():
    return jsonify({"comics_dirs": [str(d) for d in COMICS_DIRS]})


@app.route("/api/config/add", methods=["POST"])
def api_config_add():
    global COMICS_DIRS
    data = request.get_json(silent=True) or {}
    new_path = data.get("path", "").strip()
    if not new_path:
        return jsonify({"error": "No path provided"}), 400
    p = Path(new_path).expanduser().resolve()
    if not p.exists():
        return jsonify({"error": "Path does not exist"}), 400
    if not p.is_dir():
        return jsonify({"error": "Path is not a directory"}), 400
    if p in COMICS_DIRS:
        return jsonify({"error": "Path already added"}), 409
    COMICS_DIRS.append(p)
    _save_config({"comics_dirs": [str(d) for d in COMICS_DIRS]})
    return jsonify({"ok": True, "comics_dirs": [str(d) for d in COMICS_DIRS]})


@app.route("/api/config/remove", methods=["POST"])
def api_config_remove():
    global COMICS_DIRS
    data = request.get_json(silent=True) or {}
    idx = data.get("index")
    if idx is None or not isinstance(idx, int) or idx < 0 or idx >= len(COMICS_DIRS):
        return jsonify({"error": "Invalid index"}), 400
    COMICS_DIRS.pop(idx)
    _save_config({"comics_dirs": [str(d) for d in COMICS_DIRS]})
    return jsonify({"ok": True, "comics_dirs": [str(d) for d in COMICS_DIRS]})


if __name__ == "__main__":
    for d in COMICS_DIRS:
        d.mkdir(parents=True, exist_ok=True)
    print(f"[books]  Comics dirs : {[str(d) for d in COMICS_DIRS]}")
    print(f"[web]  Open        : http://localhost:5000")
    app.run(debug=True, port=5000)