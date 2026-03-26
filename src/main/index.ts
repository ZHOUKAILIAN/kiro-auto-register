/**
 * Electron 主进程
 */

import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import Store from 'electron-store';
import { autoRegister, type RegisterResult } from '../services/kiroRegister.ts';
import { buildExportPayload } from '../services/accountFormats.ts';
import { runRegisterDiagnostics } from '../services/registerDiagnostics.ts';
import { RegisterRuntimeController } from '../services/registerRuntime.ts';
import {
  exchangeSsoToken,
  type CredentialExchangeResult
} from '../services/kiroAuthExchange.ts';
import {
  DEFAULT_SETTINGS,
  normalizeAccountRecord,
  normalizeSettings
} from '../services/storeSchemas.ts';
import { normalizeOptionalProxyUrl } from '../shared/registerDiagnosticsUi.ts';
import type {
  AppSettings,
  BatchRegisterResult,
  ManualOtpSubmitResult,
  RegisterDiagnostics,
  RegisterOptions,
  RegisterRuntimeState,
  RegisterTaskResult,
  StoredAccount
} from '../shared/contracts.ts';

interface StoreSchema {
  accounts: StoredAccount[];
  settings: AppSettings;
}

type TypedStore = {
  get<K extends keyof StoreSchema>(key: K, defaultValue: StoreSchema[K]): StoreSchema[K];
  set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void;
};

const store = new Store<StoreSchema>({
  defaults: {
    accounts: [],
    settings: DEFAULT_SETTINGS
  }
}) as unknown as TypedStore;

let mainWindow: BrowserWindow | null = null;
const registerRuntime = new RegisterRuntimeController();

function resolvePreloadPath(): string {
  if (typeof __dirname === 'string') {
    return join(__dirname, '../preload/index.js');
  }

  return join(process.cwd(), 'out/preload/index.js');
}

function emitProgress(message: string): void {
  mainWindow?.webContents.send('register-progress', message);
}

