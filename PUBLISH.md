# Publishing checklist (owner steps)

Everything below requires accounts/credentials only you have. The code, build, and smoke tests are already done.

## 1. Create the GitHub repo and push

```bash
cd /Users/rushiraj/Desktop/privacypage-mcp
gh repo create rushi053/privacypage-mcp --public --description "MCP server for PrivacyPage — let AI agents generate privacy policies, ToS, EULAs, cookie policies & disclaimers" --source . --push
# or manually: create github.com/rushi053/privacypage-mcp, then:
#   git remote add origin git@github.com:rushi053/privacypage-mcp.git
#   git push -u origin main
```

Then on the repo page: add topics `mcp`, `model-context-protocol`, `privacy-policy`, `legal`, `ai-agents`; set the website to `https://privacypage.io`.

## 2. Publish to npm

```bash
cd /Users/rushiraj/Desktop/privacypage-mcp
npm login                # if not already
npm publish              # prepublishOnly runs the build automatically
npx privacypage-mcp      # verify: should print "PrivacyPage MCP server running on stdio"
```

Notes:
- The package name `privacypage-mcp` was unclaimed as of 2026-08-30.
- `package.json` already contains the `mcpName` field (`io.github.rushi053/privacypage-mcp`) required by the official MCP Registry — publish to npm BEFORE the registry step so ownership verification passes.

## 3. Publish to the official MCP Registry

The official registry (registry.modelcontextprotocol.io) is the canonical source that community directories sync from. Uses the `mcp-publisher` CLI:

```bash
brew install mcp-publisher            # or download a binary from github.com/modelcontextprotocol/registry
cd /Users/rushiraj/Desktop/privacypage-mcp
mcp-publisher init                    # generates server.json; check name = io.github.rushi053/privacypage-mcp,
                                      # package identifier = privacypage-mcp, transport = stdio
mcp-publisher login github            # authenticates your io.github.rushi053 namespace
mcp-publisher publish
# verify:
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.rushi053/privacypage-mcp"
```

Commit the generated `server.json` to the repo. Docs: https://modelcontextprotocol.io/registry/quickstart

## 4. Submit to community directories

Most of these auto-sync from the official registry within days, but direct submission is faster and lets you claim the listing:

| Directory | How to submit |
| --- | --- |
| **mcp.so** | Submit via the "Submit" form on https://mcp.so (GitHub URL) |
| **Glama** | https://glama.ai/mcp/servers — auto-indexes from the registry; claim the listing with your GitHub account to get the "Official" tier |
| **Smithery** | See "Submit to Smithery" below — requires publishing an MCPB bundle, NOT the npm URL |
| **PulseMCP** | https://www.pulsemcp.com — auto-syncs from the official registry (PulseMCP is a founding registry backer); use their contact form to expedite/claim |
| **mcpservers.org** | Submit a PR to the site's repo or use its submit form |

Also consider a PR to the README of the `modelcontextprotocol/servers` GitHub repo — the "community servers" list there is still one of the highest-traffic discovery pages.

### Submit to Smithery (MCPB bundle)

Smithery's URL flow is only for hosted Streamable-HTTP servers — pasting the npm URL fails with a 403 scan error. For local stdio servers, Smithery distributes a pre-built [MCPB bundle](https://github.com/anthropics/mcpb) instead. The repo has a `manifest.json` (MCPB manifest) and `.mcpbignore` for this.

Build the bundle:

```bash
cd /Users/rushiraj/Desktop/privacypage-mcp
npm run build
npm prune --omit=dev                       # bundle prod deps only
npx -y @anthropic-ai/mcpb pack . privacypage-mcp.mcpb
npm install                                # restore dev deps
```

Publish it (CLI, recommended):

```bash
npm install -g smithery@latest
smithery auth login
smithery mcp publish ./privacypage-mcp.mcpb -n rushi053/privacypage-mcp
```

Or via UI: https://smithery.ai/new → choose the **Local (MCPB bundle)** option → upload `privacypage-mcp.mcpb` → complete the flow. The license-key config UI comes from `user_config` in `manifest.json`.

When bumping versions, also update `version` in `manifest.json`, re-pack, and re-publish.

## 5. Announce

- Add a "Works with Claude, Cursor, and any MCP client" section + GitHub link to privacypage.io (footer and/or a `/mcp` landing page).
- Post: X/Twitter, r/mcp, r/SideProject, Hacker News (Show HN: "Show HN: MCP server that generates privacy policies while your AI builds your app").
- The strategic pitch to lead with: apps built with Lovable/Bolt/v0/Cursor all need a privacy policy before they can ship — now the agent handles it mid-build.

## 6. After publishing

- Tag the release: `git tag v0.1.0 && git push --tags`, then create a GitHub Release.
- Watch for issues at github.com/rushi053/privacypage-mcp/issues.
- When bumping versions: update `version` in both `package.json` and `server.json`, `npm publish`, then `mcp-publisher publish` again.
