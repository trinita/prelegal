#!/usr/bin/env bash
# Stop Prelegal on macOS. The logic lives in scripts/_compose.sh, shared with the
# other platform so a fix cannot land on one and miss the other.
exec "$(dirname "$0")/_compose.sh" stop
