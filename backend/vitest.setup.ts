// Vitest setup — keeps service-under-test env deterministic.
// Individual tests override these via vi.stubEnv when needed.

// Silence winston during tests — we inspect return values, not logs.
process.env.LOG_LEVEL = 'silent';

// Default to "no AI configured" / "no OBO configured" so tests explicitly
// opt-in by stubbing the relevant env vars. Matches production safety:
// nothing should work without explicit configuration.
delete process.env.AZURE_OPENAI_ENDPOINT;
delete process.env.AZURE_OPENAI_API_KEY;
delete process.env.AZURE_OPENAI_DEPLOYMENT;
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_BASE_URL;
delete process.env.OPENAI_MODEL;
delete process.env.AZURE_CLIENT_ID;
delete process.env.AZURE_CLIENT_SECRET;
delete process.env.AZURE_TENANT_ID;
