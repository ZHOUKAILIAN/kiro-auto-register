/**
 * Kiro Auto Register - 主应用
 */

import { useState, useEffect } from 'react';
import './App.css';

interface Account {
  id: number;
  email: string;
  ssoToken: string;
  name?: string;
  createdAt: number;
}

function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [registering, setRegistering] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [proxyUrl, setProxyUrl] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    loadAccounts();
    loadSettings();

    // 监听注册进度
    window.api.onRegisterProgress((message: string) => {
      setProgress(prev => [...prev, message]);
    });

    return () => {
      window.api.removeRegisterProgressListener();
    };
  }, []);

  const loadAccounts = async () => {
    const data = await window.api.getAccounts();
    setAccounts(data);
  };

  const loadSettings = async () => {
    const settings = await window.api.getSettings();
    setProxyUrl(settings.proxyUrl || '');
  };

  const handleRegister = async () => {
    setRegistering(true);
    setProgress([]);

    const result = await window.api.startRegister(proxyUrl || undefined);

    if (result.success) {
      await window.api.saveAccount(result);
      await loadAccounts();
      setProgress(prev => [...prev, '\n✅ 注册成功！账号已保存']);
    } else {
      setProgress(prev => [...prev, `\n❌ 注册失败: ${result.error}`]);
    }

    setRegistering(false);
  };

  const handleDelete = async (id: number) => {
    if (confirm('确定要删除这个账号吗？')) {
      await window.api.deleteAccount(id);
      await loadAccounts();
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) {
      alert('请先选择要删除的账号');
      return;
    }

    if (confirm(`确定要删除选中的 ${selectedIds.size} 个账号吗？`)) {
      await window.api.deleteAccounts(Array.from(selectedIds));
      await loadAccounts();
      setSelectedIds(new Set());
    }
  };

  const handleExport = async () => {
    if (accounts.length === 0) {
      alert('没有可导出的账号');
      return;
    }

    const json = await window.api.exportAccounts(accounts);

    // 下载文件
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kiro-accounts-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    alert('导出成功！');
  };

  const toggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === accounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(accounts.map(a => a.id)));
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>🚀 Kiro Auto Register</h1>
        <p>AWS Kiro 账号自动注册工具</p>
      </header>

      <div className="container">
        {/* 操作栏 */}
        <div className="toolbar">
          <button
            onClick={handleRegister}
            disabled={registering}
            className="btn btn-primary"
          >
            {registering ? '注册中...' : '🎯 开始注册'}
          </button>

          <button
            onClick={handleExport}
            disabled={accounts.length === 0}
            className="btn btn-secondary"
          >
            📤 导出账号
          </button>

          <button
            onClick={handleBatchDelete}
            disabled={selectedIds.size === 0}
            className="btn btn-danger"
          >
            🗑️ 批量删除 ({selectedIds.size})
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="btn btn-secondary"
          >
            ⚙️ 设置
          </button>
        </div>

        {/* 设置面板 */}
        {showSettings && (
          <div className="settings-panel">
            <h3>设置</h3>
            <div className="form-group">
              <label>代理 URL（可选）</label>
              <input
                type="text"
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
                placeholder="http://127.0.0.1:7890"
                className="input"
              />
              <small>留空表示不使用代理</small>
            </div>
            <button
              onClick={async () => {
                await window.api.saveSettings({ proxyUrl });
                alert('设置已保存');
                setShowSettings(false);
              }}
              className="btn btn-primary"
            >
              保存设置
            </button>
          </div>
        )}

        {/* 进度日志 */}
        {registering && (
          <div className="progress-panel">
            <h3>注册进度</h3>
            <div className="log-output">
              {progress.map((msg, idx) => (
                <div key={idx} className="log-line">{msg}</div>
              ))}
            </div>
          </div>
        )}

        {/* 账号列表 */}
        <div className="accounts-section">
          <div className="section-header">
            <h2>账号列表 ({accounts.length})</h2>
            {accounts.length > 0 && (
              <button onClick={toggleSelectAll} className="btn-link">
                {selectedIds.size === accounts.length ? '取消全选' : '全选'}
              </button>
            )}
          </div>

          {accounts.length === 0 ? (
            <div className="empty-state">
              <p>暂无账号，点击"开始注册"创建新账号</p>
            </div>
          ) : (
            <table className="accounts-table">
              <thead>
                <tr>
                  <th width="40">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === accounts.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th>邮箱</th>
                  <th>姓名</th>
                  <th>SSO Token</th>
                  <th>创建时间</th>
                  <th width="100">操作</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(account.id)}
                        onChange={() => toggleSelect(account.id)}
                      />
                    </td>
                    <td>{account.email}</td>
                    <td>{account.name || '-'}</td>
                    <td className="token-cell">
                      {account.ssoToken.substring(0, 20)}...
                    </td>
                    <td>{new Date(account.createdAt).toLocaleString()}</td>
                    <td>
                      <button
                        onClick={() => handleDelete(account.id)}
                        className="btn-danger-small"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <footer className="footer">
        <p>
          导出格式兼容 <a href="http://localhost:62311" target="_blank">claude-api</a>
          {' | '}
          <a href="https://github.com/ZHOUKAILIAN/kiro-auto-register" target="_blank">
            GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}

export default App;
