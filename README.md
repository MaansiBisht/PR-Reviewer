# PR Reviewer

🚀 **A local AI-powered Git PR reviewer that works with YOUR local LLM**

Review your code changes before pushing with any local LLM - completely offline, no external APIs required. Perfect for teams that want to keep their code private while getting AI-powered reviews.

## ✨ Why Use PR Reviewer?

- 🔒 **100% Private**: Your code never leaves your machine
- 🤖 **Works with ANY Local LLM**: Ollama, LM Studio, or any local API
- 🎯 **PR-Style Reviews**: Like GitHub/GitLab PR reviews but locally
- 📊 **Multiple Formats**: CLI, JSON, Markdown, HTML reports
- ⚡ **Fast & Efficient**: Smart chunking handles large codebases
- 🛠️ **Team Ready**: Configuration files for consistent reviews

## Features

### Core Features
- **PR Review Mode**: Review branches like GitHub/GitLab PRs locally
- **Git Integration**: Review diffs between branches, staged changes, or uncommitted changes
- **Local LLM**: Uses Ollama with configurable models (default: deepseek-coder)
- **Smart Chunking**: Handles large diffs by splitting them intelligently

### Advanced Features
- **Configuration File**: Project-level `.pr-reviewrc.json` for team settings
- **File Filtering**: Include/exclude patterns to focus reviews
- **Multiple Export Formats**: CLI, JSON, Markdown, HTML reports
- **Severity Levels**: Critical, High, Medium, Low with thresholds
- **Category Detection**: Bug, Security, Performance, Style, Logic, etc.
- **Caching**: Optional caching for repeated reviews
- **CI/CD Ready**: Exit codes, JSON output, fail thresholds

## 🚀 Quick Start

### 1. Install Node.js
```bash
# Requires Node.js >= 18.0.0
node --version  # Check your version
```

### 2. Setup Your Local LLM

#### Option A: Ollama (Recommended)
```bash
# Install Ollama
# macOS
brew install ollama
# Or download from https://ollama.ai

# Start Ollama
ollama serve

# Pull a code model (pick one)
ollama pull deepseek-coder          # 1.7GB - Fast, good balance
ollama pull qwen2.5-coder:7b        # 4.7GB - More capable
ollama pull codellama:7b             # 3.8GB - Good for general coding
ollama pull starcoder2:7b           # 4.1GB - Excellent for code
```

#### Option B: LM Studio or Other Local LLM
```bash
# Any local LLM that provides an API works!
# Just point to your API URL with --url flag
# Example with LM Studio:
pr-review --url http://localhost:1234/v1 --model your-model-name
```

### 3. Install PR Reviewer
```bash
# Clone the repository
git clone https://github.com/yourusername/pr-reviewer.git
cd pr-reviewer

# Install dependencies
npm install

# Build the project
npm run build

# Install globally (optional)
npm link
```

## 🎯 Your First Review

```bash
# Check if everything is working
pr-review check

# Review your current changes
pr-review

# Review a feature branch
pr-review pr my-feature-branch

# See all options
pr-review --help
```

## Usage

## 📖 Usage Examples

### Basic Reviews
```bash
# Review current uncommitted changes
pr-review

# Review staged changes only
pr-review --staged

# Review all changes in working directory
pr-review --all

# Compare against different base branch
pr-review --base develop
```

### Using Different Models
```bash
# Use a specific Ollama model
pr-review --model qwen2.5-coder:7b

# Use LM Studio or other local LLM
pr-review --url http://localhost:1234/v1 --model your-model

# Use DeepSeek Coder (recommended)
pr-review --model deepseek-coder:6.7b
```

### Export Options
```bash
# Generate HTML report
pr-review --html -o review.html

# Generate Markdown report
pr-review --markdown -o review.md

# JSON for CI/CD
pr-review --json > review.json
```

### All Options
```bash
pr-review [options]

Options:
  -b, --base <branch>      Base branch to compare against (default: "main")
  -m, --model <model>      LLM model to use (default: "deepseek-coder")
  -u, --url <url>          LLM API URL (default: "http://localhost:11434")
  -s, --staged             Review only staged changes
  -a, --all                Review all uncommitted changes
  --chunk-size <size>      Maximum chunk size for large diffs (default: 4000)
  --json                   Output results as JSON
  --markdown               Output results as Markdown
  --html                   Output results as HTML
  -o, --output <file>      Save report to file
  --fail-on-high           Exit with code 1 if high severity issues found
  --fail-on-critical       Exit with code 1 if critical issues found
  -v, --verbose            Enable verbose logging
  -h, --help               Display help
```

### Examples

```bash
# Review staged changes only
pr-review --staged

# Review all uncommitted changes
pr-review --all

# Compare against a different base branch
pr-review --base develop

# Use a different model
pr-review --model codellama

# Output as JSON (for CI/CD integration)
pr-review --json
```

## PR Review Mode (Main Feature)

Review a PR branch against a base branch - just like reviewing a GitHub/GitLab PR locally.

### Usage

```bash
pr-review pr <branch> [options]
```

### Options

