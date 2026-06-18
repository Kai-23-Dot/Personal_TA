# Personal_TA

## Running Multiple Agents With Regente

Regente is installed for this repo and coordinates already-running agents. Do not run `.codex/hooks.json` directly; it is a config file that Codex reads when a new session starts.

### One-time setup

```bash
npm run regente:install
```

After installing, restart any open Codex/Claude/Gemini/Cursor sessions so they reload the repo-local hooks and MCP config.

### Start the Regente dashboard/watch view

```bash
npm run regente:watch
```

In separate terminals, start each AI coding tool from this repo:

```bash
cd /Users/kairavkaran/Documents/Personal_TA
codex
claude
gemini
```

Each new supported agent should auto-join through its installed hook/MCP config. If an agent does not auto-join, run a manual join command in that agent's terminal with a unique `AGENT_NAME`:

```bash
AGENT_NAME=codex-ui AGENT_TOOL=codex npm run regente:join
AGENT_NAME=claude-auth AGENT_TOOL=claude-code npm run regente:join
AGENT_NAME=gemini-tests AGENT_TOOL=gemini-cli npm run regente:join
```

### Check who is connected

```bash
npm run regente:status
```

You should see more than one online agent before delegating work.

### Delegate work

Use Regente calls once the target agent appears online:

```bash
/Users/kairavkaran/.regente/bin/regente call claude-auth "Review the auth flow and report risks" --from codex-ui
/Users/kairavkaran/.regente/bin/regente call gemini-tests "Check dashboard UI responsiveness" --from codex-ui
```

Agents should claim files before editing and release claims when done. Regente coordinates ownership; it does not replace starting the actual agent processes.
