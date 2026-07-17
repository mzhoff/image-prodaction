export type AuthEmailKind = 'password-changed' | 'password-reset' | 'verification';

type EmailFailureReporter = (kind: AuthEmailKind) => void;

export async function dispatchAuthEmail(
  kind: AuthEmailKind,
  send: () => Promise<void>,
  reportFailure: EmailFailureReporter = reportAuthEmailFailure,
) {
  try {
    await send();
  } catch {
    reportFailure(kind);
  }
}

function reportAuthEmailFailure(kind: AuthEmailKind) {
  console.error(`[email] ${kind} delivery failed.`);
}
