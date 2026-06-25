import json
import os
import queue
import socketserver
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path
from flask import Flask, Response, jsonify, request
from werkzeug.serving import BaseWSGIServer

app = Flask(__name__)
DEFAULT_DOWNLOAD_DIR = str(Path.home() / "Downloads")

# ── Global process tracking for Cancel ────────────────────────────────────
current_download_process = None
current_download_files   = []
current_download_dir     = None
current_download_cancelled = False
process_lock             = threading.Lock()

# ── Download history (in-memory) ───────────────────────────────────────────
history_lock = threading.Lock()
download_history = []

# ── Windows: suppress console windows ─────────────────────────────────────
def _no_window_kwargs():
    if os.name != "nt":
        return {}
    si = subprocess.STARTUPINFO()
    si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    si.wShowWindow = 0
    return {"creationflags": subprocess.CREATE_NO_WINDOW, "startupinfo": si}

# ── EXPLICIT FFMPEG LOCATION ──────────────────────────────────────────────
FFMPEG_DIR = r"C:\ffmpeg\bin"

def ffmpeg_args():
    if Path(FFMPEG_DIR).exists():
        return ["--ffmpeg-location", FFMPEG_DIR]
    return []

_shutdown_event = threading.Event()

class ThreadedWSGIServer(socketserver.ThreadingMixIn, BaseWSGIServer):
    daemon_threads = True

def run_server(port=9999):
    _shutdown_event.clear()
    srv = ThreadedWSGIServer("127.0.0.1", port, app)
    srv.timeout = 1
    while not _shutdown_event.is_set():
        srv.handle_request()
    srv.server_close()

# ── CORS ───────────────────────────────────────────────────────────────────
@app.after_request
def add_cors(r):
    r.headers["Access-Control-Allow-Origin"]  = "*"
    r.headers["Access-Control-Allow-Headers"] = "Content-Type"
    r.headers["Access-Control-Allow-Private-Network"] = "true" 
    return r

@app.route("/options", methods=["OPTIONS"])
def options():
    resp = Response(status=204)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Private-Network"] = "true"
    return resp

# ── SHUTDOWN ───────────────────────────────────────────────────────────────
@app.route("/shutdown", methods=["POST"])
def shutdown():
    _shutdown_event.set()
    return "ok"

# ── OPEN FOLDER ────────────────────────────────────────────────────────────
@app.route("/open_folder", methods=["POST"])
def open_folder():
    data = request.get_json(force=True)
    folder = data.get("folder", "")
    if not folder or not Path(folder).exists():
        return jsonify({"error": "Folder not found"}), 400
    subprocess.Popen(["explorer", folder], **_no_window_kwargs())
    return jsonify({"status": "ok"})

# ── CANCEL ─────────────────────────────────────────────────────────────────
@app.route("/cancel", methods=["POST"])
def cancel_download():
    global current_download_process, current_download_files, current_download_dir, current_download_cancelled
    with process_lock:
        proc = current_download_process
        if proc is None:
            return jsonify({"status": "no_active_download"}), 200
        if proc.poll() is not None:
            current_download_process = None
            return jsonify({"status": "already_finished"}), 200

        current_download_cancelled = True
        pid = proc.pid
        if os.name == "nt":
            try:
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(pid)],
                    capture_output=True, check=False,
                    **_no_window_kwargs(),
                )
                time.sleep(0.2)
            except Exception:
                proc.terminate()
                time.sleep(0.3)
                if proc.poll() is None:
                    proc.kill()
        else:
            proc.terminate()
            time.sleep(0.3)
            if proc.poll() is None:
                proc.kill()

        current_download_process = None
        files_to_clean = list(current_download_files)
        current_download_files = []
        cleanup_dir = current_download_dir or DEFAULT_DOWNLOAD_DIR

    time.sleep(0.5)

    def _delete(p: Path):
        try:
            if p.exists():
                p.unlink()
        except Exception:
            pass

    for path in files_to_clean:
        p = Path(path)
        _delete(p)
        _delete(Path(str(path) + ".part"))

    try:
        now = time.time()
        for p in Path(cleanup_dir).iterdir():
            if not p.is_file():
                continue
            if now - p.stat().st_mtime > 600:
                continue
            if p.suffix == ".part" or p.stat().st_size == 0:
                _delete(p)
    except Exception:
        pass

    return jsonify({"status": "cancelled"}), 200

