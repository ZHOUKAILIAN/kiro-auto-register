/// <reference types="vite/client" />

import type {
  AppSettings,
  BatchRegisterResult,
  ClaudeChatProbeResult,
  ClaudeImportResult,
  CliproxyWriteResult,
  RegisterOptions,
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
      onRegisterProgress: (callback: (message: string) => void) => void;
      removeRegisterProgressListener: () => void;
      exportAccounts: (accountIds?: number[]) => Promise<string>;
      importToClaudeApi: (accountIds?: number[]) => Promise<ClaudeImportResult>;
      probeClaudeApiChat: () => Promise<ClaudeChatProbeResult>;
      writeCliproxyAuthFiles: (accountIds?: number[]) => Promise<CliproxyWriteResult>;
      selectCliproxyAuthDir: () => Promise<{ canceled: boolean; path?: string }>;
      getSettings: () => Promise<AppSettings>;
      saveSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
    };
  }
}

export {};
