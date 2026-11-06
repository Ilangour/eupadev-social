"""Voice-over and original background music for a Reel.
Usage: audio.py <scenes.json> <out.wav> <seed>. scenes.json: [{"min": seconds, "say": [["eupa"|"toi", text], ...]}].
Writes the mixed track and prints each scene's duration as JSON, so the video follows the voice."""
import json, re, sys, wave
import numpy as np
import parselmouth
from parselmouth.praat import call
from piper import PiperVoice, SynthesisConfig

SR = 44100
VOICE = 'voices/fr_FR-siwis-medium.onnx'  # SIWIS corpus, CC-BY 4.0: credit it.
PITCH = 1.1  # one steady voice everywhere
NOISE, NOISE_W = .2, .25
CENTRE, FLAT = 232, .35  # Hz measured on this voice; lower FLAT = flatter
SAY = [(r'\bIA\b', 'I.A.'), (r'EupaDev', 'Eupa Dève'), (r'\bOpen source\b', 'Opène source'), (r'\bopen source\b', 'opène source'),
       (r'\bappli\b', 'appli'), (r'\bbit\b', 'bitte'), (r'2 500', 'deux mille cinq cents'), (r'’', "'")]

def clean(t):
    for a, b in SAY:
        t = re.sub(a, b, t)
    return t

def flatten(x, rate):
    """Pull the melody towards one steady note, keeping a little life (FLAT = share of the melody kept)."""
    snd = parselmouth.Sound(x, sampling_frequency=rate)
    manip = call(snd, 'To Manipulation', .01, 110, 420)
    tier = call(manip, 'Extract pitch tier')
    call(tier, 'Formula', f'{CENTRE} * (self / {CENTRE}) ^ {FLAT}')
    call([tier, manip], 'Replace pitch tier')
    return call(manip, 'Get resynthesis (overlap-add)').values[0]

def speak(voice, who, text):
    # Low noise = flat, even delivery (Piper's defaults are .667 and .8).
    cfg = SynthesisConfig(length_scale=1.02, noise_scale=NOISE, noise_w_scale=NOISE_W)
    chunks = list(voice.synthesize(clean(text), syn_config=cfg))
    level = lambda y: y / (np.sqrt(np.mean(y ** 2)) + 1e-9) * .12  # same loudness for each sentence
    rate = chunks[0].sample_rate
    x = np.concatenate([level(flatten(c.audio_float_array.astype(np.float64), rate)) for c in chunks])
    n = int(len(x) * SR / rate / PITCH)  # resampling shifts the pitch
    return np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x)

def note(f, dur, kind):
    t = np.arange(int(dur * SR)) / SR
    if kind == 'pad':
        y = sum(np.sin(2 * np.pi * f * m * t + m) / (i + 1) for i, m in enumerate((1, 1.003, 2)))
        return y * np.minimum(t / .5, 1) * np.minimum((dur - t) / .5, 1) * .22
    y = np.sin(2 * np.pi * f * t) + .3 * np.sin(4 * np.pi * f * t)  # soft pluck
    return y * np.exp(-t * 5) * np.minimum(t / .004, 1) * .5

def music(total, rng):
    root = 220 * 2 ** (rng.integers(-4, 4) / 12)
    prog = [[0, 3, 7, 10], [5, 8, 12, 15], [-2, 2, 5, 9], [3, 7, 10, 14]]
    prog = [prog[i] for i in rng.permutation(4)]
    beat = 60 / rng.integers(84, 104)
    bar = beat * 4
    out = np.zeros(int((total + bar + 2) * SR))
    add = lambda y, at: out.__setitem__(slice(int(at * SR), int(at * SR) + len(y)), out[int(at * SR):int(at * SR) + len(y)] + y)
    pattern = rng.permutation([0, 1, 2, 3, 2, 1, 3, 0])
    t, b = 0, 0
    while t < total + .1:
        ch = prog[b % 4]
        for s in ch[:3]:
            add(note(root * 2 ** (s / 12), bar + .4, 'pad'), t)
        add(note(root / 2 * 2 ** (ch[0] / 12), bar, 'pad') * 1.1, t)
        for i, p in enumerate(pattern):
            if rng.random() > .18:
                add(note(root * 2 * 2 ** (ch[p] / 12), .7, 'pluck') * .55, t + i * beat / 2)
        for i in range(4):  # soft kick and tick
            k = np.arange(int(.16 * SR)) / SR
            if i % 2 == 0:
                add(np.sin(2 * np.pi * (46 + 70 * np.exp(-k * 40)) * k) * np.exp(-k * 22) * .75, t + i * beat)
            add(rng.standard_normal(int(.03 * SR)) * np.exp(-np.arange(int(.03 * SR)) / 300) * .05, t + i * beat + beat / 2)
        t += bar
        b += 1
    return out[:int(total * SR)]

scenes, target, seed = json.load(open(sys.argv[1])), sys.argv[2], sys.argv[3]
voice = PiperVoice.load(VOICE)
gap = np.zeros(int(.22 * SR))
parts, durations = [], []
for s in scenes:
    x = np.concatenate([np.concatenate([speak(voice, w, t), gap]) for w, t in s['say']]) if s['say'] else np.zeros(0)
    d = max(s.get('min', 1.2), len(x) / SR + .25)
    parts.append(np.pad(x, (0, int(d * SR) - len(x))))
    durations.append(round(d, 3))
speech = np.concatenate(parts)
speech = speech / (np.abs(speech).max() + 1e-9) * .92
total = len(speech) / SR

rng = np.random.default_rng(sum(map(ord, seed)))
bed = music(total, rng)[:len(speech)]
bed = bed / (np.abs(bed).max() + 1e-9)
env = np.convolve(np.abs(speech) > .02, np.ones(SR // 5) / (SR // 5), 'same')
bed = bed * (.26 - .15 * np.clip(env * 2, 0, 1))        # music dips under the voice
fade = np.minimum(1, (total - np.arange(len(bed)) / SR) / 1.0)
mix = np.clip(speech + bed * fade, -1, 1)
with wave.open(target, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print(json.dumps(durations))
