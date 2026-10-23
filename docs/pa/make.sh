#!/bin/bash
# Rebuilds the PA announcements (pa/*.mp3, played on the Apply form by Ambience.html) from lines.json. Run from docs/pa: ./make.sh [elevenlabs VOICE_ID]
#   ./make.sh                  -> macOS `say` (Samantha), placeholder quality
#   ./make.sh <voice id>       -> ElevenLabs via the motion-reel skill's tts.py (needs a valid ELEVENLABS_API_KEY in
#                                 ~/.claude/skills/motion-reel/.env; never put the key in this repo: docs/ is public)
# Every take goes through the same filter: a little lower and slower, a CCTV/PA speaker band, a short room echo.
set -e
cd "$(dirname "$0")"
FX="aresample=44100,asetrate=44100*0.94,aresample=44100,atempo=0.97,highpass=f=220,lowpass=f=4200,aecho=0.8:0.5:60:0.18,volume=1.6,loudnorm=I=-16:TP=-1.5"
tmp=$(mktemp -d)
if [ -n "$1" ]; then
  (cd "$tmp" && python3 ~/.claude/skills/motion-reel/scripts/tts.py "$OLDPWD/lines.json" --voice "$1")
fi
python3 -c 'import json,sys; [print(n+"\t"+t) for n,t in json.load(open("lines.json"))]' | while IFS=$'\t' read -r name text; do
  if [ -n "$1" ]; then src="$tmp/audio/$name.mp3"; else say -v Samantha -r 150 -o "$tmp/$name.aiff" "$text"; src="$tmp/$name.aiff"; fi
  ffmpeg -loglevel error -y -i "$src" -af "$FX" -ac 1 -b:a 64k "$name.mp3" </dev/null
done
rm -rf "$tmp"
ls -la *.mp3
