/**
 * Electron Preload 脚本
 */

import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

// 自定义 API
const api = {
  // 账号管理
  getAccounts: () => ipcRenderer.invoke('get-accounts'),
  saveAccount: (account: any) => ipcRenderer.invoke('save-account', account),
  deleteAccount: (id: number) => ipcRenderer.invoke('delete-account', id),
  deleteAccounts: (ids: number[]) => ipcRenderer.invoke('delete-accounts', ids),

  // 注册功能
  startRegister: (proxyUrl?: string) => ipcRenderer.invoke('start-register', proxyUrl),
  onRegisterProgress: (callback: (message: string) => void) => {
    ipcRenderer.on('register-progress', (_, message) => callback(message));
  },
  removeRegisterProgressListener: () => {
    ipcRenderer.removeAllListeners('register-progress');
  },

  // 导出功能
  exportAccounts: (accounts: any[]) => ipcRenderer.invoke('export-accounts', accounts),
  toClaudeApiFormat: (account: any) => ipcRenderer.invoke('to-claude-api-format', account),

  // 设置
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings)
};

// 暴露到渲染进程
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore
  window.electron = electronAPI;
  // @ts-ignore
  window.api = api;
}
