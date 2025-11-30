let socket = null;
let currentUrl = '';
let selectedFormat = null;
let videoData = null;

// Initialize Socket.IO
socket = io.connect(window.location.origin);

socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

socket.on('progress', (data) => {
    updateProgress(data);
});

async function getVideoInfo() {
    const urlInput = document.getElementById('urlInput');
    currentUrl = urlInput.value.trim();
    
    if (!currentUrl) {
        showError('URL tidak boleh kosong!');
        return;
    }
    
    // Reset UI
    hideError();
    hideSuccess();
    document.getElementById('videoInfo').classList.add('hidden');
    document.getElementById('downloadBtn').classList.add('hidden');
    document.getElementById('loading').classList.remove('hidden');
    
    try {
        const response = await fetch('/api/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: currentUrl })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Gagal mengambil info');
        }
        
        videoData = await response.json();
        displayVideoInfo(videoData);
        
    } catch (error) {
        showError(error.message);
    } finally {
        document.getElementById('loading').classList.add('hidden');
    }
}

function displayVideoInfo(data) {
    // Thumbnail
    document.getElementById('thumbnail').src = data.thumbnail;
    
    // Info
    document.getElementById('videoTitle').textContent = data.title;
    document.getElementById('channelName').textContent = data.uploader;
    document.getElementById('duration').textContent = data.duration;
    document.getElementById('viewCount').textContent = data.views;
    
    // Format cards
    const formatCards = document.getElementById('formatCards');
    formatCards.innerHTML = '';
    
    // Filter format yang bagus
    const filteredFormats = data.formats.filter(f => 
        f.resolution !== '0x0' && f.resolution !== 'Audio Only'
    ).slice(0, 6);
    
    // Tambahkan opsi audio
    filteredFormats.push({
        id: 'bestaudio',
        resolution: 'Audio Only',
        ext: 'mp3',
        vcodec: '-',
        acodec: 'MP3',
        fps: '-',
        size: '~',
        note: '192kbps',
        type: 'audio',
        codec: 'mp3'
    });
    
    filteredFormats.forEach((format, index) => {
        const card = createFormatCard(format, index === 0);
        formatCards.appendChild(card);
    });
    
    // Set default selection
    if (filteredFormats.length > 0) {
        selectFormat(filteredFormats[0]);
    }
    
    document.getElementById('videoInfo').classList.remove('hidden');
}

function createFormatCard(format, isSelected = false) {
    const card = document.createElement('div');
    card.className = `format-card bg-gray-700 rounded-lg p-4 cursor-pointer transition-all duration-200 hover:bg-gray-600 
                      ${isSelected ? 'ring-2 ring-red-500 bg-red-900/20' : ''}`;
    
    card.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <span class="font-bold text-lg text-white">${format.resolution}</span>
            <span class="text-xs bg-blue-600 px-2 py-1 rounded">${format.ext}</span>
        </div>
        <div class="text-sm text-gray-300 space-y-1">
            <p>Video: ${format.vcodec}</p>
            <p>Audio: ${format.acodec}</p>
            <p>FPS: ${format.fps}</p>
            <p class="font-semibold text-yellow-400">Ukuran: ${format.size}</p>
            <p class="text-xs text-gray-400 mt-2">${format.note}</p>
        </div>
    `;
    
    card.onclick = () => selectFormat(format);
    return card;
}

function selectFormat(format) {
    selectedFormat = format;
    
    // Update UI selection
    document.querySelectorAll('.format-card').forEach(card => {
        card.classList.remove('ring-2', 'ring-red-500', 'bg-red-900/20');
    });
    
    event.currentTarget.classList.add('ring-2', 'ring-red-500', 'bg-red-900/20');
    
    // Show download button
    document.getElementById('downloadBtn').classList.remove('hidden');
}

async function startDownload() {
    if (!selectedFormat || !currentUrl) {
        showError('Pilih format terlebih dahulu!');
        return;
    }
    
    // Reset progress
    document.getElementById('downloadSection').classList.remove('hidden');
    document.getElementById('progressBar').style.width = '0%';
    document.getElementById('progressText').textContent = '0% - 0MB / 0MB';
    document.getElementById('speed').textContent = 'Speed: -';
    document.getElementById('eta').textContent = 'ETA: -';
    hideSuccess();
    
    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: currentUrl,
                format: selectedFormat.id,
                type: selectedFormat.type || 'video',
                codec: selectedFormat.codec || null
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Download gagal');
        }
        
        const result = await response.json();
        showSuccess(result.filename);
        
    } catch (error) {
        showError(error.message);
    } finally {
        document.getElementById('downloadSection').classList.add('hidden');
    }
}

function updateProgress(data) {
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const speedEl = document.getElementById('speed');
    const etaEl = document.getElementById('eta');
    
    const percent = data.percent.toFixed(1);
    const downloaded = (data.downloaded / 1024 / 1024).toFixed(1);
    const total = (data.total / 1024 / 1024).toFixed(1);
    
    progressBar.style.width = percent + '%';
    progressText.textContent = `${percent}% - ${downloaded}MB / ${total}MB`;
    
    // Update speed dan ETA jika tersedia
    if (data.speed) {
        const speed = (data.speed / 1024 / 1024).toFixed(1);
        speedEl.textContent = `Speed: ${speed} MB/s`;
    }
    
    if (data.eta) {
        const eta = Math.ceil(data.eta);
        etaEl.textContent = `ETA: ${eta}s`;
    }
}

function showError(message) {
    const errorAlert = document.getElementById('errorAlert');
    const errorText = document.getElementById('errorText');
    errorText.textContent = message;
    errorAlert.classList.remove('hidden');
}

function hideError() {
    document.getElementById('errorAlert').classList.add('hidden');
}

function showSuccess(filename) {
    const successMessage = document.getElementById('successMessage');
    const downloadLink = document.getElementById('downloadLink');
    downloadLink.href = `/download/${filename}`;
    successMessage.classList.remove('hidden');
}

function hideSuccess() {
    document.getElementById('successMessage').classList.add('hidden');
}

// Enter key support
document.getElementById('urlInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        getVideoInfo();
    }
});
