#!/usr/bin/env bash
# Claude Code add-ons installer: the 42 add-ons from the guide, grouped into phases.
#
# Usage:
#   ./install.sh                 # phase "core" only (recommended start)
#   ./install.sh core build      # several phases
#   ./install.sh all             # everything (not recommended in one go)
#
# Phases: prereq core build design research content office extras
# Every step is independent: one failure does not stop the rest.
# No API keys are stored by this script. Keys go in your shell profile (see README).

set -u
OK=(); FAIL=(); SKIP=()

run() {  # run "<label>" <command...>
  local label="$1"; shift
  printf '\n\033[1;33m▶ %s\033[0m\n' "$label"
  if "$@"; then OK+=("$label"); else FAIL+=("$label"); fi
}
skip() { printf '\n\033[2m⏭  %s — %s\033[0m\n' "$1" "$2"; SKIP+=("$1: $2"); }
have() { command -v "$1" >/dev/null 2>&1; }

pkg() {  # install a system package with whatever manager exists
  if have brew; then brew install "$@"
  elif have winget; then for p in "$@"; do winget install -e --id "$p"; done
  elif have apt-get; then sudo apt-get install -y "$@"
  else echo "No package manager found (install Homebrew: https://brew.sh)"; return 1; fi
}
mkt()    { claude plugin marketplace add "$1"; }
plugin() { claude plugin install "$1"; }
mcp()    { claude mcp add -s user "$@"; }
skill()  { npx -y skills add "$@" -g -a claude-code; }

# ---------------------------------------------------------------- phases
phase_prereq() {
  have claude || run "Claude Code" bash -c 'curl -fsSL https://claude.ai/install.sh | bash'
  have node   || run "Node.js (41)" pkg node
  have python3|| run "Python (33)" pkg python
  have uv     || run "uv" pkg uv
  have gh     || run "GitHub CLI (04)" pkg gh
  have ffmpeg || run "ffmpeg (16)" pkg ffmpeg
  run "Official marketplace" mkt anthropics/claude-plugins-official
}

phase_core() {  # the 5 the guide says to start with
  run "01 Superpowers"        plugin superpowers@claude-plugins-official
  have gh && { gh auth status >/dev/null 2>&1 || run "04 gh auth login" gh auth login; }
  run "04 GitHub plugin"      plugin github@claude-plugins-official
  run "24 Humanizer"          bash -c 'claude plugin marketplace add blader/humanizer && claude plugin install humanizer@humanizer'
  skip "19 Claude in Chrome"  "install the extension from https://claude.com/chrome then run: claude --chrome"
  skip "30/34/35/36 Drive, Notion, Gmail, Calendar" "connect on claude.ai → Customize → Connectors"
}

phase_build() {
  run "08 Claude HUD"         bash -c 'claude plugin marketplace add jarrodwatts/claude-hud && claude plugin install claude-hud@claude-hud'
  run "05 Vercel CLI"         npm i -g vercel
  run "05 Vercel plugin"      plugin vercel@claude-plugins-official
  run "06 Playwright MCP"     mcp playwright -- npx @playwright/mcp@latest
  if have uv; then
    run "03 graphify"         bash -c 'uv tool install graphifyy && graphify install'
  else skip "03 graphify" "needs uv + Python 3.10+"; fi
  if have bun; then
    run "02 gstack"           bash -c 'git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup'
  else skip "02 gstack" "needs Bun 1.4.2+ (https://bun.sh)"; fi
  run "07 Codex (needs a ChatGPT account; then run /codex:setup)" \
                              bash -c 'claude plugin marketplace add openai/codex-plugin-cc && claude plugin install codex@openai-codex'
}

