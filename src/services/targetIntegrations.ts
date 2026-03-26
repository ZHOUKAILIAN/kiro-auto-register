import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

import {
  buildClaudeApiDirectImportPayload,
  buildClaudeApiImportPayload,
  buildCliproxyAuthRecord,
  generateCliproxyAuthFilename
} from './accountFormats.ts';
import type {
  ClaudeChatProbeResult,
  ClaudeImportResult,
  CliproxyWriteResult,
  OperationIssue,
  StoredAccount,
  TargetIntegrationSettings
} from '../shared/contracts.ts';

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function parseJsonSafely(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildClaudeHeaders(adminKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminKey}`
  };
}

function extractProbeReplyText(rawPayload: unknown): string | undefined {
  const raw = (rawPayload && typeof rawPayload === 'object'
    ? rawPayload
    : {}) as Record<string, unknown>;
  const choices = Array.isArray(raw.choices) ? raw.choices : [];
  const firstChoice =
    choices.length > 0 && choices[0] && typeof choices[0] === 'object'
      ? (choices[0] as Record<string, unknown>)
      : undefined;
  const message =
    firstChoice && firstChoice.message && typeof firstChoice.message === 'object'
      ? (firstChoice.message as Record<string, unknown>)
      : undefined;
  const content = message?.content;

  if (typeof content === 'string' && content.trim()) {
    return content.trim();
  }

  return undefined;
}

function shouldFallbackToDirectImport(status: number): boolean {
  return status === 404 || status === 405 || status === 501;
}

function parseClaudeImportResult(
  rawPayload: unknown,
  defaults: {
    success: boolean;
    imported: number;
    failed: number;
    duplicate: number;
    message: string;
  }
): ClaudeImportResult {
  const raw = (rawPayload && typeof rawPayload === 'object'
    ? rawPayload
    : {}) as Record<string, unknown>;

  return {
    success: typeof raw.success === 'boolean' ? raw.success : defaults.success,
    message: typeof raw.message === 'string' ? raw.message : defaults.message,
    imported: typeof raw.imported === 'number' ? raw.imported : defaults.imported,
    failed:
      typeof raw.failed === 'number'
        ? raw.failed
        : typeof raw.invalid === 'number'
          ? raw.invalid
          : defaults.failed,
    duplicate: typeof raw.duplicate === 'number' ? raw.duplicate : defaults.duplicate,
    raw
  };
}

export async function importAccountsToClaudeApi(
  accounts: StoredAccount[],
  settings: TargetIntegrationSettings
): Promise<ClaudeImportResult> {
  const baseUrl = normalizeBaseUrl(settings.claudeApiBaseUrl);
  const adminKey = settings.claudeApiAdminKey.trim();

  if (!baseUrl || !adminKey) {
    return {
      success: false,
      message: '请先配置 claude-api 地址和管理员口令',
      imported: 0,
      failed: accounts.length,
      duplicate: 0
    };
  }

  const payload = buildClaudeApiImportPayload(accounts);
  if (payload.length === 0) {
    return {
      success: false,
      message: '没有可导入到 claude-api 的账号',
      imported: 0,
      failed: 0,
      duplicate: 0
    };
  }

  try {
    const response = await fetch(`${baseUrl}/v2/accounts/import-by-token`, {
      method: 'POST',
      headers: buildClaudeHeaders(adminKey),
      body: JSON.stringify(payload)
    });

    const rawText = await response.text();
    const rawPayload = rawText ? parseJsonSafely(rawText) : {};

    if (!response.ok && shouldFallbackToDirectImport(response.status)) {
      const directPayload = buildClaudeApiDirectImportPayload(accounts);
      const skippedCount = accounts.length - directPayload.length;

      if (directPayload.length === 0) {
        return {
          success: false,
          message:
            '目标 claude-api 不支持 /v2/accounts/import-by-token，且当前账号缺少 clientId/clientSecret，无法回退到 /v2/accounts/import',
          imported: 0,
          failed: accounts.length,
          duplicate: 0,
          raw: {
            endpoint: '/v2/accounts/import-by-token',
            response: rawPayload
          }
        };
      }

      const fallbackResponse = await fetch(`${baseUrl}/v2/accounts/import`, {
        method: 'POST',
        headers: buildClaudeHeaders(adminKey),
        body: JSON.stringify(directPayload)
      });

      const fallbackText = await fallbackResponse.text();
      const fallbackRawPayload = fallbackText ? parseJsonSafely(fallbackText) : {};

      if (!fallbackResponse.ok) {
        return {
          success: false,
          message: `claude-api 导入失败: HTTP ${fallbackResponse.status}`,
          imported: 0,
          failed: directPayload.length + skippedCount,
          duplicate: 0,
          raw: {
            endpoint: '/v2/accounts/import',
            response: fallbackRawPayload
          }
        };
      }

      const fallbackResult = parseClaudeImportResult(fallbackRawPayload, {
        success: true,
        imported: directPayload.length,
        failed: 0,
        duplicate: 0,
        message: `已提交 ${directPayload.length} 个账号到 claude-api`
      });

      const finalFailed = fallbackResult.failed + skippedCount;
      const finalMessageParts = [fallbackResult.message, '已回退到 /v2/accounts/import 兼容模式'];
      if (skippedCount > 0) {
        finalMessageParts.push(`另有 ${skippedCount} 个账号缺少 clientId/clientSecret，未导入`);
      }

      return {
        ...fallbackResult,
        failed: finalFailed,
        message: finalMessageParts.join('；'),
        raw: {
          endpoint: '/v2/accounts/import',
          response: fallbackResult.raw
        }
      };
    }

    if (!response.ok) {
      return {
        success: false,
        message: `claude-api 导入失败: HTTP ${response.status}`,
        imported: 0,
        failed: payload.length,
        duplicate: 0,
        raw: {
          endpoint: '/v2/accounts/import-by-token',
          response: rawPayload
        }
      };
    }

    const result = parseClaudeImportResult(rawPayload, {
      success: true,
      imported: payload.length,
      failed: 0,
      duplicate: 0,
      message: `已提交 ${payload.length} 个账号到 claude-api`
    });

    return {
      ...result,
      raw: {
        endpoint: '/v2/accounts/import-by-token',
        response: result.raw
      }
    };
  } catch (error) {
    return {
      success: false,
      message: `claude-api 导入失败: ${error instanceof Error ? error.message : String(error)}`,
      imported: 0,
      failed: payload.length,
      duplicate: 0
    };
  }
}

export async function probeClaudeApiChat(
  settings: TargetIntegrationSettings
): Promise<ClaudeChatProbeResult> {
  const baseUrl = normalizeBaseUrl(settings.claudeApiBaseUrl);
  const adminKey = settings.claudeApiAdminKey.trim();

  if (!baseUrl || !adminKey) {
    return {
      success: false,
      message: '请先配置 claude-api 地址和管理员口令'
    };
  }

  try {
    const response = await fetch(`${baseUrl}/v2/test/chat/completions`, {
      method: 'POST',
      headers: buildClaudeHeaders(adminKey),
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 32,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: 'Reply with OK.'
          }
        ]
      })
    });

    const rawText = await response.text();
    const rawPayload = rawText ? parseJsonSafely(rawText) : {};
    const errorMessage =
      rawPayload && typeof rawPayload === 'object' && typeof (rawPayload as { error?: unknown }).error === 'string'
        ? (rawPayload as { error: string }).error
        : undefined;

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        message: errorMessage || `claude-api chat 探针失败: HTTP ${response.status}`,
        raw: rawPayload
      };
    }

    const replyText = extractProbeReplyText(rawPayload);
    return {
      success: true,
      status: response.status,
      message: replyText ? `claude-api chat 探针成功: ${replyText}` : 'claude-api chat 探针成功',
      replyText,
      raw: rawPayload
    };
  } catch (error) {
    return {
      success: false,
      message: `claude-api chat 探针失败: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

export async function writeAccountsToCliproxy(
  accounts: StoredAccount[],
  authDir: string
): Promise<CliproxyWriteResult> {
  const targetDir = authDir.trim();
  if (!targetDir) {
    return {
      success: false,
      message: '请先配置 cliproxyapi auth 目录',
      written: [],
      failed: []
    };
  }

  const written: string[] = [];
  const failed: OperationIssue[] = [];

  try {
    await mkdir(targetDir, { recursive: true, mode: 0o700 });

    for (const account of accounts) {
      if (!account.refreshToken || !account.accessToken) {
        failed.push({
          accountId: account.id,
          email: account.email,
          message: '缺少 accessToken 或 refreshToken，无法写入 cliproxy auth 文件'
        });
        continue;
      }

      const fileName = generateCliproxyAuthFilename(account);
      const filePath = path.join(targetDir, fileName);
      const payload = buildCliproxyAuthRecord(account);

      try {
        await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
        written.push(filePath);
      } catch (error) {
        failed.push({
          accountId: account.id,
          email: account.email,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const account of accounts) {
      failed.push({
        accountId: account.id,
        email: account.email,
        message
      });
    }
  }

  return {
    success: failed.length === 0,
    message:
      failed.length === 0
        ? `已写入 ${written.length} 个 cliproxyapi auth 文件`
        : `已写入 ${written.length} 个文件，${failed.length} 个失败`,
    written,
    failed
  };
}
