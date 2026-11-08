#!/usr/bin/env bash
# Starts, waits for and stops the dev or preview server of a ui-review run. The server runs
# in its own process group; its PID and log stay in the run directory, so stopping it never
# needs a pattern match (pkill -f can hit the calling shell or other projects).
#
#   server.sh start RUN_DIR -- CMD [ARGS...]  -> starts CMD in the background, writes RUN_DIR/server.pid and server.log
#   server.sh wait URL [SECONDS]              -> polls URL until it answers (default 120 s)
#   server.sh stop RUN_DIR                    -> stops the process group from RUN_DIR/server.pid
set -euo pipefail

cmd="${1:-}"
case "$cmd" in
start)
	dir="${2:?usage: server.sh start RUN_DIR -- CMD [ARGS...]}"
	shift 2
	[[ ${1:-} == "--" ]] && shift
	[[ $# -gt 0 ]] || {
		echo "usage: server.sh start RUN_DIR -- CMD [ARGS...]" >&2
		exit 2
	}
	mkdir -p "$dir"
	if [[ -s "$dir/server.pid" ]] && kill -0 "$(cat "$dir/server.pid")" 2>/dev/null; then
		echo "server already running (pid $(cat "$dir/server.pid"))" >&2
		exit 1
	fi
	setsid "$@" >"$dir/server.log" 2>&1 </dev/null &
	echo "$!" >"$dir/server.pid"
	echo "started pid $! (log: $dir/server.log)"
	;;
wait)
	url="${2:?usage: server.sh wait URL [SECONDS]}"
	limit="${3:-120}"
	for ((i = 0; i < limit * 2; i++)); do
		if curl -fsS -o /dev/null --max-time 5 "$url" 2>/dev/null; then
			echo "up: $url"
			exit 0
		fi
		sleep 0.5
	done
	echo "no answer from $url after ${limit} s" >&2
	exit 1
	;;
stop)
	dir="${2:?usage: server.sh stop RUN_DIR}"
	[[ -s "$dir/server.pid" ]] || {
		echo "no server.pid in $dir (nothing started by ui-review)"
		exit 0
	}
	pid="$(cat "$dir/server.pid")"
	if kill -0 "$pid" 2>/dev/null; then
		# setsid made the server a process group leader: stop the whole group (npm, node, watchers).
		kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
		for _ in $(seq 1 20); do
			kill -0 "$pid" 2>/dev/null || break
			sleep 0.25
		done
		kill -0 "$pid" 2>/dev/null && kill -KILL -- "-$pid" 2>/dev/null || true
		echo "stopped pid $pid"
	else
		echo "server (pid $pid) was not running"
	fi
	rm -f "$dir/server.pid"
	;;
*)
	echo "usage: server.sh start RUN_DIR -- CMD [ARGS...] | wait URL [SECONDS] | stop RUN_DIR" >&2
	exit 2
	;;
esac
