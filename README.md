# Ai-Vtuber

朝暮, an AI VTuber with a Live2D body. Two ways to use her:

- **Videos** (`npm run video`): an AI writes a short script in her voice and
  world, and she performs it: lines, faces, gestures, built-in meme stickers,
  camera moves, captions, sound effects and subtitles. Out comes an MP4 in
  9:16 (Shorts / Reels / 竖屏) or 16:9, ready to upload.
- **Live** (`npm start`): she reads YouTube live chat and answers out loud,
  shown in OBS.

```
Videos: topic ─► AI writer ─► script.json ─► voice ─► 朝暮 performs it frame by frame ─► video.mp4
Live:   YouTube chat ─► AI brain ─► voice ─► Live2D avatar page ─► OBS ─► YouTube Live
```

The AI can be free (a local model with Ollama, or free tiers of Gemini/Groq),
and so can the voice (Microsoft Edge voices, or your own cloned voice with
GPT-SoVITS). You don't need VTube Studio running: this app draws the model
itself.

## What you need

- **Node.js 22 or newer**: https://nodejs.org (the "LTS" download).
- **OBS Studio** (only for live mode): https://obsproject.com
- **Your Live2D model folder** (the one VTube Studio uses).
- **One AI option** (all have a free way in, see [Pick a brain](#pick-a-brain)).

## Setup

Open a terminal (on Windows: PowerShell) and run:

```bash
git clone https://github.com/gigichengnc/Ai-Vtuber.git
cd Ai-Vtuber
npm install
npm run setup        # downloads the Live2D Cubism Core and a browser for rendering videos
```

**1. Add your model.** Copy your whole model folder into `models/`, so you get
`models/zhaomu/朝暮_v6.model3.json` with the textures, `expressions/` and
`motions/` folders next to it. With VTube Studio from Steam, the folder is in
`...\steamapps\common\VTube Studio\VTube Studio_Data\StreamingAssets\Live2DModels\`.
The `models/` folder is ignored by git, so your model is never uploaded.

**2. Make your settings file.** Copy `.env.example` to `.env` and choose a brain
(below). Everything else can stay as it is to start.

**3. Tell the AI who she is.** Copy `config/lore.example.md` to
`config/lore.md` and fill in 朝暮's world and story (or use the one made from
your novel). `config/lore.md` is kept out of git so your story stays private.
Also check `config/persona.md` (her personality and safety rules). Both the
video writer and live chat follow these closely.

**4. Try it.** Make a video:

```bash
npm run video
```

Or start live mode with `npm start` and open **http://localhost:8787/?panel**:
she appears on the left with a control panel on the right. Click "Click to
turn on sound" once, type in **Make her say**, and press **Say it**.

## Make videos

```bash
npm run video                                    # a POV short (9:16); the AI picks the topic
npm run video -- --type skit                     # pov | skit | explainer
npm run video -- --aspect landscape              # portrait (9:16) | landscape (16:9)
npm run video -- --topic "叫你起床"               # give the AI a topic
npm run video -- --write-only                    # write the script only, render later
npm run video -- --script "output/<folder>/script.json"   # render a script you edited
```

Each video gets its own folder in `output/`:

- `video.mp4`: the finished video (1080×1920 or 1920×1080, 30 fps).
- `script.json`: what she does, beat by beat. Change any line, face, sticker
  or caption and render it again with `--script`.
- `subtitles.srt`: subtitles, if you'd rather add them in your editor.
- `upload.txt`: title, description and tags for the upload page.

Video types:

- **pov**: she talks straight to you in an everyday moment from her world
  (waking you up, good night, sulking, cheering you up), like the "起床啦"
  style of shorts.
- **skit**: a tiny story or meme with a twist and a punchline; can use a
  narrator voice.
- **explainer**: she explains something interesting in her own voice.

The AI remembers past titles (`output/episodes.jsonl`) so it doesn't repeat
ideas. Rendering happens in a hidden browser: a 45-second short takes a few
minutes on a PC with a graphics card.

**Backgrounds and music.** Put images in `assets/backgrounds/` (say
`bedroom.jpg`) and the AI will use them where they fit; without images she
gets soft colour gradients. Put music in `assets/music/` and name it in a
script's `"music"` field. See `assets/README.md`.

**What a beat can do** (in `script.json`): `say`, `speaker` (`main` or
`narrator`), `emotion`, `motion`, `sticker` (her model's built-in effects:
`angry_mark`, `question`, `sweat`, `tears`, `heart_eyes`, `star_eyes`,
`money_eyes`, `spiral_eyes`, `gloom`, `blank_eyes`, `squint`, `puppy_mouth`),
`camera` (`close`, `medium`, `wide`, `shake`), `caption`, `sfx` (`pop`,
`ding`, `boing`, `whoosh`, `wobble`), `background`, `hold`, `pause`. Camera
framings live in `config/avatar.json` under `cameras`.

## Her voice

- **Edge** (default, free): set `TTS_VOICE` in `.env`, e.g.
  `zh-CN-XiaoyiNeural`, `zh-CN-XiaoxiaoNeural`, `zh-TW-HsiaoChenNeural`.
- **Your own cloned voice with GPT-SoVITS** (free, on your PC): install
  [GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) (it has a Windows
  package), start its API server (`api_v2.py`, port 9880), set
  `TTS_PROVIDER=gpt-sovits`, and fill in `config/voice.json`. Give a short
  reference clip (3 to 10 seconds) and its exact words for `default`, and
  optionally one per emotion (`happy`, `angry`, `sleepy`...): an angry clip
  makes her angry lines sound angry.
- **Only clone a voice you have the rights to**: your own, or a voice actor
  who agreed to it in writing. Never another VTuber's or anyone else's voice.
- Narrator lines use `NARRATOR_VOICE` (an Edge voice).

## Pick a brain

Both the video writer and live chat use it. Set these three lines in `.env`. Any service with an "OpenAI-compatible" API
works.

| Option | Cost | Settings |
|---|---|---|
| **Ollama** (runs on your PC) | Free, private | Install [Ollama](https://ollama.com), run `ollama pull qwen3:8b`, then `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_MODEL=qwen3:8b`, `LLM_API_KEY=` (empty) |
| **Google Gemini** | Free tier | Key from [AI Studio](https://aistudio.google.com/apikey); `LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`, `LLM_MODEL=gemini-2.5-flash` |
| **Groq** | Free tier, very fast | Key from [Groq console](https://console.groq.com/keys); `LLM_BASE_URL=https://api.groq.com/openai/v1`, `LLM_MODEL=llama-3.3-70b-versatile` |

Notes:
- Ollama needs a reasonably strong PC; running a model, OBS and the stream at
  once is heavy. If it's slow, try a smaller model or an online option.
- Free tiers limit how many requests you can make per minute and per day. With
  default settings she makes roughly one request per chat batch, plus one a
  minute when chat is quiet (`IDLE_TALK_SECONDS`, set to `0` to turn off).
- Free tiers may use what you send to improve the provider's products. Read
  their terms if that matters to you.
- Other compatible services (OpenRouter, DeepSeek, LM Studio, ...) work too:
  put their base URL, key and model name in the same three settings.

## Show her in OBS

1. In OBS, add a **Browser** source.
2. URL: `http://localhost:8787/` (no `?panel`!). Width `1920`, height `1080`.
3. Tick **Control audio via OBS** so her voice goes into your stream.
4. The background is transparent, so put her over any scene. Use the
   **Position** sliders in the control panel to move/resize her, then press
   **Copy for config/avatar.json** and paste the line into `config/avatar.json`
   to keep it.

Keep the panel open in your browser while streaming. The page's own options:
`?mute` (move the mouth but stay silent), `?subtitles=0` (hide the speech
bubble), `?bg=%2300ff00` (green background for chroma key).

## Read YouTube live chat

1. In [Google Cloud Console](https://console.cloud.google.com/), create a
   project, enable **YouTube Data API v3**, and create an **API key**.
2. In `.env`: `YOUTUBE_API_KEY=...`, `YOUTUBE_VIDEO_ID=` the id of your live
   stream (the part after `watch?v=`), and `CHAT_SOURCES=console,youtube`.
3. Start your stream, then `npm start`. She skips messages from before she
   connected.

The free quota is 10,000 units a day and each chat check costs 5, so checking
every 8 seconds (`YOUTUBE_POLL_SECONDS`) lasts about 4.4 hours of streaming per
day. Check less often for longer streams.

## The control panel

- **Stop talking (panic)**: she stops mid-sentence and ignores chat until you
  press **Resume**. Use it if chat tries to make her say something bad.
- **Make her say**: speak exact text, skipping the AI.
- **Chat as a viewer**: test the AI without going live.
- **Faces / Moves**: try every expression and motion.
- **Log**: chat, her replies, and errors.

You can also type in the terminal: plain text chats as a viewer, `/say 文字`
makes her speak, `/pause` and `/resume` work too.

## Make her yours

Edits to files in `config/` apply right away, no restart needed.

- `config/persona.md`: her name, personality, and safety rules.
- `config/lore.md`: her world and story (private, not in git; template in
  `config/lore.example.md`). The AI stays true to it.
- `config/voice.json`: GPT-SoVITS reference clips, if you use a cloned voice.
- `config/avatar.json`: which model to load, which expression each emotion uses,
  what each motion is (the descriptions help the AI pick), the default framing,
  and lip-sync strength (`mouth.gain`).
- `config/blocklist.txt`: words that are never answered and never spoken.
- `.env`: voice (`TTS_VOICE`, e.g. `zh-CN-XiaoyiNeural`, `zh-TW-HsiaoChenNeural`,
  `en-US-AnaNeural`, `ja-JP-NanamiNeural`), speed and pitch.

## Troubleshooting

- **"Couldn't load the Live2D model"**: check that the path in
  `config/avatar.json` matches your `.model3.json` file inside `models/`.
- **No sound in the browser**: click "Click to turn on sound". In OBS, tick
  "Control audio via OBS" and check the source isn't muted in the mixer.
- **"Couldn't reach the local AI ... Is Ollama running?"**: start Ollama, or
  switch to an online option.
- **HTTP 429 from the AI**: you hit the free tier's limit. Raise
  `IDLE_TALK_SECONDS` or wait.
- **Voice fails**: Edge TTS is a free, unofficial service and needs internet.
  Set `TTS_PROVIDER=mock` to test everything else with beeps.
- **Video render can't start a browser**: run `npx playwright install
  chromium`, or set `BROWSER_PATH` in `.env` to Chrome or Edge.
- **Video render fails with a WebGL error**: set `RENDER_SOFTWARE_GL=1` (slow,
  but works without a graphics card).
- **The AI's script "wasn't valid JSON"**: small local models sometimes
  struggle with long scripts; it retries 3 times. A bigger model, or Gemini or
  Groq, helps.

## For developers

```bash
npm run dev        # restart the server when server code changes
npm run typecheck
npm test
```

Layout: `server/` (web server, AI client and live brain, voice, chat sources,
moderation), `video/` (script writer, checker, renderer, sound effects),
`web/` (avatar page, control panel and video render page; PixiJS v8 +
[untitled-pixi-live2d-engine](https://github.com/Untitled-Story/untitled-pixi-live2d-engine)),
`shared/protocol.ts` (messages between them), `config/` (persona and avatar).

## Licenses

The Live2D Cubism Core is downloaded from Live2D by `npm run setup` and is
covered by the [Live2D Proprietary Software License](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html).
If you earn money from the stream, check Live2D's SDK license terms on
live2d.com for whether you need a publication license. Your model and its artwork belong to
you and their creators; they are not part of this repository. When you upload
AI-made videos, label them as AI-generated where the platform asks (Bilibili
and YouTube both have a setting for it).
