"""Procedural soundtrack: music-box BGM, sound effects and voice blips, all synthesised."""
import math
import random
import wave

import numpy as np

SR = 44100
NOTE = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9,
        'A#': 10, 'B': 11}
PENTA = (0, 2, 4, 7, 9)
PUNCT = set('，。！？、…—―·~～,.!?- "“”‘’「」『』（）()')

PAD = {'Am': ('A2', 'E3', 'A3', 'C4', 'E4'), 'F': ('F2', 'C3', 'F3', 'A3', 'C4'),
       'C': ('C3', 'G3', 'C4', 'E4', 'G4'), 'G': ('G2', 'D3', 'G3', 'B3', 'D4')}
ARP = {'Am': ('A4', 'C5', 'E5', 'A5'), 'F': ('F4', 'A4', 'C5', 'F5'),
       'C': ('C5', 'E5', 'G5', 'C6'), 'G': ('G4', 'B4', 'D5', 'G5')}


def freq(name):
    pitch, octave = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((NOTE[pitch] + 12 * (octave + 1) - 69) / 12)


def _t(dur):
    return np.arange(int(dur * SR)) / SR


def bell(f, dur=1.6, amp=0.2):
    t = _t(dur)
    sig = np.zeros_like(t)
    for ratio, gain, decay in ((1, 1, 3.0), (2.0, 0.45, 5.0), (3.0, 0.2, 8.0), (4.2, 0.12, 11.0)):
        sig += gain * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t * decay)
    return amp * sig * (1 - np.exp(-t * 600))


def pad(freqs, dur, amp=0.05):
    t = _t(dur)
    sig = np.zeros_like(t)
    for f in freqs:
        vib = 1 + 0.003 * np.sin(2 * np.pi * 5 * t)
        for k, g in ((1, 1.0), (2, 0.3), (3, 0.12)):
            sig += g * np.sin(2 * np.pi * f * k * vib * t + random.random() * 6)
    env = np.minimum(1, t / 0.8) * np.minimum(1, (dur - t) / 0.9)
    return amp * sig * np.clip(env, 0, 1)


def chirp(f0, f1, dur, amp=0.2, decay=6.0):
    t = _t(dur)
    f = np.geomspace(f0, f1, len(t))
    phase = 2 * np.pi * np.cumsum(f) / SR
    return amp * np.sin(phase) * np.exp(-t * decay) * (1 - np.exp(-t * 300))


def noise_sweep(dur, f0, f1, amp=0.2, rise=True):
    t = _t(dur)
    noise = np.random.default_rng(3).standard_normal(len(t))
    cut = np.geomspace(f0, f1, len(t))
    alpha = 1 - np.exp(-2 * np.pi * cut / SR)
    out = np.empty_like(noise)
    y = 0.0
    for i in range(len(noise)):  # one-pole low-pass with a moving cutoff
        y += alpha[i] * (noise[i] - y)
        out[i] = y
    env = (t / dur) ** 2 if rise else np.exp(-t * 4)
    return amp * out * env / (np.abs(out).max() + 1e-9)


def boom(dur=1.6, amp=0.6):
    t = _t(dur)
    f = 40 + 70 * np.exp(-t * 6)
    phase = 2 * np.pi * np.cumsum(f) / SR
    hit = np.random.default_rng(9).standard_normal(len(t)) * np.exp(-t * 18) * 0.5
    return amp * (np.sin(phase) * np.exp(-t * 2.5) + hit)


