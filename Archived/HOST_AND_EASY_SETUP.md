# Should we host the MCP? How to make it easy

## Best option when you already host APIs on AWS: **Hosted MCP**

If you already run the OASIS (and related) APIs on AWS, **hosting the MCP there is the best option.**

- **Same infra:** MCP is one more service (e.g. ECS task or Lambda) in the same account. It calls your APIs over the internal network (VPC); no extra public surface beyond the MCP endpoint.
- **Same auth:** Reuse the same API key or JWT you use for the API. The MCP endpoint validates the key and forwards requests; users get one key for both API and Cursor.
- **Zero install for users:** They add a URL and key in Cursor — no Node, no clone, no path. Easiest onboarding.
- **You control versions:** Everyone uses the MCP version you deploy; no drift from old NPM installs.
- **Low marginal cost:** You’re already doing ops, monitoring, and auth for the API; hosting MCP is a small addition.

**Recommendation:** Ship **hosted MCP** as the primary (“Add by URL” on the site and in docs). Keep **NPM** as a fallback for users who prefer to run the server locally (e.g. air-gapped or custom env).

---

## Short answers (generic)

- **Host the MCP?** If you have AWS and already host the APIs → **yes, host the MCP** and make “Add by URL” the default. If you had no infra, NPM-only would be simpler.
- **Make it easy:** (1) **Host** an SSE (or Streamable HTTP) MCP endpoint on AWS; document URL + API key. (2) **Publish to NPM** for local/fallback. (3) **Site:** “Copy MCP config” for both URL and NPM. (4) **Config generator** optional.

---

## 1. Host the MCP?

### What “hosting” means

Run the MCP as a **remote server** (HTTP/SSE or Streamable HTTP). Cursor (and other clients) add it by **URL** instead of running a local process. User’s `mcp.json` would look like:

```json
{
  "mcpServers": {
    "oasis-unified": {
      "url": "https://mcp.oasisweb4.com/sse",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY_OR_JWT"
      }
    }
  }
}
```

No Node, no clone, no path — just URL + auth.

### Pros of hosting

- **Zero install:** No `git clone`, `npm install`, `npm run build`, or path in `mcp.json`.
- **Always current:** You deploy once; everyone gets the same tools and fixes.
- **Easier for non-devs:** “Add this URL in Cursor” is simpler than “install Node, clone, build, edit path.”
- **Unified auth:** One API key / JWT can gate both API and MCP (rate limits, licensing).

### Cons of hosting

- **Ops:** You run and monitor a service (reliability, scaling, restarts).
- **Auth and abuse:** Need to enforce API keys or JWT, rate limits, and optional license checks so the endpoint isn’t abused.
- **Code change:** Current MCP is **stdio only**. You’d add an **SSE** (or Streamable HTTP) transport and a small HTTP server (see below).
- **Latency:** Every tool call goes over the network instead of local process (usually fine for API-backed tools).

### Recommendation

- **If you already host APIs on AWS:** **Host the MCP** first (see top of this doc). Add SSE/HTTP transport, deploy next to your APIs, document “Add by URL.” Publish NPM as fallback.
- **If you have no infra yet:** Start with **NPM** to remove clone/path friction; add hosted MCP later when you have a place to run it.

---

## 2. Make it easy: concrete steps

### A. Publish to NPM (high impact, no hosting)

The repo already has `package.json` with `name: "@oasis-unified/mcp-server"` and `bin: { "oasis-mcp": "./dist/index.js" }`.

1. **Publish** (when ready):  
   `npm publish --access public` (or `restricted` if you use private packages).

2. **User install (global):**
   ```bash
   npm install -g @oasis-unified/mcp-server
   ```
   Then in `~/.cursor/mcp.json`:
   ```json
   {
     "mcpServers": {
       "oasis-unified": {
         "command": "oasis-mcp",
         "env": {
           "OASIS_API_URL": "https://api.oasisweb4.com",
           "OASIS_MCP_LICENSE_KEY": ""
         }
       }
     }
   }
   ```
   **No path to repo.** Works the same on Windows/macOS/Linux if `oasis-mcp` is on PATH.

3. **Or use npx (no global install):**
   ```json
   {
     "mcpServers": {
       "oasis-unified": {
         "command": "npx",
         "args": ["-y", "@oasis-unified/mcp-server"],
         "env": {
           "OASIS_API_URL": "https://api.oasisweb4.com",
           "OASIS_MCP_LICENSE_KEY": ""
         }
       }
     }
   }
   ```
   First run may be a bit slower; no clone or build.

**Site / docs:** Replace “clone and set path” with “Install: `npm install -g @oasis-unified/mcp-server`” and the snippet above. “Copy MCP config” on the site can copy the **NPM-based** config (command `oasis-mcp` or npx) instead of the path-based one.

### B. Hosted MCP (optional phase 2)

To support **add by URL** in Cursor:

1. **Add SSE (or Streamable HTTP) transport** in this repo:
   - The MCP SDK supports (or will support) SSE; check `@modelcontextprotocol/sdk` for `StreamableHTTPTransport` or SSE server helpers.
   - In `src/index.ts`, if `config.mode === 'http'`, start an HTTP server and connect the server to an SSE/Streamable transport instead of `StdioServerTransport`.
   - One process: stdio for local, or HTTP for hosted (or two entrypoints: `node dist/index.js` for stdio, `node dist/server.js` for HTTP).

2. **Run it in your infra:**
   - Deploy the Node process (e.g. on Fly, Railway, or same host as api.oasisweb4.com).
   - Expose `https://mcp.oasisweb4.com/sse` (or your chosen path).
   - Env: `OASIS_API_URL=https://api.oasisweb4.com`, and optionally validate a bearer token or API key on each request (reuse existing license or API key).

3. **Document for users:**
   - “Add OASIS MCP by URL” → paste URL + API key in Cursor MCP settings.
   - Keep NPM as the primary option for developers.

### C. Site: “Copy MCP config” and config generator

- **Today:** “Copy MCP config” already copies a JSON snippet. **Change it** to the **NPM** version (`"command": "oasis-mcp"` or npx) so nobody needs a path. Add one line: “Run: `npm install -g @oasis-unified/mcp-server`” (or “No install: use npx in the snippet”).
- **Optional:** Add a small **config generator** on the MCP product page:
  - Choose: “Install via NPM” vs “Use hosted (URL)”.
  - Output the exact `mcp.json` block (and optional `npm install` line). Users paste into `~/.cursor/mcp.json`.

### D. Cursor MCP directory

- Submit OASIS to the [Cursor MCP directory](https://cursor.com/docs/context/mcp/directory) (or equivalent) with:
  - Short description.
  - Install: NPM command and/or hosted URL.
  - Link to docs (GitBook, README, or oasisweb4.com/products/mcp.html).

---

## 3. Summary

| Question | Answer |
|----------|--------|
| **Should we host the MCP?** | **If you have AWS and host the APIs:** Yes — host MCP there and make “Add by URL” the default. **If no infra:** NPM first; host later. |
| **How to make it easy?** | (1) **Hosted (primary):** Add SSE/HTTP transport, deploy on AWS, document URL + API key; “Copy MCP config” offers the URL snippet. (2) **NPM (fallback):** Publish and document for local/air-gapped use. (3) **Site:** Support both URL and NPM. (4) **Cursor MCP directory** with URL and/or NPM. |

With AWS already in place, **hosted MCP** gives the best UX (zero install) and fits naturally next to your existing APIs.