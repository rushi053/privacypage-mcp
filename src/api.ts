/**
 * Thin HTTP client for the PrivacyPage production API.
 *
 * Endpoints:
 *   POST /api/generate              — privacy policy
 *   POST /api/generate/tos          — terms of service
 *   POST /api/generate/eula         — EULA
 *   POST /api/generate/cookie      — cookie policy
 *   POST /api/generate/disclaimer  — disclaimer
 *   GET  /api/document/{id}?license={key} — full document (requires license)
 *
 * Generate endpoints are rate-limited to 10 generations/hour/IP (429).
 */

const BASE_URL = process.env.PRIVACYPAGE_API_URL || "https://privacypage.io";

export interface GenerateResult {
  documentId: string;
  preview: string;
  totalLines: number;
  /** Set when the API returned the full document (legacy deployments). */
  fullContent?: string;
}

/** Error carrying a message meant to be shown to the calling agent verbatim. */
export class ApiError extends Error {
  constructor(message: string, public readonly retryable = false) {
    super(message);
    this.name = "ApiError";
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new ApiError(
      `Could not reach the PrivacyPage API (${detail}). Check your network connection and try again.`,
      true
    );
  }
}

export async function generateDocument(
  docType: "privacy" | "tos" | "eula" | "cookie" | "disclaimer",
  inputs: Record<string, string>
): Promise<GenerateResult> {
  const path = docType === "privacy" ? "/api/generate" : `/api/generate/${docType}`;
  const res = await request(path, { method: "POST", body: JSON.stringify(inputs) });

  let json: Record<string, unknown>;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(`Unexpected response from the PrivacyPage API (HTTP ${res.status}).`, true);
  }

  if (res.status === 429) {
    throw new ApiError(
      typeof json.message === "string"
        ? `${json.message} (Rate limit: 10 document generations per hour per IP. Wait before retrying.)`
        : "Rate limited: too many documents generated. Wait up to an hour before retrying.",
      true
    );
  }
  if (!res.ok) {
    const msg = typeof json.message === "string" ? json.message
      : typeof json.error === "string" ? json.error
      : `HTTP ${res.status}`;
    throw new ApiError(`Document generation failed: ${msg}`, res.status >= 500);
  }

  // Legacy deployments without document storage return the full text directly.
  if (typeof json.policy === "string" && json.legacyFull) {
    return {
      documentId: "",
      preview: json.policy,
      totalLines: json.policy.split("\n").length,
      fullContent: json.policy,
    };
  }

  if (typeof json.documentId !== "string" || typeof json.preview !== "string") {
    throw new ApiError("The PrivacyPage API returned an unexpected response shape.", true);
  }

  return {
    documentId: json.documentId,
    preview: json.preview,
    totalLines: typeof json.totalLines === "number" ? json.totalLines : 0,
  };
}

export async function getFullDocument(
  documentId: string,
  licenseKey: string
): Promise<{ content: string; docType: string }> {
  const res = await request(
    `/api/document/${encodeURIComponent(documentId)}?license=${encodeURIComponent(licenseKey)}`
  );

  let json: Record<string, unknown>;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(`Unexpected response from the PrivacyPage API (HTTP ${res.status}).`, true);
  }

  if (res.ok && typeof json.content === "string") {
    return { content: json.content, docType: typeof json.docType === "string" ? json.docType : "" };
  }

  // The API intentionally returns 404 for both missing documents and invalid
  // licenses; the body's error code distinguishes them.
  if (json.error === "locked") {
    throw new ApiError(
      "This license key does not unlock this document. Verify the key, or purchase access at https://privacypage.io ($9.99 single document / $24.99 bundle, one-time)."
    );
  }
  if (json.error === "not_found") {
    throw new ApiError("No document exists with that documentId. Generate a document first.");
  }
  if (res.status === 401) {
    throw new ApiError(
      "A license key is required. Pass licenseKey or set the PRIVACYPAGE_LICENSE_KEY environment variable. Purchase at https://privacypage.io."
    );
  }
  throw new ApiError(
    `Could not fetch the document: ${typeof json.error === "string" ? json.error : `HTTP ${res.status}`}`,
    res.status >= 500
  );
}
