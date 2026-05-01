# PR Reviewer

Multi-agent AI-powered PR reviewer with a web UI. Review pull requests from GitHub or Bitbucket using local Ollama models or cloud LLMs (Claude, GPT-4o). Host it on your own server — your code stays private.

## Features

- **Multi-agent pipeline** — Security, Complexity, Feature Verification, and Synthesis agents run in parallel
- **Multiple LLM providers** — Ollama (local/offline), Anthropic Claude, OpenAI GPT
- **PR Browser** — connect GitHub or Bitbucket via personal access tokens and trigger reviews from the UI
- **Local repo review** — point at any git repo on the server by path
- **Review history & analytics** — all results stored and queryable
- **Dark/light theme** — responsive Tailwind UI

## Quick Start (Local Development)

### 1. Install dependencies

```bash
npm install
cd web && npm install && cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — set LLM_PROVIDER and the matching key/URL
```

### 3. Run

```bash
# Terminal 1 — backend API on port 3001
npm run dev

# Terminal 2 — frontend dev server on port 3000
npm run ui
```

Open http://localhost:3000. Use **Settings** to switch providers and enter tokens at any time without restarting.

## LLM Providers

| Provider | Config |
|----------|--------|
| Ollama (local) | `LLM_PROVIDER=ollama`, `OLLAMA_URL`, `OLLAMA_MODEL` |
| Claude | `LLM_PROVIDER=claude`, `ANTHROPIC_API_KEY` |
| OpenAI | `LLM_PROVIDER=openai`, `OPENAI_API_KEY` |

## GitHub / Bitbucket Integration

1. Open **Settings → Source Control**
2. Enter a GitHub Personal Access Token (`repo` scope) or Bitbucket App Password (`Repositories: Read` + `Pull requests: Read`)
3. Go to **PR Browser → Load Repos → select repo → Review**

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `ollama` | `ollama` \| `claude` \| `openai` |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama base URL |
| `OLLAMA_MODEL` | `qwen2.5-coder:7b` | Model name |
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `CLOUD_MODEL` | — | Override cloud model (e.g. `claude-opus-4-7`) |
| `GITHUB_TOKEN` | — | GitHub Personal Access Token |
| `BITBUCKET_TOKEN` | — | Bitbucket App Password |
| `BITBUCKET_USERNAME` | — | Bitbucket username |
| `PORT` | `3001` | Backend server port |

## Deployment (Self-hosted / Contabo)

### One-time setup

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER  # re-login after

# Clone and configure
git clone https://github.com/MaansiBisht/PR-Reviewer.git
cd PR-Reviewer
cp .env.example .env
nano .env

# SSL cert
sudo apt install certbot -y
sudo certbot certonly --standalone -d your-domain.com
mkdir -p nginx/certs
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/certs/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/certs/

# Set your domain in nginx/nginx.conf (replace YOUR_DOMAIN)
nano nginx/nginx.conf
```

### Deploy

```bash
bash scripts/deploy.sh
```

Pulls latest, rebuilds containers, health-checks, prunes old images.

### With Ollama on the server

```bash
docker compose --profile local-llm up -d --build
# Also set OLLAMA_URL=http://ollama:11434 in .env
```

### Update

```bash
bash scripts/deploy.sh
```

## Architecture

```
src/
├── index.ts              # Entry point — reads .env, starts Express
├── server/index.ts       # All API routes
├── agents/               # SecurityAgent, ComplexityAgent, FeatureVerificationAgent, SynthesisAgent
├── orchestrator/         # Runs agents in parallel, aggregates results
├── providers/            # GitHub, Bitbucket, local git diff fetchers
├── services/
│   ├── llm/              # LLMProvider interface + Ollama / Claude / OpenAI adapters
│   ├── git.ts
│   ├── review-store.ts   # Persistence + analytics
│   └── ...
└── utils/

web/src/
├── pages/                # Dashboard, PRBrowserPage, ReviewPage, HistoryPage, AnalyticsPage, SettingsPage
├── components/           # Layout, charts, diff viewer, agent panel
└── api/client.ts         # Typed API client
```

## Optional Project Config

Drop a `.pr-reviewrc.json` in any repo root to override defaults for that repo:

```json
{
  "baseBranch": "main",
  "fileFilter": {
    "exclude": ["node_modules/**", "dist/**", "*.lock"]
  },
  "reviewFocus": {
    "categories": ["bug", "security", "performance"],
    "severityThreshold": "medium"
  }
}
```

## License

MIT
