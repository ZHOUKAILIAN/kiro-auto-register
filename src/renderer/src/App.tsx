import { startTransition, useEffect, useState } from 'react';

import { DEFAULT_SETTINGS } from '../../services/storeSchemas.ts';
import type { AppSettings, StoredAccount } from '../../shared/contracts.ts';
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

function App() {
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [registering, setRegistering] = useState(false);
  const [busyAction, setBusyAction] = useState<'claude' | 'cliproxy' | 'export' | 'probe' | null>(null);
  const [progress, setProgress] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showSettings, setShowSettings] = useState(true);
  const [flashMessage, setFlashMessage] = useState('');

  useEffect(() => {
    void loadAccounts();
    void loadSettings();

    window.api.onRegisterProgress((message: string) => {
      setProgress((previous) => [...previous, message]);
    });

    return () => {
      window.api.removeRegisterProgressListener();
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

  function updateSettings<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    setSettings((current) => ({
      ...current,
      [key]: value
    }));
  }

  async function handleSaveSettings(): Promise<void> {
    const saved = await window.api.saveSettings(settings);
    setSettings(saved);
    setFlashMessage('设置已保存');
  }

  async function handleRegister(): Promise<void> {
    setRegistering(true);
    setProgress([]);
    setFlashMessage('');

    try {
      const result = await window.api.startRegister({
        count: settings.registerCount,
        proxyUrl: settings.proxyUrl,
        autoImportClaude: settings.autoImportClaude,
        autoWriteCliproxy: settings.autoWriteCliproxy
      });

      await loadAccounts();
      setFlashMessage(`注册任务完成：成功 ${result.successCount} / ${result.total}`);
    } finally {
      setRegistering(false);
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
      anchor.download = `kiro-accounts-${Date.now()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setFlashMessage('导出文件已生成');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleImportClaude(): Promise<void> {
    setBusyAction('claude');
    try {
      const result = await window.api.importToClaudeApi(getTargetIds());
      setFlashMessage(result.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleWriteCliproxy(): Promise<void> {
    setBusyAction('cliproxy');
    try {
      const result = await window.api.writeCliproxyAuthFiles(getTargetIds());
      setFlashMessage(result.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleProbeClaude(): Promise<void> {
    setBusyAction('probe');
    try {
      const result = await window.api.probeClaudeApiChat();
      setFlashMessage(result.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePickCliproxyDir(): Promise<void> {
    const result = await window.api.selectCliproxyAuthDir();
    if (!result.canceled && result.path) {
      updateSettings('cliproxyAuthDir', result.path);
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

    await window.api.deleteAccounts(Array.from(selectedIds));
    setSelectedIds(new Set());
    await loadAccounts();
    setFlashMessage('选中账号已删除');
  }

  async function handleDeleteSingle(id: number): Promise<void> {
    if (!confirm('确定要删除这个账号吗？')) {
      return;
    }

    await window.api.deleteAccount(id);
    await loadAccounts();
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
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

  return (
    <div className="app-shell">
      <div className="background-orb background-orb-left" />
      <div className="background-orb background-orb-right" />

      <header className="hero">
        <div>
          <p className="eyebrow">Kiro Registration Studio</p>
          <h1>自动注册、凭证补全、下游导入一站完成</h1>
          <p className="hero-copy">
            注册成功后自动把 SSO Token 兑换成可落地的 Kiro / BuilderId 凭证，并直接送进
            claude-api 或 cliproxyapi。
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
              <h2>注册与目标系统设置</h2>
            </div>
            <button className="ghost-button" onClick={() => setShowSettings((current) => !current)}>
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
                  placeholder="http://127.0.0.1:7890"
                  value={settings.proxyUrl}
                  onChange={(event) => updateSettings('proxyUrl', event.target.value)}
                />
              </label>

              <label className="field field-span-2">
                <span>claude-api 地址</span>
                <input
                  className="text-input"
                  type="text"
                  placeholder="http://127.0.0.1:62311"
                  value={settings.claudeApiBaseUrl}
                  onChange={(event) => updateSettings('claudeApiBaseUrl', event.target.value)}
                />
              </label>

              <label className="field">
                <span>claude-api 管理口令</span>
                <input
                  className="text-input"
                  type="password"
                  value={settings.claudeApiAdminKey}
                  onChange={(event) => updateSettings('claudeApiAdminKey', event.target.value)}
                />
              </label>

              <label className="field field-span-2">
                <span>cliproxyapi auth 目录</span>
                <div className="inline-field">
                  <input
                    className="text-input"
                    type="text"
                    placeholder="选择 ~/.cli-proxy-api 或挂载的 auth 目录"
                    value={settings.cliproxyAuthDir}
                    onChange={(event) => updateSettings('cliproxyAuthDir', event.target.value)}
                  />
                  <button className="secondary-button" onClick={handlePickCliproxyDir}>
                    选择目录
                  </button>
                </div>
              </label>

              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={settings.autoImportClaude}
                  onChange={(event) => updateSettings('autoImportClaude', event.target.checked)}
                />
                <span>注册成功后自动导入 claude-api</span>
              </label>

              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={settings.autoWriteCliproxy}
                  onChange={(event) => updateSettings('autoWriteCliproxy', event.target.checked)}
                />
                <span>注册成功后自动写入 cliproxy auth 文件</span>
              </label>
            </div>
          ) : null}

          <div className="action-row">
            <button className="primary-button" disabled={registering} onClick={handleRegister}>
              {registering ? '注册进行中...' : '开始注册'}
            </button>
            <button className="secondary-button" onClick={handleSaveSettings}>
              保存设置
            </button>
            <button className="secondary-button" disabled={busyAction === 'export'} onClick={handleExport}>
              {busyAction === 'export' ? '导出中...' : '导出 JSON'}
            </button>
            <button
              className="secondary-button"
              disabled={busyAction === 'claude'}
              onClick={handleImportClaude}
            >
              {busyAction === 'claude' ? '导入中...' : '导入 claude-api'}
            </button>
            <button
              className="secondary-button"
              disabled={busyAction === 'probe'}
              onClick={handleProbeClaude}
            >
              {busyAction === 'probe' ? '验证中...' : '验证 claude-api'}
            </button>
            <button
              className="secondary-button"
              disabled={busyAction === 'cliproxy'}
              onClick={handleWriteCliproxy}
            >
              {busyAction === 'cliproxy' ? '同步中...' : '同步 cliproxyapi'}
            </button>
            <button className="danger-button" onClick={handleDeleteSelected}>
              删除选中
            </button>
          </div>

          <div className="hint-grid">
            <div className="hint-card">
              <span className="hint-label">claude-api</span>
              <p>使用 `/v2/accounts/import-by-token` 接口直接批量导入。</p>
            </div>
            <div className="hint-card">
              <span className="hint-label">cliproxyapi</span>
              <p>按其 Kiro provider 规范写入 `type=kiro` 的本地 auth JSON 文件。</p>
            </div>
          </div>
        </section>

        <section className="panel log-panel">
          <div className="panel-header">
            <div>
              <p className="panel-title">实时日志</p>
              <h2>注册与导入过程</h2>
            </div>
            <span className="status-chip">{registering ? '运行中' : '空闲'}</span>
          </div>

          <div className="log-console">
            {progress.length === 0 ? (
              <div className="log-empty">开始注册后，这里会实时显示纯接口注册、凭证兑换与下游导入日志。</div>
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
            <button className="ghost-button" disabled={accounts.length === 0} onClick={toggleSelectAll}>
              {selectedIds.size === accounts.length && accounts.length > 0 ? '取消全选' : '全选'}
            </button>
          </div>

          {accounts.length === 0 ? (
            <div className="empty-state">
              <h3>还没有账号</h3>
              <p>先在上方配置好参数，再点击“开始注册”生成第一批可导入账号。</p>
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
                            {credentialReady ? '可导入' : '待补全'}
                          </span>
                        </td>
                        <td>{account.subscriptionTitle || '-'}</td>
                        <td>{formatUsage(account.usageCurrent, account.usageLimit)}</td>
                        <td className="mono-cell">{maskValue(account.refreshToken)}</td>
                        <td className="mono-cell">{maskValue(account.clientId)}</td>
                        <td>{formatDate(account.createdAt)}</td>
                        <td>
                          <button className="table-action" onClick={() => handleDeleteSingle(account.id)}>
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
