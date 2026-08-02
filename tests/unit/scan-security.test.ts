import { describe, expect, it } from "vitest";
import { scanToBlueprint } from "@/lib/blueprint/scan";

describe("scanToBlueprint · security / SSRF", () => {
  it("blocks localhost", async () => {
    await expect(scanToBlueprint({ url: "http://localhost:3000" })).rejects.toThrow(
      /Local and private|Lokálne|privátne/i,
    );
  });

  it("blocks 127.0.0.1", async () => {
    await expect(scanToBlueprint({ url: "http://127.0.0.1/" })).rejects.toThrow(
      /Local and private|Lokálne|privátne/i,
    );
  });

  it("blocks private RFC1918 ranges", async () => {
    await expect(scanToBlueprint({ url: "http://10.0.0.5/" })).rejects.toThrow(
      /Local and private|Lokálne|privátne/i,
    );
    await expect(scanToBlueprint({ url: "http://192.168.1.1/" })).rejects.toThrow(
      /Local and private|Lokálne|privátne/i,
    );
    await expect(scanToBlueprint({ url: "http://172.16.5.1/" })).rejects.toThrow(
      /Local and private|Lokálne|privátne/i,
    );
  });

  it("blocks link-local and metadata hosts", async () => {
    await expect(scanToBlueprint({ url: "http://169.254.169.254/" })).rejects.toThrow(
      /Local and private|Lokálne|privátne/i,
    );
    await expect(
      scanToBlueprint({ url: "http://metadata.google.internal/" }),
    ).rejects.toThrow(/Local and private|Lokálne|privátne/i);
  });

  it("blocks non-http protocols", async () => {
    await expect(scanToBlueprint({ url: "file:///etc/passwd" })).rejects.toThrow(
      /Only http and https|http a https|Invalid|Neplatná/i,
    );
    await expect(scanToBlueprint({ url: "ftp://example.com/a" })).rejects.toThrow(
      /Only http and https|http a https/i,
    );
  });

  it("rejects invalid URL shape", async () => {
    await expect(scanToBlueprint({ url: "not a url" })).rejects.toThrow(/Invalid|Neplatná/i);
  });

  it("allows HTML paste even without public base URL", async () => {
    const bp = await scanToBlueprint({
      html: "<html><head><title>Offline</title></head><body><h1>x</h1></body></html>",
    });
    expect(bp.source).toBe("html");
    expect(bp.meta.title).toBe("Offline");
  });
});
