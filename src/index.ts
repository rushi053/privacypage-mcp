#!/usr/bin/env node
/**
 * PrivacyPage MCP server — generate legal documents (privacy policy, terms of
 * service, EULA, cookie policy, disclaimer) for the app you're building via
 * the privacypage.io API, over stdio.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ApiError, generateDocument, getFullDocument } from "./api.js";

const server = new McpServer({
  name: "privacypage",
  version: "0.1.0",
});

const PURCHASE_NOTE =
  "Full document: purchase at https://privacypage.io (one-time $9.99 single document or $24.99 all-documents bundle, no subscription) " +
  "then call get_full_document with your license key, or set the PRIVACYPAGE_LICENSE_KEY environment variable.";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function errorResult(e: unknown): ToolResult {
  const message =
    e instanceof ApiError ? e.message : `Unexpected error: ${e instanceof Error ? e.message : String(e)}`;
  return { content: [{ type: "text", text: message }], isError: true };
}

async function runGenerate(
  docType: "privacy" | "tos" | "eula" | "cookie" | "disclaimer",
  label: string,
  inputs: Record<string, string>
): Promise<ToolResult> {
  try {
    const result = await generateDocument(docType, inputs);
    if (result.fullContent) {
      return { content: [{ type: "text", text: result.fullContent }] };
    }
    const text = [
      `${label} generated. Preview (first 25 of ${result.totalLines} lines):`,
      "",
      result.preview,
      "",
      "---",
      `documentId: ${result.documentId}`,
      PURCHASE_NOTE,
    ].join("\n");
    return { content: [{ type: "text", text }] };
  } catch (e) {
    return errorResult(e);
  }
}

/** Join a multi-select list the way the PrivacyPage wizard does. */
const list = (values: string[]) => values.join(", ");

server.registerTool(
  "generate_privacy_policy",
  {
    title: "Generate Privacy Policy",
    description:
      "Generate a GDPR/CCPA/COPPA-aware privacy policy for an app or website using privacypage.io. " +
      "Returns a free 25-line preview and a documentId; the full document is unlocked with a one-time license ($9.99, no subscription). " +
      "Fill the fields from what you know about the app being built.",
    inputSchema: {
      appName: z.string().describe("Name of the app or website, e.g. 'MyApp'"),
      platform: z
        .enum(["iOS", "Android", "Both (iOS & Android)", "Web App", "All Platforms"])
        .describe("Platform the app runs on"),
      companyName: z.string().describe("Company or developer name, e.g. 'Acme Inc.'"),
      contactEmail: z.string().describe("Contact email for privacy inquiries, e.g. 'privacy@acme.com'"),
      websiteUrl: z.string().optional().describe("Website URL, if any, e.g. 'https://myapp.com'"),
      dataCollected: z
        .array(z.string())
        .min(1)
        .describe(
          "Types of data the app collects. Common values: 'Name & Email', 'Phone Number', 'Location Data', " +
            "'Photos / Camera', 'Device Info', 'Usage Analytics', 'Payment Info', 'Health Data', 'No Personal Data'. " +
            "Free-form values are also accepted."
        ),
      thirdPartyServices: z
        .array(z.string())
        .min(1)
        .describe(
          "Third-party services/SDKs the app uses. Common values: 'Google Analytics / Firebase', 'Facebook SDK', " +
            "'AdMob / Ads', 'Stripe / Payments', 'Sentry / Crashlytics', 'Mixpanel / Amplitude', 'Push Notifications', 'None'. " +
            "Free-form values are also accepted."
        ),
      childrenUnder13: z
        .boolean()
        .describe("Whether the app is directed at children under 13 (COPPA)"),
    },
  },
  async (args) =>
    runGenerate("privacy", "Privacy policy", {
      appName: args.appName,
      platform: args.platform,
      companyName: args.companyName,
      contactEmail: args.contactEmail,
      ...(args.websiteUrl ? { websiteUrl: args.websiteUrl } : {}),
      dataCollected: list(args.dataCollected),
      thirdParties: list(args.thirdPartyServices),
      childrenData: args.childrenUnder13 ? "Yes" : "No",
      docType: "privacy",
    })
);

