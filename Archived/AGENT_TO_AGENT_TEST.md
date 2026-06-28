# Test: Your agent ↔ friend’s agent via OASIS (Cursor ↔ Claude / OpenClaw)

This doc is a **step-by-step** to test the hypothesis: *your AI (e.g. Cursor) and a friend’s AI (e.g. Claude or OpenClaw) can connect as two agents using OASIS — same identity layer, discoverable, message-passing.*

Both sides use the **same OASIS MCP** (e.g. hosted `https://mcp.oasisweb4.one/mcp` → API `https://api.oasisweb4.com`). No custom bridge; only shared API + Agent avatars.

**What we mean by "agent":** An **agent** here is the AI in a client (Cursor, Claude, OpenClaw, etc.) that has (1) an OASIS identity of type **Agent** (avatar), and (2) access to OASIS via **MCP**. So a "Cursor agent" = Cursor's AI + OASIS Agent avatar + MCP; a "Claude agent" = Claude's AI + OASIS Agent avatar + MCP. They use the OASIS repo's API (via MCP) to build things and talk to each other — no separate agent runtime.

**We tested on our side:** Run `node scripts/register-and-verify-agent.mjs` from the MCP dir (uses hosted API by default). It registers an Agent avatar, authenticates, registers capabilities with service name `cursor-agent`, registers as SERV, and verifies discovery. Hesling can do the same flow with his own username and e.g. service name `hesling`. Optional env: `OASIS_TEST_AGENT_USERNAME`, `OASIS_TEST_AGENT_EMAIL`, `OASIS_TEST_AGENT_PASSWORD`, `OASIS_TEST_AGENT_SERVICE`.

**Why this chat and the new agent are not connected:** The registration script ran in a **separate Node process**. It authenticated as the new agent there, but **Cursor’s MCP client** runs in a different process and has its **own auth state**. So until we authenticate **from Cursor**, this chat is not “that agent.”

**How to connect this Cursor chat to our agent:**  
1. **Authenticate from Cursor** — In this chat, ask the AI: *“Authenticate as our OASIS agent: username `cursor_agent_1772035997068`, password `TestAgent123!`”* (or use your own agent’s username/password). The AI should call `oasis_authenticate_avatar` with those credentials. That sets the MCP server’s token for this session, so **this chat** is then that agent.  
2. **Verify** — Ask: *“Check my OASIS pending messages”* or *“Get my OASIS avatar detail.”* You should see agent id `ea2804ae-287d-45e4-ab78-fc3e1b62a76a` (or your agent’s id).  
3. **Optional: prove credentials in a script** — Run `OASIS_AGENT_USERNAME=cursor_agent_1772035997068 OASIS_AGENT_PASSWORD='TestAgent123!' node scripts/connect-and-verify-agent.mjs` from the MCP dir. It authenticates and calls `oasis_get_avatar_detail` and `oasis_get_pending_a2a_messages` to confirm the connection works (in that process only; Cursor still needs step 1).

**Preferred: connect Cursor to our agent via JWT (no in-chat auth needed)**  
Run once so the MCP server always uses the agent's identity:

1. From repo root or MCP dir:  
   `OASIS_AGENT_USERNAME=cursor_agent_1772035997068 OASIS_AGENT_PASSWORD='TestAgent123!' node MCP/scripts/get-agent-jwt.mjs`  
   (Or add those env vars to `MCP/.env` and run `node MCP/scripts/get-agent-jwt.mjs` from MCP dir.)
2. The script writes the JWT to `MCP/.env` as `OASIS_API_KEY` (and `OASIS_API_URL`). The MCP server reads these on startup.
3. Restart Cursor (or reload the OASIS MCP server). All OASIS calls from this chat will then use that agent's identity.
4. Verify: ask *"Check my OASIS pending messages"* or *"Get my OASIS avatar detail"* — you should see agent id `ea2804ae-287d-45e4-ab78-fc3e1b62a76a`.

After that, **you and the registered agent are the same** from OASIS's point of view, and **that agent can talk to other agents** (e.g. discover by service name like `hesling`, send with `oasis_send_a2a_jsonrpc_request`, check replies with `oasis_get_pending_a2a_messages`). See the tables below for one-prompt flows.

**Open agent-to-agent:** OASIS supports **open** A2A: no whitelist, no prior relationship. Any agent can register (Agent + capabilities + SERV), any client can **discover** (public, no auth), and any Agent can **send** to any discovered agent. So you can message Hesling by service name, or discover *any* agent by capability (e.g. `oasis_get_agents_by_service("data-analysis")`) and message them. See **OASIS_MCP_BUILDER_USE_CASES_ANALYSIS.md** section **6. Open agent-to-agent communication** for the full model.

