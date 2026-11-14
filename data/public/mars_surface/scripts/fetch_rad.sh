#!/bin/bash
# usage: fetch_rad.sh outdir YYYY-MM ...
out=$1; shift
for m in "$@"; do
  s="${m//-/}01T000000Z"
  e=$(date -u -d "$m-01 +1 month" +%Y%m%dT000000Z)
  j=$(curl -sL -H "Accept: application/json" "https://cdaweb.gsfc.nasa.gov/WS/cdasr/1/dataviews/sp_phys/datasets/MSL_RAD_OBS-L2/data/$s,$e/DOSIMETRY_TOTAL_f?format=text")
  u=$(echo "$j" | grep -o '"Name":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -n "$u" ]; then curl -sL "$u" -o "$out/msl_rad_l2_$m.txt"; echo "$m ok $(wc -l < $out/msl_rad_l2_$m.txt)"; else echo "$m FAIL $(echo $j | head -c 200)"; fi
done
