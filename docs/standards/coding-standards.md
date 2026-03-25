# Coding Standards

**Project**: kiro-auto-register
**Last Updated**: 2026-03-25

## 📋 General Principles

1. **Clarity Over Cleverness**: Write code that is easy to understand
2. **Type Safety**: Leverage TypeScript's type system fully
3. **DRY (Don't Repeat Yourself)**: Extract common patterns
4. **KISS (Keep It Simple, Stupid)**: Avoid unnecessary complexity
5. **Fail Fast**: Validate inputs and handle errors early

## 📁 File Organization

### Directory Structure

```
src/
├── main/              # Electron main process
│   ├── index.ts       # Main entry point
│   ├── ipc/           # IPC handlers
│   ├── services/      # Main process services
│   └── database/      # Database access layer
├── preload/           # Preload scripts
│   └── index.ts       # Expose safe APIs to renderer
├── renderer/          # React UI
│   ├── App.tsx        # Root component
│   ├── components/    # Reusable components
│   ├── pages/         # Page components
│   ├── hooks/         # Custom React hooks
│   └── utils/         # UI utilities
└── services/          # Shared services
    ├── tempmail.ts    # API integrations
    ├── kiroRegister.ts
    └── exporter.ts
```

### File Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| TypeScript files | camelCase.ts | `userService.ts` |
| React components | PascalCase.tsx | `RegisterForm.tsx` |
| Test files | *.test.ts | `userService.test.ts` |
| Type definitions | PascalCase.types.ts | `Account.types.ts` |
| Constants | UPPER_CASE.ts | `API_ENDPOINTS.ts` |

## 📝 TypeScript Standards

### Type Annotations

**Always specify return types for functions:**
```typescript
// ✅ Good
function getUser(id: string): Promise<User> {
  return fetchUser(id);
}

// ❌ Bad
function getUser(id: string) {
  return fetchUser(id);
}
```

**Use explicit types for parameters:**
```typescript
// ✅ Good
function processData(data: UserData, options: ProcessOptions): Result {
  // ...
}

// ❌ Bad
function processData(data, options) {
  // ...
}
```

**Avoid `any`:**
```typescript
// ✅ Good
function parseJson<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

// ❌ Bad
function parseJson(json: string): any {
  return JSON.parse(json);
}
```

### Interfaces vs Types

**Use interfaces for object shapes:**
```typescript
interface User {
  id: string;
  name: string;
  email: string;
}
```

**Use types for unions, intersections, and utilities:**
```typescript
type Status = 'pending' | 'success' | 'error';
type Result<T> = { success: true; data: T } | { success: false; error: string };
```

### Async/Await

**Prefer async/await over promises:**
```typescript
// ✅ Good
async function fetchUser(id: string): Promise<User> {
  const response = await api.get(`/users/${id}`);
  return response.data;
}

// ❌ Bad
function fetchUser(id: string): Promise<User> {
  return api.get(`/users/${id}`).then(res => res.data);
}
```

### Error Handling

**Use try-catch for async operations:**
```typescript
async function registerAccount(): Promise<RegisterResult> {
  try {
    const inbox = await createInbox();
    const account = await register(inbox);
    return { success: true, data: account };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
```

**Return Result types instead of throwing:**
```typescript
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

function processData(input: string): Result<Data> {
  if (!input) {
    return { success: false, error: new Error('Input required') };
  }
  return { success: true, data: parse(input) };
}
```

## ⚛️ React Standards

### Component Structure

```typescript
// ✅ Good component structure
import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import styles from './RegisterForm.module.css';

interface RegisterFormProps {
  onSubmit: (data: FormData) => Promise<void>;
  disabled?: boolean;
}

export function RegisterForm({ onSubmit, disabled = false }: RegisterFormProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit({ email });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={disabled || loading}
      />
      <Button type="submit" loading={loading}>
        Register
      </Button>
    </form>
  );
}
```

### Hooks

**Custom hooks start with `use`:**
```typescript
function useRegister() {
  const [status, setStatus] = useState<Status>('idle');

  const register = useCallback(async (email: string) => {
    setStatus('loading');
    try {
      await registerAccount(email);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }, []);

  return { status, register };
}
```

## 🔌 Electron IPC Standards

### Handler Naming

```typescript
// Format: 'domain:action'
ipcMain.handle('register:start', async (event, config) => { });
ipcMain.handle('register:cancel', async (event, id) => { });
ipcMain.handle('accounts:list', async (event) => { });
ipcMain.handle('accounts:export', async (event, ids) => { });
```

### Type-Safe IPC

```typescript
// Define IPC API types
interface IpcApi {
  'register:start': (config: RegisterConfig) => Promise<RegisterResult>;
  'register:cancel': (id: string) => Promise<void>;
  'accounts:list': () => Promise<Account[]>;
}

// Main process
ipcMain.handle('register:start', async (event, config: RegisterConfig) => {
  return await startRegistration(config);
});

// Preload
const api = {
  registerStart: (config: RegisterConfig) =>
    ipcRenderer.invoke('register:start', config),
};

contextBridge.exposeInMainWorld('api', api);
```

### Progress Events

```typescript
// Main process
async function performOperation(id: string) {
  const window = BrowserWindow.getFocusedWindow();

  window?.webContents.send(`operation:${id}:progress`, {
    step: 'Starting',
    progress: 0
  });

  // ... operation steps ...

  window?.webContents.send(`operation:${id}:progress`, {
    step: 'Complete',
    progress: 100
  });
}

// Renderer
window.api.onProgress((event, data) => {
  console.log(data.step, data.progress);
});
```

## 📦 Service Layer Standards

### Service Structure

```typescript
export interface ServiceConfig {
  timeout?: number;
  retries?: number;
}

export class EmailService {
  private config: Required<ServiceConfig>;

  constructor(config: ServiceConfig = {}) {
    this.config = {
      timeout: 30000,
      retries: 3,
      ...config
    };
  }

  async createInbox(): Promise<InboxResult> {
    // Implementation
  }

  async getMessages(token: string): Promise<Message[]> {
    // Implementation
  }

  private async retry<T>(fn: () => Promise<T>): Promise<T> {
    // Retry logic
  }
}
```

### Progress Callbacks

```typescript
type ProgressCallback = (message: string, progress?: number) => void;

async function longOperation(
  onProgress?: ProgressCallback
): Promise<Result> {
  onProgress?.('Step 1: Initializing', 0);
  await step1();

  onProgress?.('Step 2: Processing', 50);
  await step2();

  onProgress?.('Step 3: Finalizing', 100);
  return await step3();
}
```

## 🗃️ Database Standards

### Query Functions

```typescript
interface Database {
  get<T>(query: string, params: unknown[]): T | undefined;
  all<T>(query: string, params: unknown[]): T[];
  run(query: string, params: unknown[]): { changes: number };
}

// ✅ Good: Type-safe queries
function getAccount(db: Database, id: string): Account | undefined {
  return db.get<Account>(
    'SELECT * FROM accounts WHERE id = ?',
    [id]
  );
}

function insertAccount(db: Database, account: Omit<Account, 'id'>): number {
  const result = db.run(
    'INSERT INTO accounts (email, name, sso_token) VALUES (?, ?, ?)',
    [account.email, account.name, account.ssoToken]
  );
  return result.lastInsertRowId;
}
```

### Transactions

```typescript
function performBatch(db: Database, accounts: Account[]): void {
  const insert = db.prepare('INSERT INTO accounts (email, name) VALUES (?, ?)');

  const transaction = db.transaction((accounts: Account[]) => {
    for (const account of accounts) {
      insert.run(account.email, account.name);
    }
  });

  transaction(accounts);
}
```

## 🧪 Testing Standards

### Test Structure

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('EmailService', () => {
  let service: EmailService;

  beforeEach(() => {
    service = new EmailService();
  });

  describe('createInbox', () => {
    it('should create a new inbox', async () => {
      const result = await service.createInbox();

      expect(result).toMatchObject({
        email: expect.stringContaining('@'),
        token: expect.any(String)
      });
    });

    it('should handle API errors', async () => {
      // Mock API failure
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(
        new Error('Network error')
      );

      await expect(service.createInbox()).rejects.toThrow('Network error');
    });
  });
});
```

### Mocking

```typescript
// Mock external dependencies
vi.mock('./api', () => ({
  fetchData: vi.fn(() => Promise.resolve({ data: 'mock' }))
}));

// Mock Electron APIs
vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn()
  }
}));
```

## 📝 Documentation Standards

### JSDoc Comments

```typescript
/**
 * Creates a new temporary email inbox
 *
 * @param options - Configuration options for the inbox
 * @returns Promise resolving to inbox details
 * @throws {ApiError} If API request fails
 *
 * @example
 * ```typescript
 * const inbox = await createInbox({ domain: 'tempmail.lol' });
 * console.log(inbox.email); // random@tempmail.lol
 * ```
 */
