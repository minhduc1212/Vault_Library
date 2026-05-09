import os
import json
import logging
from pathlib import Path
from flask import Flask, render_template, send_file, jsonify, request, abort, redirect, url_for
import io
import qrcode
from flask import Response
from flask_cloudflared import run_with_cloudflared, get_cloudflared_url
from models import Database, initialize_database
import requests
import zipfile

app = Flask(__name__)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("vault_library.log", encoding="utf-8")
    ]
)
logger = logging.getLogger(__name__)

CONFIG_FILE = Path(__file__).parent / ".comics_config.json"
DB_PATH = Path(__file__).parent / "comics.db"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp"}

db = Database(str(DB_PATH))
db.connect()
initialize_database(db)


def _add_comics_from_dir(root: Path) -> int:
    """Scan a directory for comic subfolders and insert them into the DB. Returns count added."""
    if not root.is_dir():
        logger.warning(f"Failed to scan directory, path does not exist or is not a directory: {root}")
        return 0
    count = 0
    logger.info(f"Scanning directory for comics: {root}")
    for child in sorted(p for p in root.iterdir() if not p.name.startswith('.') and (p.is_dir() or p.suffix.lower() == '.epub')):
        meta = scan_entry(child)
        if meta is None:
            continue
        db.execute_query(
            "INSERT INTO comics (title, author, genres, description, cover_image, path, type, pages, chapters) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (meta["name"], "", "", "", meta.get("cover_path", ""), str(child), meta["type"], meta["pages"], meta["chapters"])
        )
        count += 1
    logger.info(f"Added {count} comics from {root}")
    return count


def _remove_comics_by_root(root: Path) -> int:
    """Delete all comics whose path is under the given root directory."""
    root_str = str(root)
    db.execute_query("DELETE FROM comics WHERE path LIKE ?", (root_str + "%",))
    logger.info(f"Removed comics under root path: {root_str}")
    # sqlite3 doesn't expose rowcount easily; just return 0 as indicator
    return 0


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
    """Return metadata for one comic entry (folder or epub file)."""
    if path.is_file() and path.suffix.lower() == '.epub':
        cover_path = ""
        try:
            with zipfile.ZipFile(path, 'r') as z:
                # 1. Try standard names in Zip
                for name in z.namelist():
                    name_low = name.lower()
                    if "cover" in name_low and any(name_low.endswith(ext) for ext in IMAGE_EXTS):
                        cover_path = name
                        break
                
                # 2. Just take the first image if it's in a likely folder
                if not cover_path:
                    for name in z.namelist():
                        if any(name.lower().endswith(ext) for ext in IMAGE_EXTS):
                            cover_path = name
                            break
        except Exception as e:
            logger.error(f"Error scanning EPUB {path}: {e}")

        return {
            "name": path.stem,
            "type": "epub",
            "pages": 0,
            "chapters": 0,
            "cover_path": cover_path,
        }

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
        rows = db.execute_query("SELECT COUNT(*) FROM comics")
        if not rows or rows[0][0] == 0:
            return redirect(url_for("setup"))
    return render_template("index.html")


@app.route("/setup")
def setup():
    return render_template("setup.html")


@app.route("/api/library")
def api_library():
    rows = db.execute_query(
        "SELECT id, title, author, genres, description, cover_image, path, type, pages, chapters FROM comics"
    )
    entries = []
    for row in rows:
        comic_id, title, author, genres, description, cover_image, path_str, comic_type, pages, chapters = row
        comic_path = Path(path_str)

        dir_index = -1
        dir_path_str = ""
        for di, root in enumerate(COMICS_DIRS):
            try:
                if comic_path.is_relative_to(root):
                    dir_index = di
                    dir_path_str = str(root)
                    rel_path = comic_path.relative_to(root).as_posix()
                    break
            except AttributeError:
                try:
                    rel_path = comic_path.relative_to(root).as_posix()
                    dir_index = di
                    dir_path_str = str(root)
                    break
                except ValueError:
                    pass

        if dir_index == -1:
            dir_index = 10000 + comic_id
            dir_path_str = path_str
            rel_path = comic_path.name

        entry = {
            "name": title,
            "type": comic_type or "oneshot",
            "pages": pages or 0,
            "chapters": chapters or 0,
            "cover_path": cover_image,
            "dir_index": dir_index,
            "dir_path": dir_path_str,
            "rel_path": rel_path,
        }
        if cover_image:
            entry["cover"] = f"/img/{dir_index}/{rel_path}/{cover_image}"
        entries.append(entry)

    logger.info(f"DB: Displaying {len(entries)} comics")
    return jsonify(entries)


