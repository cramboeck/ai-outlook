// Tests for authService
//
// Covers:
//   - extractBearerToken (pure helper, no mocks)
//   - isOboConfigured (env-var helper)
//   - getGraphTokenOnBehalfOf: missing config, malformed input, successful
//     exchange, consent-required mapping, generic MSAL failure mapping.
//
// @azure/msal-node is fully mocked so no real identity-platform calls are
// attempted. Module cache is reset between specs via vi.resetModules() so
// the service-internal cachedApp singleton is fresh each time.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAcquireTokenOnBehalfOf = vi.fn();

vi.mock('@azure/msal-node', () => {
  // Classic class form survives vi.resetModules() — vi.fn() variants can lose
  // their constructability when the module graph is rebuilt between tests.
  class FakeConfidentialClientApplication {
    acquireTokenOnBehalfOf = mockAcquireTokenOnBehalfOf;
  }
  return {
    ConfidentialClientApplication: FakeConfidentialClientApplication,
    LogLevel: { Error: 0, Warning: 1, Info: 2, Verbose: 3 },
  };
});

import {
  extractBearerToken,
  isOboConfigured,
  getGraphTokenOnBehalfOf,
  OboAuthError,
} from '../services/authService';

// Dynamic re-import for tests that need a fresh module singleton. The
// `.js` extension is required by NodeNext module resolution at compile
// time; tsx / vitest resolve it back to the .ts source at runtime.
async function loadSut(): Promise<typeof import('../services/authService')> {
  return import('../services/authService.js' as string) as Promise<
    typeof import('../services/authService')
  >;
}

describe('extractBearerToken', () => {
  it('returns null for undefined / empty / non-bearer headers', () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken('')).toBeNull();
    expect(extractBearerToken('Basic abc')).toBeNull();
    expect(extractBearerToken('Bearer ')).toBeNull();
  });

  it('returns the raw JWT for a valid Bearer header', () => {
    expect(extractBearerToken('Bearer eyJhbGciOi')).toBe('eyJhbGciOi');
  });

  it('trims surrounding whitespace from the token', () => {
    expect(extractBearerToken('Bearer   eyJhbGciOi   ')).toBe('eyJhbGciOi');
  });
});

describe('isOboConfigured', () => {
  beforeEach(() => {
    delete process.env.AZURE_CLIENT_ID;
    delete process.env.AZURE_CLIENT_SECRET;
  });

  it('is false when AZURE_CLIENT_SECRET is missing', () => {
    process.env.AZURE_CLIENT_ID = 'id';
    expect(isOboConfigured()).toBe(false);
  });

  it('is false when AZURE_CLIENT_ID is missing', () => {
    process.env.AZURE_CLIENT_SECRET = 'secret';
    expect(isOboConfigured()).toBe(false);
  });

  it('is true when both vars are set', () => {
    process.env.AZURE_CLIENT_ID = 'id';
    process.env.AZURE_CLIENT_SECRET = 'secret';
    expect(isOboConfigured()).toBe(true);
  });
});

