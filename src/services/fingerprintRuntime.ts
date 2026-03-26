import crypto from 'node:crypto';

import { JSDOM } from 'jsdom';

import type { EnvironmentProfile } from './environmentProfile.ts';
import type { FetchImpl } from './httpClient.ts';

const DEFAULT_SELECTOR = '#fpr_form';
const DEFAULT_FWCIM_SCRIPT_URL =
  'https://d1osqh8czd52ng.cloudfront.net/fwcim_signin_us-east-1_prod.js';

interface FwcimRuntime {
  profileForm(selector: string): void;
  report(selector: string, callback: (...args: unknown[]) => void): void;
}

interface FwcimWindow {
  TextEncoder: typeof TextEncoder;
  TextDecoder: typeof TextDecoder;
  fwcim?: FwcimRuntime;
  eval(source: string): unknown;
}

interface GradientStub {
  addColorStop(offset: number, color: string): void;
}

interface TextMetricsStub {
  width: number;
  actualBoundingBoxAscent: number;
  actualBoundingBoxDescent: number;
}

interface WebGlDebugRendererInfoStub {
  UNMASKED_VENDOR_WEBGL: number;
  UNMASKED_RENDERER_WEBGL: number;
}

interface WebGlContextStub {
  getExtension(name: string): WebGlDebugRendererInfoStub | null;
  getParameter(parameter: number): string | number;
  getSupportedExtensions(): string[];
}

interface OffscreenCanvasStub {
  width: number;
  height: number;
  getContext(type: string): unknown;
  convertToBlob(): Promise<Blob>;
}

interface BrowserLikeWindow extends Window, FwcimWindow {
  AudioContext?: unknown;
  HTMLCanvasElement: typeof HTMLCanvasElement;
  OffscreenCanvas?: new (width: number, height: number) => OffscreenCanvasStub;
  webkitAudioContext?: unknown;
}

let cachedScriptPromise: Promise<string> | null = null;

const UNMASKED_VENDOR_WEBGL = 0x9245;
const UNMASKED_RENDERER_WEBGL = 0x9246;
const DEFAULT_SCREEN = {
  width: 1440,
  height: 900,
  availWidth: 1440,
  availHeight: 860,
  colorDepth: 24,
  pixelDepth: 24
};

function createGradientStub(): GradientStub {
  return {
    addColorStop(): void {
      // no-op stub for FWCIM canvas gradient calls
    }
  };
}

function createCanvasContextStub(canvas: object): CanvasRenderingContext2D {
  const gradient = createGradientStub();
  const imageData = {
    data: new Uint8ClampedArray(400)
  };
  const context = {
    canvas,
    measureText(): TextMetricsStub {
      return {
        width: 120,
        actualBoundingBoxAscent: 10,
        actualBoundingBoxDescent: 2
      };
    },
    createLinearGradient(): GradientStub {
      return gradient;
    },
    createRadialGradient(): GradientStub {
      return gradient;
    },
    getImageData(): { data: Uint8ClampedArray } {
      return imageData;
    },
    getLineDash(): number[] {
      return [];
    },
    isPointInPath(): boolean {
      return false;
    },
    isPointInStroke(): boolean {
      return false;
    },
    globalCompositeOperation: 'source-over'
  };

  return new Proxy(context as unknown as CanvasRenderingContext2D, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver);
      }

      return (): undefined => undefined;
    },
    set() {
      return true;
    }
  });
}

function createWebGlContextStub(): WebGlContextStub {
  return {
    getExtension(name: string): WebGlDebugRendererInfoStub | null {
      if (name === 'WEBGL_debug_renderer_info') {
        return {
          UNMASKED_VENDOR_WEBGL,
          UNMASKED_RENDERER_WEBGL
        };
      }

      return null;
    },
    getParameter(parameter: number): string | number {
      if (parameter === UNMASKED_VENDOR_WEBGL) {
        return 'Intel Inc.';
      }

      if (parameter === UNMASKED_RENDERER_WEBGL) {
        return 'Intel Iris OpenGL Engine';
      }

      return 0;
    },
    getSupportedExtensions(): string[] {
      return ['WEBGL_debug_renderer_info'];
    }
  };
}

