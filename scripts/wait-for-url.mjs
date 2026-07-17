const [target, timeoutArgument = '60000'] = process.argv.slice(2);

if (!target) {
  console.error('Usage: node scripts/wait-for-url.mjs <url> [timeout-ms]');
  process.exit(2);
}

const timeoutMs = Number(timeoutArgument);
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  console.error('timeout-ms must be a positive number.');
  process.exit(2);
}

const deadline = Date.now() + timeoutMs;
let lastFailure = 'No response received.';

while (Date.now() < deadline) {
  try {
    const response = await fetch(target, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) {
      console.log(`${target} is ready (${response.status}).`);
      process.exit(0);
    }
    lastFailure = `HTTP ${response.status}`;
  } catch (error) {
    lastFailure = error instanceof Error ? error.message : String(error);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

console.error(`Timed out after ${timeoutMs}ms waiting for ${target}. ${lastFailure}`);
process.exit(1);
