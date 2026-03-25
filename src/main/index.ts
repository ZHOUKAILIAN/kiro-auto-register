/**
 * Electron 主进程
 */

import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import Store from 'electron-store';
import icon from '../../resources/icon.png?asset';
import { autoRegister } from '../services/kiroRegister';
import { exportToJson, toClaudeApiFormat } from '../services/exporter';

// 数据存储
const store = new Store();

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.kiro.auto-register');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // IPC 处理器
  setupIPCHandlers();

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * 设置 IPC 处理器
 */
function setupIPCHandlers() {
  // 获取所有账号
  ipcMain.handle('get-accounts', async () => {
    return store.get('accounts', []);
  });

  // 保存账号
  ipcMain.handle('save-account', async (_, account) => {
    const accounts = store.get('accounts', []) as any[];
    accounts.push({
      ...account,
      id: Date.now(),
      createdAt: Date.now()
    });
    store.set('accounts', accounts);
    return accounts;
  });

  // 删除账号
  ipcMain.handle('delete-account', async (_, id) => {
    const accounts = store.get('accounts', []) as any[];
    const filtered = accounts.filter((acc: any) => acc.id !== id);
    store.set('accounts', filtered);
    return filtered;
  });

  // 批量删除账号
  ipcMain.handle('delete-accounts', async (_, ids) => {
    const accounts = store.get('accounts', []) as any[];
    const filtered = accounts.filter((acc: any) => !ids.includes(acc.id));
    store.set('accounts', filtered);
    return filtered;
  });

  // 开始注册
  ipcMain.handle('start-register', async (_, proxyUrl?: string) => {
    return new Promise((resolve) => {
      autoRegister(
        (message) => {
          // 发送进度消息到渲染进程
          mainWindow?.webContents.send('register-progress', message);
        },
        proxyUrl
      ).then(resolve);
    });
  });

  // 导出账号
  ipcMain.handle('export-accounts', async (_, accounts) => {
    return exportToJson(accounts);
  });

  // 转换为 claude-api 格式
  ipcMain.handle('to-claude-api-format', async (_, account) => {
    return toClaudeApiFormat(account);
  });

  // 获取设置
  ipcMain.handle('get-settings', async () => {
    return store.get('settings', {
      proxyUrl: '',
      autoExport: false,
      maxConcurrent: 3
    });
  });

  // 保存设置
  ipcMain.handle('save-settings', async (_, settings) => {
    store.set('settings', settings);
    return settings;
  });
}
