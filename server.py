#!/usr/bin/env python3

import os, re, tempfile, threading
from flask import Flask, request, jsonify, send_file, after_this_request
from flask_cors import CORS
import yt_dlp

app = Flask(__name__)
CORS(app, expose_headers=["X-Filename"])

# Paths
BASE_DIR = os.path.dirname(__file__)
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")
COOKIE_FILE = os.path.join(BASE_DIR, "cookies.txt")

os.makedirs(DOWNLOAD_DIR, exist_ok=True)


# ═══════════════════════════════
# HEALTH CHECK
# ═══════════════════════════════
@app.route("/ping")
def ping():
    return jsonify({"status": "ok"})


# ═══════════════════════════════
# FETCH INFO
# ═══════════════════════════════
@app.route("/info", methods=["POST"])
def get_info():
    data = request.json or {}
    url = data.get("url", "").strip()

    if not url:
        return jsonify({"error": "No URL provided"}), 400

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "cookiefile": COOKIE_FILE,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        return jsonify({
            "title": info.get("title"),
            "channel": info.get("uploader") or info.get("channel"),
            "thumbnail": info.get("thumbnail"),
            "duration": info.get("duration"),
            "view_count": info.get("view_count"),
            "upload_date": info.get("upload_date"),
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ═══════════════════════════════
# DOWNLOAD
# ═══════════════════════════════
@app.route("/download", methods=["POST"])
def download():
    data = request.json or {}
    url   = data.get("url", "").strip()
    mode  = data.get("mode", "video")
    ext   = data.get("ext", "mp4")

    if not url:
        return jsonify({"error": "No URL provided"}), 400

    tmp_dir = tempfile.mkdtemp(dir=DOWNLOAD_DIR)
    out_template = os.path.join(tmp_dir, "%(title)s.%(ext)s")

    # 🔥 SMART FORMAT LOGIC
    if mode == "audio":
        ydl_opts = {
            "outtmpl": out_template,
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "cookiefile": COOKIE_FILE,
            "format": "bestaudio/best",
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": data.get("audio_format", "mp3"),
                "preferredquality": str(data.get("audio_bitrate", "320")),
            }],
        }

    else:
        ydl_opts = {
            "outtmpl": out_template,
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "cookiefile": COOKIE_FILE,

            # 🔥 BULLETPROOF FORMAT FALLBACK
            "format": "bv*+ba/b[ext=mp4]/best",

            "merge_output_format": ext,
        }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        files = [f for f in os.listdir(tmp_dir) if not f.endswith(('.json', '.ytdl'))]

        if not files:
            return jsonify({"error": "Download failed"}), 500

        filepath = os.path.join(tmp_dir, files[0])
        safe_name = re.sub(r'[^\w\s\-_.]', '', os.path.basename(filepath))[:200]

        @after_this_request
        def cleanup(response):
            def _del():
                import shutil
                shutil.rmtree(tmp_dir, ignore_errors=True)
            threading.Thread(target=_del).start()
            return response

        return send_file(
            filepath,
            as_attachment=True,
            download_name=safe_name,
        ), 200, {"X-Filename": safe_name}

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ═══════════════════════════════
# RUN
# ═══════════════════════════════
if __name__ == "__main__":
    print("🚀 YT Vault backend running...")
    app.run(host="0.0.0.0", port=5050)
