const uploadBox = document.getElementById('uploadBox');
const fileInput = document.getElementById('fileInput');
const resultBox = document.getElementById('resultBox');
const settingsBox = document.getElementById('settingsBox');
const loading = document.getElementById('loading');
const filename = document.getElementById('filename');
const filesize = document.getElementById('filesize');
const linkInput = document.getElementById('linkInput');
const copyBtn = document.getElementById('copyBtn');
const newUploadBtn = document.getElementById('newUploadBtn');

const settingsFilename = document.getElementById('settingsFilename');
const passwordLabel = document.getElementById('passwordLabel');
const passwordInput = document.getElementById('passwordInput');
const maxDownloadsLabel = document.getElementById('maxDownloadsLabel');
const maxDownloadsInput = document.getElementById('maxDownloadsInput');
const autoDeleteTime = document.getElementById('autoDeleteTime');
const publishBtn = document.getElementById('publishBtn');

let currentFileId = null;
let passwordEnabled = false;
let maxDownloadsEnabled = false;

// Фоновая музыка
const bgMusic = document.getElementById('bgMusic');
bgMusic.volume = 0.3;

// Автозапуск при первом клике
document.addEventListener('click', () => {
    if (bgMusic.paused) {
        bgMusic.play().catch(() => {});
    }
}, { once: true });

// Клик по области загрузки
uploadBox.addEventListener('click', () => {
    fileInput.click();
});

// Выбор файла через input
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        const files = Array.from(e.target.files);
        if (files.length > 1) {
            uploadMultipleFiles(files);
        } else {
            uploadFile(files[0]);
        }
    }
});

// Drag & Drop
uploadBox.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadBox.classList.add('dragover');
});

uploadBox.addEventListener('dragleave', () => {
    uploadBox.classList.remove('dragover');
});

uploadBox.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadBox.classList.remove('dragover');

    if (e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 1) {
            uploadMultipleFiles(files);
        } else {
            uploadFile(files[0]);
        }
    }
});

// Загрузка файла на сервер
async function uploadFile(file) {
    uploadBox.style.display = 'none';
    loading.style.display = 'block';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки');
        }

        const data = await response.json();
        currentFileId = data.id;

        loading.style.display = 'none';
        settingsBox.style.display = 'block';

        settingsFilename.textContent = data.filename + ' (' + formatFileSize(data.size) + ')';

    } catch (error) {
        alert('Ошибка при загрузке файла');
        loading.style.display = 'none';
        uploadBox.style.display = 'block';
    }
}

// Загрузка нескольких файлов (автоархивация)
async function uploadMultipleFiles(files) {
    uploadBox.style.display = 'none';
    loading.style.display = 'block';

    const formData = new FormData();
    files.forEach(file => {
        formData.append('files', file);
    });

    try {
        const response = await fetch('/upload-multiple', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки');
        }

        const data = await response.json();
        currentFileId = data.id;

        loading.style.display = 'none';
        settingsBox.style.display = 'block';

        settingsFilename.textContent = `${data.filename} (${data.filesCount} файлов, ${formatFileSize(data.size)})`;

    } catch (error) {
        alert('Ошибка при загрузке файлов');
        loading.style.display = 'none';
        uploadBox.style.display = 'block';
    }
}

// Копирование ссылки
copyBtn.addEventListener('click', () => {
    linkInput.select();
    document.execCommand('copy');

    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Скопировано!';

    setTimeout(() => {
        copyBtn.textContent = originalText;
    }, 2000);
});

// Загрузить ещё файл
newUploadBtn.addEventListener('click', () => {
    resultBox.style.display = 'none';
    uploadBox.style.display = 'block';
    fileInput.value = '';
});

// Переключение настроек по клику
passwordLabel.addEventListener('click', () => {
    passwordEnabled = !passwordEnabled;
    passwordInput.disabled = !passwordEnabled;
    passwordLabel.classList.toggle('active', passwordEnabled);
    if (passwordEnabled) passwordInput.focus();
});

maxDownloadsLabel.addEventListener('click', () => {
    maxDownloadsEnabled = !maxDownloadsEnabled;
    maxDownloadsInput.disabled = !maxDownloadsEnabled;
    maxDownloadsLabel.classList.toggle('active', maxDownloadsEnabled);
    if (maxDownloadsEnabled) maxDownloadsInput.focus();
});

// Публикация файла с настройками
publishBtn.addEventListener('click', async () => {
    const settings = {
        password: passwordEnabled ? passwordInput.value : null,
        maxDownloads: maxDownloadsEnabled ? parseInt(maxDownloadsInput.value) : null,
        autoDelete: true,
        autoDeleteTime: parseInt(autoDeleteTime.value)
    };

    if (passwordEnabled && !passwordInput.value) {
        alert('Введите пароль');
        return;
    }

    if (maxDownloadsEnabled && (!maxDownloadsInput.value || maxDownloadsInput.value < 1)) {
        alert('Укажите количество скачиваний');
        return;
    }

    publishBtn.disabled = true;
    publishBtn.textContent = 'Публикация...';

    try {
        const response = await fetch(`/publish/${currentFileId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });

        if (!response.ok) {
            throw new Error('Ошибка публикации');
        }

        const data = await response.json();

        settingsBox.style.display = 'none';
        resultBox.style.display = 'block';

        filename.textContent = settingsFilename.textContent;

        // Генерируем ссылку на страницу просмотра
        const viewUrl = `${window.location.origin}/view.html?id=${currentFileId}`;
        linkInput.value = viewUrl;

        // Показываем активные настройки
        let settingsInfo = [];
        if (settings.password) settingsInfo.push('🔒 Пароль');
        if (settings.maxDownloads) settingsInfo.push(`📊 ${settings.maxDownloads} скачиваний`);
        settingsInfo.push(`⏱️ ${settings.autoDeleteTime} мин`);

        filesize.textContent = settingsInfo.join(' • ');

    } catch (error) {
        alert('Ошибка при публикации файла');
    } finally {
        publishBtn.disabled = false;
        publishBtn.textContent = 'Опубликовать';
    }
});

// Форматирование размера файла
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
