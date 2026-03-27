import crypto from 'node:crypto';

import {
  buildBrowserData,
  generateFingerprint
} from './fingerprintRuntime.ts';
import {
  resolveEnvironmentProfile,
  summarizeEnvironmentProfile,
  type EnvironmentProfile
} from './environmentProfile.ts';
import { formatErrorDetails } from './errorDetails.ts';
import {
  CookieJar,
  createFetchContext,
  type FetchImpl
} from './httpClient.ts';
import { fetchEgressInfo } from './egressInfo.ts';
import {
  createMoeMailInbox,
  waitForMoeMailVerificationCode
} from './moemail.ts';
import {
  createInbox,
  waitForVerificationCode,
  type TempmailInbox
} from './tempmail.ts';
import type {
  ManagedEmailProvider,
  OtpMode,
  RegistrationEmailMode,
  RegistrationProbeClassification,
  RegistrationStageTrace,
  RegistrationProbeSummary
} from '../shared/contracts.ts';

export interface RegisterResult {
  success: boolean;
  email?: string;
  ssoToken?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  name?: string;
  error?: string;
  stage?: string;
}

interface RegistrationInbox {
  email: string;
  token?: string;
  providerId?: string;
  createdAt: number;
  source: RegistrationEmailMode;
  managedProvider?: ManagedEmailProvider;
}

export interface OtpRequest {
  email: string;
  source: 'tempmail' | 'manual' | 'mailbox';
  otpSentAt: number;
  tempmailToken?: string;
}

export interface AutoRegisterFlowOptions {
  onProgress?: (message: string) => void;
  proxyUrl?: string;
  registrationEmailMode?: RegistrationEmailMode;
  managedEmailProvider?: ManagedEmailProvider;
  moemailConfig?: {
    baseUrl?: string;
    apiKey?: string;
    preferredDomain?: string;
  };
  customEmailAddress?: string;
  otpMode?: OtpMode;
  requestOtp?: (request: OtpRequest) => Promise<string | null>;
}

interface ResolvedAutoRegisterFlowOptions {
  onProgress?: (message: string) => void;
  proxyUrl?: string;
  registrationEmailMode: RegistrationEmailMode;
  managedEmailProvider: ManagedEmailProvider;
  moemailConfig?: {
    baseUrl: string;
    apiKey: string;
    preferredDomain: string;
  };
  customEmailAddress: string;
  otpMode: OtpMode;
  requestOtp?: (request: OtpRequest) => Promise<string | null>;
}

interface RequestResult {
  response: Response;
  text: string;
  json?: Record<string, unknown>;
}

interface RegistrationRedeemInput {
  registrationCode: string;
  signInState: string;
  postCreateRedirectUrl?: string;
}

interface RegistrationRedeemRequest {
  action: string;
  method: 'GET' | 'POST';
  fields: Record<string, string>;
}

interface ApiSession {
  cookieJar: CookieJar;
  environmentProfile: EnvironmentProfile;
  fetchImpl: FetchImpl;
}

interface ExistingInboxEnvironment {
  TEMPMAIL_REUSE_EMAIL?: string;
  TEMPMAIL_REUSE_TOKEN?: string;
}

interface RegistrationProbeOptions {
  fetchImpl: FetchImpl;
  email: string;
  country?: string;
  onProgress?: (message: string) => void;
}

class RequestStageError extends Error {
  readonly status: number;
  readonly requestUrl: string;
  readonly responseText: string;

  constructor(options: {
    message: string;
    status: number;
    requestUrl: string;
    responseText: string;
  }) {
    super(options.message);
    this.name = 'RequestStageError';
    this.status = options.status;
    this.requestUrl = options.requestUrl;
    this.responseText = options.responseText;
  }
}

const DEFAULT_PASSWORD = 'KiroAuto123!@#';
const DIRECTORY_ID = 'd-9067642ac7';
const PROFILE_BASE_URL = 'https://profile.aws.amazon.com';
const REGION = 'us-east-1';
const SIGNIN_BASE_URL = `https://${REGION}.signin.aws`;
const SIGNIN_SERVICE_PATH = `${SIGNIN_BASE_URL}/platform/${DIRECTORY_ID}`;
const PORTAL_LOGIN_URL = `https://portal.sso.${REGION}.amazonaws.com/login`;
const VIEW_START_URL = 'https://view.awsapps.com/start/#/device?user_code=PQCF-FCCN';
const DEFAULT_CREDENTIALS_REDIRECT_URL = `https://${REGION}.credentials.signin.aws/`;
const PROFILE_UBID_COOKIE_NAME = 'aws-user-profile-ubid';

