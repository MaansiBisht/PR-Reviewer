#!/usr/bin/env bash

# Install git hooks for PR reviewer
# Run this script to set up the pre-push hook

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "📦 Installing PR Reviewer git hooks..."

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Error: Not a git repository. Please run this from your project root."
    exit 1
fi

# Create .husky directory if it doesn't exist
mkdir -p .husky/_

# Create husky.sh helper
cat > .husky/_/husky.sh << 'EOF'
#!/usr/bin/env sh
if [ -z "$husky_skip_init" ]; then
  debug () {
    if [ "$HUSKY_DEBUG" = "1" ]; then
      echo "husky (debug) - $1"
    fi
  }

  readonly hook_name="$(basename -- "$0")"
  debug "starting $hook_name..."

  if [ "$HUSKY" = "0" ]; then
    debug "HUSKY env variable is set to 0, skipping hook"
    exit 0
  fi

  if [ -f ~/.huskyrc ]; then
    debug "sourcing ~/.huskyrc"
    . ~/.huskyrc
  fi

  readonly husky_skip_init=1
  export husky_skip_init
  sh -e "$0" "$@"
  exitCode="$?"

  if [ $exitCode != 0 ]; then
    echo "husky - $hook_name hook exited with code $exitCode (error)"
  fi

  if [ $exitCode = 127 ]; then
    echo "husky - command not found in PATH=$PATH"
  fi

  exit $exitCode
fi
EOF

chmod +x .husky/_/husky.sh

# Create pre-push hook
cat > .husky/pre-push << 'EOF'
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "🔍 Running AI code review before push..."

# Run the PR reviewer
npx pr-review --fail-on-high

exit_code=$?

if [ $exit_code -ne 0 ]; then
    echo ""
    echo "❌ Push blocked due to code review issues."
    echo "   Please fix the high severity issues and try again."
    echo "   To bypass this check, use: git push --no-verify"
    exit 1
fi

echo "✅ Code review passed!"
exit 0
EOF

chmod +x .husky/pre-push

# Configure git to use husky hooks
git config core.hooksPath .husky

echo "✅ Git hooks installed successfully!"
echo ""
echo "The pre-push hook will now run AI code review before each push."
echo "To skip the hook temporarily, use: git push --no-verify"