@app.route("/api/chapters/<int:dir_index>/<path:comic_path>")
def api_chapters(dir_index, comic_path):
    if dir_index >= 10000:
        comic_id = dir_index - 10000
        rows = db.execute_query("SELECT path FROM comics WHERE id = ?", (comic_id,))
        if not rows:
            abort(404)
        base = Path(rows[0][0])
        if not base.is_dir():
            abort(404)
    else:
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
    if dir_index >= 10000:
        comic_id = dir_index - 10000
        rows = db.execute_query("SELECT path FROM comics WHERE id = ?", (comic_id,))
        if not rows:
            abort(404)
        comic_base = Path(rows[0][0])
        parts = Path(chapter_path).parts
        if parts and parts[0] == comic_base.name:
            base = comic_base / Path(*parts[1:])
        else:
            base = comic_base / chapter_path
        if not base.is_dir():
            abort(404)
    else:
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
    if dir_index >= 10000:
        comic_id = dir_index - 10000
        rows = db.execute_query("SELECT path FROM comics WHERE id = ?", (comic_id,))
        if not rows: abort(404)
        comic_base = Path(rows[0][0])
    else:
        if dir_index >= len(COMICS_DIRS): abort(404)
        comic_base = COMICS_DIRS[dir_index]

    parts = Path(rel).parts
    epub_path = None
    internal_path = None
    
    # Identify if the request is for a file inside an EPUB
    for i in range(len(parts)):
        p = Path(*parts[:i+1])
        full_p = comic_base / p
        if full_p.suffix.lower() == ".epub" and full_p.is_file():
            epub_path = full_p
            internal_path = "/".join(parts[i+1:]).replace("\\", "/")
            break
            
    if epub_path:
        if not internal_path:
            return send_file(epub_path)
        try:
            with zipfile.ZipFile(epub_path, 'r') as z:
                # 1. Direct try
                try:
                    data = z.read(internal_path)
                except KeyError:
                    # 2. Fuzzy search (find by filename ignoring directory)
                    filename = os.path.basename(internal_path)
                    found_path = None
                    for name in z.namelist():
                        if name.endswith(filename):
                            found_path = name
                            break
                    if found_path:
                        data = z.read(found_path)
                    else:
                        abort(404)
                
                # Mimetype detection
                ext = Path(internal_path).suffix.lower()
                mimes = {
                    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                    ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
                    ".htm": "text/html", ".html": "text/html", ".xhtml": "application/xhtml+xml",
                    ".xml": "application/xml", ".css": "text/css", ".js": "application/javascript",
                    ".json": "application/json", ".opf": "application/oebps-package+xml",
                    ".ncx": "application/x-dtbncx+xml", ".ttf": "font/ttf", ".otf": "font/otf",
                    ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain"
                }
                mimetype = mimes.get(ext, "application/octet-stream")
                
                return Response(data, mimetype=mimetype)
        except Exception as e:
            logger.error(f"Error serving image from ZIP: {e}")
            abort(404)

    # Standard image serving
    full = comic_base / rel
    if not full.is_file() or not is_image(full):
        # try stripping first part if it's the comic folder name
        if parts and parts[0] == comic_base.name:
            full = comic_base / Path(*parts[1:])
        if not full.is_file() or not is_image(full):
            abort(404)
    return send_file(full)


@app.route("/epub/<int:dir_index>/<path:rel_path>")
def epub_metadata(dir_index, rel_path):
    return render_template("epub_metadata.html", dir_index=dir_index, rel_path=rel_path)