# ── STATUS PAGE ────────────────────────────────────────────────────────────
@app.route("/")
def index():
    ffmpeg_ok = Path(FFMPEG_DIR).exists()
    status = "✓ found" if ffmpeg_ok else "✗ NOT FOUND — edit FFMPEG_DIR in server.py"
    return f"""<!doctype html><html lang="en"><head>
<meta charset="utf-8"><title>NJK - YT-Downloader</title>
<style>body{{font-family:system-ui;max-width:480px;margin:60px auto;padding:0 20px}}
h2{{color:#22c55e}}code{{background:#f3f3f3;padding:2px 7px;border-radius:4px}}</style></head><body>
<h2>NJK - YT-Downloader is running ✓</h2>
<p>Listening on <code>localhost:9999</code>.<br>
ffmpeg: <code>{FFMPEG_DIR}</code> — {status}</p>
</body></html>"""

# ── FORMATS (single video) ─────────────────────────────────────────────────
@app.route("/formats", methods=["POST"])
def formats():
    data = request.get_json(force=True)
    url  = data.get("url", "")
    if not url:
        return jsonify(error="No URL"), 400

    result = subprocess.run(
        ["yt-dlp", "--dump-json", "--no-playlist", *ffmpeg_args(), url],
        capture_output=True, text=True, timeout=30,
        **_no_window_kwargs(),
    )
    if result.returncode != 0:
        return jsonify(error=result.stderr[:400]), 500

    info     = json.loads(result.stdout)
    fmts     = info.get("formats", [])
    duration = info.get("duration") or 0

    def human_size(num_bytes):
        if not num_bytes:
            return None
        mb = num_bytes / (1024 * 1024)
        return f"{num_bytes/1024:.0f} KB" if mb < 1 else f"{mb:.1f} MB"

    def estimate_from_bitrate(kbps, seconds):
        if not kbps or not seconds:
            return None
        return human_size((kbps * 1000 / 8) * seconds)

    video_options, audio_options = [], []
    seen_vres = set()

    best_audio_abr = best_audio_size = 0
    for f in fmts:
        if f.get("vcodec", "none") == "none" and f.get("acodec", "none") != "none":
            abr = f.get("abr") or 0
            if abr > best_audio_abr:
                best_audio_abr  = abr
                best_audio_size = f.get("filesize") or f.get("filesize_approx") or 0
    if not best_audio_size and best_audio_abr and duration:
        best_audio_size = (best_audio_abr * 1000 / 8) * duration

    for f in reversed(fmts):
        vcodec   = f.get("vcodec", "none")
        acodec   = f.get("acodec", "none")
        height   = f.get("height")
        ext      = f.get("ext", "")
        filesize = f.get("filesize") or f.get("filesize_approx")

        if vcodec != "none" and height and height not in seen_vres:
            seen_vres.add(height)
            vo = filesize or ((f.get("tbr", 0) * 1000 / 8) * duration if f.get("tbr") and duration else 0)
            total = vo if acodec != "none" else vo + best_audio_size
            sl = human_size(total) if total else None
            video_options.append({
                "id": f["format_id"],
                "label": f"{height}p {ext.upper()}" + (f" — ~{sl}" if sl else ""),
                "height": height,
            })

        if vcodec == "none" and acodec != "none":
            abr = f.get("abr") or 0
            sl  = human_size(filesize) or estimate_from_bitrate(abr, duration)
            audio_options.append({
                "id": f["format_id"],
                "label": (f"{int(abr)}kbps {ext.upper()}" if abr else ext.upper()) + (f" — ~{sl}" if sl else ""),
                "abr": abr, "size_label": sl,
            })

    seen_abr, unique_audio = set(), []
    for a in sorted(audio_options, key=lambda x: -x["abr"]):
        key = round(a["abr"] / 10) * 10
        if key not in seen_abr:
            seen_abr.add(key)
            unique_audio.append(a)

    best_original = unique_audio[0] if unique_audio else None
    return jsonify(
        title=info.get("title", ""),
        thumbnail=info.get("thumbnail", ""),
        is_playlist=False,
        duration=duration,
        video=sorted(video_options, key=lambda x: -x["height"])[:6],
        audio=unique_audio[:4],
        audio_size_estimates={
        "mp3_192": estimate_from_bitrate(192, duration),
        "mp3_320": estimate_from_bitrate(320, duration),
        "original": best_original["size_label"] if best_original else None,
        },
    )

