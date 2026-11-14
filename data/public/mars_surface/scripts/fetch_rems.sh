#!/bin/bash
# usage: fetch_rems.sh rawdir outcsv sol...
raw=$1; out=$2; shift 2
B=https://pds-atmospheres.nmsu.edu/PDS/data/mslrem_1001/DATA
dirs=$(curl -sL "$B/" | grep -o 'href="SOL_[^"]*"' | cut -d'"' -f2)
for sol in "$@"; do
  for try in 0 1 2 3; do
    s=$((sol+try)); found=""
    for d in $dirs; do a=$((10#${d:4:5})); b=$((10#${d:10:5})); if [ $s -ge $a ] && [ $s -le $b ]; then found=$d; fi; done
    p=$(printf "SOL%05d" $s)
    f=$(curl -sL "$B/$found$p/" | grep -o 'href="RME_[^"]*RMD[^"]*\.TAB"' | head -1 | cut -d'"' -f2)
    if [ -n "$f" ]; then
      curl -sL "$B/$found$p/${f%.TAB}.LBL" -o "$raw/${f%.TAB}.LBL"
      curl -sL "$B/$found$p/$f" | python3 -I "$(dirname $0)/agg_rmd.py" "$raw/${f%.TAB}.LBL" $s >> "$out"
      echo "sol $s ok ($f)"; break
    fi
  done
  [ -z "$f" ] && echo "sol $sol: no RMD"
done