@app.route("/file/<int:dir_index>/<path:rel>")
def serve_file(dir_index, rel):
    if dir_index >= 10000:
        comic_id = dir_index - 10000
        rows = db.execute_query("SELECT path FROM comics WHERE id = ?", (comic_id,))
        if not rows:
            abort(404)
        comic_base = Path(rows[0][0])
        parts = Path(rel).parts
        if parts and parts[0] == comic_base.name:
            full = comic_base / Path(*parts[1:])
        else:
            full = comic_base / rel
        if not full.is_file():
            abort(404)
        return send_file(full)
    else:
        if dir_index >= len(COMICS_DIRS):
            abort(404)
        full = COMICS_DIRS[dir_index] / rel
        if not full.is_file():
            parts = Path(rel).parts
            if parts and parts[0] == COMICS_DIRS[dir_index].name:
                full = COMICS_DIRS[dir_index] / Path(*parts[1:])
            if not full.is_file():
                abort(404)
        return send_file(full)


@app.route("/read/<int:dir_index>/<path:read_path>")
def reader(dir_index, read_path):
    return render_template("reader.html", dir_index=dir_index, read_path=read_path)


@app.route("/api/comic/<int:dir_index>/<path:comic_path>")
def api_comic_metadata(dir_index, comic_path):
    # Try to find in DB first
    # This is a bit tricky because comic_path might be relative or absolute-ish
    # But we can try to match the path string
    
    rows = db.execute_query(
        "SELECT id, title, author, genres, description, cover_image, path, type, pages, chapters FROM comics"
    )
    
    # Matching logic similar to api_library
    for row in rows:
        comic_id, title, author, genres, description, cover_image, path_str, comic_type, pages, chapters = row
        cp = Path(path_str)
        
        match = False
        if dir_index >= 10000:
            if comic_id == dir_index - 10000:
                match = True
        else:
            if dir_index < len(COMICS_DIRS):
                root = COMICS_DIRS[dir_index]
                try:
                    if cp.is_relative_to(root) and cp.relative_to(root).as_posix() == comic_path:
                        match = True
                except:
                    pass
        
        if match:
            entry = {
                "id": comic_id,
                "title": title,
                "author": author or "",
                "genres": genres or "",
                "description": description or "",
                "type": comic_type or "oneshot",
                "pages": pages or 0,
                "chapters": chapters or 0,
                "cover_path": cover_image,
                "dir_index": dir_index,
                "rel_path": comic_path,
            }
            if cover_image:
                entry["cover"] = f"/img/{dir_index}/{comic_path}/{cover_image}"
            return jsonify(entry)
            
    abort(404)


@app.route("/oneshot/<int:dir_index>/<path:oneshot_path>")
def oneshot(dir_index, oneshot_path):
    return render_template("oneshot.html", dir_index=dir_index, oneshot_path=oneshot_path)


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
        logger.warning("api_config_add: No path provided")
        return jsonify({"error": "No path provided"}), 400
    p = Path(new_path).expanduser().resolve()
    if not p.exists():
        logger.warning(f"api_config_add: Path does not exist: {p}")
        return jsonify({"error": "Path does not exist"}), 400
    if not p.is_dir():
        logger.warning(f"api_config_add: Path is not a directory: {p}")
        return jsonify({"error": "Path is not a directory"}), 400
    if p in COMICS_DIRS:
        logger.warning(f"api_config_add: Path already added: {p}")
        return jsonify({"error": "Path already added"}), 409
    COMICS_DIRS.append(p)
    _save_config({"comics_dirs": [str(d) for d in COMICS_DIRS]})
    added = _add_comics_from_dir(p)
    return jsonify({"ok": True, "comics_dirs": [str(d) for d in COMICS_DIRS], "comics_added": added})


@app.route("/api/config/remove", methods=["POST"])
def api_config_remove():
    global COMICS_DIRS
    data = request.get_json(silent=True) or {}
    idx = data.get("index")
    if idx is None or not isinstance(idx, int) or idx < 0 or idx >= len(COMICS_DIRS):
        logger.warning(f"api_config_remove: Invalid index: {idx}")
        return jsonify({"error": "Invalid index"}), 400
    removed_dir = COMICS_DIRS.pop(idx)
    _save_config({"comics_dirs": [str(d) for d in COMICS_DIRS]})
    _remove_comics_by_root(removed_dir)
    return jsonify({"ok": True, "comics_dirs": [str(d) for d in COMICS_DIRS]})