server.registerTool(
  "generate_terms_of_service",
  {
    title: "Generate Terms of Service",
    description:
      "Generate a Terms of Service agreement for an app or service using privacypage.io. " +
      "Returns a free 25-line preview and a documentId; the full document is unlocked with a one-time license ($9.99, no subscription).",
    inputSchema: {
      serviceName: z.string().describe("Name of the app or service, e.g. 'MyApp'"),
      companyName: z.string().describe("Company name, e.g. 'Acme Inc.'"),
      contactEmail: z.string().describe("Legal contact email, e.g. 'legal@acme.com'"),
      platform: z
        .enum(["Web App", "Mobile App (iOS/Android)", "Both", "SaaS Platform"])
        .describe("Platform the service runs on"),
      keyPolicies: z
        .array(z.string())
        .min(1)
        .describe(
          "Key policies that apply. Common values: 'Refunds allowed', 'No refunds', 'User-generated content', " +
            "'Account termination rights', 'Subscription auto-renewal', 'Free trial terms', 'Intellectual property protection'."
        ),
      jurisdiction: z.string().describe("Governing law jurisdiction, e.g. 'California, USA' or 'London, UK'"),
    },
  },
  async (args) =>
    runGenerate("tos", "Terms of service", {
      serviceName: args.serviceName,
      companyInfo: `${args.companyName}, ${args.contactEmail}`,
      platform: args.platform,
      keyPolicies: list(args.keyPolicies),
      jurisdiction: args.jurisdiction,
      docType: "tos",
    })
);

server.registerTool(
  "generate_eula",
  {
    title: "Generate EULA",
    description:
      "Generate an End-User License Agreement (EULA) for a software application using privacypage.io. " +
      "Returns a free 25-line preview and a documentId; the full document is unlocked with a one-time license ($9.99, no subscription).",
    inputSchema: {
      appName: z.string().describe("Name of the application, e.g. 'MyApp'"),
      companyName: z.string().describe("Company or developer name, e.g. 'Acme Inc.'"),
      platform: z
        .enum(["iOS", "Android", "Desktop (Windows/Mac)", "Web", "All Platforms"])
        .describe("Platform the application runs on"),
      licenseType: z
        .enum(["Free", "Paid (one-time)", "Freemium", "Subscription"])
        .describe("How the application is licensed/sold"),
      restrictions: z
        .array(z.string())
        .min(1)
        .describe(
          "Usage restrictions to include. Common values: 'No reverse engineering', 'No redistribution', " +
            "'No modifications', 'No commercial use (free apps)', 'No resale', 'Single user license'."
        ),
    },
  },
  async (args) =>
    runGenerate("eula", "EULA", {
      appName: `${args.appName} by ${args.companyName}`,
      platform: args.platform,
      licenseType: args.licenseType,
      restrictions: list(args.restrictions),
      docType: "eula",
    })
);

