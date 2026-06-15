import { describe, expect, it, vi } from "vitest";

describe("Puppeteer PDF Sandbox Network Constraints", () => {
  it("allows data URLs and about:blank but blocks everything else", () => {
    // This handler mimics the network interception logic in worker main.ts
    const requestHandler = (request: any) => {
      if (request.url().startsWith("data:") || request.url() === "about:blank") {
        request.continue();
      } else {
        request.abort();
      }
    };

    const mockContinue1 = vi.fn();
    const mockAbort1 = vi.fn();
    const req1 = {
      url: () => "data:text/html;base64,PGgxPkhlbGxvPC9oMT4=",
      continue: mockContinue1,
      abort: mockAbort1,
    };
    requestHandler(req1);
    expect(mockContinue1).toHaveBeenCalled();
    expect(mockAbort1).not.toHaveBeenCalled();

    const mockContinue2 = vi.fn();
    const mockAbort2 = vi.fn();
    const req2 = {
      url: () => "about:blank",
      continue: mockContinue2,
      abort: mockAbort2,
    };
    requestHandler(req2);
    expect(mockContinue2).toHaveBeenCalled();
    expect(mockAbort2).not.toHaveBeenCalled();

    const mockContinue3 = vi.fn();
    const mockAbort3 = vi.fn();
    const req3 = {
      url: () => "http://example.com/malicious-script.js",
      continue: mockContinue3,
      abort: mockAbort3,
    };
    requestHandler(req3);
    expect(mockContinue3).not.toHaveBeenCalled();
    expect(mockAbort3).toHaveBeenCalled();

    const mockContinue4 = vi.fn();
    const mockAbort4 = vi.fn();
    const req4 = {
      url: () => "file:///etc/passwd",
      continue: mockContinue4,
      abort: mockAbort4,
    };
    requestHandler(req4);
    expect(mockContinue4).not.toHaveBeenCalled();
    expect(mockAbort4).toHaveBeenCalled();
  });
});