@app.route("/api/comics/add", methods=["POST"])
def api_comics_add():
    data = request.get_json(silent=True) or {}
    title = data.get("title", "").strip()
    path_str = data.get("path", "").strip()
    if not title or not path_str:
        logger.warning("api_comics_add: Title and path are required")
        return jsonify({"error": "Title and path are required"}), 400

    p = Path(path_str).expanduser().resolve()
    if not p.exists():
        logger.warning(f"api_comics_add: Path does not exist: {p}")
        return jsonify({"error": "Path does not exist"}), 400
    if not p.is_dir():
        logger.warning(f"api_comics_add: Path is not a directory: {p}")
        return jsonify({"error": "Path is not a directory"}), 400

    author = data.get("author", "").strip()
    genres = data.get("genres", "").strip()
    description = data.get("description", "").strip()
    cover_image = data.get("cover_image", "").strip()

    meta = scan_entry(p)
    if meta is None:
        logger.warning(f"api_comics_add: No images found in the folder: {p}")
        return jsonify({"error": "No images found in the folder"}), 400

    if not cover_image:
        cover_image = meta.get("cover_path", "")

    db.execute_query(
        "INSERT INTO comics (title, author, genres, description, cover_image, path, type, pages, chapters) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (title, author, genres, description, cover_image, str(p), meta["type"], meta["pages"], meta["chapters"])
    )
    logger.info(f"Added single comic: {title} at {p}")
    return jsonify({"ok": True, "comic": {"title": title, "path": str(p)}})


@app.route("/api/tunnel-qr")
def api_tunnel_qr():
    url = get_cloudflared_url()
    if not url:
        logger.warning("api_tunnel_qr: Tunnel not ready yet")
        return jsonify({"error": "Tunnel not ready yet"}), 503
    img = qrcode.make(url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return Response(buf.getvalue(), mimetype="image/png")


@app.route("/api/mangadex/popular")
def get_popular_mangadex():
    url = "https://api.mangadex.org/manga"
    params = {
        "limit": 12,
        "order[followedCount]": "desc",
        "hasAvailableChapters": "true",
        "includes[]": ["author", "cover_art"]
    }
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        
        results = []
        for manga in data.get("data", []):
            manga_id = manga["id"]
            attributes = manga.get("attributes", {})
            title_obj = attributes.get("title", {})
            title = title_obj.get("en") or next(iter(title_obj.values())) if title_obj else "Unknown"
            
            cover_file = None
            for rel in manga.get("relationships", []):
                if rel["type"] == "cover_art" and "attributes" in rel:
                    cover_file = rel["attributes"].get("fileName")
                    break
            
            cover_url = f"https://uploads.mangadex.org/covers/{manga_id}/{cover_file}.512.jpg" if cover_file else None
            
            results.append({
                "id": manga_id,
                "title": title,
                "cover": cover_url,
                "type": "mangadex"
            })
            
        return jsonify(results)
    except Exception as e:
        logger.error(f"Error fetching from MangaDex: {e}")
        return jsonify([])

if __name__ == "__main__":
    for d in COMICS_DIRS:
        d.mkdir(parents=True, exist_ok=True)
    logger.info(f"[books]  Comics dirs : {[str(d) for d in COMICS_DIRS]}")
    logger.info(f"[web]  Open        : http://localhost:5000")
    
    # Try to start Cloudflare tunnel safely
    if os.environ.get("DISABLE_TUNNEL") != "1":
        try:
            logger.info("Initializing Cloudflare tunnel...")
            # If you have cloudflared.exe in the project folder, this is much more stable on Windows
            run_with_cloudflared(app)
        except Exception as e:
            logger.error(f"Cloudflare tunnel failed to start: {e}")
            logger.info("The app is still running locally at http://localhost:5000")
    
    app.run(host="0.0.0.0", port=5000, debug=True)
