/**
 * Electron Preload 脚本
 */

import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

import type {
  AppSettings,
  BatchRegisterResult,
  ManualOtpSubmitResult,
  RegisterDiagnostics,
  RegisterOptions,
  RegisterRuntimeState,
  StoredAccount
} from '../shared/contracts.ts';

const api = {
  getAccounts: (): Promise<StoredAccount[]> => ipcRenderer.invoke('get-accounts'),
  saveAccount: (account: StoredAccount): Promise<StoredAccount[]> => ipcRenderer.invoke('save-account', account),
  deleteAccount: (id: number): Promise<StoredAccount[]> => ipcRenderer.invoke('delete-account', id),
  deleteAccounts: (ids: number[]): Promise<StoredAccount[]> => ipcRenderer.invoke('delete-accounts', ids),

  startRegister: (options: Partial<RegisterOptions>): Promise<BatchRegisterResult> =>
    ipcRenderer.invoke('start-register', options),
  getRegisterRuntimeState: (): Promise<RegisterRuntimeState> =>
    ipcRenderer.invoke('get-register-runtime-state'),
  submitRegisterOtp: (taskId: string, otp: string): Promise<ManualOtpSubmitResult> =>
    ipcRenderer.invoke('submit-register-otp', taskId, otp),
  runRegisterDiagnostics: (proxyUrl?: string): Promise<RegisterDiagnostics> =>
    ipcRenderer.invoke('run-register-diagnostics', proxyUrl),
  onRegisterProgress: (callback: (message: string) => void): void => {
    ipcRenderer.on('register-progress', (_event, message: string) => callback(message));
  },
  removeRegisterProgressListener: (): void => {
    ipcRenderer.removeAllListeners('register-progress');
  },
  onRegisterRuntimeState: (callback: (state: RegisterRuntimeState) => void): void => {
    ipcRenderer.on('register-runtime-state', (_event, state: RegisterRuntimeState) => callback(state));
  },
  removeRegisterRuntimeStateListener: (): void => {
    ipcRenderer.removeAllListeners('register-runtime-state');
  },

  exportAccounts: (accountIds?: number[]): Promise<string> => ipcRenderer.invoke('export-accounts', accountIds),

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
