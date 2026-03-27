import type {
  BrowserObservationNetworkHit,
  BrowserObservationSummary
} from '../shared/contracts.ts';

const MAX_OBSERVATION_HITS = 10;
const MAX_OBSERVATION_EVENTS = 12;

export function isInterestingObservationUrl(url: string): boolean {
  return (
    url.includes('profile.aws.amazon.com/api/') ||
    url.includes('.signin.aws/platform/') ||
    url.includes('portal.sso.') ||
    url.includes('view.awsapps.com/start')
  );
}

export function createBrowserObservationSummary(
  startedAt: number = Date.now()
): BrowserObservationSummary {
  return {
    active: true,
    startedAt,
    latestInterestingEvents: [],
    latestNetworkHits: []
  };
}

function keepLatest<T>(items: T[], maxSize: number): T[] {
  return items.length <= maxSize ? items : items.slice(items.length - maxSize);
}

export function pushBrowserObservationEvent(
  summary: BrowserObservationSummary,
  message: string
): BrowserObservationSummary {
  return {
    ...summary,
    latestInterestingEvents: keepLatest(
      [...summary.latestInterestingEvents, message],
      MAX_OBSERVATION_EVENTS
    )
  };
}

export function pushBrowserObservationHit(
  summary: BrowserObservationSummary,
  hit: BrowserObservationNetworkHit
): BrowserObservationSummary {
  return {
    ...summary,
    currentUrl:
      hit.type === 'navigation' && hit.url ? hit.url : summary.currentUrl,
    lastError: hit.type === 'failure' ? hit.detail : summary.lastError,
    latestNetworkHits: keepLatest(
      [...summary.latestNetworkHits, hit],
      MAX_OBSERVATION_HITS
    )
  };
}
