const bgMusic = document.getElementById('bgMusic');
const viewBox = document.getElementById('viewBox');
const loading = document.getElementById('loading');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const passwordSection = document.getElementById('passwordSection');
const passwordInput = document.getElementById('passwordInput');
const unlockBtn = document.getElementById('unlockBtn');
const errorMsg = document.getElementById('errorMsg');
const previewSection = document.getElementById('previewSection');
const previewContainer = document.getElementById('previewContainer');
const downloadBtn = document.getElementById('downloadBtn');
const stats = document.getElementById('stats');

let fileId = null;
let fileData = null;
let currentPassword = null;
let mediaElement = null;

// Управление музыкой
bgMusic.volume = 0.3;

// Автозапуск при первом клике
document.addEventListener('click', () => {
    if (bgMusic.paused) {
        bgMusic.play().catch(() => {});
    }
}, { once: true });

// Получаем ID файла из URL
const urlParams = new URLSearchParams(window.location.search);
fileId = urlParams.get('id');

if (!fileId) {
    fileName.textContent = 'Файл не найден';
    fileSize.textContent = 'Неверная ссылка';
} else {
    loadFileInfo();
}

async function loadFileInfo() {
    try {
        const response = await fetch(`/preview/${fileId}`);

        if (!response.ok) {
            throw new Error('Файл не найден');
        }

        fileData = await response.json();

        fileName.textContent = fileData.filename;
        fileSize.textContent = formatFileSize(fileData.size);

        // Статистика
        let statsText = [];
        if (fileData.maxDownloads) {
            statsText.push(`Скачиваний: ${fileData.downloadCount}/${fileData.maxDownloads}`);
        }
        if (fileData.deleteAt) {
            const deleteDate = new Date(fileData.deleteAt);
            statsText.push(`Удалится: ${deleteDate.toLocaleString('ru-RU')}`);
        }
        if (statsText.length > 0) {
            stats.textContent = statsText.join(' • ');
        }

        if (fileData.hasPassword) {
            passwordSection.style.display = 'block';
        } else {
            showContent();
        }

    } catch (error) {
        fileName.textContent = 'Ошибка';
        fileSize.textContent = error.message;
    }
}

unlockBtn.addEventListener('click', async () => {
    const password = passwordInput.value;

    if (!password) {
        showError('Введите пароль');
        return;
    }

    unlockBtn.disabled = true;
    unlockBtn.textContent = 'Проверка...';

    try {
        const response = await fetch(`/stream/${fileId}?password=${encodeURIComponent(password)}`, {
            method: 'HEAD'
        });

        if (response.status === 401) {
            showError('Неверный пароль');
            unlockBtn.disabled = false;
            unlockBtn.textContent = 'Разблокировать';
            return;
        }

        if (!response.ok) {
            throw new Error('Ошибка проверки пароля');
        }

        currentPassword = password;
        passwordSection.style.display = 'none';
        showContent();

    } catch (error) {
        showError('Ошибка проверки пароля');
        unlockBtn.disabled = false;
        unlockBtn.textContent = 'Разблокировать';
    }
});

function showContent() {
    const ext = fileData.filename.split('.').pop().toLowerCase();
    const videoExts = ['mp4', 'webm', 'ogg', 'mov', 'avi'];
    const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'flac'];

    const streamUrl = currentPassword
        ? `/stream/${fileId}?password=${encodeURIComponent(currentPassword)}`
        : `/stream/${fileId}`;

    if (videoExts.includes(ext)) {
        previewSection.style.display = 'block';
        mediaElement = document.createElement('video');
        mediaElement.controls = true;
        mediaElement.src = streamUrl;
        previewContainer.appendChild(mediaElement);

        mediaElement.addEventListener('play', () => fadeOutBgMusic());
        mediaElement.addEventListener('pause', () => fadeInBgMusic());
        mediaElement.addEventListener('ended', () => fadeInBgMusic());

    } else if (audioExts.includes(ext)) {
        previewSection.style.display = 'block';
        mediaElement = document.createElement('audio');
        mediaElement.controls = true;
        mediaElement.src = streamUrl;
        previewContainer.appendChild(mediaElement);

        mediaElement.addEventListener('play', () => fadeOutBgMusic());
        mediaElement.addEventListener('pause', () => fadeInBgMusic());
        mediaElement.addEventListener('ended', () => fadeInBgMusic());
    }

    const downloadUrl = currentPassword
        ? `/download/${fileId}?password=${encodeURIComponent(currentPassword)}`
        : `/download/${fileId}`;

    downloadBtn.href = downloadUrl;
    downloadBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/>
            <path d="M14 2v5a1 1 0 0 0 1 1h5"/>
            <path d="M12 18v-6"/>
            <path d="m9 15 3 3 3-3"/>
        </svg>
        Скачать файл
    `;
    downloadBtn.style.display = 'flex';
}

function fadeOutBgMusic() {
    const fadeOut = setInterval(() => {
        if (bgMusic.volume > 0.05) {
            bgMusic.volume = Math.max(0, bgMusic.volume - 0.05);
        } else {
            bgMusic.volume = 0;
            bgMusic.pause();
            clearInterval(fadeOut);
        }
    }, 50);
}

function fadeInBgMusic() {
    bgMusic.play().catch(() => {});
    const fadeIn = setInterval(() => {
        if (bgMusic.volume < 0.25) {
            bgMusic.volume = Math.min(0.3, bgMusic.volume + 0.05);
        } else {
            bgMusic.volume = 0.3;
            clearInterval(fadeIn);
        }
    }, 50);
}

function showError(message) {
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