function emitRegisterRuntimeState(): void {
  mainWindow?.webContents.send('register-runtime-state', registerRuntime.getState());
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: resolvePreloadPath(),
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

function getAccounts(): StoredAccount[] {
  const raw = store.get('accounts', []);
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((account) => normalizeAccountRecord(account))
    .sort((left, right) => right.createdAt - left.createdAt);
}

function saveAccounts(accounts: StoredAccount[]): StoredAccount[] {
  const normalized = accounts
    .map((account) => normalizeAccountRecord(account))
    .sort((left, right) => right.createdAt - left.createdAt);

  store.set('accounts', normalized);
  return normalized;
}

function getSettings(): AppSettings {
  return normalizeSettings(store.get('settings', DEFAULT_SETTINGS));
}

function saveSettings(settings: Partial<AppSettings>): AppSettings {
  const merged = normalizeSettings({
    ...getSettings(),
    ...settings
  });

  store.set('settings', merged);
  return merged;
}

function selectAccounts(accountIds?: number[]): StoredAccount[] {
  const accounts = getAccounts();
  if (!accountIds || accountIds.length === 0) {
    return accounts;
  }

  const wanted = new Set(accountIds);
  return accounts.filter((account) => wanted.has(account.id));
}

function createStoredAccount(
  registerResult: RegisterResult,
  exchangeResult?: CredentialExchangeResult
): StoredAccount {
  const now = Date.now();
  const expiresIn = exchangeResult?.expiresIn ?? 0;
  const region = exchangeResult?.region || 'us-east-1';

  return normalizeAccountRecord({
    id: now + Math.floor(Math.random() * 1000),
    email: exchangeResult?.email || registerResult.email || '',
    name: registerResult.name || '',
    region,
    authMethod: exchangeResult?.authMethod || 'builder-id',
    provider: 'BuilderId',
    ssoToken: registerResult.ssoToken || '',
    accessToken: exchangeResult?.accessToken || '',
    refreshToken: exchangeResult?.refreshToken || '',
    clientId: exchangeResult?.clientId || '',
    clientSecret: exchangeResult?.clientSecret || '',
    profileArn: '',
    subscriptionTitle: exchangeResult?.subscriptionTitle || '',
    usageCurrent: exchangeResult?.usageCurrent || 0,
    usageLimit: exchangeResult?.usageLimit || 0,
    accessTokenExpiresAt: expiresIn > 0 ? now + expiresIn * 1000 : 0,
    createdAt: now,
    updatedAt: now
  });
}

async function runRegisterWorkflow(options: RegisterOptions): Promise<BatchRegisterResult> {
  const total = Math.max(1, Math.floor(options.count || 1));
  const results: RegisterTaskResult[] = [];
  let savedAccounts = getAccounts();

  registerRuntime.setRegistering(true);
  emitRegisterRuntimeState();

  try {
    for (let index = 0; index < total; index += 1) {
      emitProgress(`========== 注册任务 ${index + 1}/${total} ==========`);
      const registerResult = await autoRegister({
        onProgress: emitProgress,
        proxyUrl: options.proxyUrl,
        registrationEmailMode: options.registrationEmailMode,
        customEmailAddress: options.customEmailAddress,
        otpMode: options.otpMode,
        requestOtp: async ({ email }) => {
          emitProgress(`请输入 ${email} 的 6 位验证码以继续当前注册任务`);
          const otpPromise = registerRuntime.requestManualOtp({
            registerIndex: index + 1,
            email
          });
          emitRegisterRuntimeState();
          return otpPromise;
        }
      });

      if (!registerResult.success || !registerResult.ssoToken) {
        const failureMessage = registerResult.error || '注册失败';
        const stageLabel = registerResult.stage ? `阶段 ${registerResult.stage}` : '注册阶段';
        registerRuntime.recordFailure({
          stage: registerResult.stage || 'register',
          message: failureMessage,
          timestamp: Date.now()
        });
        emitRegisterRuntimeState();
        results.push({
          index: index + 1,
          success: false,
          message: `${stageLabel} 失败: ${failureMessage}`
        });
        continue;
      }

      registerRuntime.clearFailure();
      emitRegisterRuntimeState();

      emitProgress('========== 开始兑换 Kiro 凭证 ==========');
      const exchangeResult = await exchangeSsoToken(registerResult.ssoToken, 'us-east-1', emitProgress);
      const account = createStoredAccount(registerResult, exchangeResult.success ? exchangeResult : undefined);
      savedAccounts = saveAccounts([account, ...savedAccounts]);
      const message = exchangeResult.success
        ? '注册成功，完整凭证已保存'
        : `注册成功，但凭证兑换失败: ${exchangeResult.error || 'unknown_error'}`;

      results.push({
        index: index + 1,
        success: true,
        account,
        message
      });
    }

    return {
      total,
      successCount: results.filter((result) => result.success).length,
      failureCount: results.filter((result) => !result.success).length,
      results
    };
  } finally {
    registerRuntime.setRegistering(false);
    registerRuntime.clearPendingOtp('注册任务已结束');
    emitRegisterRuntimeState();
  }
}

function setupIPCHandlers(): void {
  ipcMain.handle('get-accounts', async (): Promise<StoredAccount[]> => {
    return getAccounts();
  });

  ipcMain.handle('save-account', async (_event, account: StoredAccount): Promise<StoredAccount[]> => {
    const accounts = getAccounts();
    const incoming = normalizeAccountRecord(account);
    const nextAccounts = accounts.filter((item) => item.id !== incoming.id);
    return saveAccounts([incoming, ...nextAccounts]);
  });

  ipcMain.handle('delete-account', async (_event, id: number): Promise<StoredAccount[]> => {
    const accounts = getAccounts().filter((account) => account.id !== id);
    return saveAccounts(accounts);
  });

  ipcMain.handle('delete-accounts', async (_event, ids: number[]): Promise<StoredAccount[]> => {
    const removing = new Set(ids);
    const accounts = getAccounts().filter((account) => !removing.has(account.id));
    return saveAccounts(accounts);
  });

  ipcMain.handle('start-register', async (_event, options?: Partial<RegisterOptions>): Promise<BatchRegisterResult> => {
    const settings = getSettings();
    return runRegisterWorkflow({
      count: options?.count ?? settings.registerCount,
      proxyUrl: options?.proxyUrl || settings.proxyUrl || undefined,
      registrationEmailMode: options?.registrationEmailMode ?? settings.registrationEmailMode,
      customEmailAddress: options?.customEmailAddress ?? settings.customEmailAddress,
      otpMode: options?.otpMode ?? settings.otpMode
    });
  });

  ipcMain.handle('get-register-runtime-state', async (): Promise<RegisterRuntimeState> => {
    return registerRuntime.getState();
  });

  ipcMain.handle(
    'submit-register-otp',
    async (_event, taskId: string, otp: string): Promise<ManualOtpSubmitResult> => {
      const result = registerRuntime.submitManualOtp(taskId, otp);
      emitRegisterRuntimeState();
      emitProgress(result.success ? '✓ 已收到手动验证码，继续注册流程' : `⚠ ${result.message}`);
      return result;
    }
  );

  ipcMain.handle('run-register-diagnostics', async (_event, proxyUrl?: string): Promise<RegisterDiagnostics> => {
    const diagnostics = await runRegisterDiagnostics({
      proxyUrl: normalizeOptionalProxyUrl(proxyUrl),
      lastFailure: registerRuntime.getState().lastFailure
    });
    registerRuntime.setDiagnostics(diagnostics);
    emitRegisterRuntimeState();
    return diagnostics;
  });

  ipcMain.handle('export-accounts', async (_event, accountIds?: number[]): Promise<string> => {
    return JSON.stringify(buildExportPayload(selectAccounts(accountIds)), null, 2);
  });

  ipcMain.handle('get-settings', async (): Promise<AppSettings> => {
    return getSettings();
  });

  ipcMain.handle('save-settings', async (_event, settings: Partial<AppSettings>): Promise<AppSettings> => {
    return saveSettings(settings);
  });
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.kiro.auto-register');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  setupIPCHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
