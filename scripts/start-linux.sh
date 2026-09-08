#!/usr/bin/env bash
# Start Prelegal on Linux. The logic lives in scripts/_compose.sh, shared with the
# other platform so a fix cannot land on one and miss the other.
exec "$(dirname "$0")/_compose.sh" start
