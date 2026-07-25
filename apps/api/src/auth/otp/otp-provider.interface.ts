export const OTP_PROVIDER = Symbol('OTP_PROVIDER');

export interface OtpSendResult {
  /** Provider-side message id, stored for support and delivery troubleshooting. */
  messageId: string;
  /**
   * Only populated by the mock provider in non-production environments so local and
   * automated tests can complete the flow without an SMS gateway. Real providers
   * must never return the code.
   */
  debugCode?: string;
}

/**
 * Swap point for SMS delivery. Adding a provider means implementing this interface
 * and registering it in OtpModule — no call site changes (see ADR: OTP abstraction).
 */
export interface OtpProvider {
  readonly name: string;
  send(phoneE164: string, code: string, purpose: string): Promise<OtpSendResult>;
}
