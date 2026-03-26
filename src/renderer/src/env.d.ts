/// <reference types="vite/client" />

import type {
  AppSettings,
  BatchRegisterResult,
  ManualOtpSubmitResult,
  RegisterDiagnostics,
  RegisterOptions,
  RegisterRuntimeState,
  StoredAccount
} from '../../shared/contracts.ts';

declare global {
  interface Window {
    electron: unknown;
    api: {
      getAccounts: () => Promise<StoredAccount[]>;
      saveAccount: (account: StoredAccount) => Promise<StoredAccount[]>;
      deleteAccount: (id: number) => Promise<StoredAccount[]>;
      deleteAccounts: (ids: number[]) => Promise<StoredAccount[]>;
      startRegister: (options: Partial<RegisterOptions>) => Promise<BatchRegisterResult>;
      getRegisterRuntimeState: () => Promise<RegisterRuntimeState>;
      submitRegisterOtp: (taskId: string, otp: string) => Promise<ManualOtpSubmitResult>;
      runRegisterDiagnostics: (proxyUrl?: string) => Promise<RegisterDiagnostics>;
      onRegisterProgress: (callback: (message: string) => void) => void;
      removeRegisterProgressListener: () => void;
      onRegisterRuntimeState: (callback: (state: RegisterRuntimeState) => void) => void;
      removeRegisterRuntimeStateListener: () => void;
      exportAccounts: (accountIds?: number[]) => Promise<string>;
      getSettings: () => Promise<AppSettings>;
      saveSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
    };
  }
}

export {};
