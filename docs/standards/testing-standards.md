# Testing Standards

**Project**: kiro-auto-register
**Last Updated**: 2026-03-25

## 📋 Overview

### Testing Philosophy

1. **Write Testable Code**: Design for testability from the start
2. **Test Behavior, Not Implementation**: Focus on what code does, not how
3. **Fast Feedback**: Unit tests should run in milliseconds
4. **Isolated Tests**: Each test should be independent
5. **Meaningful Tests**: Test real scenarios, not just coverage numbers

### Testing Pyramid

```
        /\
       /E2E\       ← Few (5-10% coverage)
      /------\
     / Integ  \    ← Some (20-30% coverage)
    /----------\
   /    Unit    \  ← Many (60-70% coverage)
  /--------------\
```

## 🎯 Test Coverage Goals

| Type | Target Coverage | Purpose |
|------|----------------|---------|
| **Unit Tests** | 70%+ | Test individual functions/classes |
| **Integration Tests** | 30%+ | Test service interactions |
| **E2E Tests** | Critical paths | Test full user workflows |

### Critical Path Coverage

Must have E2E tests for:
- Complete registration flow
- Account export flow
- Batch registration
- Error recovery

## 🔧 Testing Framework

### Stack

- **Test Runner**: Vitest
- **Assertions**: Vitest built-in `expect`
- **Mocking**: Vitest `vi`
- **E2E**: Playwright Test
- **Coverage**: vitest coverage (c8)

### Installation

```bash
npm install -D vitest @vitest/ui c8 @playwright/test
```

### Configuration

**vitest.config.ts**:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'c8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
    },
  },
});
```

## 📝 Unit Testing

### Test File Structure

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createInbox, waitForVerificationCode } from './tempmail';

describe('Tempmail Service', () => {
  describe('createInbox', () => {
    it('should create a new temporary inbox', async () => {
      const inbox = await createInbox();

      expect(inbox).toMatchObject({
        token: expect.any(String),
        email: expect.stringContaining('@tempmail.lol'),
      });
    });

    it('should handle API errors gracefully', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(
        new Error('Network error')
      );

      await expect(createInbox()).rejects.toThrow('Network error');
    });

    it('should retry on timeout', async () => {
      vi.spyOn(global, 'fetch')
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: 'abc', email: 'test@tempmail.lol' })
        });

      const inbox = await createInbox();
      expect(inbox.token).toBe('abc');
    });
  });

  describe('waitForVerificationCode', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should extract verification code from email', async () => {
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          emails: [{
            text: 'Your verification code is 123456',
            receivedAt: Date.now()
          }]
        })
      });

      const codePromise = waitForVerificationCode('token123', 5000);

      await vi.advanceTimersByTimeAsync(2000);

      const code = await codePromise;
      expect(code).toBe('123456');
    });

    it('should return null on timeout', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ emails: [] })
      });

      const codePromise = waitForVerificationCode('token123', 5000);

      await vi.advanceTimersByTimeAsync(6000);

      const code = await codePromise;
      expect(code).toBeNull();
    });
  });
});
```

### Best Practices

**✅ Good: Test behavior**
```typescript
it('should register account with valid email', async () => {
  const result = await autoRegister({
    email: 'test@example.com',
    onProgress: vi.fn()
  });

  expect(result.success).toBe(true);
  expect(result.email).toBe('test@example.com');
  expect(result.ssoToken).toBeTruthy();
});
```

**❌ Bad: Test implementation details**
```typescript
it('should call createBrowser internally', async () => {
  const spy = vi.spyOn(playwright, 'chromium');

  await autoRegister({ email: 'test@example.com' });

  expect(spy).toHaveBeenCalled(); // Tests internal implementation
});
```

**✅ Good: Mock external dependencies**
```typescript
vi.mock('./tempmail', () => ({
  createInbox: vi.fn(() => Promise.resolve({
    token: 'mock-token',
    email: 'mock@tempmail.lol'
  })),
  waitForVerificationCode: vi.fn(() => Promise.resolve('123456'))
}));
```

