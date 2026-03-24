import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

describe("encryption.server", () => {
  const MOCK_KEY = "a".repeat(64); // 64 hex chars = 32 bytes

  beforeAll(() => {
    vi.stubEnv("ENCRYPTION_KEY", MOCK_KEY);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("encrypts and decrypts a string round-trip", async () => {
    const { encrypt, decrypt } = await import("~/utils/encryption.server");
    const plaintext = "hello world secret data";
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toContain("="); // base64
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for same input (random IV)", async () => {
    const { encrypt } = await import("~/utils/encryption.server");
    const text = "same input";
    const enc1 = encrypt(text);
    const enc2 = encrypt(text);
    expect(enc1).not.toBe(enc2);
  });

  it("decrypts what was encrypted with JSON credentials", async () => {
    const { encrypt, decrypt } = await import("~/utils/encryption.server");
    const creds = JSON.stringify({ apiKey: "key123", secret: "sec456" });
    const encrypted = encrypt(creds);
    const decrypted = decrypt(encrypted);
    expect(JSON.parse(decrypted)).toEqual({ apiKey: "key123", secret: "sec456" });
  });

  it("throws on invalid ciphertext", async () => {
    const { decrypt } = await import("~/utils/encryption.server");
    expect(() => decrypt("not-valid-base64!!!")).toThrow();
  });

  it("throws if ENCRYPTION_KEY is missing", async () => {
    const { encrypt, decrypt } = await import("~/utils/encryption.server");
    vi.stubEnv("ENCRYPTION_KEY", "");
    // getKey() is called at encrypt/decrypt time, so empty key should throw
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY environment variable is required");
    expect(() => decrypt("dGVzdA==")).toThrow("ENCRYPTION_KEY environment variable is required");
    // Restore valid key for subsequent tests
    vi.stubEnv("ENCRYPTION_KEY", MOCK_KEY);
  });

  it("throws if ENCRYPTION_KEY has wrong length", async () => {
    const { encrypt } = await import("~/utils/encryption.server");
    vi.stubEnv("ENCRYPTION_KEY", "abcd1234"); // too short
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY must be exactly 64 hex characters");
    vi.stubEnv("ENCRYPTION_KEY", MOCK_KEY);
  });

  it("handles empty string", async () => {
    const { encrypt, decrypt } = await import("~/utils/encryption.server");
    const encrypted = encrypt("");
    expect(decrypt(encrypted)).toBe("");
  });

  it("handles unicode and special characters", async () => {
    const { encrypt, decrypt } = await import("~/utils/encryption.server");
    const text = "こんにちは 🌍 <script>alert('xss')</script>";
    expect(decrypt(encrypt(text))).toBe(text);
  });

  it("handles long strings", async () => {
    const { encrypt, decrypt } = await import("~/utils/encryption.server");
    const text = "x".repeat(10000);
    expect(decrypt(encrypt(text))).toBe(text);
  });
});