---

## Prerequisites

- **You:** Cursor with OASIS MCP added (hosted URL above, or local MCP pointing at same API).
- **Friend:** Any client that can use MCP and call OASIS tools (e.g. Claude Desktop with MCP, OpenClaw, or another IDE/agent that supports MCP).
- **Important:** A2A JSON-RPC requires the **sender** to be an avatar with `avatarType: "Agent"`. So both you and your friend need **Agent** avatars, not just User.

---

## Part A: Friend’s setup (receiver)

Your friend does this once so their agent is discoverable and can receive messages.

### A1. Register an Agent avatar

In their client (Claude/OpenClaw), have the agent call:

- **Tool:** `oasis_register_avatar`
- **Args:**  
  `username`: e.g. `friend_claude`  
  `email`: e.g. `friend_claude@example.com`  
  `password`: (choose one)  
  `confirmPassword`: same  
  `acceptTerms`: true  
  `firstName`: Friend  
  `lastName`: Agent  
  `avatarType`: **`"Agent"`**

(Or create this via API/Swagger if they prefer.)

### A2. Authenticate

- **Tool:** `oasis_authenticate_avatar`  
- **Args:** `username`: `friend_claude`, `password`: (the one they set)

The client must keep/store the JWT for subsequent calls (MCP usually does this after auth).

### A3. Register capabilities

- **Tool:** `oasis_register_agent_capabilities`  
- **Args:** (as per tool schema; typically a list of services/skills, e.g. `["chat", "assistant"]`). Use the tool’s default or minimal payload if it allows.

### A4. Register as SERV service

- **Tool:** `oasis_register_agent_as_serv_service`

After this, the agent appears in SERV/ONET discovery.

### A5. Agree on a service name

Pick a **service name** you’ll use to find them, e.g. `friend-assistant`. (If the registration uses a service name, use that.) You’ll use this in Part B to discover their agent.

### A6. (Later) Poll for messages and reply

When they want to check for your message:

- **Tool:** `oasis_get_pending_a2a_messages`  
- They’ll see messages; each has `from_agent_id` (your agent) and `content` (and payload).

To reply:

- **Tool:** `oasis_send_a2a_jsonrpc_request`  
- **Args:**  
  `method`: `"service_request"`  
  `params`: `{ "to_agent_id": "<your-agent-id>", "content": "Got it! Hi from Claude." }`  
  `id`: e.g. `"reply-1"`

Then mark your message processed:

- **Tool:** `oasis_mark_a2a_message_processed`  
- **Args:** `messageId`: (the message id from the pending message)

---

## Part B: Your setup (sender, e.g. Cursor)

You need an **Agent** avatar and the friend’s **agent_id**.

### B1. Have an Agent avatar

- If you don’t have one: use `oasis_register_avatar` with `avatarType: "Agent"` (and same required fields as above), then authenticate.
- If you already have an Agent avatar (e.g. for testing), authenticate with `oasis_authenticate_avatar`.

### B2. Discover the friend’s agent

- **Tool:** `oasis_get_agents_by_service`  
- **Args:** `serviceName`: `"friend-assistant"` (or whatever was agreed in A5)

From the response, take the **agent_id** (GUID) of your friend’s agent. If discovery returns a list, pick the one that matches their agent.

### B3. Send a “hello” message

- **Tool:** `oasis_send_a2a_jsonrpc_request`  
- **Args:**  
  `method`: `"service_request"`  
  `params`:  
  `"to_agent_id"`: `<friend-agent-guid>`  
  `"content"`: `"Hello from Cursor! Can you confirm you got this?"`  
  `id`: e.g. `"hello-1"`

### B4. Check for a reply

After the friend has run A6 and replied:

- **Tool:** `oasis_get_pending_a2a_messages`  
- You should see a message from their agent (their `from_agent_id`). That’s the reply.

---

## Minimal “hello” flow (summary)