const FIRST_NAMES = [
  'James',
  'Robert',
  'John',
  'Michael',
  'David',
  'William',
  'Richard',
  'Maria',
  'Elizabeth',
  'Jennifer'
];
const LAST_NAMES = [
  'Smith',
  'Johnson',
  'Williams',
  'Brown',
  'Jones',
  'Garcia',
  'Miller',
  'Davis',
  'Rodriguez',
  'Martinez'
];

function logProgress(
  onProgress: ((message: string) => void) | undefined,
  message: string
): void {
  onProgress?.(message);
}

function formatStageName(stage: string): string {
  const mapping: Record<string, string> = {
    'create-inbox': '创建邮箱',
    'prepare-profile-workflow': '初始化 AWS 注册',
    'start-profile-signup': '启动 profile 注册',
    'send-otp': '发送邮箱验证码',
    'wait-otp': '等待验证码',
    'create-identity': '创建身份',
    'resolve-sso-token': '回填 SSO Token'
  };

  return mapping[stage] || stage;
}

function classifyRegistrationProbeMessage(
  message: string
): RegistrationProbeClassification {
  const normalized = message.toLowerCase();

  if (
    normalized.includes('request was blocked by tes') ||
    normalized.includes('"errorcode":"blocked"') ||
    normalized.includes('tes blocked')
  ) {
    return 'tes-blocked';
  }

  if (
    normalized.includes('econnreset') ||
    normalized.includes('und_err_socket') ||
    normalized.includes('fetch failed') ||
    normalized.includes('tls') ||
    normalized.includes('socket') ||
    normalized.includes('econnrefused') ||
    normalized.includes('etimedout') ||
    normalized.includes('enotfound') ||
    normalized.includes('eai_again') ||
    normalized.includes('network')
  ) {
    return 'network-error';
  }

  return 'failed';
}

function truncateResponseSnippet(value: string, maxLength: number = 240): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

