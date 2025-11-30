# Menggunakan Python 3.10 image yang minimal
FROM python:3.10-slim

# Install FFmpeg (REQUIRED untuk yt-dlp)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set working directory di dalam container
WORKDIR /app

# Copy requirements.txt dulu (untuk cache layer)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy semua file project ke container
COPY . .

# Buat folder downloads dengan permission yang benar
RUN mkdir -p downloads && chmod 777 downloads

# Expose port (sesuai dengan PORT environment variable)
EXPOSE 5000

# Jalankan aplikasi dengan Gunicorn + Eventlet (untuk WebSocket support)
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--worker-class", "eventlet", "app:app"]