export async function createInbox(
  options: InboxOptions = {}
): Promise<InboxResult> {
  // Implementation
}
```

### Inline Comments

```typescript
// ✅ Good: Explain WHY, not WHAT
// Use exponential backoff to avoid rate limiting
const delay = Math.min(1000 * Math.pow(2, attempt), 30000);

// ❌ Bad: Obvious comment
// Set delay to exponential value
const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
```

## 🔒 Security Standards

### Input Validation

```typescript
function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeInput(input: string): string {
  return input.replace(/[<>]/g, '');
}
```

### Sensitive Data

```typescript
// ✅ Good: Don't log sensitive data
logger.info('User logged in', { userId: user.id });

// ❌ Bad: Logs password
logger.info('Login attempt', { email: user.email, password: user.password });

// ✅ Good: Clear sensitive data from memory
let token = await getToken();
// Use token...
token = null; // Clear reference
```

## 🎨 Code Style

### Naming Conventions

```typescript
// Constants: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;
const API_BASE_URL = 'https://api.example.com';

// Variables and functions: camelCase
const userData = await fetchUser();
function processUserData() { }

// Classes and interfaces: PascalCase
class UserService { }
interface UserData { }

// Private class members: _prefix
class Service {
  private _cache = new Map();
}

// Boolean variables: is/has/can prefix
const isLoading = true;
const hasError = false;
const canSubmit = user.isValid;
```

### Formatting

- **Indentation**: 2 spaces
- **Line length**: 100 characters (soft limit)
- **Semicolons**: Always use
- **Quotes**: Single quotes for strings, backticks for templates
- **Trailing commas**: Use in multiline arrays/objects

```typescript
// ✅ Good formatting
const config = {
  timeout: 30000,
  retries: 3,
  headers: {
    'Content-Type': 'application/json',
  },
};