function generateRandomName(): string {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${first} ${last}`;
}

function toObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function buildApiUrl(pathname: string): string {
  return `${PROFILE_BASE_URL}/api${pathname}`;
}

function buildProfileUbid(): string {
  return [
    Math.floor(Math.random() * 900) + 100,
    Math.floor(Math.random() * 9_000_000) + 1_000_000,
    Math.floor(Math.random() * 9_000_000) + 1_000_000
  ].join('-');
}

function parseJsonSafely(text: string): Record<string, unknown> | undefined {
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

function resolveHashQueryParam(url: string, key: string): string | null {
  const hash = new URL(url).hash.replace(/^#/, '');
  const queryIndex = hash.indexOf('?');
  if (queryIndex < 0) {
    return null;
  }

  return new URLSearchParams(hash.slice(queryIndex + 1)).get(key);
}

export function extractWorkflowIdFromProfileRedirect(url: string): string | null {
  return resolveHashQueryParam(url, 'workflowID');
}

export function extractWorkflowStateHandleFromRedirect(url: string): string | null {
  return new URL(url).searchParams.get('workflowStateHandle');
}

export function buildRegistrationRedeemRequest(
  input: RegistrationRedeemInput
): RegistrationRedeemRequest {
  if (input.postCreateRedirectUrl) {
    return {
      action: input.postCreateRedirectUrl,
      method: 'GET',
      fields: {
        registrationCode: input.registrationCode,
        state: input.signInState
      }
    };
  }

  return {
    action: DEFAULT_CREDENTIALS_REDIRECT_URL,
    method: 'POST',
    fields: {
      'registration-code': input.registrationCode,
      state: input.signInState
    }
  };
}

function createRequestId(): string {
  return crypto.randomUUID();
}

function createFingerprintUrl(path: string): string {
  return path.startsWith('http') ? path : `${SIGNIN_BASE_URL}${path}`;
}

function createSession(
  fetchImpl: FetchImpl,
  environmentProfile: EnvironmentProfile
): ApiSession {
  return {
    fetchImpl,
    cookieJar: new CookieJar(),
    environmentProfile
  };
}

/**
 * Merge session cookies and environment-derived defaults into a request header bag.
 */
export function buildSessionHeaders(options: {
  cookieHeader?: string;
  environmentProfile?: Pick<EnvironmentProfile, 'acceptLanguage' | 'userAgent'>;
  initHeaders?: HeadersInit;
}): Headers {
  const headers = new Headers(options.initHeaders);

  if (options.cookieHeader) {
    const existingCookieHeader = headers.get('cookie');
    headers.set(
      'cookie',
      existingCookieHeader
        ? `${existingCookieHeader}; ${options.cookieHeader}`
        : options.cookieHeader
    );
  }

  if (options.environmentProfile) {
    if (!headers.has('user-agent')) {
      headers.set('user-agent', options.environmentProfile.userAgent);
    }

    if (!headers.has('accept-language')) {
      headers.set('accept-language', options.environmentProfile.acceptLanguage);
    }
  }

  return headers;
}

function applySessionHeaders(session: ApiSession, url: URL, initHeaders?: HeadersInit): Headers {
  const cookieHeader = session.cookieJar.getCookieHeader(url);
  return buildSessionHeaders({
    initHeaders,
    cookieHeader,
    environmentProfile: session.environmentProfile
  });
}

async function sessionRequest(
  session: ApiSession,
  url: string,
  init: RequestInit = {}
): Promise<RequestResult> {
  const targetUrl = new URL(url);
  const headers = applySessionHeaders(session, targetUrl, init.headers);

  if (!headers.has('accept')) {
    headers.set('accept', 'application/json, text/html;q=0.9,*/*;q=0.8');
  }

  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await session.fetchImpl(url, {
    ...init,
    headers,
    redirect: 'manual'
  });

  session.cookieJar.capture(response, targetUrl);
  const text = await response.text();

  return {
    response,
    text,
    json: parseJsonSafely(text)
  };
}

async function requestJsonOrThrow(
  session: ApiSession,
  url: string,
  init: RequestInit,
  errorPrefix: string
): Promise<Record<string, unknown>> {
  const result = await sessionRequest(session, url, init);

  if (!result.response.ok) {
    throw new RequestStageError({
      message: `${errorPrefix}: HTTP ${result.response.status}${result.text ? ` ${result.text}` : ''}`,
      status: result.response.status,
      requestUrl: url,
      responseText: result.text
    });
  }

  return toObject(result.json);
}

function requireString(
  payload: Record<string, unknown>,
  key: string,
  errorMessage: string
): string {
  const value = payload[key];
  if (typeof value !== 'string' || !value) {
    throw new Error(errorMessage);
  }

  return value;
}

function getOptionalString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value ? value : undefined;
}

function createExistingInboxFromEnvironment(
  environment: ExistingInboxEnvironment = process.env
): RegistrationInbox | null {
  const email = environment.TEMPMAIL_REUSE_EMAIL?.trim();
  const token = environment.TEMPMAIL_REUSE_TOKEN?.trim();

  if (!email || !token) {
    return null;
  }

  return {
    email,
    token,
    createdAt: Date.now(),
    source: 'tempmail',
    managedProvider: 'tempmail.lol'
  };
}

function normalizeFlowOptions(options: AutoRegisterFlowOptions = {}): ResolvedAutoRegisterFlowOptions {
  return {
    onProgress: options.onProgress,
    proxyUrl: options.proxyUrl,
    registrationEmailMode: options.registrationEmailMode ?? 'tempmail',
    managedEmailProvider: options.managedEmailProvider ?? 'tempmail.lol',
    moemailConfig: options.moemailConfig
      ? {
          baseUrl: options.moemailConfig.baseUrl?.trim() ?? '',
          apiKey: options.moemailConfig.apiKey?.trim() ?? '',
          preferredDomain: options.moemailConfig.preferredDomain?.trim() ?? ''
        }
      : undefined,
    customEmailAddress: options.customEmailAddress?.trim() ?? '',
    otpMode: options.otpMode ?? 'tempmail',
    requestOtp: options.requestOtp
  };
}

function validateCustomEmailAddress(email: string): string {
  const normalized = email.trim();
  if (!normalized) {
    throw new Error('自定义邮箱地址不能为空');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('自定义邮箱地址格式无效');
  }

  return normalized;
}

export function resolveOtpAcquisitionMode(input: {
  inboxSource: RegistrationEmailMode;
  otpMode: OtpMode;
}): 'tempmail' | 'manual' | 'mailbox' {
  if (input.otpMode === 'mailbox') {
    return 'mailbox';
  }

  if (input.otpMode === 'manual' || input.inboxSource === 'custom') {
    return 'manual';
  }

  return 'tempmail';
}

async function resolveInbox(
  fetchImpl: FetchImpl,
  options: ResolvedAutoRegisterFlowOptions
): Promise<RegistrationInbox> {
  if (options.registrationEmailMode === 'custom') {
    return {
      email: validateCustomEmailAddress(options.customEmailAddress),
      createdAt: Date.now(),
      source: 'custom'
    };
  }

  const existingInbox = createExistingInboxFromEnvironment();
  if (existingInbox && options.managedEmailProvider === 'tempmail.lol') {
    return existingInbox;
  }

  if (options.managedEmailProvider === 'moemail-api') {
    const inbox = await createMoeMailInbox({
      baseUrl: options.moemailConfig?.baseUrl,
      apiKey: options.moemailConfig?.apiKey ?? '',
      preferredDomain: options.moemailConfig?.preferredDomain,
      fetchImpl,
      onProgress: options.onProgress
    });

    return {
      email: inbox.email,
      providerId: inbox.id,
      createdAt: inbox.createdAt,
      source: 'tempmail',
      managedProvider: 'moemail-api'
    };
  }

  const inbox = await createInbox({
    fetchImpl,
    onProgress: options.onProgress
  });

  return {
    ...inbox,
    source: 'tempmail',
    managedProvider: 'tempmail.lol'
  };
}

async function resolveOtpCode(
  inbox: RegistrationInbox,
  otpSentAt: number,
  options: ResolvedAutoRegisterFlowOptions,
  fetchImpl: FetchImpl
): Promise<string | null> {
  const acquisitionMode = resolveOtpAcquisitionMode({
    inboxSource: inbox.source,
    otpMode: options.otpMode
  });

  if (acquisitionMode === 'mailbox') {
    if (!options.requestOtp) {
      throw new Error('当前 OTP 模式需要界面提供邮箱自动收码能力');
    }

    return options.requestOtp({
      email: inbox.email,
      source: 'mailbox',
      otpSentAt,
      tempmailToken: inbox.token
    });
  }

  if (acquisitionMode === 'manual') {
    if (!options.requestOtp) {
      throw new Error('当前 OTP 模式需要界面提供验证码输入能力');
    }

    return options.requestOtp({
      email: inbox.email,
      source: 'manual',
      otpSentAt,
      tempmailToken: inbox.token
    });
  }

  if (!inbox.token) {
    if (inbox.managedProvider === 'moemail-api' && inbox.providerId) {
      return waitForMoeMailVerificationCode(
        {
          id: inbox.providerId,
          email: inbox.email,
          createdAt: inbox.createdAt,
          provider: 'moemail-api'
        },
        120_000,
        {
          baseUrl: options.moemailConfig?.baseUrl,
          apiKey: options.moemailConfig?.apiKey ?? '',
          preferredDomain: options.moemailConfig?.preferredDomain,
          otpSentAt,
          fetchImpl,
          onProgress: options.onProgress
        }
      );
    }

    throw new Error('当前 OTP 模式需要临时邮箱 token，请改用手动 OTP');
  }

  return waitForVerificationCode(inbox.token, 120_000, options.onProgress, {
    otpSentAt,
    fetchImpl
  });
}

async function generateSessionFingerprint(
  session: ApiSession,
  url: string
): Promise<string> {
  return generateFingerprint({
    environmentProfile: session.environmentProfile,
    fetchImpl: session.fetchImpl,
    url
  });
}

async function executeSigninStep(
  session: ApiSession,
  request: {
    stepId: string;
    workflowStateHandle: string;
    actionId?: string;
    inputs: Array<Record<string, unknown>>;
  }
): Promise<Record<string, unknown>> {
  return requestJsonOrThrow(
    session,
    `${SIGNIN_SERVICE_PATH}/api/execute`,
    {
      method: 'POST',
      body: JSON.stringify({
        ...request,
        requestId: createRequestId()
      })
    },
    '调用 signin /api/execute 失败'
  );
}

async function executeSignupStep(
  session: ApiSession,
  request: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return requestJsonOrThrow(
    session,
    `${SIGNIN_SERVICE_PATH}/signup/api/execute`,
    {
      method: 'POST',
      body: JSON.stringify({
        ...request,
        requestId: createRequestId()
      })
    },
    '调用 signin /signup/api/execute 失败'
  );
}

async function prepareProfileWorkflow(
  session: ApiSession,
  email: string
): Promise<{
  profileRedirectUrl: string;
  profileWorkflowId: string;
  signupWorkflowStateHandle: string;
}> {
  const loginPayload = await requestJsonOrThrow(
    session,
    `${PORTAL_LOGIN_URL}?directory_id=${DIRECTORY_ID}&redirect_url=${encodeURIComponent(
      VIEW_START_URL
    )}`,
    {},
    '调用 portal login 失败'
  );

  const redirectUrl = requireString(
    loginPayload,
    'redirectUrl',
    'portal login 缺少 redirectUrl'
  );

  await sessionRequest(session, redirectUrl, {});

  let signInWorkflowStateHandle =
    extractWorkflowStateHandleFromRedirect(redirectUrl) ??
    (() => {
      throw new Error('signin redirect 缺少 workflowStateHandle');
    })();

  for (const stepId of ['', 'start']) {
    const fingerprint = await generateSessionFingerprint(session, redirectUrl);
    const payload = await executeSigninStep(session, {
      stepId,
      workflowStateHandle: signInWorkflowStateHandle,
      inputs: [
        {
          input_type: 'FingerPrintRequestInput',
          fingerPrint: fingerprint
        }
      ]
    });

    signInWorkflowStateHandle = requireString(
      payload,
      'workflowStateHandle',
      'signin execute 缺少 workflowStateHandle'
    );
  }

  const signupFingerprint = await generateSessionFingerprint(session, redirectUrl);
  const signupPayload = await executeSigninStep(session, {
    stepId: 'get-identity-user',
    workflowStateHandle: signInWorkflowStateHandle,
    actionId: 'SIGNUP',
    inputs: [
      {
        input_type: 'UserRequestInput',
        username: email
      },
      {
        input_type: 'ApplicationTypeRequestInput',
        applicationType: 'SSO_INDIVIDUAL_ID'
      },
      {
        input_type: 'FingerPrintRequestInput',
        fingerPrint: signupFingerprint
      }
    ]
  });

  const signupRedirect = toObject(signupPayload.redirect);
  const signupRedirectUrl = requireString(
    signupRedirect,
    'url',
    'signin signup 缺少 redirect.url'
  );
  const signupWorkflowStateHandle =
    extractWorkflowStateHandleFromRedirect(signupRedirectUrl) ??
    (() => {
      throw new Error('signin signup redirect 缺少 workflowStateHandle');
    })();

  await sessionRequest(session, signupRedirectUrl, {});

  let profileRedirectUrl: string | undefined;
  let currentSignupWorkflowStateHandle = signupWorkflowStateHandle;

  for (const stepId of ['', 'start']) {
    const fingerprint = await generateSessionFingerprint(session, signupRedirectUrl);
    const payload = await executeSignupStep(session, {
      stepId,
      workflowStateHandle: currentSignupWorkflowStateHandle,
      inputs: [
        {
          input_type: 'FingerPrintRequestInput',
          fingerPrint: fingerprint
        }
      ]
    });

    currentSignupWorkflowStateHandle = requireString(
      payload,
      'workflowStateHandle',
      'signup workflow 缺少 workflowStateHandle'
    );

    const redirect = toObject(payload.redirect);
    if (typeof redirect.url === 'string' && redirect.url) {
      profileRedirectUrl = redirect.url;
    }
  }

  if (!profileRedirectUrl) {
    throw new Error('signup workflow 未返回 profile redirect');
  }

  const profileWorkflowId =
    extractWorkflowIdFromProfileRedirect(profileRedirectUrl) ??
    (() => {
      throw new Error('profile redirect 缺少 workflowID');
    })();

  return {
    profileRedirectUrl,
    profileWorkflowId,
    signupWorkflowStateHandle: currentSignupWorkflowStateHandle
  };
}

async function startProfileSignup(
  session: ApiSession,
  profileRedirectUrl: string,
  profileWorkflowId: string
): Promise<{
  profileWorkflowState: string;
  profileUbid: string;
}> {
  await sessionRequest(session, PROFILE_BASE_URL, {
    headers: {
      referer: profileRedirectUrl
    }
  });

  const profileUbid = buildProfileUbid();
  session.cookieJar.setCookie({
    name: PROFILE_UBID_COOKIE_NAME,
    value: profileUbid,
    domain: new URL(PROFILE_BASE_URL).hostname,
    path: '/',
    secure: true
  });

  const startedAt = Date.now();
  const fingerprint = await generateSessionFingerprint(session, profileRedirectUrl);
  const payload = await requestJsonOrThrow(
    session,
    buildApiUrl('/start'),
    {
      method: 'POST',
      headers: {
        origin: PROFILE_BASE_URL,
        referer: profileRedirectUrl
      },
      body: JSON.stringify({
        workflowID: profileWorkflowId,
        ...buildBrowserData({
          fingerprint,
          pageName: 'EMAIL_COLLECTION',
          eventType: 'PageLoad',
          ubid: profileUbid,
          startedAt
        })
      })
    },
    '调用 profile /start 失败'
  );

  return {
    profileWorkflowState: requireString(
      payload,
      'workflowState',
      'profile /start 缺少 workflowState'
    ),
    profileUbid
  };
}

async function sendProfileOtp(
  session: ApiSession,
  profileRedirectUrl: string,
  profileWorkflowState: string,
  email: string,
  profileUbid: string
): Promise<void> {
  const startedAt = Date.now();
  const fingerprint = await generateSessionFingerprint(session, profileRedirectUrl);

  await requestJsonOrThrow(
    session,
    buildApiUrl('/send-otp'),
    {
      method: 'POST',
      headers: {
        origin: PROFILE_BASE_URL,
        referer: profileRedirectUrl
      },
      body: JSON.stringify({
        workflowState: profileWorkflowState,
        email,
        ...buildBrowserData({
          fingerprint,
          pageName: 'EMAIL_COLLECTION',
          eventType: 'PageSubmit',
          ubid: profileUbid,
          startedAt
        })
      })
    },
    '调用 profile /send-otp 失败'
  );
}

export async function probeRegistrationPath(
  options: RegistrationProbeOptions
): Promise<RegistrationProbeSummary> {
  const environmentProfile = resolveEnvironmentProfile(options.country);
  const session = createSession(options.fetchImpl, environmentProfile);
  let currentStage = 'prepare-profile-workflow';
  const stageTrace: RegistrationStageTrace[] = [];
  let lastRequestUrl: string | undefined;
  let lastHttpStatus: number | undefined;
  let lastResponseSnippet: string | undefined;

  function recordStage(stage: string, ok: boolean, detail: string): void {
    stageTrace.push({
      stage,
      ok,
      detail,
      timestamp: Date.now()
    });
  }

  try {
    const environmentSummary = summarizeEnvironmentProfile(environmentProfile, options.country);
    logProgress(
      options.onProgress,
      `注册探针环境画像: ${environmentSummary}`
    );

    logProgress(options.onProgress, '========== 初始化 AWS 纯接口注册 ==========');
    const {
      profileRedirectUrl,
      profileWorkflowId
    } = await prepareProfileWorkflow(session, options.email);
    recordStage('prepare-profile-workflow', true, '已拿到 profile workflow');
    logProgress(options.onProgress, `profile workflowID: ${profileWorkflowId}`);

    currentStage = 'start-profile-signup';
    logProgress(options.onProgress, '========== 启动 profile 注册 ==========');
    const {
      profileWorkflowState,
      profileUbid
    } = await startProfileSignup(session, profileRedirectUrl, profileWorkflowId);
    recordStage('start-profile-signup', true, `workflowState=${profileWorkflowState}`);

    currentStage = 'send-otp';
    logProgress(options.onProgress, '========== 发送邮箱验证码 ==========');
    lastRequestUrl = buildApiUrl('/send-otp');
    await sendProfileOtp(
      session,
      profileRedirectUrl,
      profileWorkflowState,
      options.email,
      profileUbid
    );
    lastHttpStatus = 200;
    lastResponseSnippet = 'OTP trigger accepted';
    recordStage('send-otp', true, '已成功触发 OTP 发送');

    return {
      success: true,
      stage: currentStage,
      message: '已成功触发 OTP 发送，可继续等待邮箱验证码',
      email: options.email,
      classification: 'reachable',
      evidence: {
        environmentSummary,
        httpStatus: lastHttpStatus,
        requestUrl: lastRequestUrl,
        responseSnippet: lastResponseSnippet,
        cookieNames: session.cookieJar.listNames(),
        stageTrace
      }
    };
  } catch (error) {
    const errorDetail = formatErrorDetails(error);
    recordStage(currentStage, false, errorDetail);
    logProgress(
      options.onProgress,
      `⚠ 注册探针在阶段 ${formatStageName(currentStage)} 失败: ${errorDetail}`
    );
    const environmentSummary = summarizeEnvironmentProfile(environmentProfile, options.country);
    const requestStageError = error instanceof RequestStageError ? error : undefined;
    return {
      success: false,
      stage: currentStage,
      message: errorDetail,
      email: options.email,
      classification: classifyRegistrationProbeMessage(errorDetail),
      evidence: {
        environmentSummary,
        httpStatus: requestStageError?.status ?? lastHttpStatus,
        requestUrl: requestStageError?.requestUrl ?? lastRequestUrl,
        responseSnippet:
          requestStageError?.responseText
            ? truncateResponseSnippet(requestStageError.responseText)
            : lastResponseSnippet,
        cookieNames: session.cookieJar.listNames(),
        stageTrace
      }
    };
  }
}

async function createProfileIdentity(
  session: ApiSession,
  options: {
    email: string;
    fullName: string;
    otp: string;
    profileRedirectUrl: string;
    profileUbid: string;
    profileWorkflowState: string;
  }
): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  const fingerprint = await generateSessionFingerprint(
    session,
    `${PROFILE_BASE_URL}/#/signup/verify-otp`
  );

  return requestJsonOrThrow(
    session,
    buildApiUrl('/create-identity'),
    {
      method: 'POST',
      headers: {
        origin: PROFILE_BASE_URL,
        referer: `${PROFILE_BASE_URL}/#/signup/verify-otp`
      },
      body: JSON.stringify({
        workflowState: options.profileWorkflowState,
        userData: {
          email: options.email,
          fullName: options.fullName
        },
        otpCode: options.otp,
        ...buildBrowserData({
          fingerprint,
          pageName: 'EMAIL_VERIFICATION',
          eventType: 'EmailVerification',
          ubid: options.profileUbid,
          startedAt
        })
      })
    },
    '调用 profile /create-identity 失败'
  );
}