function defineWindowValue<K extends keyof BrowserLikeWindow>(
  window: BrowserLikeWindow,
  key: K,
  value: BrowserLikeWindow[K]
): void {
  Object.defineProperty(window, key, {
    configurable: true,
    value
  });
}

class AudioContextStub {
  sampleRate = 44100;
  destination = {};

  createOscillator(): {
    type: string;
    frequency: { value: number };
    connect(): void;
    start(): void;
    stop(): void;
  } {
    return {
      type: 'sine',
      frequency: { value: 0 },
      connect(): void {},
      start(): void {},
      stop(): void {}
    };
  }

  createDynamicsCompressor(): {
    threshold: { value: number };
    knee: { value: number };
    ratio: { value: number };
    reduction: { value: number };
    attack: { value: number };
    release: { value: number };
    connect(): void;
  } {
    return {
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      reduction: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
      connect(): void {}
    };
  }

  createAnalyser(): {
    connect(): void;
    getFloatFrequencyData(data: Float32Array): void;
  } {
    return {
      connect(): void {},
      getFloatFrequencyData(data: Float32Array): void {
        data.fill(0);
      }
    };
  }

  createGain(): {
    gain: { value: number };
    connect(): void;
  } {
    return {
      gain: { value: 1 },
      connect(): void {}
    };
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

function installBrowserLikeEnvironment(
  window: BrowserLikeWindow,
  environmentProfile?: EnvironmentProfile
): void {
  const navigatorProfile = environmentProfile ?? {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    platform: 'MacIntel',
    language: 'en-US',
    languages: ['en-US', 'en']
  };

  Object.defineProperty(window.navigator, 'webdriver', {
    configurable: true,
    value: false
  });
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: navigatorProfile.userAgent
  });
  Object.defineProperty(window.navigator, 'platform', {
    configurable: true,
    value: navigatorProfile.platform
  });
  Object.defineProperty(window.navigator, 'vendor', {
    configurable: true,
    value: 'Google Inc.'
  });
  Object.defineProperty(window.navigator, 'language', {
    configurable: true,
    value: navigatorProfile.language
  });
  Object.defineProperty(window.navigator, 'languages', {
    configurable: true,
    value: navigatorProfile.languages
  });
  Object.defineProperty(window.navigator, 'hardwareConcurrency', {
    configurable: true,
    value: 8
  });
  Object.defineProperty(window.navigator, 'deviceMemory', {
    configurable: true,
    value: 8
  });
  Object.defineProperty(window.navigator, 'maxTouchPoints', {
    configurable: true,
    value: 0
  });
  Object.defineProperty(window.navigator, 'plugins', {
    configurable: true,
    value: [
      { name: 'Chrome PDF Plugin' },
      { name: 'Chrome PDF Viewer' },
      { name: 'Native Client' }
    ]
  });
  defineWindowValue(window, 'screen', DEFAULT_SCREEN as BrowserLikeWindow['screen']);

  window.matchMedia = (query: string): MediaQueryList => ({
    matches: query.includes('prefers-color-scheme') ? false : true,
    media: query,
    onchange: null,
    addEventListener(): void {},
    removeEventListener(): void {},
    addListener(): void {},
    removeListener(): void {},
    dispatchEvent(): boolean {
      return false;
    }
  });

  defineWindowValue(
    window,
    'OffscreenCanvas',
    class {
      width: number;
      height: number;

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }

      getContext(type: string): unknown {
        if (type === '2d') {
          return createCanvasContextStub(this);
        }

        if (type === 'webgl' || type === 'experimental-webgl') {
          return createWebGlContextStub();
        }

        return null;
      }

      convertToBlob(): Promise<Blob> {
        return Promise.resolve(new Blob(['stub']));
      }
    }
  );

  window.HTMLCanvasElement.prototype.getContext = (function getContext(
    this: HTMLCanvasElement,
    type: string
  ): RenderingContext | null {
    if (type === '2d') {
      return createCanvasContextStub(this) as unknown as RenderingContext;
    }

    if (type === 'webgl' || type === 'experimental-webgl') {
      return createWebGlContextStub() as unknown as RenderingContext;
    }

    return null;
  }) as typeof window.HTMLCanvasElement.prototype.getContext;
  window.HTMLCanvasElement.prototype.toDataURL = function toDataURL(): string {
    return 'data:image/png;base64,stub';
  };

  defineWindowValue(window, 'AudioContext', AudioContextStub);
  window.webkitAudioContext = window.AudioContext;
}

