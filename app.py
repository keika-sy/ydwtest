#!/usr/bin/env python3
from flask import Flask, render_template, request, jsonify, send_file
from flask_socketio import SocketIO, emit
import yt_dlp
import os
import shutil
from pathlib import Path

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-change-in-production'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

DOWNLOAD_DIR = Path("downloads")
DOWNLOAD_DIR.mkdir(exist_ok=True)

app.config['DOWNLOAD_FOLDER'] = str(DOWNLOAD_DIR)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/info', methods=['POST'])
def get_video_info():
    url = request.json.get('url', '').strip()
    if not url:
        return jsonify({'error': 'URL tidak boleh kosong'}), 400
    
    try:
        with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
            info = ydl.extract_info(url, download=False)
            
            formats = []
            for f in info.get('formats', []):
                if f.get('acodec') == 'none' and f.get('vcodec') == 'none':
                    continue
                    
                size = f.get('filesize') or f.get('filesize_approx', 0)
                formats.append({
                    'id': f['format_id'],
                    'resolution': f"{f.get('width', 0)}x{f.get('height', 0)}",
                    'ext': f.get('ext', 'mp4'),
                    'vcodec': f.get('vcodec', 'N/A').split('.')[0] if f.get('vcodec') != 'none' else '-',
                    'acodec': f.get('acodec', 'N/A').split('.')[0] if f.get('acodec') != 'none' else '-',
                    'fps': int(f.get('fps', 0)) if f.get('fps') else '-',
                    'size': human_bytes(size) if size else '~',
                    'note': get_format_note(f)
                })
            
            video_info = {
                'title': info['title'],
                'uploader': info['uploader'],
                'duration': info['duration_string'],
                'views': f"{info['view_count']:,}",
                'upload_date': info['upload_date'],
                'thumbnail': info.get('thumbnail', ''),
                'formats': formats
            }
            
            return jsonify(video_info)
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download', methods=['POST'])
def start_download():
    url = request.json.get('url', '').strip()
    format_id = request.json.get('format', '')
    download_type = request.json.get('type', 'video')
    
    if not url:
        return jsonify({'error': 'URL tidak valid'}), 400
    
    try:
        socket_id = request.sid
        
        def progress_hook(d):
            if d['status'] == 'downloading':
                downloaded = d.get('downloaded_bytes', 0)
                total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
                
                socketio.emit('progress', {
                    'downloaded': downloaded,
                    'total': total,
                    'percent': (downloaded / total * 100) if total > 0 else 0
                }, room=socket_id)
        
        # Opsi download
        ydl_opts = {
            'outtmpl': str(DOWNLOAD_DIR / '%(title)s.%(ext)s'),
            'quiet': True,
            'format': format_id,
            'progress_hooks': [progress_hook]
        }
        
        if download_type == 'video':
            ydl_opts['merge_output_format'] = 'mp4'
        else:
            ydl_opts['postprocessors'] = [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': request.json.get('codec', 'mp3'),
                'preferredquality': '192',
            }]
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            
            if download_type != 'video':
                filename = filename.rsplit('.', 1)[0] + f".{request.json.get('codec', 'mp3')}"
            
            return jsonify({
                'success': True,
                'filename': os.path.basename(filename)
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/download/<filename>')
def download_file(filename):
    try:
        return send_file(
            os.path.join(app.config['DOWNLOAD_FOLDER'], filename),
            as_attachment=True
        )
    except FileNotFoundError:
        return jsonify({'error': 'File tidak ditemukan'}), 404

def get_format_note(f):
    notes = []
    if f.get('video_ext') != 'none' and f.get('audio_ext') == 'none':
        notes.append("Video Only")
    if f.get('video_ext') == 'none' and f.get('audio_ext') != 'none':
        notes.append("Audio Only")
    if f.get('asr'):
        notes.append(f"{f['asr']/1000:.0f}kHz")
    if f.get('tbr'):
        notes.append(f"{int(f['tbr'])}kbps")
    return ", ".join(notes) if notes else "-"

def human_bytes(b):
    if not b or b <= 0:
        return "0B"
    for u in ["B","KB","MB","GB","TB"]:
        if b < 1024: return f"{b:.1f}{u}"
        b /= 1024
    return f"{b:.1f}PB"

@socketio.on('connect')
def handle_connect():
    print(f"Client {request.sid} connected")

@socketio.on('disconnect')
def handle_disconnect():
    print(f"Client {request.sid} disconnected")

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)
