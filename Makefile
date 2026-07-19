# Dev convenience only — never a build/release dependency (goreleaser and CI
# call go/pnpm directly, per docs/TUTORIAL.md and the workflow files under
# .github/). `make dev` exists purely so a local session doesn't need two
# terminals and a manual OPENAI_API_KEY export to see the CLI and UI talking
# to each other.

ADDR      ?= 127.0.0.1:7676
UI_PORT   ?= 5173
WORKSPACE ?= .workflow
DIR       ?= .

.PHONY: dev serve ui build ui-deps stop

build:
	go build -o wee ./cli

ui-deps:
	cd ui && pnpm install

# Frees the ports `dev`/`serve`/`ui` use — handy after a Ctrl-C that left a
# process behind, or before a fresh run. Never errors if nothing's listening.
stop:
	@lsof -ti:$(word 2,$(subst :, ,$(ADDR))) -sTCP:LISTEN 2>/dev/null | xargs -r kill 2>/dev/null || true
	@lsof -ti:$(UI_PORT) -sTCP:LISTEN 2>/dev/null | xargs -r kill 2>/dev/null || true

# Backend only: build + serve. Loads .env if present — `wee` reads
# OPENAI_API_KEY/ANTHROPIC_API_KEY straight from the environment, never from a
# .env file itself (there's no dotenv dependency in go.mod, deliberately).
serve: build stop
	@if [ -f .env ]; then set -a; . ./.env; set +a; fi; \
	./wee serve --addr $(ADDR) --workspace $(WORKSPACE) --dir $(DIR)

# Frontend only: the Vite dev server, pointed at ADDR by default (set in the
# Toolbar's "wee serve address" field once it's open — this just starts it).
ui: ui-deps
	cd ui && pnpm dev --port $(UI_PORT)

# Both at once, one Ctrl-C stops both. This is the one command "easy mode"
# needs. Override on the command line, e.g.:
#   make dev DIR=examples/pr-review   # so the UI's Run button can resolve
#                                      # files imported from that folder
#
# Cleanup is port-based (`make stop`), not PID-based (`kill 0`/child PIDs):
# `pnpm dev` spawns Vite as a further child process it doesn't forward
# signals to, so killing the `pnpm`/`sh -c` wrapper alone leaves Vite running
# and the port held — confirmed by testing a backgrounded `kill -INT` against
# a PID-based version, which hung with both processes still listening.
# Whatever's actually bound to the port is what `stop` targets, so it works
# regardless of how many wrapper layers spawned it.
dev: build ui-deps stop
	@echo "wee serve   -> http://$(ADDR)"
	@echo "ui (vite)   -> http://localhost:$(UI_PORT)"
	@echo ""
	@echo "Nothing loads on the canvas by itself — open the UI, click Import, and"
	@echo "pick a workflow file from $(DIR) (e.g. $(DIR)/workflow.yaml if that's an"
	@echo "example folder). DIR only tells the server where to resolve Run against;"
	@echo "it doesn't put anything on screen until you import it yourself."
	@echo ""
	@echo "Ctrl-C stops both (falls back to 'make stop' if anything lingers)."
	@trap '$(MAKE) stop >/dev/null 2>&1' INT TERM EXIT; \
	( if [ -f .env ]; then set -a; . ./.env; set +a; fi; \
	  ./wee serve --addr $(ADDR) --workspace $(WORKSPACE) --dir $(DIR) ) & \
	( cd ui && pnpm dev --port $(UI_PORT) ) & \
	wait