function maskToken(value: string): string {
  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function findSsoToken(cookieJar: CookieJar): string | undefined {
  return (
    cookieJar.get('x-amz-sso_authn', 'signin.aws') ??
    cookieJar.get('x-amz-sso_authn', `${REGION}.signin.aws`)
  );
}

export async function autoRegisterViaApi(
  options: AutoRegisterFlowOptions = {}
): Promise<RegisterResult> {
  const flowOptions = normalizeFlowOptions(options);
  const fetchContext = await createFetchContext(flowOptions.proxyUrl);
  let currentStage = 'create-inbox';

  try {
    const egress = await fetchEgressInfo(fetchContext.fetchImpl);
    const environmentProfile = resolveEnvironmentProfile(egress?.country);
    const session = createSession(fetchContext.fetchImpl, environmentProfile);

    if (egress?.ip || egress?.country || egress?.city || egress?.region) {
      const egressSummary = [
        egress.ip,
        egress.country,
        egress.region,
        egress.city
      ]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join(' / ');
      logProgress(flowOptions.onProgress, `代理出口: ${egressSummary}`);
    }

    logProgress(
      flowOptions.onProgress,
      `自动环境画像: ${summarizeEnvironmentProfile(environmentProfile, egress?.country)}`
    );

    const inboxLabel = flowOptions.registrationEmailMode === 'custom' ? '使用自定义邮箱' : '创建临时邮箱';
    logProgress(flowOptions.onProgress, `========== ${inboxLabel} ==========`);
    const inbox = await resolveInbox(fetchContext.fetchImpl, flowOptions);
    logProgress(flowOptions.onProgress, `邮箱地址: ${inbox.email}`);

    const fullName = generateRandomName();

    currentStage = 'prepare-profile-workflow';
    logProgress(flowOptions.onProgress, '========== 初始化 AWS 纯接口注册 ==========');
    const {
      profileRedirectUrl,
      profileWorkflowId
    } = await prepareProfileWorkflow(session, inbox.email);
    logProgress(flowOptions.onProgress, `profile workflowID: ${profileWorkflowId}`);

    currentStage = 'start-profile-signup';
    logProgress(flowOptions.onProgress, '========== 启动 profile 注册 ==========');
    const {
      profileWorkflowState,
      profileUbid
    } = await startProfileSignup(session, profileRedirectUrl, profileWorkflowId);

    currentStage = 'send-otp';
    logProgress(flowOptions.onProgress, '========== 发送邮箱验证码 ==========');
    const otpSentAt = Date.now();
    await sendProfileOtp(
      session,
      profileRedirectUrl,
      profileWorkflowState,
      inbox.email,
      profileUbid
    );

    currentStage = 'wait-otp';
    if (flowOptions.otpMode === 'manual' || inbox.source === 'custom') {
      logProgress(flowOptions.onProgress, '========== 等待手动输入验证码 ==========');
    }
    const otp = await resolveOtpCode(inbox, otpSentAt, flowOptions, fetchContext.fetchImpl);

    if (!otp) {
      throw new Error('等待邮箱验证码超时');
    }

    logProgress(flowOptions.onProgress, '已获取验证码，准备继续校验');
    currentStage = 'create-identity';
    logProgress(flowOptions.onProgress, '========== 创建 Builder ID 身份 ==========');
    const identityPayload = await createProfileIdentity(session, {
      email: inbox.email,
      fullName,
      otp,
      profileRedirectUrl,
      profileUbid,
      profileWorkflowState
    });

    const registrationCode = requireString(
      identityPayload,
      'registrationCode',
      'create-identity 缺少 registrationCode'
    );
    const signInState = requireString(
      identityPayload,
      'signInState',
      'create-identity 缺少 signInState'
    );
    const postCreateRedirectUrl = getOptionalString(identityPayload, 'postCreateRedirectUrl');
    const redeemRequest = buildRegistrationRedeemRequest({
      registrationCode,
      signInState,
      postCreateRedirectUrl
    });

    logProgress(
      flowOptions.onProgress,
      `已拿到 registrationCode，准备继续回填注册链路 (${redeemRequest.method} ${redeemRequest.action})`
    );

    currentStage = 'resolve-sso-token';
    const ssoToken = findSsoToken(session.cookieJar);
    if (!ssoToken) {
      return {
        success: false,
        email: inbox.email,
        name: fullName,
        stage: currentStage,
        error:
          '已完成邮箱验证并创建身份，但尚未打通最终 x-amz-sso_authn 回填步骤。当前产物已包含 registrationCode/signInState，可继续调试后续密码设置链路。'
      };
    }

    logProgress(flowOptions.onProgress, `已获取 SSO Token: ${maskToken(ssoToken)}`);
    return {
      success: true,
      email: inbox.email,
      name: fullName,
      ssoToken
    };
  } catch (error) {
    const errorDetail = formatErrorDetails(error);
    logProgress(
      flowOptions.onProgress,
      `⚠ 阶段 ${formatStageName(currentStage)} 失败: ${errorDetail}`
    );
    return {
      success: false,
      stage: currentStage,
      error: errorDetail
    };
  } finally {
    await fetchContext.close();
  }
}
