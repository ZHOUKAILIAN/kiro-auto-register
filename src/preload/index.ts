/**
 * Electron Preload 脚本
 */

import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

import type {
  AppSettings,
  BatchRegisterResult,
  ClaudeChatProbeResult,
  ClaudeImportResult,
  CliproxyWriteResult,
  RegisterOptions,
  StoredAccount
} from '../shared/contracts.ts';

interface DirectorySelectionResult {
  canceled: boolean;
  path?: string;
}

const api = {
  getAccounts: (): Promise<StoredAccount[]> => ipcRenderer.invoke('get-accounts'),
  saveAccount: (account: StoredAccount): Promise<StoredAccount[]> => ipcRenderer.invoke('save-account', account),
  deleteAccount: (id: number): Promise<StoredAccount[]> => ipcRenderer.invoke('delete-account', id),
  deleteAccounts: (ids: number[]): Promise<StoredAccount[]> => ipcRenderer.invoke('delete-accounts', ids),

  startRegister: (options: Partial<RegisterOptions>): Promise<BatchRegisterResult> =>
    ipcRenderer.invoke('start-register', options),
  onRegisterProgress: (callback: (message: string) => void): void => {
    ipcRenderer.on('register-progress', (_event, message: string) => callback(message));
  },
  removeRegisterProgressListener: (): void => {
    ipcRenderer.removeAllListeners('register-progress');
  },

  exportAccounts: (accountIds?: number[]): Promise<string> => ipcRenderer.invoke('export-accounts', accountIds),
  importToClaudeApi: (accountIds?: number[]): Promise<ClaudeImportResult> =>
    ipcRenderer.invoke('import-to-claude-api', accountIds),
  probeClaudeApiChat: (): Promise<ClaudeChatProbeResult> =>
    ipcRenderer.invoke('probe-claude-api-chat'),
  writeCliproxyAuthFiles: (accountIds?: number[]): Promise<CliproxyWriteResult> =>
    ipcRenderer.invoke('write-cliproxy-auth-files', accountIds),
  selectCliproxyAuthDir: (): Promise<DirectorySelectionResult> =>
    ipcRenderer.invoke('select-cliproxy-auth-dir'),

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('save-settings', settings)
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  const fallbackWindow = window as typeof window & {
    electron: typeof electronAPI;
    api: typeof api;
  };
  fallbackWindow.electron = electronAPI;
  fallbackWindow.api = api;
}