```bash
Options:
  -b, --base <branch>    Base branch to compare against (default: "main")
  -r, --remote <remote>  Remote name (default: "origin")
  -f, --fetch            Fetch latest from remote before comparing
  --local                Use local branches only (no remote fetch)
  -m, --model <model>    Ollama model to use
  --json                 Output results as JSON
  --markdown             Output results as Markdown
  --html                 Output results as HTML
  -o, --output <file>    Save report to file
  --fail-on-high         Exit with code 1 if high severity issues found
  --fail-on-critical     Exit with code 1 if critical issues found
  -v, --verbose          Enable verbose logging
```

### Examples

```bash
# Review a feature branch against main (local branches)
pr-review pr feature/my-feature --base main

# Review with latest remote changes (fetches from origin first)
pr-review pr feature/my-feature --base main --fetch

# Generate HTML report
pr-review pr feature/my-feature --base main --html -o ./reports/review.html

# Generate Markdown report for documentation
pr-review pr feature/my-feature --base main --markdown -o ./reports/review.md

# Review and fail CI if high severity issues found
pr-review pr feature/my-feature --base main --fail-on-high

# Output as JSON for CI/CD pipelines
pr-review pr feature/my-feature --base main --json
```

### List Available Branches

```bash
# List local and remote branches
pr-review branches

# Fetch latest and list branches
pr-review branches --fetch

# Fail if high severity issues found (for CI/CD)
pr-review --fail-on-high

# Verbose mode for debugging
pr-review --verbose
```

### Check Ollama Status

```bash
# Verify Ollama is running and model is available
pr-review check

# Check a specific model
pr-review check --model codellama
```

## Git Hook Integration

### Using Husky (Recommended)

```bash
# Install husky
npm install husky --save-dev

# Initialize husky
npx husky install

# The pre-push hook is already configured in .husky/pre-push
# Just make sure husky is set up in your project
```

### Manual Hook Installation

```bash
# Run the install script
chmod +x scripts/install-hooks.sh
./scripts/install-hooks.sh
```

### Bypassing the Hook

```bash
# Skip the pre-push review temporarily
git push --no-verify
```

## Output Formats

### CLI Output (Default)

Colorized terminal output with severity indicators:

- 🔴 **CRITICAL**: Security vulnerabilities, data loss, crashes
- 🟠 **HIGH**: Bugs that will cause production issues
- 🟡 **MEDIUM**: Code quality, minor bugs, maintainability
- 🔵 **LOW**: Style issues, suggestions

### JSON Output

```bash
pr-review --json
```

Structured JSON with full metadata for CI/CD integration.

### Markdown Report

```bash
pr-review --markdown -o ./reports/review.md
```

Generate documentation-ready Markdown reports.

### HTML Report

```bash
pr-review --html -o ./reports/review.html
```

Beautiful, shareable HTML reports with styling.

### Example Output

```
═══════════════════════════════════════════════════════════
                    PR REVIEW RESULTS                       
═══════════════════════════════════════════════════════════

Summary:
The changes introduce a new authentication module with some security concerns.

Statistics:
  Total: 3
  🔴 High: 1
  🟡 Medium: 1
  🔵 Low: 1

⚠ CRITICAL ISSUES FOUND:

  🔴 [HIGH] (security)
    File: src/auth.ts:42
    Issue: Password is logged to console in plain text
    Fix: Remove console.log statement or mask the password

Issues by File:

📁 src/auth.ts

  🟡 [MEDIUM] (error-handling)
    Line: 58
    Issue: Missing error handling for database connection failure
    Fix: Add try-catch block and handle connection errors gracefully

  🔵 [LOW] (style)
    Line: 12
    Issue: Variable name 'x' is not descriptive
    Fix: Rename to 'userCredentials' or similar descriptive name

═══════════════════════════════════════════════════════════
```

## Configuration

### Project Configuration File

Create a `.pr-reviewrc.json` in your project root for team-wide settings:

```bash
# Initialize a config file
pr-review init
```

Example `.pr-reviewrc.json`:

```json
{
  "model": "deepseek-coder:6.7b",
  "baseBranch": "main",
  "fileFilter": {
    "exclude": [
      "node_modules/**",
      "dist/**",
      "*.lock",
      "*.min.js",
      "**/*.test.ts"
    ]
  },
  "reviewFocus": {
    "categories": ["bug", "security", "performance", "logic"],
    "severityThreshold": "medium",
    "context": "This is a production e-commerce application. Focus on security and data handling.",
    "customRules": [
      "Check for SQL injection vulnerabilities",
      "Ensure all API endpoints have authentication",
      "Verify error messages don't leak sensitive info"
    ]
  },
  "output": {
    "format": "cli",
    "includeCodeSnippets": true,
    "groupBy": "file"
  }
}
```

### View Current Configuration

```bash
pr-review config
```

### Configuration Options

