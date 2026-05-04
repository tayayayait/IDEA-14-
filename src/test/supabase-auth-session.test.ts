import { describe, expect, it } from "vitest";
import {
  clearSupabaseAuthStorage,
  getSupabaseAuthStorageKey,
  isInvalidRefreshTokenError,
} from "@/lib/supabase-auth-session";

describe("supabase auth session helpers", () => {
  it("detects invalid refresh token errors", () => {
    expect(
      isInvalidRefreshTokenError(
        new Error("Invalid Refresh Token: Refresh Token Not Found"),
      ),
    ).toBe(true);
    expect(isInvalidRefreshTokenError(new Error("Network request failed"))).toBe(
      false,
    );
  });

  it("builds the Supabase auth storage key from the project URL", () => {
    expect(
      getSupabaseAuthStorageKey("https://gnwhjqaxndbkqxecxjkn.supabase.co"),
    ).toBe("sb-gnwhjqaxndbkqxecxjkn-auth-token");
  });

  it("removes only the current Supabase project auth key", () => {
    const removedKeys: string[] = [];

    const key = clearSupabaseAuthStorage(
      { removeItem: (storageKey) => removedKeys.push(storageKey) },
      "https://gnwhjqaxndbkqxecxjkn.supabase.co",
    );

    expect(key).toBe("sb-gnwhjqaxndbkqxecxjkn-auth-token");
    expect(removedKeys).toEqual(["sb-gnwhjqaxndbkqxecxjkn-auth-token"]);
  });
});
