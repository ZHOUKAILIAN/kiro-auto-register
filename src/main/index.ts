/**
 * Electron 主进程
 */

import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import Store from 'electron-store';
import { autoRegister, type RegisterResult } from '../services/kiroRegister.ts';
import {
  createBrowserObservationSummary,
  isInterestingObservationUrl,
  pushBrowserObservationEvent,
  pushBrowserObservationHit
} from '../services/browserObservation.ts';
import { buildExportPayload } from '../services/accountFormats.ts';
import {
  probeOutlookMailbox,
  waitForOutlookVerificationCode
} from '../services/outlookMailbox.ts';
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
  BrowserObservationSummary,
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
let browserObservationWindow: BrowserWindow | null = null;
const registerRuntime = new RegisterRuntimeController();
const OBSERVATION_START_URL = 'https://profile.aws.amazon.com/#/signup/start';

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

function updateLatestDiagnostics(
  updater: (current: RegisterDiagnostics | undefined) => RegisterDiagnostics
): RegisterDiagnostics {
  const current = registerRuntime.getState().latestDiagnostics;
  const next = updater(current);
  registerRuntime.setDiagnostics(next);
  emitRegisterRuntimeState();
  return next;
}

function setBrowserObservationSummary(summary: BrowserObservationSummary): BrowserObservationSummary {
  updateLatestDiagnostics((current) => ({
    executedAt: current?.executedAt ?? Date.now(),
    proxyUrl: current?.proxyUrl,
    egress: current?.egress,
    tempmail: current?.tempmail ?? {
      success: false,
      message: '尚未运行链路诊断'
    },
    managedEmail: current?.managedEmail,
    mailbox: current?.mailbox,
    registrationProbe: current?.registrationProbe,
    registrationComparisons: current?.registrationComparisons,
    browserObservation: summary,
    aws: current?.aws
  }));

  return summary;
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

function buildMoeMailConfig(settings: Pick<
  AppSettings,
  'moemailApiKey' | 'moemailBaseUrl' | 'moemailPreferredDomain'
>): {
  baseUrl: string;
  apiKey: string;
  preferredDomain?: string;
} {
  return {
    baseUrl: settings.moemailBaseUrl,
    apiKey: settings.moemailApiKey,
    preferredDomain: settings.moemailPreferredDomain || undefined
  };
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

function persistRotatedOutlookRefreshToken(
  settings: AppSettings,
  nextRefreshToken: string | undefined,
  reason: 'diagnostics' | 'register'
): void {
  if (!nextRefreshToken || nextRefreshToken === settings.outlookRefreshToken) {
    return;
  }

  saveSettings({
    outlookRefreshToken: nextRefreshToken
  });
  emitProgress(`Outlook: 已在${reason === 'register' ? '注册流程' : '诊断流程'}后更新 refresh token`);
}

async function resolveOutlookMailboxOtp(input: {
  email: string;
  otpSentAt: number;
}): Promise<string | null> {
  const settings = getSettings();
  if (settings.mailboxProvider !== 'outlook-graph') {
    throw new Error(`当前 mailbox provider 暂不支持: ${settings.mailboxProvider}`);
  }

  const result = await waitForOutlookVerificationCode({
    email: input.email,
    clientId: settings.outlookClientId,
    refreshToken: settings.outlookRefreshToken,
    otpSentAt: input.otpSentAt,
    onProgress: emitProgress
  });

  persistRotatedOutlookRefreshToken(settings, result.nextRefreshToken, 'register');
  return result.code;
}

async function startBrowserObservation(
  settings: AppSettings
): Promise<BrowserObservationSummary> {
  if (browserObservationWindow && !browserObservationWindow.isDestroyed()) {
    browserObservationWindow.focus();
    return (
      registerRuntime.getState().latestDiagnostics?.browserObservation ??
      setBrowserObservationSummary(createBrowserObservationSummary())
    );
  }

  browserObservationWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 720,
    autoHideMenuBar: true,
    webPreferences: {
      sandbox: false,
      contextIsolation: true
    }
  });

  let summary = setBrowserObservationSummary(createBrowserObservationSummary());
  const requestUrls = new Map<string, string>();

  const pushEvent = (message: string): void => {
    summary = pushBrowserObservationEvent(summary, message);
    setBrowserObservationSummary(summary);
    emitProgress(`[浏览器观察] ${message}`);
  };

  const pushHit = (hit: BrowserObservationSummary['latestNetworkHits'][number]): void => {
    summary = pushBrowserObservationHit(summary, hit);
    setBrowserObservationSummary(summary);
  };

  const configuredProxy = normalizeOptionalProxyUrl(settings.proxyUrl);
  if (configuredProxy) {
    pushEvent(`当前观察窗口走 Electron 默认网络栈；如需代理请确保系统/VPN 已生效 (${configuredProxy})`);
  }

  browserObservationWindow.on('closed', () => {
    if (browserObservationWindow?.webContents.debugger.isAttached()) {
      try {
        browserObservationWindow.webContents.debugger.detach();
      } catch {
        // ignore detach failures during teardown
      }
    }

    browserObservationWindow = null;
    summary = {
      ...summary,
      active: false
    };
    setBrowserObservationSummary(summary);
    emitProgress('[浏览器观察] 窗口已关闭');
  });

  browserObservationWindow.webContents.on('console-message', (_event, level, message) => {
    pushEvent(`console[${level}]: ${message}`);
    pushHit({
      type: 'console',
      detail: message,
      timestamp: Date.now()
    });
  });

  browserObservationWindow.webContents.on('did-start-navigation', (_event, url, _isInPlace, isMainFrame) => {
    if (!isMainFrame) {
      return;
    }

    pushEvent(`开始导航: ${url}`);
    pushHit({
      type: 'navigation',
      url,
      detail: 'did-start-navigation',
      timestamp: Date.now()
    });
  });

  browserObservationWindow.webContents.on('will-redirect', (_event, url) => {
    pushEvent(`发生重定向: ${url}`);
    pushHit({
      type: 'redirect',
      url,
      detail: 'will-redirect',
      timestamp: Date.now()
    });
  });

  browserObservationWindow.webContents.on('did-navigate', (_event, url) => {
    pushEvent(`已导航到: ${url}`);
    pushHit({
      type: 'navigation',
      url,
      detail: 'did-navigate',
      timestamp: Date.now()
    });
  });

  browserObservationWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) {
        return;
      }

      pushEvent(`页面加载失败: ${errorCode} ${errorDescription} (${validatedURL})`);
      pushHit({
        type: 'failure',
        url: validatedURL,
        detail: `${errorCode} ${errorDescription}`,
        timestamp: Date.now()
      });
    }
  );

  browserObservationWindow.webContents.on('page-title-updated', (event, title) => {
    event.preventDefault();
    summary = {
      ...summary,
      lastTitle: title
    };
    setBrowserObservationSummary(summary);
    pushEvent(`页面标题: ${title}`);
  });

  try {
    browserObservationWindow.webContents.debugger.attach('1.3');
    await browserObservationWindow.webContents.debugger.sendCommand('Network.enable');
    pushEvent('已附加浏览器 Network 调试器');

    browserObservationWindow.webContents.debugger.on(
      'message',
      (_event, method: string, params: Record<string, unknown>) => {
        if (method === 'Network.requestWillBeSent') {
          const request = (params.request as Record<string, unknown> | undefined) ?? {};
          const url = typeof request.url === 'string' ? request.url : undefined;
          const requestId = typeof params.requestId === 'string' ? params.requestId : undefined;
          if (requestId && url) {
            requestUrls.set(requestId, url);
          }

          if (url && isInterestingObservationUrl(url)) {
            pushHit({
              type: 'request',
              url,
              detail: typeof request.method === 'string' ? request.method : 'request',
              timestamp: Date.now()
            });
          }

          const redirectResponse = params.redirectResponse as
            | Record<string, unknown>
            | undefined;
          if (redirectResponse && url && isInterestingObservationUrl(url)) {
            pushHit({
              type: 'redirect',
              url,
              status:
                typeof redirectResponse.status === 'number'
                  ? redirectResponse.status
                  : undefined,
              detail: 'Network.requestWillBeSent redirect',
              timestamp: Date.now()
            });
          }
        }

        if (method === 'Network.responseReceived') {
          const response = (params.response as Record<string, unknown> | undefined) ?? {};
          const url = typeof response.url === 'string' ? response.url : undefined;
          if (url && isInterestingObservationUrl(url)) {
            pushHit({
              type: 'response',
              url,
              status: typeof response.status === 'number' ? response.status : undefined,
              detail: typeof response.mimeType === 'string' ? response.mimeType : 'response',
              timestamp: Date.now()
            });
          }
        }

        if (method === 'Network.loadingFailed') {
          const requestId = typeof params.requestId === 'string' ? params.requestId : undefined;
          const url = requestId ? requestUrls.get(requestId) : undefined;
          const errorText =
            typeof params.errorText === 'string' ? params.errorText : 'Network loading failed';

          if (url && isInterestingObservationUrl(url)) {
            pushHit({
              type: 'failure',
              url,
              detail: errorText,
              timestamp: Date.now()
            });
          }
        }
      }
    );
  } catch (error) {
    pushEvent(`附加浏览器调试器失败: ${error instanceof Error ? error.message : String(error)}`);
  }

  await browserObservationWindow.loadURL(OBSERVATION_START_URL);
  pushEvent(`已打开观察页: ${OBSERVATION_START_URL}`);

  return summary;
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
        managedEmailProvider: options.managedEmailProvider,
        moemailConfig: {
          baseUrl: options.moemailBaseUrl,
          apiKey: options.moemailApiKey,
          preferredDomain: options.moemailPreferredDomain
        },
        customEmailAddress: options.customEmailAddress,
        otpMode: options.otpMode,
        requestOtp: async ({ email, source, otpSentAt }) => {
          if (source === 'mailbox') {
            emitProgress(`将通过 Outlook 邮箱自动收取 ${email} 的验证码`);
            return resolveOutlookMailboxOtp({
              email,
              otpSentAt
            });
          }

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
      managedEmailProvider: options?.managedEmailProvider ?? settings.managedEmailProvider,
      moemailBaseUrl: options?.moemailBaseUrl ?? settings.moemailBaseUrl,
      moemailApiKey: options?.moemailApiKey ?? settings.moemailApiKey,
      moemailPreferredDomain: options?.moemailPreferredDomain ?? settings.moemailPreferredDomain,
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

  ipcMain.handle(
    'run-register-diagnostics',
    async (_event, nextSettings?: Partial<AppSettings>): Promise<RegisterDiagnostics> => {
      const settings = normalizeSettings({
        ...getSettings(),
        ...nextSettings
      });
      const currentBrowserObservation = registerRuntime.getState().latestDiagnostics?.browserObservation;
      const diagnostics = await runRegisterDiagnostics({
        proxyUrl: normalizeOptionalProxyUrl(settings.proxyUrl),
        lastFailure: registerRuntime.getState().lastFailure,
        registrationEmailMode: settings.registrationEmailMode,
        customEmailAddress: settings.customEmailAddress,
        managedEmailConfig:
          settings.registrationEmailMode === 'tempmail'
            ? {
                provider: settings.managedEmailProvider,
                ...buildMoeMailConfig(settings)
              }
            : undefined,
        mailboxConfig:
          settings.registrationEmailMode === 'custom' && settings.otpMode === 'mailbox'
            ? {
                provider: settings.mailboxProvider,
                email: settings.customEmailAddress,
                clientId: settings.outlookClientId,
                refreshToken: settings.outlookRefreshToken,
                onRefreshToken: (value: string) => {
                  persistRotatedOutlookRefreshToken(settings, value, 'diagnostics');
                }
              }
            : undefined,
        probeOutlookMailboxFn: probeOutlookMailbox
      });
      registerRuntime.setDiagnostics({
        ...diagnostics,
        browserObservation: currentBrowserObservation
      });
      emitRegisterRuntimeState();
      return {
        ...diagnostics,
        browserObservation: currentBrowserObservation
      };
    }
  );

  ipcMain.handle(
    'start-browser-observation',
    async (_event, nextSettings?: Partial<AppSettings>): Promise<BrowserObservationSummary> => {
      const settings = normalizeSettings({
        ...getSettings(),
        ...nextSettings
      });
      return startBrowserObservation(settings);
    }
  );

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
