from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import yt_dlp
import os
import uuid

app = Flask(__name__)
CORS(app)

# Folder to store downloads
DOWNLOAD_FOLDER = "downloads"
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)


# ✅ Health check (important for Render)
@app.route("/")
def home():
    return "Server is running ✅"


# 🎯 Download endpoint
@app.route("/download", methods=["POST"])
def download_video():
    data = request.get_json()
    url = data.get("url")

    if not url:
        return jsonify({"error": "No URL provided"}), 400

    try:
        # Unique filename
        file_id = str(uuid.uuid4())
        output_path = os.path.join(DOWNLOAD_FOLDER, f"{file_id}.%(ext)s")

        ydl_opts = {
            "outtmpl": output_path,
            "format": "bestvideo+bestaudio/best",
            "merge_output_format": "mp4",
            "noplaylist": True,
            "quiet": True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)

        # Get actual final file name (after merge)
        final_file = None
        for file in os.listdir(DOWNLOAD_FOLDER):
            if file.startswith(file_id):
                final_file = file
                break

        if not final_file:
            return jsonify({"error": "Download failed"}), 500

        return jsonify({
            "success": True,
            "download_url": f"/file/{final_file}"
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# 📥 Serve downloaded file
@app.route("/file/<filename>")
def get_file(filename):
    return send_from_directory(DOWNLOAD_FOLDER, filename, as_attachment=True)


# 🚀 Run (Render-compatible)
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
