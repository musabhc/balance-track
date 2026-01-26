const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

let mainWindow;

const dataFilePath = () => path.join(app.getPath('userData'), 'balance-data.json');

const defaultData = () => ({
  salaries: [],
  expenses: [],
  recurringExpenses: [],
  installmentPlans: [],
  settings: {
    currency: 'TRY'
  }
});

const ensureDataShape = (data) => {
  if (!data || typeof data !== 'object') {
    return defaultData();
  }

  return {
    salaries: Array.isArray(data.salaries) ? data.salaries : [],
    expenses: Array.isArray(data.expenses) ? data.expenses : [],
    recurringExpenses: Array.isArray(data.recurringExpenses) ? data.recurringExpenses : [],
    installmentPlans: Array.isArray(data.installmentPlans) ? data.installmentPlans : [],
    settings: {
      currency: data.settings && data.settings.currency ? data.settings.currency : 'TRY'
    }
  };
};

const loadData = () => {
  try {
    const filePath = dataFilePath();
    if (!fs.existsSync(filePath)) {
      return defaultData();
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return ensureDataShape(JSON.parse(raw));
  } catch (error) {
    return defaultData();
  }
};

const saveData = (payload) => {
  const data = ensureDataShape(payload);
  fs.writeFileSync(dataFilePath(), JSON.stringify(data, null, 2), 'utf8');
  return data;
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 800,
    minWidth: 1040,
    minHeight: 720,
    backgroundColor: '#f4f1eb',
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#f4f1eb',
      symbolColor: '#2d2a24',
      height: 32
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // Show window when ready or after safety timeout
  let isShown = false;
  const showWindow = () => {
    if (!isShown && mainWindow) {
      mainWindow.show();
      isShown = true;
    }
  };

  mainWindow.once('ready-to-show', showWindow);

  // Safety timeout: if ready-to-show doesn't fire (e.g. network/font hang), show anyway after 4s
  setTimeout(showWindow, 4000);

  mainWindow.loadFile('index.html');
};

const sendUpdateStatus = (message) => {
  if (mainWindow) {
    mainWindow.webContents.send('update:status', message);
  }
};

const setupAutoUpdater = () => {
  autoUpdater.autoDownload = false;

  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus('Güncellemeler kontrol ediliyor...');
  });

  autoUpdater.on('update-available', async () => {
    sendUpdateStatus('Yeni sürüm bulundu.');
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['İndir ve yükle', 'Sonra'],
      defaultId: 0,
      cancelId: 1,
      title: 'Güncelleme bulundu',
      message: 'Yeni bir sürüm bulundu. Şimdi indirmek ister misiniz?'
    });
    if (result.response === 0) {
      autoUpdater.downloadUpdate();
    }
  });

  autoUpdater.on('update-not-available', () => {
    sendUpdateStatus('Güncel sürüm kullanıyorsunuz.');
  });

  autoUpdater.on('error', (error) => {
    sendUpdateStatus(`Güncelleme hatası: ${error.message}`);
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent);
    sendUpdateStatus(`Güncelleme indiriliyor: %${percent}`);
  });

  autoUpdater.on('update-downloaded', async () => {
    sendUpdateStatus('Güncelleme indirildi.');
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Şimdi yükle', 'Sonra'],
      defaultId: 0,
      cancelId: 1,
      title: 'Güncelleme hazır',
      message: 'Güncelleme hazır. Şimdi yükleyip yeniden başlatmak ister misiniz?'
    });
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  if (app.isPackaged) {
    autoUpdater.checkForUpdates();
  }
};

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('data:load', () => loadData());
ipcMain.handle('data:save', (_, payload) => saveData(payload));

ipcMain.handle('data:export', async (_, payload) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Yedek dışa aktar',
    defaultPath: 'balance-track-backup.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) {
    return { status: 'cancelled' };
  }
  fs.writeFileSync(filePath, JSON.stringify(ensureDataShape(payload), null, 2), 'utf8');
  return { status: 'saved', filePath };
});

ipcMain.handle('data:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Yedek içe aktar',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths || filePaths.length === 0) {
    return { status: 'cancelled' };
  }
  try {
    const raw = fs.readFileSync(filePaths[0], 'utf8');
    return { status: 'loaded', data: ensureDataShape(JSON.parse(raw)) };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
});

ipcMain.handle('app:getVersion', () => app.getVersion());

ipcMain.handle('update:check', async () => {
  if (!app.isPackaged) {
    return { status: 'dev' };
  }
  await autoUpdater.checkForUpdates();
  return { status: 'checking' };
});