const message = `User ${user.name} logged in at ${timestamp}`;
```

## 🔧 Configuration

### Environment Variables

```typescript
// Load from .env file
const config = {
  tempmailBaseUrl: process.env.TEMPMAIL_BASE_URL || 'https://api.tempmail.lol/v2',
  proxyUrl: process.env.PROXY_URL,
  maxConcurrent: parseInt(process.env.MAX_CONCURRENT || '3', 10),
  timeout: parseInt(process.env.TIMEOUT || '300', 10) * 1000,
};

// Validate required config
function validateConfig(config: Config): void {
  if (!config.tempmailBaseUrl) {
    throw new Error('TEMPMAIL_BASE_URL is required');
  }
}
```

## 📊 Performance

### Optimization Guidelines

```typescript
// ✅ Good: Reuse expensive objects
const browserPool = new BrowserPool(5);

for (const task of tasks) {
  const browser = await browserPool.acquire();
  await processTask(browser, task);
  await browserPool.release(browser);
}

// ✅ Good: Batch operations
const accounts = await db.all<Account>('SELECT * FROM accounts');
const exports = accounts.map(toClaudeApiFormat);

// ✅ Good: Concurrent operations
const results = await Promise.allSettled(
  accounts.map(account => exportAccount(account))
);
```

---

**Note**: These standards should evolve with the project. When patterns emerge that aren't covered here, update this document.
