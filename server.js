const express = require('express');
const multer = require('multer');
const { nanoid } = require('nanoid');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

const app = express();
const PORT = 3000;

// Хранилище для метаданных файлов
const filesDbPath = path.join(__dirname, 'files.json');
let files = new Map();

// Загрузка базы файлов при старте
if (fs.existsSync(filesDbPath)) {
    try {
        const data = JSON.parse(fs.readFileSync(filesDbPath, 'utf8'));
        files = new Map(Object.entries(data));
        console.log(`Загружено ${files.size} файлов из базы`);
    } catch (error) {
        console.error('Ошибка загрузки базы файлов:', error);
    }
}

// Сохранение базы файлов
function saveFilesDb() {
    const data = Object.fromEntries(files);
    fs.writeFileSync(filesDbPath, JSON.stringify(data, null, 2));
}

// Настройка multer для загрузки
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const id = nanoid(10);
        const ext = path.extname(file.originalname);
        cb(null, `${id}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
});

const uploadMultiple = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }
}).array('files', 50); // До 50 файлов

app.use(express.json());
app.use(express.static('public'));

// Загрузка файла (временная, до настроек)
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Файл не загружен' });
    }

    const fileId = nanoid(8);
    const fileData = {
        id: fileId,
        originalName: req.file.originalname,
        filename: req.file.filename,
        size: req.file.size,
        uploadDate: new Date().toISOString(),
        tempFile: true
    };

    files.set(fileId, fileData);
    saveFilesDb();

    console.log(`[UPLOAD] Файл загружен: ${fileId} - ${req.file.originalname}`);
    console.log(`[UPLOAD] Всего файлов в базе: ${files.size}`);

    res.json({
        id: fileId,
        filename: req.file.originalname,
        size: req.file.size
    });
});

// Загрузка нескольких файлов
app.post('/upload-multiple', uploadMultiple, async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'Файлы не загружены' });
    }

    console.log(`[UPLOAD-MULTIPLE] Загружено ${req.files.length} файлов`);

    const fileId = nanoid(8);
    const zipFilename = `${fileId}.zip`;
    const zipPath = path.join(__dirname, 'uploads', zipFilename);

    try {
        // Создаём ZIP архив
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        // Обработка ошибок архива
        archive.on('error', (err) => {
            throw err;
        });

        archive.pipe(output);

        // Добавляем все файлы в архив
        for (const file of req.files) {
            const filePath = path.join(__dirname, 'uploads', file.filename);
            archive.file(filePath, { name: file.originalname });
        }

        // Финализируем архив
        archive.finalize();

        // Ждём завершения записи
        await new Promise((resolve, reject) => {
            output.on('close', resolve);
            output.on('error', reject);
        });

        console.log(`[UPLOAD-MULTIPLE] Архив создан: ${zipFilename}`);

        // Удаляем оригинальные файлы
        for (const file of req.files) {
            const filePath = path.join(__dirname, 'uploads', file.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        // Получаем размер архива
        const zipStats = fs.statSync(zipPath);

        const fileData = {
            id: fileId,
            originalName: `archive_${fileId}.zip`,
            filename: zipFilename,
            size: zipStats.size,
            uploadDate: new Date().toISOString(),
            tempFile: true,
            filesCount: req.files.length
        };

        files.set(fileId, fileData);
        saveFilesDb();

        console.log(`[UPLOAD-MULTIPLE] Файл сохранён в базу: ${fileId}`);

        res.json({
            id: fileId,
            filename: fileData.originalName,
            size: fileData.size,
            filesCount: req.files.length
        });

    } catch (error) {
        console.error('[UPLOAD-MULTIPLE] Ошибка создания архива:', error);
        res.status(500).json({ error: 'Ошибка создания архива: ' + error.message });
    }
});

// Публикация файла с настройками
app.post('/publish/:id', (req, res) => {
    console.log(`[PUBLISH] Запрос публикации файла: ${req.params.id}`);

    const fileData = files.get(req.params.id);

    if (!fileData) {
        console.log(`[PUBLISH] Файл ${req.params.id} не найден`);
        return res.status(404).json({ error: 'Файл не найден' });
    }

    const { password, maxDownloads, autoDelete, autoDeleteTime } = req.body;

    fileData.password = password || null;
    fileData.maxDownloads = maxDownloads || null;
    fileData.downloadCount = 0;
    fileData.autoDelete = autoDelete || false;
    fileData.tempFile = false;

    if (autoDelete && autoDeleteTime) {
        const deleteAt = new Date(Date.now() + autoDeleteTime * 60 * 1000);
        fileData.deleteAt = deleteAt.toISOString();

        setTimeout(() => {
            deleteFile(req.params.id);
        }, autoDeleteTime * 60 * 1000);
    }

    files.set(req.params.id, fileData);
    saveFilesDb();

    console.log(`[PUBLISH] Файл опубликован: ${req.params.id}`);
    console.log(`[PUBLISH] Настройки:`, { password: !!password, maxDownloads, autoDelete });

    res.json({
        url: `${req.protocol}://${req.get('host')}/download/${req.params.id}`,
        settings: {
            password: !!password,
            maxDownloads: maxDownloads || 'unlimited',
            autoDelete: autoDelete ? `${autoDeleteTime} мин` : 'disabled'
        }
    });
});