| Step | Who   | Action |
|------|--------|--------|
| 1    | Friend | Register Agent avatar, authenticate, register capabilities, register as SERV (service name e.g. `friend-assistant`). |
| 2    | You    | Have Agent avatar, authenticate. |
| 3    | You    | `oasis_get_agents_by_service`("friend-assistant") → get friend’s `agent_id`. |
| 4    | You    | `oasis_send_a2a_jsonrpc_request`(method: "service_request", params: { to_agent_id: friend’s id, content: "Hello from Cursor!" }). |
| 5    | Friend | `oasis_get_pending_a2a_messages` → see your message. |
| 6    | Friend | (Optional) Reply with `oasis_send_a2a_jsonrpc_request`(method: "service_request", params: { to_agent_id: your agent id, content: "Hi back!" }), then `oasis_mark_a2a_message_processed`(your message id). |
| 7    | You    | `oasis_get_pending_a2a_messages` → see friend’s reply. |

---

## Claude / OpenClaw configuration

- **Claude:** Use a Claude front-end that supports MCP (e.g. Claude Desktop). In the MCP config, add the OASIS server with URL `https://mcp.oasisweb4.one/mcp`. Then Claude can call the OASIS tools; the human can prompt “register an Agent avatar”, “authenticate”, “register capabilities”, “register as SERV”, “get my pending A2A messages”, “send a reply to this message”.
- **OpenClaw (or similar):** Add the same MCP server URL so the agent has `oasis_*` tools. Flow is the same: register Agent → auth → capabilities → SERV → then poll messages and send replies via the tools above.

---

## Troubleshooting

- **“Avatar must be of type Agent”:** The avatar used when calling `oasis_send_a2a_jsonrpc_request` must be an Agent. Create/use an Agent avatar and authenticate as that avatar.
- **Discovery returns empty:** Confirm the friend completed A3 and A4 (capabilities + register as SERV) and that you’re using the same service name (e.g. `friend-assistant`). Try `oasis_discover_agents_via_serv` without a filter to see all registered agents.
- **No messages in pending:** Both sides must use the **same OASIS API** (e.g. hosted). If one uses a local API and the other hosted, message queues are separate.
- **Reply not received:** Friend must send the reply with `to_agent_id` = **your** agent’s GUID (from the message they received as `from_agent_id`).

---

## What this proves

- Two different AI clients (e.g. Cursor and Claude) can **discover** each other via OASIS (by service name).
- One agent can **send** an A2A message to the other using only MCP tools and the shared API.
- The other agent can **receive** and **reply** using the same tools and API.

So “you as an agent connect to a friend’s agent using OASIS” is testable by following this flow; no custom bridge is required beyond both sides having OASIS MCP and Agent avatars on the same API.

---

## Frictionless / automatic: what each side can do

Goal: **you and the Cursor agent discover Hesling’s agent and the two agents exchange data with minimal manual steps.** Below is what can be automated and what stays one-time or manual.

### What the Cursor agent (me) can do automatically — with one prompt from you

Once you’re authenticated as an **Agent** avatar (one-time), I can do the rest in a single turn when you ask:

| You say | I do automatically |
|--------|---------------------|
| “Discover Hesling’s agent” or “Find Hesling on OASIS” | Call `oasis_get_agents_by_service`(serviceName: `"hesling"`) and show you the agent_id and card. I can cache the agent_id for this chat so we don’t rediscover every time. |
| “Message Hesling’s agent: &lt;content&gt;” or “Send to Hesling: &lt;content&gt;” | If I don’t have Hesling’s agent_id, discover by service name `"hesling"`, then call `oasis_send_a2a_jsonrpc_request`(method: `"service_request"`, params: `{ to_agent_id: <id>, content: "<content>" }`). No need for you to copy IDs. |
| “Check messages from OASIS” / “Any messages from Hesling?” | Call `oasis_get_pending_a2a_messages`, show you the list, and optionally summarize who said what. |

So on **your side**, after one-time auth as an Agent: **discovery and sending are one prompt each; checking for replies is one prompt.** No manual copying of GUIDs if we use a fixed service name.

### What Hesling’s agent can do automatically

With a **one-time setup** and a **simple rule**, their agent can make receipt and reply very low-friction:

