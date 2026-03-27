import { startTransition, useEffect, useState } from 'react';

import { DEFAULT_SETTINGS } from '../../services/storeSchemas.ts';
import { getAccountActionHint } from '../../shared/accountActionUi.ts';
import {
  buildRegisterOutcomeMessage,
  buildRegisterStartupMessages
} from '../../shared/registerProgressUi.ts';
import {
  getRegistrationComparisonSummary,
  getRegistrationEvidenceSummary,
  getRegistrationProbeAvailabilityLabel,
  getRegistrationProbeMessage,
  getTempmailAvailabilityLabel
} from '../../shared/registerDiagnosticsUi.ts';
import type {
  AppSettings,
  RegisterDiagnostics,
  RegisterRuntimeState,
  StoredAccount
} from '../../shared/contracts.ts';
import './App.css';

function maskValue(value: string, head: number = 8, tail: number = 6): string {
  if (!value) {
    return '-';
  }

  if (value.length <= head + tail) {
    return value;
  }

  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function formatDate(timestamp: number): string {
  if (!timestamp) {
    return '-';
  }

  return new Date(timestamp).toLocaleString();
}

function formatUsage(current: number, limit: number): string {
  if (!limit) {
    return '-';
  }

  return `${current}/${limit}`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function App() {
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [runtimeState, setRuntimeState] = useState<RegisterRuntimeState>({ isRegistering: false });
  const [busyAction, setBusyAction] = useState<'export' | 'diagnostics' | 'browser' | 'save' | null>(null);
  const [progress, setProgress] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showSettings, setShowSettings] = useState(true);
  const [flashMessage, setFlashMessage] = useState('');
  const [manualOtp, setManualOtp] = useState('');

  useEffect(() => {
    void loadAccounts();
    void loadSettings();
    void loadRegisterRuntimeState();

    window.api.onRegisterProgress((message: string) => {
      setProgress((previous) => [...previous, message]);
    });
    window.api.onRegisterRuntimeState((state: RegisterRuntimeState) => {
      setRuntimeState(state);
      if (!state.isRegistering) {
        void loadAccounts();
      }
    });

    return () => {
      window.api.removeRegisterProgressListener();
      window.api.removeRegisterRuntimeStateListener();
    };
  }, []);

  async function loadAccounts(): Promise<void> {
    const nextAccounts = await window.api.getAccounts();
    startTransition(() => {
      setAccounts(nextAccounts);
    });
  }

  async function loadSettings(): Promise<void> {
    const nextSettings = await window.api.getSettings();
    setSettings(nextSettings);
  }

  async function loadRegisterRuntimeState(): Promise<void> {
    const nextState = await window.api.getRegisterRuntimeState();
    setRuntimeState(nextState);
  }

  function updateSettings<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    setSettings((current) => ({
      ...current,
      [key]: value
    }));
  }

  async function handleSaveSettings(): Promise<void> {
    setBusyAction('save');
    try {
      const saved = await window.api.saveSettings(settings);
      setSettings(saved);
      setFlashMessage('设置已保存');
    } catch (error) {
      setFlashMessage(`保存设置失败：${toErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRegister(): Promise<void> {
    setProgress(
      buildRegisterStartupMessages({
        count: settings.registerCount,
        managedEmailProvider: settings.managedEmailProvider,
        mailboxProvider: settings.mailboxProvider,
        proxyUrl: settings.proxyUrl,
        registrationEmailMode: settings.registrationEmailMode,
        otpMode: settings.otpMode
      })
    );
    setFlashMessage('');

    try {
      const result = await window.api.startRegister({
        count: settings.registerCount,
        proxyUrl: settings.proxyUrl,
        registrationEmailMode: settings.registrationEmailMode,
        managedEmailProvider: settings.managedEmailProvider,
        moemailBaseUrl: settings.moemailBaseUrl,
        moemailApiKey: settings.moemailApiKey,
        moemailPreferredDomain: settings.moemailPreferredDomain,
        customEmailAddress: settings.customEmailAddress,
        otpMode: settings.otpMode
      });

      setProgress((current) => [
        ...current,
        ...result.results.map((item) => `${item.success ? '✓' : '⚠'} 任务 ${item.index}: ${item.message}`)
      ]);
      await loadAccounts();
      setFlashMessage(buildRegisterOutcomeMessage(result));
    } catch (error) {
      setProgress((current) => [...current, `⚠ 注册任务异常中断：${toErrorMessage(error)}`]);
      setFlashMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function getTargetIds(): number[] | undefined {
    return selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
  }

  async function handleExport(): Promise<void> {
    if (accounts.length === 0) {
      setFlashMessage('暂无可导出的账号');
      return;
    }

    setBusyAction('export');
    try {
      const json = await window.api.exportAccounts(getTargetIds());
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `kiro-manager-accounts-${Date.now()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setFlashMessage('导出文件已生成');
    } catch (error) {
      setFlashMessage(`导出 JSON 失败：${toErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSubmitManualOtp(): Promise<void> {
    const pendingOtp = runtimeState.pendingOtp;
    if (!pendingOtp) {
      setFlashMessage('当前没有等待输入的验证码任务');
      return;
    }

    try {
      const result = await window.api.submitRegisterOtp(pendingOtp.taskId, manualOtp);
      setFlashMessage(result.message);
      if (result.success) {
        setManualOtp('');
      }
    } catch (error) {
      setFlashMessage(`提交验证码失败：${toErrorMessage(error)}`);
    }
  }

  async function handleRunDiagnostics(): Promise<void> {
    setBusyAction('diagnostics');
    try {
      const diagnostics = await window.api.runRegisterDiagnostics(settings);
      const summaries = [
        diagnostics.tempmail.message,
        diagnostics.managedEmail?.message,
        diagnostics.mailbox?.message,
        diagnostics.registrationProbe
          ? `注册探测(${diagnostics.registrationProbe.stage}): ${diagnostics.registrationProbe.message}`
          : getRegistrationProbeMessage(diagnostics)
      ].filter(Boolean);
      setFlashMessage(`诊断完成：${summaries.join('；')}`);
    } catch (error) {
      setFlashMessage(`运行诊断失败：${toErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleStartBrowserObservation(): Promise<void> {
    setBusyAction('browser');
    try {
      const summary = await window.api.startBrowserObservation(settings);
      setFlashMessage(
        summary.active
          ? '浏览器观察窗口已启动，可在新窗口中手动操作并回到日志面板查看事件'
          : '浏览器观察未能启动'
      );
    } catch (error) {
      setFlashMessage(`启动浏览器观察失败：${toErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeleteSelected(): Promise<void> {
    if (selectedIds.size === 0) {
      setFlashMessage('请先选择要删除的账号');
      return;
    }

    if (!confirm(`确定要删除选中的 ${selectedIds.size} 个账号吗？`)) {
      return;
    }

    try {
      await window.api.deleteAccounts(Array.from(selectedIds));
      setSelectedIds(new Set());
      await loadAccounts();
      setFlashMessage('选中账号已删除');
    } catch (error) {
      setFlashMessage(`删除账号失败：${toErrorMessage(error)}`);
    }
  }

  async function handleDeleteSingle(id: number): Promise<void> {
    if (!confirm('确定要删除这个账号吗？')) {
      return;
    }

    try {
      await window.api.deleteAccount(id);
      await loadAccounts();
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      setFlashMessage('账号已删除');
    } catch (error) {
      setFlashMessage(`删除账号失败：${toErrorMessage(error)}`);
    }
  }

  function toggleSelected(id: number): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll(): void {
    if (selectedIds.size === accounts.length) {
      setSelectedIds(new Set());
      return;
    }

    setSelectedIds(new Set(accounts.map((account) => account.id)));
  }

  const readyAccounts = accounts.filter(
    (account) => account.refreshToken && account.clientId && account.clientSecret
  ).length;
  const registering = runtimeState.isRegistering;
  const diagnostics = runtimeState.latestDiagnostics;
  const pendingOtp = runtimeState.pendingOtp;
  const hasAccounts = accounts.length > 0;
  const hasSelectedAccounts = selectedIds.size > 0;
  const managedEmailProviderLabel =
    settings.managedEmailProvider === 'moemail-api' ? 'MoeMail API' : 'Tempmail.lol';
  const effectiveOtpMode =
    settings.registrationEmailMode === 'custom' && settings.otpMode === 'tempmail'
      ? 'manual'
      : settings.otpMode;

  function renderDiagnosticsValue(value: string | undefined): string {
    return value && value.trim() ? value : '-';
  }

  function renderDiagnosticsSummary(result: RegisterDiagnostics | undefined): string {
    if (!result) {
      return '还没有运行诊断';
    }

    if (result.browserObservation?.active) {
      return `浏览器观察中 · ${result.browserObservation.currentUrl || '等待导航'}`;
    }

    if (result.registrationProbe) {
      return `${getRegistrationProbeAvailabilityLabel(result)} · ${result.registrationProbe.stage}`;
    }

    const location = [result.egress?.city, result.egress?.region, result.egress?.country]
      .filter(Boolean)
      .join(', ');

    return location || result.egress?.ip || '已完成出口检测';
  }

  return (
    <div className="app-shell">
      <div className="background-orb background-orb-left" />
      <div className="background-orb background-orb-right" />

      <header className="hero">
        <div>
          <p className="eyebrow">Kiro Manager</p>
          <h1>自动注册、凭证补全、账号导出一站完成</h1>
          <p className="hero-copy">
            聚焦纯接口注册、本地账号池、手动 OTP 回退与链路诊断，只在需要时导出标准账号数据。
          </p>
        </div>

        <div className="hero-metrics">
          <div className="metric-card">
            <span className="metric-label">本地账号</span>
            <strong>{accounts.length}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">完整凭证</span>
            <strong>{readyAccounts}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">当前选择</span>
            <strong>{selectedIds.size}</strong>
          </div>
        </div>
      </header>

      {flashMessage ? <div className="flash-banner">{flashMessage}</div> : null}

      <main className="workspace-grid">
        <section className="panel control-panel">
          <div className="panel-header">
            <div>
              <p className="panel-title">控制台</p>
              <h2>注册与导出设置</h2>
            </div>
            <button className="ghost-button" type="button" onClick={() => setShowSettings((current) => !current)}>
              {showSettings ? '收起设置' : '展开设置'}
            </button>
          </div>

          {showSettings ? (
            <div className="settings-grid">
              <label className="field">
                <span>注册数量</span>
                <input
                  className="text-input"
                  type="number"
                  min={1}
                  value={settings.registerCount}
                  onChange={(event) =>
                    updateSettings('registerCount', Math.max(1, Number(event.target.value) || 1))
                  }
                />
              </label>

              <label className="field">
                <span>代理 URL</span>
                <input
                  className="text-input"
                  type="text"
                  placeholder="http://127.0.0.1:7890 / socks5://user:pass@host:port / ipfoxy://userId:proxyKey"
                  value={settings.proxyUrl}
                  onChange={(event) => updateSettings('proxyUrl', event.target.value)}
                />
                <small className="field-hint">支持 http://、https://、socks5://、ipfoxy://用户ID:代理密钥</small>
              </label>

              <label className="field">
                <span>注册邮箱来源</span>
                <select
                  className="text-input"
                  value={settings.registrationEmailMode}
                  onChange={(event) => {
                    const nextMode = event.target.value as AppSettings['registrationEmailMode'];
                    setSettings((current) => ({
                      ...current,
                      registrationEmailMode: nextMode,
                      otpMode:
                        nextMode === 'custom' && current.otpMode === 'tempmail'
                          ? 'manual'
                          : current.otpMode
                    }));
                  }}
                >
                  <option value="tempmail">应用自动创建邮箱</option>
                  <option value="custom">我自己的邮箱</option>
                </select>
              </label>

              <label className="field">
                <span>OTP 模式</span>
                <select
                  className="text-input"
                  value={effectiveOtpMode}
                  onChange={(event) =>
                    updateSettings('otpMode', event.target.value as AppSettings['otpMode'])
                  }
                >
                  {settings.registrationEmailMode === 'custom' ? (
                    <>
                      <option value="manual">界面手动输入 OTP</option>
                      <option value="mailbox">Outlook 邮箱自动收码</option>
                    </>
                  ) : (
                    <>
                      <option value="tempmail">自动轮询当前邮箱提供方</option>
                      <option value="manual">界面手动输入 OTP</option>
                    </>
                  )}
                </select>
              </label>

              {settings.registrationEmailMode === 'tempmail' ? (
                <>
                  <label className="field field-span-2">
                    <span>自动邮箱提供方</span>
                    <select
                      className="text-input"
                      value={settings.managedEmailProvider}
                      onChange={(event) =>
                        updateSettings(
                          'managedEmailProvider',
                          event.target.value as AppSettings['managedEmailProvider']
                        )
                      }
                    >
                      <option value="tempmail.lol">Tempmail.lol</option>
                      <option value="moemail-api">MoeMail API</option>
                    </select>
                    <small className="field-hint">
                      `Tempmail.lol` 适合匿名临时邮箱；`MoeMail API` 适合你已经有账号和 API Key 的场景。
                    </small>
                  </label>

                  {settings.managedEmailProvider === 'moemail-api' ? (
                    <>
                      <label className="field field-span-2">
                        <span>MoeMail Base URL</span>
                        <input
                          className="text-input"
                          type="text"
                          placeholder="https://moemail.app"
                          value={settings.moemailBaseUrl}
                          onChange={(event) => updateSettings('moemailBaseUrl', event.target.value)}
                        />
                      </label>

                      <label className="field field-span-2">
                        <span>MoeMail API Key</span>
                        <textarea
                          className="text-input"
                          rows={3}
                          placeholder="mk_xxxxx"
                          value={settings.moemailApiKey}
                          onChange={(event) => updateSettings('moemailApiKey', event.target.value)}
                        />
                        <small className="field-hint">
                          当前项目不会自动注册 MoeMail 账号，只会使用你已有账号的 API Key 进行建箱和收码。
                        </small>
                      </label>

                      <label className="field field-span-2">
                        <span>MoeMail 优选域名</span>
                        <input
                          className="text-input"
                          type="text"
                          placeholder="moemail.app"
                          value={settings.moemailPreferredDomain}
                          onChange={(event) =>
                            updateSettings('moemailPreferredDomain', event.target.value)
                          }
                        />
                        <small className="field-hint">
                          留空时会自动读取 `/api/config` 并使用第一个可用域名。
                        </small>
                      </label>
                    </>
                  ) : null}
                </>
              ) : null}

              {settings.registrationEmailMode === 'custom' ? (
                <>
                  <label className="field field-span-2">
                    <span>自定义邮箱地址</span>
                    <input
                      className="text-input"
                      type="email"
                      placeholder="owner@outlook.com"
                      value={settings.customEmailAddress}
                      onChange={(event) => updateSettings('customEmailAddress', event.target.value)}
                    />
                  </label>

                  {effectiveOtpMode === 'mailbox' ? (
                    <>
                      <label className="field field-span-2">
                        <span>邮箱自动收码提供方</span>
                        <input
                          className="text-input"
                          type="text"
                          value="Outlook Graph"
                          disabled
                        />
                        <small className="field-hint">
                          当前轮次仅内置 Outlook Graph 收码链路，需要你提供可用的 client_id 与 refresh_token。
                        </small>
                      </label>

                      <label className="field field-span-2">
                        <span>Outlook Graph Client ID</span>
                        <input
                          className="text-input"
                          type="text"
                          placeholder="9e5f94bc-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                          value={settings.outlookClientId}
                          onChange={(event) => updateSettings('outlookClientId', event.target.value)}
                        />
                      </label>

                      <label className="field field-span-2">
                        <span>Outlook Graph Refresh Token</span>
                        <textarea
                          className="text-input"
                          rows={4}
                          placeholder="M.C5_BAY.xxxxx..."
                          value={settings.outlookRefreshToken}
                          onChange={(event) => updateSettings('outlookRefreshToken', event.target.value)}
                        />
                        <small className="field-hint">
                          注册和诊断会直接用这组凭据访问 Outlook Graph 邮箱，不会展示完整 token。
                        </small>
                      </label>
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          <div className="action-row">
            <button className="primary-button" type="button" disabled={registering} onClick={handleRegister}>
              {registering ? '注册进行中...' : '开始注册'}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={busyAction === 'save'}
              onClick={handleSaveSettings}
            >
              {busyAction === 'save' ? '保存中...' : '保存设置'}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={busyAction === 'export' || !hasAccounts}
              onClick={handleExport}
            >
              {busyAction === 'export' ? '导出中...' : '导出账号 JSON'}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={busyAction === 'diagnostics'}
              onClick={handleRunDiagnostics}
            >
              {busyAction === 'diagnostics' ? '诊断中...' : '运行诊断'}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={busyAction === 'browser'}
              onClick={handleStartBrowserObservation}
            >
              {busyAction === 'browser' ? '启动中...' : '浏览器观察'}
            </button>
            <button
              className="danger-button"
              type="button"
              disabled={!hasSelectedAccounts}
              onClick={handleDeleteSelected}
            >
              删除选中
            </button>
          </div>

          <p className="action-hint">{getAccountActionHint(accounts.length, selectedIds.size)}</p>

          <div className="hint-grid">
            <div className="hint-card">
              <span className="hint-label">导出接口</span>
              <p>导出按钮会生成标准账号 JSON，后续由你在别处自行消费，不在当前应用里耦合下游仓库。</p>
            </div>
            <div className="hint-card">
              <span className="hint-label">邮箱策略</span>
              <p>
                当前自动邮箱提供方是 <strong>{managedEmailProviderLabel}</strong>。自定义邮箱仍可走手动 OTP 或 Outlook
                自动收码，失败日志都会继续写进当前面板。
              </p>
            </div>
          </div>

          <div className="diagnostics-card">
            <div className="panel-header compact-header">
              <div>
                <p className="panel-title">链路诊断</p>
                <h2>出口、邮箱与注册探测</h2>
              </div>
              <span className="status-chip">{renderDiagnosticsSummary(diagnostics)}</span>
            </div>

            <div className="diagnostics-grid">
              <div className="diagnostic-item">
                <span className="diagnostic-label">出口 IP</span>
                <strong>{renderDiagnosticsValue(diagnostics?.egress?.ip)}</strong>
                <p>
                  {[
                    diagnostics?.egress?.city,
                    diagnostics?.egress?.region,
                    diagnostics?.egress?.country
                  ]
                    .filter(Boolean)
                    .join(', ') || '尚未检测'}
                </p>
              </div>
              <div className="diagnostic-item">
                <span className="diagnostic-label">Tempmail</span>
                <strong>{getTempmailAvailabilityLabel(diagnostics)}</strong>
                <p>{diagnostics?.tempmail.message || '点击“运行诊断”检查邮箱创建能力'}</p>
              </div>
              <div className="diagnostic-item">
                <span className="diagnostic-label">代理注册探测</span>
                <strong>{getRegistrationProbeAvailabilityLabel(diagnostics)}</strong>
                <p>
                  {diagnostics?.registrationProbe
                    ? `${diagnostics.registrationProbe.stage} · ${getRegistrationProbeMessage(diagnostics)}`
                    : getRegistrationProbeMessage(diagnostics)}
                </p>
              </div>
              <div className="diagnostic-item">
                <span className="diagnostic-label">探针证据</span>
                <strong>
                  {diagnostics?.registrationProbe?.evidence?.httpStatus
                    ? `HTTP ${diagnostics.registrationProbe.evidence.httpStatus}`
                    : '待补充'}
                </strong>
                <p>{getRegistrationEvidenceSummary(diagnostics?.registrationProbe)}</p>
              </div>
              {settings.registrationEmailMode === 'tempmail' &&
              settings.managedEmailProvider === 'moemail-api' ? (
                <div className="diagnostic-item">
                  <span className="diagnostic-label">当前自动邮箱</span>
                  <strong>
                    {diagnostics?.managedEmail
                      ? diagnostics.managedEmail.success
                        ? '可用'
                        : '不可用'
                      : '待检测'}
                  </strong>
                  <p>
                    {diagnostics?.managedEmail?.message ||
                      '点击“运行诊断”验证 MoeMail API Key、域名和建箱能力'}
                  </p>
                </div>
              ) : null}
              <div className="diagnostic-item">
                <span className="diagnostic-label">最近阻塞</span>
                <strong>{runtimeState.lastFailure?.stage || '暂无'}</strong>
                <p>{runtimeState.lastFailure?.message || '最近还没有记录到注册阻塞摘要'}</p>
              </div>
              {settings.registrationEmailMode === 'custom' ? (
                <div className="diagnostic-item">
                  <span className="diagnostic-label">邮箱自动收码</span>
                  <strong>
                    {diagnostics?.mailbox
                      ? diagnostics.mailbox.success
                        ? '可用'
                        : '不可用'
                      : effectiveOtpMode === 'mailbox'
                        ? '待检测'
                        : '未启用'}
                  </strong>
                  <p>
                    {diagnostics?.mailbox?.message ||
                      (effectiveOtpMode === 'mailbox'
                        ? '点击“运行诊断”验证 Outlook 邮箱凭据是否可用'
                        : '当前未启用邮箱自动收码')}
                  </p>
                </div>
              ) : null}
              <div className="diagnostic-item">
                <span className="diagnostic-label">浏览器观察</span>
                <strong>
                  {diagnostics?.browserObservation
                    ? diagnostics.browserObservation.active
                      ? '观察中'
                      : '已结束'
                    : '未启动'}
                </strong>
                <p>
                  {diagnostics?.browserObservation?.lastError ||
                    diagnostics?.browserObservation?.currentUrl ||
                    '点击“浏览器观察”打开真实页面并采集导航/网络事件'}
                </p>
              </div>
            </div>

            {diagnostics?.registrationComparisons?.length ? (
              <div className="diagnostic-detail-block">
                <span className="diagnostic-label">邮箱来源对比</span>
                <div className="diagnostic-detail-list">
                  {getRegistrationComparisonSummary(diagnostics).map((line) => (
                    <div key={line} className="diagnostic-detail-line">
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {diagnostics?.registrationProbe?.evidence?.stageTrace?.length ? (
              <div className="diagnostic-detail-block">
                <span className="diagnostic-label">探针阶段时间线</span>
                <div className="diagnostic-detail-list">
                  {diagnostics.registrationProbe.evidence.stageTrace.map((entry) => (
                    <div
                      key={`${entry.stage}-${entry.timestamp}`}
                      className="diagnostic-detail-line"
                    >
                      {`${entry.ok ? '✓' : '⚠'} ${entry.stage}: ${entry.detail}`}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {diagnostics?.registrationProbe?.evidence?.responseSnippet ? (
              <div className="diagnostic-detail-block">
                <span className="diagnostic-label">响应摘要</span>
                <div className="diagnostic-detail-list">
                  <div className="diagnostic-detail-line">
                    {diagnostics.registrationProbe.evidence.responseSnippet}
                  </div>
                </div>
              </div>
            ) : null}

            {diagnostics?.browserObservation?.latestNetworkHits?.length ? (
              <div className="diagnostic-detail-block">
                <span className="diagnostic-label">浏览器观察事件</span>
                <div className="diagnostic-detail-list">
                  {diagnostics.browserObservation.latestNetworkHits.map((hit, index) => (
                    <div
                      key={`${hit.timestamp}-${hit.type}-${index}`}
                      className="diagnostic-detail-line"
                    >
                      {`${hit.type}${typeof hit.status === 'number' ? ` ${hit.status}` : ''} · ${hit.url || hit.detail}`}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {pendingOtp ? (
            <div className="otp-card">
              <div className="panel-header compact-header">
                <div>
                  <p className="panel-title">手动 OTP</p>
                  <h2>等待你输入验证码</h2>
                </div>
                <span className="status-chip">任务 {pendingOtp.registerIndex}</span>
              </div>

              <p className="otp-copy">
                当前注册任务正在等待 <strong>{pendingOtp.email}</strong> 的 6 位验证码。输入后应用会继续完成身份创建与凭证兑换。
              </p>

              <div className="otp-row">
                <input
                  className="text-input otp-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6 位验证码"
                  value={manualOtp}
                  onChange={(event) => setManualOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                />
                <button className="primary-button" type="button" onClick={handleSubmitManualOtp}>
                  提交验证码
                </button>
              </div>

              <div className="otp-meta">
                <span>请求时间：{formatDate(pendingOtp.requestedAt)}</span>
                <span>任务 ID：{maskValue(pendingOtp.taskId, 6, 6)}</span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="panel log-panel">
          <div className="panel-header">
            <div>
              <p className="panel-title">实时日志</p>
              <h2>注册与保存过程</h2>
            </div>
            <span className="status-chip">{registering ? '运行中' : '空闲'}</span>
          </div>

          <div className="log-console">
            {progress.length === 0 ? (
              <div className="log-empty">开始注册后，这里会实时显示纯接口注册、凭证兑换与本地保存日志。</div>
            ) : (
              progress.map((line, index) => (
                <div key={`${line}-${index}`} className="log-line">
                  {line}
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel accounts-panel">
          <div className="panel-header">
            <div>
              <p className="panel-title">账号池</p>
              <h2>本地账号管理</h2>
            </div>
            <button
              className="ghost-button"
              type="button"
              disabled={accounts.length === 0}
              onClick={toggleSelectAll}
            >
              {selectedIds.size === accounts.length && accounts.length > 0 ? '取消全选' : '全选'}
            </button>
          </div>

          {accounts.length === 0 ? (
            <div className="empty-state">
              <h3>还没有账号</h3>
              <p>先在上方配置好参数，再点击“开始注册”生成第一批可导出账号。</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="accounts-table">
                <thead>
                  <tr>
                    <th className="checkbox-col">
                      <input
                        type="checkbox"
                        checked={accounts.length > 0 && selectedIds.size === accounts.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th>邮箱</th>
                    <th>显示名</th>
                    <th>凭证状态</th>
                    <th>订阅</th>
                    <th>用量</th>
                    <th>Refresh Token</th>
                    <th>Client ID</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => {
                    const credentialReady = Boolean(
                      account.refreshToken && account.clientId && account.clientSecret
                    );

                    return (
                      <tr key={account.id}>
                        <td className="checkbox-col">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(account.id)}
                            onChange={() => toggleSelected(account.id)}
                          />
                        </td>
                        <td>
                          <div className="cell-title">{account.email || '-'}</div>
                          <div className="cell-subtitle">{maskValue(account.ssoToken)}</div>
                        </td>
                        <td>{account.name || '-'}</td>
                        <td>
                          <span className={`badge ${credentialReady ? 'badge-ready' : 'badge-pending'}`}>
                            {credentialReady ? '可导出' : '待补全'}
                          </span>
                        </td>
                        <td>{account.subscriptionTitle || '-'}</td>
                        <td>{formatUsage(account.usageCurrent, account.usageLimit)}</td>
                        <td className="mono-cell">{maskValue(account.refreshToken)}</td>
                        <td className="mono-cell">{maskValue(account.clientId)}</td>
                        <td>{formatDate(account.createdAt)}</td>
                        <td>
                          <button className="table-action" type="button" onClick={() => handleDeleteSingle(account.id)}>
                            删除
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