// Скачивание файла
app.get('/download/:id', (req, res) => {
    const fileData = files.get(req.params.id);

    if (!fileData) {
        return res.status(404).send('Файл не найден');
    }

    const filePath = path.join(__dirname, 'uploads', fileData.filename);

    if (!fs.existsSync(filePath)) {
        files.delete(req.params.id);
        return res.status(404).send('Файл не найден');
    }

    // Проверка пароля
    if (fileData.password) {
        const providedPassword = req.query.password;
        if (providedPassword !== fileData.password) {
            return res.status(401).send('Неверный пароль');
        }
    }

    // Проверка лимита скачиваний
    if (fileData.maxDownloads && fileData.downloadCount >= fileData.maxDownloads) {
        deleteFile(req.params.id);
        return res.status(410).send('Лимит скачиваний исчерпан');
    }

    // Увеличиваем счётчик
    fileData.downloadCount = (fileData.downloadCount || 0) + 1;
    files.set(req.params.id, fileData);
    saveFilesDb();

    // Если достигнут лимит — удаляем после отправки
    if (fileData.maxDownloads && fileData.downloadCount >= fileData.maxDownloads) {
        res.download(filePath, fileData.originalName, () => {
            deleteFile(req.params.id);
        });
    } else {
        res.download(filePath, fileData.originalName);
    }
});

// Предпросмотр файла (для страницы скачивания)
app.get('/preview/:id', (req, res) => {
    console.log(`[PREVIEW] Запрос файла ID: ${req.params.id}`);
    console.log(`[PREVIEW] Всего файлов в базе: ${files.size}`);
    console.log(`[PREVIEW] Файлы в базе:`, Array.from(files.keys()));

    const fileData = files.get(req.params.id);

    if (!fileData) {
        console.log(`[PREVIEW] Файл ${req.params.id} не найден в базе`);
        return res.status(404).json({ error: 'Файл не найден' });
    }

    console.log(`[PREVIEW] Файл найден:`, fileData);

    res.json({
        id: fileData.id,
        filename: fileData.originalName,
        size: fileData.size,
        hasPassword: !!fileData.password,
        maxDownloads: fileData.maxDownloads,
        downloadCount: fileData.downloadCount || 0,
        deleteAt: fileData.deleteAt || null
    });
});

// Стрим файла для предпросмотра (только после проверки пароля)
app.get('/stream/:id', (req, res) => {
    const fileData = files.get(req.params.id);

    if (!fileData) {
        return res.status(404).send('Файл не найден');
    }

    // Проверка пароля
    if (fileData.password) {
        const providedPassword = req.query.password;
        if (providedPassword !== fileData.password) {
            return res.status(401).send('Неверный пароль');
        }
    }

    const filePath = path.join(__dirname, 'uploads', fileData.filename);

    if (!fs.existsSync(filePath)) {
        files.delete(req.params.id);
        return res.status(404).send('Файл не найден');
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': getContentType(fileData.originalName),
        };
        res.writeHead(206, head);
        file.pipe(res);
    } else {
        const head = {
            'Content-Length': fileSize,
            'Content-Type': getContentType(fileData.originalName),
        };
        res.writeHead(200, head);
        fs.createReadStream(filePath).pipe(res);
    }
});

function getContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const types = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.ogg': 'video/ogg',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
        '.flac': 'audio/flac'
    };
    return types[ext] || 'application/octet-stream';
}

// Получение информации о файле
app.get('/info/:id', (req, res) => {
    const fileData = files.get(req.params.id);

    if (!fileData) {
        return res.status(404).json({ error: 'Файл не найден' });
    }

    res.json(fileData);
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});

// Функция удаления файла
function deleteFile(fileId) {
    const fileData = files.get(fileId);
    if (!fileData) return;

    const filePath = path.join(__dirname, 'uploads', fileData.filename);

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }

    files.delete(fileId);
    saveFilesDb();
    console.log(`Файл ${fileId} удалён`);
}