phase_design() {
  run "09 Figma MCP"          mcp --transport http figma https://mcp.figma.com/mcp
  run "10 UI UX Pro Max"      bash -c 'claude plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill && claude plugin install ui-ux-pro-max@ui-ux-pro-max-skill'
  run "11 Impeccable"         bash -c 'claude plugin marketplace add pbakaus/impeccable && claude plugin install impeccable@impeccable'
  run "12 Taste Skill"        bash -c 'claude plugin marketplace add Leonxlnx/taste-skill && claude plugin install taste-skill@taste-skill'
  run "13 emil-design-eng"    skill emilkowalski/skills --skill emil-design-eng
  run "14 HyperFrames"        plugin hyperframes@claude-plugins-official
  run "15 Remotion skills"    skill remotion-dev/skills
  run "17 Higgsfield MCP"     mcp --transport http higgsfield https://mcp.higgsfield.ai/mcp
}

phase_research() {
  if [ -n "${PERPLEXITY_API_KEY:-}" ]; then
    run "18 Perplexity MCP"   mcp perplexity --env PERPLEXITY_API_KEY="$PERPLEXITY_API_KEY" -- npx -y @perplexity-ai/mcp-server
  else skip "18 Perplexity" "set PERPLEXITY_API_KEY first (paid API)"; fi
  run "20 Firecrawl"          plugin firecrawl@claude-plugins-official
  run "21 Apify MCP"          mcp --transport http apify https://mcp.apify.com
  run "22 last30days"         bash -c 'claude plugin marketplace add mvanhorn/last30days-skill && claude plugin install last30days@last30days-skill'
  run "23 Gemini CLI"         npm install -g @google/gemini-cli
  run "25 Metricool MCP"      mcp --transport http metricool https://ai.metricool.com/mcp
}

phase_content() {
  skip "26 GPT Image"         "add OPENAI_API_KEY to your shell profile (paid API)"
  skip "27 Nano Banana"       "add GEMINI_API_KEY to your shell profile"
  run "28 ElevenLabs MCP"     mcp --transport http elevenlabs https://api.elevenlabs.io/v1/mcp
  run "29 Puppeteer"          npm i -g puppeteer
  run "31 Granola MCP"        mcp --transport http granola https://mcp.granola.ai/mcp
  run "32 Whisper"            pip3 install -U openai-whisper
}

phase_office() {
  run "34 Notion"             plugin notion@claude-plugins-official
  run "37 Slack"              plugin slack@claude-plugins-official
  run "38 Zapier MCP"         mcp --transport http zapier https://mcp.zapier.com/api/v1/connect
  run "40 find-skills"        skill vercel-labs/skills --skill find-skills
}

phase_extras() {  # deliberately separate: see README for why
  run "39 Caveman"            bash -c 'claude plugin marketplace add JuliusBrussee/caveman && claude plugin install caveman@caveman'
  run "42 Ollama"             bash -c 'curl -fsSL https://ollama.com/install.sh | sh'
}

# ---------------------------------------------------------------- main
PHASES=("$@"); [ ${#PHASES[@]} -eq 0 ] && PHASES=(core)
[ "${PHASES[0]}" = all ] && PHASES=(prereq core build design research content office extras)
[ "${PHASES[0]}" != prereq ] && PHASES=(prereq "${PHASES[@]}")

for p in "${PHASES[@]}"; do
  if declare -F "phase_$p" >/dev/null; then printf '\n\033[1;36m═══ %s ═══\033[0m\n' "$p"; "phase_$p"
  else echo "Unknown phase: $p"; fi
done

printf '\n\033[1m── Summary ──\033[0m\n'
printf '\033[32m✔ %s\033[0m\n' "${OK[@]:-none}"
[ ${#SKIP[@]} -gt 0 ] && printf '\033[33m⏭ %s\033[0m\n' "${SKIP[@]}"
[ ${#FAIL[@]} -gt 0 ] && printf '\033[31m✘ %s\033[0m\n' "${FAIL[@]}"
echo
echo "Next: open Claude Code, run /reload-plugins, then /plugin, /mcp and /skills to confirm."
echo "MCP servers marked 'needs auth' sign in the first time you use them."
