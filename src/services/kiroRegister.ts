/**
 * AWS Kiro 自动注册服务
 * 集成 Tempmail.lol 和 Playwright 自动化
 */

import { chromium, Browser, Page } from 'playwright';
import { createInbox, waitForVerificationCode } from './tempmail';

export interface RegisterResult {
  success: boolean;
  email?: string;
  ssoToken?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  name?: string;
  error?: string;
}

// 随机姓名生成
const FIRST_NAMES = ['James', 'Robert', 'John', 'Michael', 'David', 'William', 'Richard', 'Maria', 'Elizabeth', 'Jennifer'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];

function generateRandomName(): string {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${first} ${last}`;
}

const DEFAULT_PASSWORD = 'KiroAuto123!@#';

/**
 * AWS Kiro 自动注册
 */
export async function autoRegister(
  onProgress?: (message: string) => void,
  proxyUrl?: string
): Promise<RegisterResult> {
  let browser: Browser | null = null;
  let tempmailToken: string | null = null;

  try {
    // 步骤1: 创建临时邮箱
    onProgress?.('========== 创建临时邮箱 ==========');
    const inbox = await createInbox();
    tempmailToken = inbox.token;
    onProgress?.(`邮箱地址: ${inbox.email}`);

    // 步骤2: 启动浏览器
    onProgress?.('\n========== 启动浏览器 ==========');
    browser = await chromium.launch({
      headless: false,
      proxy: proxyUrl ? { server: proxyUrl } : undefined,
      args: ['--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });

    const page = await context.newPage();

    // 步骤3: 访问注册页面
    onProgress?.('\n========== 访问注册页面 ==========');
    const registerUrl = 'https://view.awsapps.com/start/#/device?user_code=PQCF-FCCN';
    await page.goto(registerUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    // 步骤4: 输入邮箱
    onProgress?.('\n========== 输入邮箱 ==========');
    const emailInput = page.locator('input[placeholder="username@example.com"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 30000 });
    await emailInput.fill(inbox.email);
    onProgress?.(`已输入邮箱: ${inbox.email}`);

    await page.waitForTimeout(1000);

    // 步骤5: 点击第一个继续按钮
    onProgress?.('\n========== 点击继续 ==========');
    const continueBtn = page.locator('button[data-testid="test-primary-button"]').first();
    await continueBtn.click();
    await page.waitForTimeout(3000);

    // 步骤6: 输入姓名
    onProgress?.('\n========== 输入姓名 ==========');
    const randomName = generateRandomName();
    const nameInput = page.locator('input[placeholder="Maria José Silva"]').first();
    await nameInput.waitFor({ state: 'visible', timeout: 30000 });
    await nameInput.fill(randomName);
    onProgress?.(`已输入姓名: ${randomName}`);

    await page.waitForTimeout(1000);

    // 步骤7: 点击第二个继续按钮
    const nextBtn = page.locator('button[data-testid="signup-next-button"]').first();
    await nextBtn.click();
    await page.waitForTimeout(3000);

    // 步骤8: 等待并输入验证码
    onProgress?.('\n========== 获取验证码 ==========');
    const codeInput = page.locator('input[placeholder="6 位数"]').first();
    await codeInput.waitFor({ state: 'visible', timeout: 30000 });

    const code = await waitForVerificationCode(tempmailToken, 120000, onProgress);

    if (!code) {
      throw new Error('未能获取验证码');
    }

    await codeInput.fill(code);
    onProgress?.(`已输入验证码: ${code}`);

    await page.waitForTimeout(1000);

    // 步骤9: 点击验证按钮
    const verifyBtn = page.locator('button[data-testid="email-verification-verify-button"]').first();
    await verifyBtn.click();
    await page.waitForTimeout(3000);

    // 步骤10: 设置密码
    onProgress?.('\n========== 设置密码 ==========');
    const passwordInput = page.locator('input[placeholder="Enter password"]').first();
    await passwordInput.waitFor({ state: 'visible', timeout: 30000 });
    await passwordInput.fill(DEFAULT_PASSWORD);

    const confirmPasswordInput = page.locator('input[placeholder="Re-enter password"]').first();
    await confirmPasswordInput.fill(DEFAULT_PASSWORD);

    await page.waitForTimeout(1000);

    // 步骤11: 完成注册
    const finalBtn = page.locator('button[data-testid="test-primary-button"]').first();
    await finalBtn.click();
    await page.waitForTimeout(5000);

    // 步骤12: 获取 SSO Token
    onProgress?.('\n========== 获取 SSO Token ==========');
    let ssoToken: string | null = null;

    for (let i = 0; i < 30; i++) {
      const cookies = await context.cookies();
      const ssoCookie = cookies.find(c => c.name === 'x-amz-sso_authn');
      if (ssoCookie) {
        ssoToken = ssoCookie.value;
        onProgress?.('✓ 成功获取 SSO Token');
        break;
      }
      await page.waitForTimeout(1000);
    }

    await browser.close();

    if (ssoToken) {
      onProgress?.('\n========== 注册成功! ==========');
      return {
        success: true,
        email: inbox.email,
        ssoToken,
        name: randomName
      };
    } else {
      throw new Error('未能获取 SSO Token');
    }

  } catch (error) {
    onProgress?.(`\n✗ 注册失败: ${error}`);
    if (browser) {
      try { await browser.close(); } catch {}
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