**✅ Good: Test edge cases**
```typescript
describe('edge cases', () => {
  it('should handle empty email', async () => {
    const result = await processEmail('');
    expect(result.success).toBe(false);
    expect(result.error).toContain('email required');
  });

  it('should handle malformed email', async () => {
    const result = await processEmail('not-an-email');
    expect(result.success).toBe(false);
  });

  it('should handle null input', async () => {
    const result = await processEmail(null as any);
    expect(result.success).toBe(false);
  });
});
```

## 🔗 Integration Testing

### Test Database Operations

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { AccountRepository } from './AccountRepository';

describe('AccountRepository Integration', () => {
  let db: Database.Database;
  let repo: AccountRepository;

  beforeEach(() => {
    // Use in-memory database for tests
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE accounts (
        id INTEGER PRIMARY KEY,
        email TEXT UNIQUE,
        sso_token TEXT
      )
    `);
    repo = new AccountRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should save and retrieve account', async () => {
    const account = {
      email: 'test@example.com',
      ssoToken: 'token123'
    };

    const id = repo.save(account);
    const retrieved = repo.getById(id);

    expect(retrieved).toMatchObject(account);
  });

  it('should enforce unique email constraint', () => {
    const account = { email: 'test@example.com', ssoToken: 'token1' };

    repo.save(account);

    expect(() => repo.save(account)).toThrow('UNIQUE constraint failed');
  });
});
```

### Test Service Integration

```typescript
describe('Registration Service Integration', () => {
  it('should complete full registration flow', async () => {
    const progressSteps: string[] = [];

    const result = await autoRegister({
      onProgress: (msg) => progressSteps.push(msg)
    });

    expect(result.success).toBe(true);
    expect(progressSteps).toContain('Creating temporary email');
    expect(progressSteps).toContain('Waiting for verification code');
    expect(progressSteps).toContain('Registration complete');
  });

  it('should handle verification timeout', async () => {
    vi.mock('./tempmail', () => ({
      waitForVerificationCode: () => Promise.resolve(null)
    }));

    const result = await autoRegister({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('verification code');
  });
});
```

## 🚀 E2E Testing

### Playwright Configuration

**playwright.config.ts**:
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120000,
  retries: 2,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
```

### E2E Test Examples

```typescript
import { test, expect, _electron as electron } from '@playwright/test';

test.describe('Registration Flow', () => {
  test('should register new account', async () => {
    // Launch Electron app
    const app = await electron.launch({ args: ['.'] });
    const window = await app.firstWindow();

    // Navigate to registration
    await window.click('[data-testid="register-button"]');

    // Start registration
    await window.click('[data-testid="start-register"]');

    // Wait for progress
    await expect(window.locator('[data-testid="progress"]'))
      .toContainText('Creating temporary email', { timeout: 30000 });

    // Wait for completion
    await expect(window.locator('[data-testid="status"]'))
      .toContainText('Registration successful', { timeout: 120000 });

    // Verify account appears in list
    const accountList = window.locator('[data-testid="account-list"]');
    await expect(accountList).toContainText('@tempmail.lol');

    await app.close();
  });

  test('should handle registration failure', async () => {
    const app = await electron.launch({ args: ['.'] });
    const window = await app.firstWindow();

    // Simulate network failure
    await window.route('**/api/**', route => route.abort());

    await window.click('[data-testid="start-register"]');

    await expect(window.locator('[data-testid="error"]'))
      .toBeVisible({ timeout: 30000 });

    await app.close();
  });
});

test.describe('Export Flow', () => {
  test('should export accounts to claude-api format', async () => {
    const app = await electron.launch({ args: ['.'] });
    const window = await app.firstWindow();

    // Select accounts
    await window.click('[data-testid="account-checkbox"]:first-child');

    // Export
    await window.click('[data-testid="export-button"]');

    // Verify export dialog
    await expect(window.locator('[data-testid="export-dialog"]'))
      .toBeVisible();

    // Confirm export
    await window.click('[data-testid="confirm-export"]');

    // Verify success message
    await expect(window.locator('[data-testid="success-message"]'))
      .toContainText('Exported successfully');

    await app.close();
  });
});
```

## 🧪 Test Data Management

### Fixtures

```typescript
// test/fixtures/accounts.ts
export const mockAccounts = {
  valid: {
    email: 'test@tempmail.lol',
    name: 'John Doe',
    ssoToken: 'mock-sso-token-12345',
    clientId: 'mock-client-id',
    clientSecret: 'mock-client-secret',
  },
  expired: {
    email: 'expired@tempmail.lol',
    ssoToken: 'expired-token',
  },
};

export const mockEmails = {
  verification: {
    from: 'no-reply@aws.amazon.com',
    subject: 'AWS Verification Code',
    text: 'Your verification code is 123456',
    html: '<p>Your verification code is <strong>123456</strong></p>',
    receivedAt: Date.now(),
  },
};
```

### Test Helpers

```typescript
// test/helpers/database.ts
export function createTestDb(): Database {
  const db = new Database(':memory:');
  db.exec(schema);
  return db;
}

export function seedTestDb(db: Database, data: any[]) {
  const insert = db.prepare('INSERT INTO accounts VALUES (?, ?, ?)');
  data.forEach(item => insert.run(item));
}

// test/helpers/mock-api.ts
export function mockTempmailApi() {
  return vi.spyOn(global, 'fetch').mockImplementation((url) => {
    if (url.includes('/generate')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          token: 'mock-token',
          email: 'mock@tempmail.lol'
        })
      });
    }
    // ... other endpoints
  });
}
```

## 📊 Coverage Requirements

### Minimum Coverage

```javascript
// vitest.config.ts
coverage: {
  statements: 70,
  branches: 70,
  functions: 70,
  lines: 70,
  exclude: [
    'src/main/index.ts',  // Entry point
    '**/*.test.ts',       // Test files
    '**/types.ts',        // Type definitions
  ]
}
```

### Coverage Reports

```bash
# Run tests with coverage
npm run test:coverage

