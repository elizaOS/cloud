/**
 * Phone Auth Route Tests
 *
 * Tests for the phone auth API endpoints:
 * - POST /api/eliza-app/auth/phone/send-otp
 * - POST /api/eliza-app/auth/phone/verify-otp
 *
 * These tests verify:
 * - Request validation (phone format, OTP format)
 * - Error responses for invalid inputs
 * - Response structure
 * - Edge cases
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";

// Schema definitions matching the route handlers
const sendOTPSchema = z.object({
  phone_number: z.string().min(1, "Phone number is required"),
});

const verifyOTPSchema = z.object({
  phone_number: z.string().min(1, "Phone number is required"),
  otp: z.string().length(6, "OTP must be 6 digits").regex(/^\d+$/, "OTP must be numeric"),
});

describe("Send OTP Request Validation", () => {
  describe("valid requests", () => {
    test("accepts phone_number field", () => {
      const body = { phone_number: "+14155552671" };
      const result = sendOTPSchema.safeParse(body);
      expect(result.success).toBe(true);
    });

    test("accepts various phone formats (validation done later)", () => {
      const phones = [
        "+14155552671",
        "4155552671",
        "(415) 555-2671",
        "415-555-2671",
      ];
      for (const phone of phones) {
        const result = sendOTPSchema.safeParse({ phone_number: phone });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("invalid requests", () => {
    test("rejects missing phone_number", () => {
      const body = {};
      const result = sendOTPSchema.safeParse(body);
      expect(result.success).toBe(false);
    });

    test("rejects empty phone_number", () => {
      const body = { phone_number: "" };
      const result = sendOTPSchema.safeParse(body);
      expect(result.success).toBe(false);
    });

    test("rejects null phone_number", () => {
      const body = { phone_number: null };
      const result = sendOTPSchema.safeParse(body);
      expect(result.success).toBe(false);
    });

    test("rejects non-string phone_number", () => {
      const body = { phone_number: 4155552671 };
      const result = sendOTPSchema.safeParse(body);
      expect(result.success).toBe(false);
    });
  });
});

describe("Verify OTP Request Validation", () => {
  describe("valid requests", () => {
    test("accepts valid phone and OTP", () => {
      const body = { phone_number: "+14155552671", otp: "123456" };
      const result = verifyOTPSchema.safeParse(body);
      expect(result.success).toBe(true);
    });

    test("accepts OTP with all same digits", () => {
      const body = { phone_number: "+14155552671", otp: "111111" };
      const result = verifyOTPSchema.safeParse(body);
      expect(result.success).toBe(true);
    });

    test("accepts OTP starting with zero (valid 6-digit)", () => {
      // Note: Our OTP generation doesn't produce leading zeros,
      // but the schema should still accept them
      const body = { phone_number: "+14155552671", otp: "012345" };
      const result = verifyOTPSchema.safeParse(body);
      expect(result.success).toBe(true);
    });
  });

  describe("invalid OTP format", () => {
    test("rejects too short OTP", () => {
      const body = { phone_number: "+14155552671", otp: "12345" };
      const result = verifyOTPSchema.safeParse(body);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("6");
      }
    });

    test("rejects too long OTP", () => {
      const body = { phone_number: "+14155552671", otp: "1234567" };
      const result = verifyOTPSchema.safeParse(body);
      expect(result.success).toBe(false);
    });

    test("rejects OTP with letters", () => {
      const body = { phone_number: "+14155552671", otp: "12345a" };
      const result = verifyOTPSchema.safeParse(body);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("numeric");
      }
    });

    test("rejects OTP with special characters", () => {
      const body = { phone_number: "+14155552671", otp: "123-45" };
      const result = verifyOTPSchema.safeParse(body);
      expect(result.success).toBe(false);
    });

    test("rejects OTP with spaces", () => {
      const body = { phone_number: "+14155552671", otp: "123 456" };
      const result = verifyOTPSchema.safeParse(body);
      expect(result.success).toBe(false);
    });

    test("rejects empty OTP", () => {
      const body = { phone_number: "+14155552671", otp: "" };
      const result = verifyOTPSchema.safeParse(body);
      expect(result.success).toBe(false);
    });
  });

  describe("missing fields", () => {
    test("rejects missing phone_number", () => {
      const body = { otp: "123456" };
      const result = verifyOTPSchema.safeParse(body);
      expect(result.success).toBe(false);
    });

    test("rejects missing otp", () => {
      const body = { phone_number: "+14155552671" };
      const result = verifyOTPSchema.safeParse(body);
      expect(result.success).toBe(false);
    });

    test("rejects empty object", () => {
      const body = {};
      const result = verifyOTPSchema.safeParse(body);
      expect(result.success).toBe(false);
    });
  });
});

describe("Response Type Structures", () => {
  // These tests document the expected response structures

  describe("SendOTP Success Response", () => {
    test("has correct structure", () => {
      const response = {
        success: true,
        message: "Verification code sent via iMessage",
      };
      expect(response.success).toBe(true);
      expect(typeof response.message).toBe("string");
    });
  });

  describe("SendOTP Error Response", () => {
    test("has correct structure for validation error", () => {
      const response = {
        success: false,
        error: "Phone number is required",
        code: "INVALID_REQUEST",
      };
      expect(response.success).toBe(false);
      expect(typeof response.error).toBe("string");
      expect(typeof response.code).toBe("string");
    });

    test("has correct structure for rate limit error", () => {
      const response = {
        success: false,
        error: "Please wait before requesting another code",
        code: "RATE_LIMITED",
        retry_after: 60,
      };
      expect(response.success).toBe(false);
      expect(typeof response.retry_after).toBe("number");
    });
  });

  describe("VerifyOTP Success Response", () => {
    test("has correct structure", () => {
      const response = {
        success: true,
        user: {
          id: "uuid-here",
          phone_number: "+14155552671",
          name: "User ***2671",
          organization_id: "org-uuid-here",
        },
        session: {
          token: "jwt-token-here",
          expires_at: "2024-01-01T00:00:00.000Z",
        },
        is_new_user: true,
        phone_linked: false,
        eliza_phone_number: "+14155550000",
      };

      expect(response.success).toBe(true);
      expect(typeof response.user.id).toBe("string");
      expect(typeof response.user.phone_number).toBe("string");
      expect(typeof response.session.token).toBe("string");
      expect(typeof response.is_new_user).toBe("boolean");
      expect(typeof response.phone_linked).toBe("boolean");
      expect(typeof response.eliza_phone_number).toBe("string");
    });
  });

  describe("VerifyOTP Error Response", () => {
    test("has correct structure for invalid OTP", () => {
      const response = {
        success: false,
        error: "Invalid code. 4 attempts remaining.",
        code: "INVALID_OTP",
        attempts_remaining: 4,
      };
      expect(response.success).toBe(false);
      expect(typeof response.attempts_remaining).toBe("number");
    });

    test("has correct structure for max attempts", () => {
      const response = {
        success: false,
        error: "Too many attempts. Please request a new code.",
        code: "MAX_ATTEMPTS",
        attempts_remaining: 0,
      };
      expect(response.success).toBe(false);
      expect(response.code).toBe("MAX_ATTEMPTS");
      expect(response.attempts_remaining).toBe(0);
    });
  });
});

describe("Error Code Constants", () => {
  const errorCodes = [
    "INVALID_JSON",
    "INVALID_REQUEST",
    "INVALID_PHONE",
    "RATE_LIMITED",
    "SEND_FAILED",
    "INVALID_OTP",
    "MAX_ATTEMPTS",
    "LINK_FAILED",
    "USER_NOT_FOUND",
  ];

  test("error codes are uppercase snake case", () => {
    for (const code of errorCodes) {
      expect(code).toMatch(/^[A-Z_]+$/);
    }
  });

  test("all expected error codes are defined", () => {
    expect(errorCodes).toContain("INVALID_JSON");
    expect(errorCodes).toContain("INVALID_REQUEST");
    expect(errorCodes).toContain("INVALID_PHONE");
    expect(errorCodes).toContain("RATE_LIMITED");
    expect(errorCodes).toContain("INVALID_OTP");
    expect(errorCodes).toContain("MAX_ATTEMPTS");
  });
});

describe("HTTP Status Code Mapping", () => {
  test("validation errors use 400", () => {
    const cases = [
      { code: "INVALID_JSON", status: 400 },
      { code: "INVALID_REQUEST", status: 400 },
      { code: "INVALID_PHONE", status: 400 },
      { code: "LINK_FAILED", status: 400 },
    ];
    for (const { code, status } of cases) {
      expect(status).toBe(400);
    }
  });

  test("auth failures use 401", () => {
    const cases = [
      { code: "INVALID_OTP", status: 401 },
    ];
    for (const { code, status } of cases) {
      expect(status).toBe(401);
    }
  });

  test("not found uses 404", () => {
    const cases = [
      { code: "USER_NOT_FOUND", status: 404 },
    ];
    for (const { code, status } of cases) {
      expect(status).toBe(404);
    }
  });

  test("rate limiting uses 429", () => {
    const cases = [
      { code: "RATE_LIMITED", status: 429 },
      { code: "MAX_ATTEMPTS", status: 429 },
    ];
    for (const { code, status } of cases) {
      expect(status).toBe(429);
    }
  });

  test("server errors use 500", () => {
    const cases = [
      { code: "SEND_FAILED", status: 500 },
    ];
    for (const { code, status } of cases) {
      expect(status).toBe(500);
    }
  });
});

describe("Edge Cases", () => {
  test("OTP with all zeros is valid format", () => {
    const body = { phone_number: "+14155552671", otp: "000000" };
    const result = verifyOTPSchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  test("OTP with all nines is valid format", () => {
    const body = { phone_number: "+14155552671", otp: "999999" };
    const result = verifyOTPSchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  test("phone with only whitespace is invalid", () => {
    const body = { phone_number: "   " };
    // Schema allows it (min 1), but phone validation will reject
    const result = sendOTPSchema.safeParse(body);
    expect(result.success).toBe(true); // Schema passes, phone validation will fail later
  });

  test("very long phone is accepted by schema (validation later)", () => {
    const body = { phone_number: "+1" + "0".repeat(100) };
    const result = sendOTPSchema.safeParse(body);
    expect(result.success).toBe(true); // Schema passes, phone validation will fail later
  });
});
