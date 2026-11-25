#!/bin/bash
# The hearing regression suite: synthetic instruments through the real game in headless Chromium.
#   bash test/hear/suite.sh [outdir] [quick]      (build first: python3 build.py; NODE_PATH=$(npm root -g))
#   HEAR_PAGE=/path/old-build.html bash test/hear/suite.sh out-old      the same runs against another build (before/after)
# Each run writes <outdir>/<name>.log; the summary lines are printed at the end. About 25 min (quick: about 8).
# Timings depend on the machine: run it alone (a busy machine makes the model's looks slower and feedback later).
cd "$(dirname "$0")/../.." || exit 1
OUT=${1:-/tmp/hear-suite}; QUICK=$2; mkdir -p "$OUT"
export NODE_PATH=${NODE_PATH:-$(npm root -g)}
run(){ name=$1; shift; echo "== $* (load $(cut -d' ' -f1 /proc/loadavg))" > "$OUT/$name.log"; timeout 420 node "$@" >> "$OUT/$name.log" 2>&1; echo "rc=$?" >> "$OUT/$name.log"; }
[ -z "$HEAR_PAGE" ] && run core test/hear/core.js                                   # detector, resampler, tuning under Node
run cap1 test/hear/capture.js throttle=1                                            # dropped audio + onset latency
run cap4 test/hear/capture.js throttle=4
run prac test/hear/live.js practice n=9                                             # Practice: right chords accepted
run pracwrong test/hear/live.js practice n=9 play=wrong
run stright test/hear/live.js stage play=right                                      # Stage: one strum per chord
run stwrong test/hear/live.js stage play=wrong
run pat100 test/hear/live.js stage play=pattern pattern=D.DU.UDU tempo=125          # continuous strumming, chord changes
run piano test/hear/parts.js inst=piano play=right tempo=150
run drums test/hear/parts.js inst=drums play=right
if [ -z "$QUICK" ]; then
  run prac3 test/hear/live.js practice n=6 throttle=3
  run stnone test/hear/live.js stage play=none leak=0.7                             # nobody plays, the band leaks into the mic
  run pat80 test/hear/live.js stage play=pattern pattern=D.DU.UDU tempo=100
  run pat120 test/hear/live.js stage play=pattern pattern=D.DU.UDU tempo=150
  run pat140 test/hear/live.js stage play=pattern pattern=D.DU.UDU tempo=175
  run pat100t3 test/hear/live.js stage play=pattern pattern=D.DU.UDU tempo=125 throttle=3
  run pianowrong test/hear/parts.js inst=piano play=wrong tempo=150
  run drumsnone test/hear/parts.js inst=drums play=none leak=0.7
  run bass test/hear/parts.js inst=bass play=right
  run tune test/hear/live.js practice n=6 cents=-35                                 # a flat guitar: accepted, and reported
fi
for f in "$OUT"/*.log; do echo "## $(basename "$f" .log)"; grep -E "^(CAPTURE|  ramp|  Hear.onOnset|  Mic.onset|PRACTICE|STAGE|  feedback|PARTS|TUNING|  FAIL|ERR|all budgets|BUDGET)" "$f" | cut -c1-330; done