describe('getGraphTokenOnBehalfOf', () => {
  beforeEach(() => {
    mockAcquireTokenOnBehalfOf.mockReset();
    delete process.env.AZURE_CLIENT_ID;
    delete process.env.AZURE_CLIENT_SECRET;
    delete process.env.AZURE_TENANT_ID;
    vi.resetModules();
  });

  it('throws OboAuthError(missing_config, 503) when env vars are missing', async () => {
    const { getGraphTokenOnBehalfOf: fn, OboAuthError: Err } = await loadSut();
    await expect(fn('eyJabcdefghij-long-enough-token')).rejects.toMatchObject({
      code: 'missing_config',
      httpStatus: 503,
    });
    await expect(fn('eyJabcdefghij-long-enough-token')).rejects.toBeInstanceOf(Err);
  });

  it('throws OboAuthError(unknown, 400) for a missing / malformed token', async () => {
    process.env.AZURE_CLIENT_ID = 'id';
    process.env.AZURE_CLIENT_SECRET = 'secret';
    const { getGraphTokenOnBehalfOf: fn } = await loadSut();

    await expect(fn('')).rejects.toMatchObject({ code: 'unknown', httpStatus: 400 });
    await expect(fn('short')).rejects.toMatchObject({ code: 'unknown', httpStatus: 400 });
  });

  it('returns a structured GraphTokenResult on successful OBO exchange', async () => {
    process.env.AZURE_CLIENT_ID = 'id';
    process.env.AZURE_CLIENT_SECRET = 'secret';
    const { getGraphTokenOnBehalfOf: fn, GRAPH_SCOPES_COPILOT } = await loadSut();

    mockAcquireTokenOnBehalfOf.mockResolvedValue({
      accessToken: 'the-new-graph-token',
      expiresOn: new Date('2026-05-01T10:00:00Z'),
      scopes: GRAPH_SCOPES_COPILOT,
    });

    const result = await fn('eyJabcdefghij-long-enough-token');
    expect(result.accessToken).toBe('the-new-graph-token');
    expect(result.expiresOn).toEqual(new Date('2026-05-01T10:00:00Z'));
    expect(result.scopes).toEqual(GRAPH_SCOPES_COPILOT);
  });

  it('maps AADSTS65001 / invalid_grant to consent_required (403)', async () => {
    process.env.AZURE_CLIENT_ID = 'id';
    process.env.AZURE_CLIENT_SECRET = 'secret';
    const { getGraphTokenOnBehalfOf: fn, OboAuthError: Err } = await loadSut();

    mockAcquireTokenOnBehalfOf.mockRejectedValue({
      errorCode: 'invalid_grant',
      errorMessage: 'AADSTS65001: user or admin has not consented',
    });

    await expect(fn('eyJabcdefghij-long-enough-token')).rejects.toBeInstanceOf(Err);
    await expect(fn('eyJabcdefghij-long-enough-token')).rejects.toMatchObject({
      code: 'consent_required',
      httpStatus: 403,
    });
  });

  it('maps interaction_required to consent_required', async () => {
    process.env.AZURE_CLIENT_ID = 'id';
    process.env.AZURE_CLIENT_SECRET = 'secret';
    const { getGraphTokenOnBehalfOf: fn } = await loadSut();

    mockAcquireTokenOnBehalfOf.mockRejectedValue({
      errorCode: 'interaction_required',
      errorMessage: 'MFA / CA',
    });

    await expect(fn('eyJabcdefghij-long-enough-token')).rejects.toMatchObject({
      code: 'consent_required',
      httpStatus: 403,
    });
  });

  it('maps unknown MSAL errors to OboAuthError(unknown, 401)', async () => {
    process.env.AZURE_CLIENT_ID = 'id';
    process.env.AZURE_CLIENT_SECRET = 'secret';
    const { getGraphTokenOnBehalfOf: fn, OboAuthError: Err } = await loadSut();

    mockAcquireTokenOnBehalfOf.mockRejectedValue({
      errorCode: 'some_other_error',
      errorMessage: 'catastrophic failure',
    });

    await expect(fn('eyJabcdefghij-long-enough-token')).rejects.toBeInstanceOf(Err);
    await expect(fn('eyJabcdefghij-long-enough-token')).rejects.toMatchObject({
      code: 'unknown',
      httpStatus: 401,
    });
  });
});

// Symbol-level sanity check keeps the static imports "used" so the
// build is strict about exports and the test file documents what
// OboAuthError / getGraphTokenOnBehalfOf are expected to be.
describe('module shape', () => {
  it('exports callable OboAuthError + getGraphTokenOnBehalfOf', () => {
    expect(OboAuthError).toBeTypeOf('function');
    expect(getGraphTokenOnBehalfOf).toBeTypeOf('function');
  });
});