export function resolveFingerprintReportResult(args: unknown[]): string {
  if (args.length === 0) {
    throw new Error('FWCIM 回调未返回任何结果');
  }

  if (args.length === 1) {
    if (typeof args[0] !== 'string') {
      throw new Error('FWCIM 单参数回调未返回指纹字符串');
    }

    return args[0];
  }

  if (args[0]) {
    throw new Error(String(args[0]));
  }

  if (typeof args[1] !== 'string') {
    throw new Error('FWCIM 双参数回调未返回指纹字符串');
  }

  return args[1];
}

async function loadFwcimScript(fetchImpl: FetchImpl): Promise<string> {
  if (!cachedScriptPromise) {
    cachedScriptPromise = (async () => {
      const response = await fetchImpl(DEFAULT_FWCIM_SCRIPT_URL, {
        headers: {
          accept: 'application/javascript,text/javascript;q=0.9,*/*;q=0.8'
        }
      });

      if (!response.ok) {
        throw new Error(`加载 FWCIM 指纹脚本失败: HTTP ${response.status}`);
      }

      return response.text();
    })();
  }

  return cachedScriptPromise;
}

export interface GenerateFingerprintOptions {
  environmentProfile?: EnvironmentProfile;
  fetchImpl?: FetchImpl;
  formSelector?: string;
  scriptContent?: string;
  url: string;
}

export async function generateFingerprint(
  options: GenerateFingerprintOptions
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const formSelector = options.formSelector ?? DEFAULT_SELECTOR;
  const scriptContent = options.scriptContent ?? (await loadFwcimScript(fetchImpl));

  const dom = new JSDOM(
    '<!DOCTYPE html><html><body><form id="fpr_form"></form></body></html>',
    {
      url: options.url,
      pretendToBeVisual: true,
      runScripts: 'dangerously',
      resources: 'usable'
    }
  );

  try {
    const window = dom.window as unknown as BrowserLikeWindow;
    defineWindowValue(window, 'crypto', crypto.webcrypto as BrowserLikeWindow['crypto']);
    defineWindowValue(window, 'TextEncoder', TextEncoder);
    defineWindowValue(window, 'TextDecoder', TextDecoder);
    installBrowserLikeEnvironment(window, options.environmentProfile);

    window.eval(scriptContent);

    if (!window.fwcim) {
      throw new Error('FWCIM 运行时未初始化');
    }

    window.fwcim.profileForm(formSelector);

    return await new Promise<string>((resolve, reject) => {
      window.fwcim?.report(formSelector, (...args: unknown[]) => {
        try {
          resolve(resolveFingerprintReportResult(args));
        } catch (error) {
          reject(error);
        }
      });
    });
  } finally {
    dom.window.close();
  }
}

export interface BrowserDataResult {
  browserData: {
    attributes: {
      eventTimestamp: string;
      eventType: string;
      fingerprint: string;
      pageName: string;
      timeSpentOnPage: string;
      ubid: string;
      visitorId?: string;
    };
    cookies: Record<string, never>;
  };
  elapsedTime: number;
}

export interface BuildBrowserDataOptions {
  eventType: string;
  fingerprint: string;
  now?: number;
  pageName: string;
  startedAt: number;
  ubid: string;
  visitorId?: string;
}

export function buildBrowserData(
  options: BuildBrowserDataOptions
): BrowserDataResult {
  const now = options.now ?? Date.now();
  const elapsedTime = Math.max(0, now - options.startedAt);
  const attributes: BrowserDataResult['browserData']['attributes'] = {
    fingerprint: options.fingerprint,
    eventTimestamp: new Date(now).toISOString(),
    timeSpentOnPage: String(elapsedTime),
    pageName: options.pageName,
    eventType: options.eventType,
    ubid: options.ubid
  };

  if (options.visitorId) {
    attributes.visitorId = options.visitorId;
  }

  return {
    browserData: {
      attributes,
      cookies: {}
    },
    elapsedTime
  };
}