def sfx(name):
    rng = random.Random(name)
    if name == 'twinkle':
        out = np.zeros(int(0.8 * SR))
        for i in range(4):
            note = freq('C6') * 2 ** (rng.choice(PENTA) / 12)
            mix_in(out, i * 0.07, bell(note, 0.6, 0.12))
        return out
    if name == 'shooting_star':
        out = chirp(2600, 1100, 0.9, 0.12, 3)
        mix_in(out, 0.1, sfx('twinkle'))
        return out
    if name == 'pop':
        out = chirp(320, 980, 0.18, 0.3, 14)
        mix_in(out, 0.05, bell(freq('E6'), 0.6, 0.12))
        return out
    if name == 'surprise':
        out = chirp(500, 1500, 0.14, 0.18, 10)
        mix_in(out, 0.16, chirp(600, 1800, 0.14, 0.18, 10))
        return out
    if name == 'charge':
        dur = 2.0
        out = noise_sweep(dur, 200, 5000, 0.25) + chirp(180, 900, dur, 0.12, 0.0) * (_t(dur) / dur)
        for i in range(16):
            step = PENTA[i % 5] + 12 * (i // 5)
            mix_in(out, dur * (1 - (1 - i / 16) ** 1.6), bell(freq('C5') * 2 ** (step / 12), 0.5, 0.1))
        return out
    if name == 'flash':
        out = boom()
        for n in ('C5', 'E5', 'G5', 'C6'):
            mix_in(out, 0.0, bell(freq(n), 2.0, 0.1))
        return out
    if name == 'reveal':
        out = pad([freq(n) for n in ('C4', 'E4', 'G4', 'C5')], 3.0, 0.04)
        for i in range(10):
            step = PENTA[(9 - i) % 5] + 12 * ((9 - i) // 5)
            mix_in(out, i * 0.09, bell(freq('C5') * 2 ** (step / 12), 1.2, 0.11))
        return out
    raise ValueError(f'unknown sound effect: {name}')


def mix_in(buf, at, sig):
    start = int(at * SR)
    if start >= len(buf) or start + len(sig) <= 0:
        return
    sig = sig[max(0, -start):]
    start = max(0, start)
    end = min(len(buf), start + len(sig))
    buf[start:end] += sig[:end - start]


def music(total, start=0.3):
    out = np.zeros(int(total * SR) + 1)
    beat = 60 / 80
    bar = beat * 4
    prog = ('Am', 'F', 'C', 'G')
    k = 0
    while start + k * bar < total:
        chord = prog[k % 4]
        t0 = start + k * bar
        mix_in(out, t0, pad([freq(n) for n in PAD[chord]], bar + 0.9, 0.035))
        notes = ARP[chord]
        for i, idx in enumerate((0, 1, 2, 3, 2, 1, 2, 1)):
            if t0 + i * beat / 2 > 1.2:
                mix_in(out, t0 + i * beat / 2, bell(freq(notes[idx]), 1.4, 0.07))
        k += 1
    fade = np.ones_like(out)
    n_in, n_out = int(1.5 * SR), int(2.0 * SR)
    fade[:n_in] = np.linspace(0, 1, n_in)
    fade[-n_out:] = np.linspace(1, 0, n_out)
    return out * fade


def voice(text, pitch):
    """Gentle 'voice blip' per syllable, in the style of many indie games."""
    rng = random.Random(text)
    out = np.zeros(int((len(text) / 9 + 0.5) * SR))
    i = 0
    for ch in text:
        if ch in PUNCT:
            continue
        f = pitch * 2 ** (rng.choice(PENTA) / 12)
        t = _t(0.07)
        blip = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
        mix_in(out, i / 9.0, 0.07 * blip * np.exp(-t * 35) * (1 - np.exp(-t * 800)))
        i += 1
    return out


def reverb(x, seconds=1.6, seed=0):
    t = _t(seconds)
    ir = np.random.default_rng(seed).standard_normal(len(t)) * np.exp(-t * 3.5)
    ir /= np.sqrt(np.sum(ir ** 2))
    n = 1 << int(math.ceil(math.log2(len(x) + len(ir))))
    y = np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(ir, n), n)
    return y[:len(x)]


def render_audio(timeline, story, total, path):
    random.seed(1)
    dry = music(total) if story.get('music', True) else np.zeros(int(total * SR) + 1)
    voices = story.get('characters', {})
    for shot in timeline:
        for fx in shot.get('sfx', []):
            mix_in(dry, shot['start'] + fx['at'], sfx(fx['sound']))
        for ln in shot.get('dialogue', []):
            pitch = voices.get(ln['who'], {}).get('voice_pitch', 600)
            mix_in(dry, shot['start'] + ln['at'], voice(ln['zh'], pitch))
    left = dry + 0.28 * reverb(dry, seed=1)
    right = dry + 0.28 * reverb(dry, seed=2)
    stereo = np.stack([left, right], axis=1)
    stereo = np.tanh(stereo / (np.abs(stereo).max() + 1e-9) * 1.1) * 0.89
    pcm = (stereo * 32767).astype(np.int16)
    with wave.open(str(path), 'wb') as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())