# View HTML report
open coverage/index.html
```

## 🎯 Test Categories

### Use Test Tags

```typescript
// @integration
describe('Database Integration', () => {
  // ... integration tests
});

// @e2e
describe('Full Registration Flow', () => {
  // ... e2e tests
});

// @smoke
describe('Critical Paths', () => {
  // ... smoke tests
});
```

### Run Specific Tests

```bash
# Run only unit tests
npm test -- --grep "unit"

# Run only integration tests
npm test -- --grep "@integration"

# Run only E2E tests
npm run test:e2e
```

## 🚦 CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

  e2e:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps chromium

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

## 📝 Test Documentation

### Document Complex Tests

```typescript
describe('Registration Flow', () => {
  /**
   * This test verifies the complete registration flow:
   * 1. Creates temporary email via Tempmail.lol
   * 2. Navigates to AWS registration page
   * 3. Fills in email and name
   * 4. Waits for verification code via email polling
   * 5. Completes password setup
   * 6. Extracts SSO token from cookies
   *
   * Expected duration: 60-120 seconds
   * Flakiness risk: Medium (depends on email delivery)
   */
  it('should complete full registration', async () => {
    // Test implementation
  });
});
```

## ✅ Definition of Done

A feature is considered "done" when:

- [ ] All unit tests pass
- [ ] Integration tests added for new services
- [ ] E2E tests added for user workflows
- [ ] Code coverage meets minimum thresholds
- [ ] All tests pass in CI/CD
- [ ] No flaky tests introduced
- [ ] Test documentation updated

---

**Remember**: Tests are documentation. Write tests that explain what the code should do.