server.registerTool(
  "generate_cookie_policy",
  {
    title: "Generate Cookie Policy",
    description:
      "Generate a GDPR-aware cookie policy for a website or web app using privacypage.io. " +
      "Returns a free 25-line preview and a documentId; the full document is unlocked with a one-time license ($9.99, no subscription).",
    inputSchema: {
      websiteName: z.string().describe("Name of the website or app, e.g. 'MyApp'"),
      websiteUrl: z.string().optional().describe("Website URL, e.g. 'https://myapp.com'"),
      cookieTypes: z
        .array(z.string())
        .min(1)
        .describe(
          "Cookie categories the site uses. Common values: 'Essential cookies', 'Analytics cookies', " +
            "'Advertising cookies', 'Functional cookies', 'Performance cookies', 'Social media cookies'."
        ),
      thirdPartyServices: z
        .array(z.string())
        .min(1)
        .describe(
          "Third-party services that set cookies. Common values: 'Google Analytics', 'Google Ads', 'Facebook Pixel', " +
            "'Twitter/X tracking', 'LinkedIn Insight', 'Hotjar', 'Stripe', 'None'."
        ),
      contactEmail: z.string().describe("Contact email, e.g. 'privacy@myapp.com'"),
    },
  },
  async (args) =>
    runGenerate("cookie", "Cookie policy", {
      websiteName: args.websiteUrl ? `${args.websiteName}, ${args.websiteUrl}` : args.websiteName,
      cookieTypes: list(args.cookieTypes),
      thirdPartyServices: list(args.thirdPartyServices),
      contactEmail: args.contactEmail,
      docType: "cookie",
    })
);

server.registerTool(
  "generate_disclaimer",
  {
    title: "Generate Disclaimer",
    description:
      "Generate a liability disclaimer (general, medical, financial, fitness, legal, or affiliate) for a website or app using privacypage.io. " +
      "Returns a free 25-line preview and a documentId; the full document is unlocked with a one-time license ($9.99, no subscription).",
    inputSchema: {
      websiteName: z.string().describe("Name of the website or app, e.g. 'MyApp'"),
      companyName: z.string().optional().describe("Company name, if different from the site name, e.g. 'Acme Inc.'"),
      disclaimerType: z
        .enum([
          "General (informational content)",
          "Medical (health information)",
          "Financial (investment/trading)",
          "Fitness (workout/nutrition)",
          "Legal (legal information)",
          "Affiliate (affiliate links/commissions)",
        ])
        .describe("The type of disclaimer that matches the site's content"),
      externalLinks: z.boolean().describe("Whether the site links to external websites"),
      contactEmail: z.string().describe("Contact email, e.g. 'info@myapp.com'"),
    },
  },
  async (args) =>
    runGenerate("disclaimer", "Disclaimer", {
      websiteName: args.companyName ? `${args.websiteName} by ${args.companyName}` : args.websiteName,
      disclaimerType: args.disclaimerType,
      externalLinks: args.externalLinks ? "Yes" : "No",
      contactEmail: args.contactEmail,
      docType: "disclaimer",
    })
);

server.registerTool(
  "get_full_document",
  {
    title: "Get Full Document",
    description:
      "Fetch the full text of a previously generated document using a PrivacyPage license key. " +
      "Licenses are one-time purchases at https://privacypage.io ($9.99 single document, $24.99 all-documents bundle — no subscription). " +
      "If licenseKey is omitted, the PRIVACYPAGE_LICENSE_KEY environment variable is used.",
    inputSchema: {
      documentId: z.string().describe("The documentId returned by a generate_* tool"),
      licenseKey: z
        .string()
        .optional()
        .describe("PrivacyPage license key. Falls back to the PRIVACYPAGE_LICENSE_KEY environment variable."),
    },
  },
  async (args) => {
    const key = args.licenseKey || process.env.PRIVACYPAGE_LICENSE_KEY;
    if (!key) {
      return {
        content: [
          {
            type: "text" as const,
            text:
              "No license key provided and PRIVACYPAGE_LICENSE_KEY is not set. " +
              "Purchase a one-time license at https://privacypage.io ($9.99 single / $24.99 bundle), " +
              "then pass it as licenseKey or set the environment variable.",
          },
        ],
        isError: true,
      };
    }
    try {
      const { content } = await getFullDocument(args.documentId, key);
      return { content: [{ type: "text" as const, text: content }] };
    } catch (e) {
      return errorResult(e);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout carries the MCP protocol; log to stderr only.
  console.error("PrivacyPage MCP server running on stdio");
}

main().catch((e) => {
  console.error("Fatal error starting PrivacyPage MCP server:", e);
  process.exit(1);
});
