#!/bin/bash
# Rebuilds the PA announcements (pa/*.mp3, played on the Apply form by Ambience.html) from lines.json. Run from docs/pa: ./make.sh [elevenlabs VOICE_ID]
#   ./make.sh                  -> macOS `say` (Samantha), placeholder quality
#   ./make.sh <voice id>       -> ElevenLabs via the motion-reel skill's tts.py (needs a valid ELEVENLABS_API_KEY in
#                                 ~/.claude/skills/motion-reel/.env; never put the key in this repo: docs/ is public)
# Every take goes through the same filter: lower and slower, a slight tape wobble, a narrow old-PA band, a little
# grit and a longer room, so it sounds like a speaker in a hallway, not clean AI speech.
set -e
cd "$(dirname "$0")"
FX="aresample=44100,asetrate=44100*0.9,aresample=44100,atempo=0.95,vibrato=f=0.7:d=0.06,highpass=f=300,lowpass=f=3400,acrusher=bits=10:mix=0.25:mode=log,aecho=0.8:0.55:90|170:0.22|0.12,volume=1.8,loudnorm=I=-17:TP=-1.5"
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
