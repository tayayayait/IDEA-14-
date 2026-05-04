const INVALID_REFRESH_TOKEN_MARKERS = [
  "Invalid Refresh Token",
  "Refresh Token Not Found",
];

type RemovableStorage = Pick<Storage, "removeItem">;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "";
}

export function isInvalidRefreshTokenError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return INVALID_REFRESH_TOKEN_MARKERS.every((marker) =>
    message.includes(marker),
  );
}

export function getSupabaseAuthStorageKey(
  supabaseUrl: string | null | undefined,
): string | null {
  if (!supabaseUrl) return null;

  try {
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
}

export function clearSupabaseAuthStorage(
  storage: RemovableStorage,
  supabaseUrl: string | null | undefined,
): string | null {
  const storageKey = getSupabaseAuthStorageKey(supabaseUrl);
  if (!storageKey) return null;

  storage.removeItem(storageKey);
  return storageKey;
}
