/// <reference types="vite/client" />

declare global {
  interface Window {
    electron: any;
    api: {
      getAccounts: () => Promise<any[]>;
      saveAccount: (account: any) => Promise<any[]>;
      deleteAccount: (id: number) => Promise<any[]>;
      deleteAccounts: (ids: number[]) => Promise<any[]>;
      startRegister: (proxyUrl?: string) => Promise<any>;
      onRegisterProgress: (callback: (message: string) => void) => void;
      removeRegisterProgressListener: () => void;
      exportAccounts: (accounts: any[]) => Promise<string>;
      toClaudeApiFormat: (account: any) => Promise<any>;
      getSettings: () => Promise<any>;
      saveSettings: (settings: any) => Promise<any>;
    };
  }
}

export {};
