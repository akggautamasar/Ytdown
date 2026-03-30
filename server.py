#!/usr/bin/env python3

import os, re, tempfile, threading
from flask import Flask, request, jsonify, send_file, after_this_request
from flask_cors import CORS
import yt_dlp

app = Flask(__name__)
CORS(app, expose_headers=["X-Filename"])

DOWNLOAD_DIR = os.path.join(os.path.dirname(__file__), "downloads")
os.makedirs(DOWNLOAD_DIR, exist_ok=True)


# ✅ Health check
@app.route("/")
def home():
    return "YT Vault Backend running ✅"


@app.route("/ping")
def ping():
    return jsonify({"status": "ok", "message": "YT Vault backend running"})


# 🎯 INFO API
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
        "cookiefile": "cookies.txt",
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

            return jsonify({
                "title": info.get("title"),
                "channel": info.get("uploader") or info.get("channel"),
                "thumbnail": info.get("thumbnail"),
                "duration": info.get("duration"),
                "formats": info.get("formats", [])
            })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# 📥 DOWNLOAD API
@app.route("/download", methods=["POST"])
def download():
    data = request.json or {}
    url = data.get("url", "").strip()
    mode = data.get("mode", "video")
    ext = data.get("ext", "mp4")

    if not url:
        return jsonify({"error": "No URL provided"}), 400

    tmp_dir = tempfile.mkdtemp(dir=DOWNLOAD_DIR)
    out_template = os.path.join(tmp_dir, "%(title)s.%(ext)s")

    ydl_opts = {
        "outtmpl": out_template,
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
    }

    if mode == "audio":
        ydl_opts["format"] = "bestaudio/best"
        ydl_opts["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "320",
        }]
    else:
        ydl_opts["format"] = "bestvideo+bestaudio/best"
        ydl_opts["merge_output_format"] = ext

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.extract_info(url, download=True)

        files = os.listdir(tmp_dir)
        if not files:
            return jsonify({"error": "Download failed"}), 500

        filepath = os.path.join(tmp_dir, files[0])
        safe_name = re.sub(r'[^\w\-. ]', '', files[0])

        @after_this_request
        def cleanup(response):
            def delete():
                import shutil
                shutil.rmtree(tmp_dir, ignore_errors=True)
            threading.Thread(target=delete).start()
            return response

        return send_file(filepath, as_attachment=True, download_name=safe_name)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# 🚀 Render-compatible run
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Starting server on port {port}")
    app.run(host="0.0.0.0", port=port)