# ── PLAYLIST INFO ──────────────────────────────────────────────────────────
@app.route("/playlist_info", methods=["POST"])
def playlist_info():
    data = request.get_json(force=True)
    url  = data.get("url", "")
    if not url:
        return jsonify(error="No URL"), 400

    result = subprocess.run(
        ["yt-dlp", "--flat-playlist", "--dump-json", *ffmpeg_args(), url],
        capture_output=True, text=True, timeout=60,
        **_no_window_kwargs(),
    )
    if result.returncode != 0:
        return jsonify(error=result.stderr[:400]), 500

    entries = []
    for line in result.stdout.strip().splitlines():
        try:
            e = json.loads(line)
            vid = e.get("id", "")
            entries.append({
                "id":        vid,
                "title":     e.get("title", "Unknown"),
                "url":       e.get("url") or e.get("webpage_url") or f"https://www.youtube.com/watch?v={vid}",
                "duration":  e.get("duration"),
                "thumbnail": f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg" if vid else None,
            })
        except Exception:
            pass

    return jsonify(count=len(entries), entries=entries)

# ── UPDATE yt-dlp ──────────────────────────────────────────────────────────
@app.route("/update_ytdlp", methods=["POST"])
def update_ytdlp():
    progress_q = queue.Queue()

    def run():
        proc = subprocess.Popen(
            ["yt-dlp", "-U"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            **_no_window_kwargs(),
        )
        for line in proc.stdout:
            line = line.strip()
            if line:
                progress_q.put(line)
        proc.wait()
        progress_q.put(f"__DONE__{proc.returncode}__")

    threading.Thread(target=run, daemon=True).start()

    def event_stream():
        while True:
            try:
                msg = progress_q.get(timeout=60)
            except queue.Empty:
                yield "data: __TIMEOUT__\n\n"
                break
            yield f"data: {msg}\n\n"
            if msg.startswith("__DONE__"):
                break

    return Response(event_stream(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

# ── HISTORY ────────────────────────────────────────────────────────────────
@app.route("/history", methods=["GET"])
def get_history():
    with history_lock:
        return jsonify(list(reversed(download_history)))

@app.route("/history", methods=["DELETE"])
def clear_history():
    with history_lock:
        download_history.clear()
    return jsonify({"status": "ok"})

# ── DOWNLOAD ───────────────────────────────────────────────────────────────
@app.route("/download", methods=["POST"])
def download():
    global current_download_process

    data    = request.get_json(force=True)
    url     = data.get("url", "")
    fmt     = data.get("format", "bestvideo+bestaudio/best")
    mode    = data.get("mode", "video")
    out_dir = data.get("dir", DEFAULT_DOWNLOAD_DIR)
    title   = data.get("title", "")
    use_cookies = data.get("use_cookies", False)

    if not url:
        return jsonify(error="No URL"), 400
    if not Path(FFMPEG_DIR).exists():
        return jsonify(error=f"ffmpeg not found at {FFMPEG_DIR}. Edit FFMPEG_DIR in server.py."), 500

    Path(out_dir).mkdir(parents=True, exist_ok=True)

    # ── Build yt-dlp command ───────────────────────────────────────────────
    cmd_base = ["yt-dlp", "--no-playlist"]
    if use_cookies:
        cmd_base.extend(["--cookies-from-browser", "chrome"])
    cmd_base.extend(ffmpeg_args())

    if mode == "audio":
        audio_fmt = data.get("audio_format", "mp3_320")

        if audio_fmt == "original":
            cmd = cmd_base + [
                "-f", "bestaudio/best",
                "--add-metadata",
                "-o", f"{out_dir}/%(title)s.%(ext)s",
                url,
            ]
        else:
            quality_map = {
                "mp3_192": "192K",
                "mp3_320": "320K",
            }
            cmd = cmd_base + [
                "-f", "bestaudio/best",
                "-x",
                "--audio-format", "mp3",
                "--audio-quality", quality_map.get(audio_fmt, "320K"),
                "--embed-thumbnail",
                "--ppa", "EmbedThumbnail+ffmpeg:-y", 
                "--add-metadata",
                "-o", f"{out_dir}/%(title)s.%(ext)s",
                url,
            ]
    else:
        if fmt in ("bestvideo+bestaudio/best", "best"):
            fmt_arg = "bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[ext=mp4][vcodec^=avc1]/best"
        else:
            fmt_arg = f"{fmt}+bestaudio/best"
        cmd = cmd_base + [
            "-f", fmt_arg,
            "--merge-output-format", "mp4",
            "-o", f"{out_dir}/%(title)s.%(ext)s",
            url,
        ]

    progress_q = queue.Queue()

    def run():
        global current_download_process, current_download_files, current_download_dir, current_download_cancelled

        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            **_no_window_kwargs(),
        )
        with process_lock:
            current_download_process   = proc
            current_download_files     = []
            current_download_dir       = out_dir
            current_download_cancelled = False

        captured_lines = []
        dest_file      = None

        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            captured_lines.append(line)
            progress_q.put(line)

            dest_prefix  = "[download] Destination: "
            merge_prefix = '[Merger] Merging formats into "'
            if line.startswith(dest_prefix):
                fpath = line[len(dest_prefix):]
                dest_file = fpath
                with process_lock:
                    if fpath not in current_download_files:
                        current_download_files.append(fpath)
            elif line.startswith(merge_prefix):
                fpath = line[len(merge_prefix):].rstrip('"')
                dest_file = fpath
                with process_lock:
                    if fpath not in current_download_files:
                        current_download_files.append(fpath)

        proc.wait()

        with process_lock:
            if current_download_process == proc:
                current_download_process = None

        # ── Record in history ──────────────────────────────────────────────
        if proc.returncode == 0 and dest_file:
            try:
                p         = Path(dest_file)
                size_bytes = p.stat().st_size if p.exists() else 0
                with history_lock:
                    download_history.append({
                        "title":      title or p.stem,
                        "filename":   p.name,
                        "path":       str(p),
                        "size_bytes": size_bytes,
                        "date":       datetime.now().strftime("%Y-%m-%d %H:%M"),
                        "mode":       mode,
                        "status":     "done",
                    })
            except Exception:
                pass

        # ── Signal done ────────────────────────────────────────────────────
        if proc.returncode != 0:
            with process_lock:
                was_cancelled = current_download_cancelled
            if was_cancelled:
                progress_q.put("__ERRORMSG__Cancelled by user.")
            else:
                error_line = next(
                    (l for l in reversed(captured_lines) if l.startswith("ERROR")),
                    captured_lines[-1] if captured_lines else "Download stopped unexpectedly.",
                )
                progress_q.put(f"__ERRORMSG__{error_line}")

        progress_q.put(f"__DONE__{proc.returncode}__")

    threading.Thread(target=run, daemon=True).start()

    def event_stream():
        while True:
            try:
                msg = progress_q.get(timeout=120)
            except queue.Empty:
                yield "data: __TIMEOUT__\n\n"
                break
            yield f"data: {msg}\n\n"
            if msg.startswith("__DONE__"):
                break

    return Response(event_stream(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=9999, debug=False, threaded=True)