| When | What their agent can do automatically |
|------|----------------------------------------|
| **One-time** | Register Agent avatar (if not already), authenticate, register capabilities with **services: `["hesling"]`** (so we can discover by `"hesling"`), register as SERV. Can be a single instruction: “On first run, if not already on OASIS, register as an Agent with username X, then authenticate, register capabilities with services [\"hesling\"], and register as SERV.” |
| **Every session start** | **Rule:** “When the user starts a session, first call `oasis_authenticate_avatar`, then `oasis_get_pending_a2a_messages`. If there are any messages, show them to the user and offer to reply.” So when Hesling opens Claude/OpenClaw, they immediately see our messages — no “go check OASIS” step. |
| **When user says “reply: &lt;text&gt;”** | Agent gets `from_agent_id` from the last pending message (that’s our agent), calls `oasis_send_a2a_jsonrpc_request`(method: `"service_request"`, params: `{ to_agent_id: <our-id>, content: "<text>" }`), then `oasis_mark_a2a_message_processed`(messageId). Fully automatic from their one prompt. |

So on **Hesling’s side**: one-time OASIS onboarding, then **automatic** “show my OASIS messages on session start” and “reply with one natural prompt.”

### Minimal convention (you + Hesling)

- **Service name:** Hesling’s agent registers with **service name `"hesling"`** (e.g. capabilities `services: ["hesling"]` if that’s what discovery uses, or whatever the API maps to “service name” for `oasis_get_agents_by_service` / `oasis_discover_agents_via_serv`). Then I always discover with `serviceName: "hesling"` — no IDs to exchange.
- **Your agent:** You have one Agent avatar and authenticate once (or per Cursor session). I cache Hesling’s `agent_id` in the conversation after first discovery so “message Hesling” doesn’t require a discovery call every time (or we rediscover once per conversation).
- **Their agent:** Uses the “session start: check pending messages” rule and “reply: &lt;text&gt;” so they never have to remember tool names or params.

### What’s still not automatic (by design or limitation)

- **Push delivery:** OASIS A2A is poll-based. Hesling doesn’t get a push when we send; they see it when their agent runs and calls `oasis_get_pending_a2a_messages` (e.g. on session start). So “automatic” for them means “as soon as they open their client and the agent runs the rule.”
- **First-time setup:** Each side does one-time: you = Agent avatar + auth; Hesling = Agent avatar + auth + capabilities + SERV with service name `"hesling"`.
- **Who triggers a run:** I only run when you’re in a Cursor chat; their agent only runs when they’re in their client. So a continuous “daemon” back-and-forth would need something else (e.g. a small poller service that notifies or invokes an agent). For normal use, “you ask me to send / you ask me to check” and “they open client and see messages / they say reply” is the intended frictionless flow.

### One-time onboarding for Hesling’s agent (copy-paste)

Give Hesling (or paste into their agent’s system/instructions) something like:

```text
You have OASIS MCP tools. To receive messages from Max’s Cursor agent:

1. One-time setup (do once, or if user says "set up OASIS"):
   - Register an OASIS Agent avatar: oasis_register_avatar with username (e.g. hesling_agent), email, password, confirmPassword, acceptTerms: true, firstName, lastName, avatarType: "Agent".
   - Authenticate: oasis_authenticate_avatar with that username and password.
   - Register capabilities: oasis_register_agent_capabilities with services: ["hesling"] (so Max’s agent can find you by service name "hesling").
   - Register as SERV: oasis_register_agent_as_serv_service.

2. Every time the user starts a conversation with you:
   - Call oasis_authenticate_avatar (if not already authenticated), then oasis_get_pending_a2a_messages.
   - If there are messages, show them to the user and say you can reply if they want.

3. When the user says "reply to OASIS" or "reply to Max’s agent: <content>":
   - Use the from_agent_id from the most recent pending message as to_agent_id.
   - Call oasis_send_a2a_jsonrpc_request with method "service_request", params { to_agent_id: "<that-id>", content: "<user's content>" }, and an id.
   - Call oasis_mark_a2a_message_processed with that message’s messageId.
```

With that, Hesling’s agent can do **one-time setup** and then **automatic** “show OASIS messages on session start” and “reply with one user prompt.”

### Summary: how much is automatic?

| Step | Who | Automatic? |
|------|-----|------------|
| Discover Hesling’s agent | You (Cursor) | Yes — one prompt (“find Hesling”); I use service name `"hesling"`. |
| Send message to Hesling | You (Cursor) | Yes — one prompt (“message Hesling: …”); I discover if needed and send. |
| Check for replies | You (Cursor) | Yes — one prompt (“check OASIS messages”); I poll and show. |
| Hesling sees our message | Hesling | Yes — when they open their client, if their agent runs “check pending messages” on session start. |
| Hesling replies | Hesling | Yes — one prompt (“reply: …”); their agent sends and marks processed. |
| You see Hesling’s reply | You (Cursor) | Yes — when you ask me to “check messages.” |

So: **discovery and sending on your side are one prompt each; checking is one prompt. On Hesling’s side, one-time setup plus a “session start + reply” rule makes receipt and reply effectively automatic.** The only hard requirement is both use the same OASIS API and the agreed service name (`"hesling"`).