| Option | Description | Default |
|--------|-------------|--------|
| `model` | Ollama model to use | `deepseek-coder` |
| `baseBranch` | Default base branch | `main` |
| `fileFilter.include` | Glob patterns to include | `["*"]` |
| `fileFilter.exclude` | Glob patterns to exclude | `["node_modules/**", ...]` |
| `reviewFocus.categories` | Issue categories to focus on | `["bug", "security", ...]` |
| `reviewFocus.severityThreshold` | Minimum severity to report | `low` |
| `reviewFocus.context` | Project context for LLM | - |
| `reviewFocus.customRules` | Custom rules to check | - |
| `output.format` | Output format | `cli` |
| `cache.enabled` | Enable result caching | `false` |

## 🤖 Supported Models

### Recommended Models (Tested)
| Model | Size | Best For | Speed |
|-------|------|----------|-------|
| `deepseek-coder` | 1.7GB | General coding | ⚡ Fast |
| `deepseek-coder:6.7b` | 3.8GB | Better analysis | 🚀 Fast |
| `qwen2.5-coder:7b` | 4.7GB | High quality | 🐢 Medium |
| `codellama:7b` | 3.8GB | Good balance | 🚀 Fast |
| `starcoder2:7b` | 4.1GB | Advanced code | 🐢 Medium |

### Other Models
Any local LLM that provides an API endpoint works:
- LM Studio models
- Custom fine-tuned models
- Open-source models from Hugging Face
- Your own trained models

### Model Selection Tips
```bash
# For quick reviews (fast)
pr-review --model deepseek-coder

# For thorough analysis (better quality)
pr-review --model qwen2.5-coder:7b

# For specific programming languages
pr-review --model codellama:7b  # Good for Python/JS
```

## Project Structure

```
pr-reviewer/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── types/
│   │   └── index.ts       # TypeScript interfaces
│   ├── services/
│   │   ├── git.ts         # Git operations
│   │   ├── ollama.ts      # Ollama API client
│   │   ├── chunker.ts     # Diff chunking logic
│   │   ├── prompt.ts      # Prompt engineering
│   │   ├── reviewer.ts    # Main review orchestration
│   │   ├── formatter.ts   # CLI output formatting
│   │   └── exporter.ts    # Report export (JSON/MD/HTML)
│   └── utils/
│       ├── logger.ts      # Logging utilities
│       ├── config-loader.ts # Configuration management
│       ├── file-filter.ts # File filtering logic
│       └── cache.ts       # Review caching
├── .husky/
│   └── pre-push           # Git pre-push hook
├── scripts/
│   └── install-hooks.sh   # Hook installation script
├── package.json
├── tsconfig.json
└── README.md
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: PR Review
on:
  pull_request:
    branches: [main, develop]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install Ollama
        run: curl -fsSL https://ollama.com/install.sh | sh
      
      - name: Start Ollama
        run: ollama serve &
      
      - name: Pull Model
        run: ollama pull deepseek-coder
      
      - name: Install PR Reviewer
        run: npm install -g pr-reviewer
      
      - name: Run Review
        run: |
          pr-review pr ${{ github.head_ref }} \
            --base ${{ github.base_ref }} \
            --json > review.json
      
      - name: Upload Report
        uses: actions/upload-artifact@v4
        with:
          name: pr-review-report
          path: review.json
```

## 🔧 Troubleshooting

### Common Issues

#### "Ollama is not running"
```bash
# Start Ollama
ollama serve

# Check if it's running
curl http://localhost:11434/api/tags
```

#### "Model not found"
```bash
# List available models
ollama list

# Pull a model
ollama pull deepseek-coder

# Check what's available
pr-review check --model your-model-name
```

#### "Connection refused"
```bash
# Check your LLM is running on the right port
# For Ollama (default 11434)
curl http://localhost:11434/api/tags

# For LM Studio (default 1234)
curl http://localhost:1234/v1/models
```

#### Large diffs timeout
```bash
# Increase chunk size
pr-review --chunk-size 8000

# Or review specific files only
# (use file filtering in .pr-reviewrc.json)
```

#### No changes found
```bash
# Check if you have uncommitted changes
git status

# Review staged changes instead
pr-review --staged

# Review all changes
pr-review --all
```

### Getting Help
```bash
# Verbose mode to see what's happening
pr-review --verbose

# Check prerequisites
pr-review check

# See all options
pr-review --help
```

## Issue Categories

The reviewer detects issues in these categories:

| Category | Description |
|----------|-------------|
| `bug` | Logic errors, incorrect behavior |
| `security` | Vulnerabilities, data exposure |
| `performance` | Inefficient code, memory leaks |
| `style` | Code formatting, conventions |
| `logic` | Flawed algorithms, edge cases |
| `error-handling` | Missing try-catch, unhandled errors |
| `duplication` | Repeated code, DRY violations |
| `naming` | Poor variable/function names |
| `documentation` | Missing/incorrect comments |
| `testing` | Missing tests, test issues |
| `architecture` | Design problems, coupling |
| `dependency` | Package issues, version conflicts |

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Development Setup
```bash
git clone https://github.com/yourusername/pr-reviewer.git
cd pr-reviewer
npm install
npm run build
npm link
```

## 📄 License

MIT License - feel free to use in your projects!

## 🌟 Star History

If this tool helps you, please give it a star on GitHub!

