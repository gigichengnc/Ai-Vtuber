# Ai-Vtuber

An AI VTuber for YouTube. She reads your live chat, thinks of a reply with a
free or cheap AI model, speaks it with a free voice, and her Live2D model
moves, blinks, lip-syncs and changes expression on screen. OBS shows her
through a web page.

```
YouTube chat ─► AI brain (Ollama / Gemini / Groq) ─► voice (Edge TTS) ─► Live2D avatar page ─► OBS ─► YouTube Live
```

You don't need VTube Studio running: this app draws the model itself.

## What you need

- **Node.js 22 or newer**: https://nodejs.org (the "LTS" download).
- **OBS Studio**: https://obsproject.com
- **Your Live2D model folder** (the one VTube Studio uses).
- **One AI option** (all have a free way in, see [Pick a brain](#pick-a-brain)).

## Setup

Open a terminal (on Windows: PowerShell) and run:

```bash
git clone https://github.com/gigichengnc/Ai-Vtuber.git
cd Ai-Vtuber
npm install
npm run setup        # downloads the Live2D Cubism Core from live2d.com
```

**1. Add your model.** Copy your whole model folder into `models/`, so you get
`models/zhaomu/朝暮_v6.model3.json` with the textures, `expressions/` and
`motions/` folders next to it. With VTube Studio from Steam, the folder is in
`...\steamapps\common\VTube Studio\VTube Studio_Data\StreamingAssets\Live2DModels\`.
The `models/` folder is ignored by git, so your model is never uploaded.

**2. Make your settings file.** Copy `.env.example` to `.env` and choose a brain
(below). Everything else can stay as it is to start.

**3. Start it.**

```bash
npm start
```

Then open **http://localhost:8787/?panel** in your browser. You'll see her on
the left and a control panel on the right. Click "Click to turn on sound" once,
type in **Make her say**, and press **Say it**.

## Pick a brain

Set these three lines in `.env`. Any service with an "OpenAI-compatible" API
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

## For developers

```bash
npm run dev        # restart the server when server code changes
npm run typecheck
npm test
```

Layout: `server/` (web server, AI brain, voice, chat sources, moderation),
`web/` (avatar page and control panel; PixiJS v8 +
[untitled-pixi-live2d-engine](https://github.com/Untitled-Story/untitled-pixi-live2d-engine)),
`shared/protocol.ts` (messages between them), `config/` (persona and avatar).

## Licenses

The Live2D Cubism Core is downloaded from Live2D by `npm run setup` and is
covered by the [Live2D Proprietary Software License](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html).
If you earn money from the stream, check Live2D's SDK license terms on
live2d.com for whether you need a publication license. Your model and its artwork belong to
you and their creators; they are not part of this repository.
