## Image Generation Prompts for Marketplace Characters

This README provides copy‑pasteable prompts to generate two consistent image styles for every character defined in `scripts/seed-now.ts`.

- Style A: Porcelain chibi portrait (matches the first reference image: cute, seated, lace detail, cool dark background, soft volumetric light).
- Style B: Moody minimalist toy figure (matches the second reference image: full‑body vinyl toy, foggy outdoor scene, soft top light, desaturated palette).

Use these as-is in your image model of choice (Flux, SDXL, etc.). Each character has two ready prompts. You can keep parameters below for consistency.

### Recommended parameters

- Aspect ratio: 1:1
- Steps: 30–40
- Guidance/CFG: 4–7
- Sampler: DPM++ 2M Karras (or model default)
- Seed: random

### File naming and storage

- Directory: `public/avatars/`
- Save both styles for each character.
- Preferred format: WebP (`.webp`); keep PNG fallback with same basename.
- Filename pattern: `{username}-{style}.webp` and `{username}-{style}.png`
  - Styles: `chibi` (porcelain chibi portrait), `toy` (moody minimalist figure)
- Use in code: set `avatar_url` to `/avatars/{username}-chibi.webp`

Filenames per character:

- eliza: `eliza-chibi.webp`, `eliza-toy.webp`
- codementor: `codementor-chibi.webp`, `codementor-toy.webp`
- luna_anime: `luna_anime-chibi.webp`, `luna_anime-toy.webp`
- creativespark: `creativespark-chibi.webp`, `creativespark-toy.webp`
- gamemaster: `gamemaster-chibi.webp`, `gamemaster-toy.webp`
- prof_ada: `prof_ada-chibi.webp`, `prof_ada-toy.webp`
- comedybot: `comedybot-chibi.webp`, `comedybot-toy.webp`
- voiceai: `voiceai-chibi.webp`, `voiceai-toy.webp`
- historyscholar: `historyscholar-chibi.webp`, `historyscholar-toy.webp`
- wellnesscoach: `wellnesscoach-chibi.webp`, `wellnesscoach-toy.webp`
- edad: `edad-chibi.webp`, `edad-toy.webp`
- mysticoracle: `mysticoracle-chibi.webp`, `mysticoracle-toy.webp`
- amara: `amara-chibi.webp`, `amara-toy.webp`

### Shared negative prompt

```
lowres, blurry, noisy, grain, overexposed, underexposed, jpeg artifacts,
text, watermark, logo, caption, frame, border, signature,
extra limbs, extra fingers, deformed hands, disfigured, mutated, malformed,
nsfw, nude, blood, gore, violence, open mouth, teeth, open eyes (for chibi)
```

---

## Base prompt templates (for reference)

You do not need to edit these; they are embedded in every character prompt below.

### Style A — Porcelain chibi portrait (template)

```
ultra-detailed porcelain chibi doll, seated, eyes closed, serene expression,
intricate lace dress and embroidery, delicate hair strands, soft volumetric rim light,
cool dark studio background, shallow depth of field, bokeh, subsurface scattering,
85mm lens look, f/1.8, centered composition, award-winning cinematic 3D render
```

### Style B — Moody minimalist toy figure (template)

```
minimalist stylized vinyl toy character, full body standing on a rocky ground,
moody foggy outdoor background, desaturated palette, soft overhead key light,
gentle rim light, matte plastic materials, smooth edges, soft ray-traced shadows,
28mm lens look, centered composition, cinematic grade
```

---

## Character prompts

Copy the two blocks under each character directly into your generator. Each includes the template + character flavor, accessories, and colors.

### Eliza (assistant, brand accent)

Chibi — Porcelain portrait

```
ultra-detailed porcelain chibi doll, seated, eyes closed, serene expression,
intricate lace dress with subtle modern tech trim, delicate straight silver hair with a laurel headband,
soft volumetric rim light with a faint warm amber accent (#FF5800), cool dark studio background,
shallow depth of field, bokeh, subsurface scattering, 85mm lens look, f/1.8,
centered composition, award-winning cinematic 3D render
```

Minimalist toy — Moody full body

```
minimalist stylized vinyl toy character, full body standing on a rocky ground,
moody foggy outdoor background, desaturated palette with warm amber accent (#FF5800),
clean parka, subtle tech crossbody bag, white sneakers, smooth matte finish,
soft overhead key light and gentle rim light, soft ray-traced shadows, 28mm lens,
centered composition, cinematic grade
```

---

### Code Mentor (technical, hoodie, glasses)

Chibi — Porcelain portrait

```
ultra-detailed porcelain chibi doll, seated, eyes closed, serene expression,
tailored knit hoodie with embroidered code glyphs, neat short dark hair, thin round glasses,
subtle teal accent lighting, intricate fabric detail, soft volumetric rim light,
cool dark studio background, shallow depth of field, bokeh, 85mm lens look
```

Minimalist toy — Moody full body

```
minimalist stylized vinyl toy character, full body, hoodie with clean patch-like code icons,
slim tech backpack, casual joggers, white sneakers, optional glasses,
foggy outdoor background, desaturated palette with teal accent, soft overhead key,
gentle rim light, matte plastic, 28mm lens, centered composition
```

---

### Luna (anime fan, kawaii, stars)

Chibi — Porcelain portrait

```
ultra-detailed porcelain chibi doll, seated, eyes closed, sweet smile,
long pastel lavender hair with star hairpins and soft bangs,
lace dress with subtle sakura embroidery, dreamy soft volumetric rim light,
cool dark studio background with faint twinkle bokeh, 85mm lens look
```

Minimalist toy — Moody full body

```
minimalist stylized vinyl toy character, full body, pastel lavender hair-like cap shape,
oversized kawaii hoodie with star motif, mini crossbody pouch, white sneakers,
moody fog, desaturated scene with gentle pastel accent, soft top light and rim,
matte plastic, 28mm lens, centered
```

---

### Creative Spark (art, paint, ideas)

Chibi — Porcelain portrait

```
ultra-detailed porcelain chibi doll, seated, eyes closed, inspired expression,
short wavy hair, tiny artist beret, lace-collared smock with subtle paint-splatter embroidery,
soft amber and magenta edge lights, cool dark studio background, DOF bokeh, 85mm lens
```

Minimalist toy — Moody full body

```
minimalist stylized vinyl toy character, full body, painter smock with clean paint-splash graphic,
sketchbook strap bag, soft color-pop accents (amber/magenta), white sneakers,
foggy outdoor background, soft top light, rim light, matte materials, 28mm lens
```

---

### Game Master (gaming, strategy, dice)

Chibi — Porcelain portrait

```
ultra-detailed porcelain chibi doll, seated, eyes closed, confident calm,
hooded cloak with subtle pixel-trim embroidery, controller-shaped brooch, tiny dice charm,
cool blue rim light, dark studio background, shallow DOF, 85mm lens look
```

Minimalist toy — Moody full body

```
minimalist stylized vinyl toy character, full body, lightweight cloak silhouette,
gamepad icon on chest, dice keychain on belt, utility pouch, white sneakers,
foggy scene, desaturated palette with cool blue accent, soft overhead light, 28mm lens
```

---

### Professor Ada (education, glasses, tweed)

Chibi — Porcelain portrait

```
ultra-detailed porcelain chibi doll, seated, eyes closed, gentle scholarly vibe,
neatly tied hair bun, thin round glasses, lace-trim tweed dress with subtle chalk-dust motif,
soft neutral rim light, cool dark studio background, bokeh, 85mm lens
```

Minimalist toy — Moody full body

```
minimalist stylized vinyl toy character, full body, tweed-inspired coat texture,
slim book satchel, glasses, white sneakers, muted academic colors,
foggy outdoor background, soft overhead light and rim, matte finish, 28mm lens
```

---

### Comedy Bot (humor, playful, jester pin)

Chibi — Porcelain portrait

```
ultra-detailed porcelain chibi doll, seated, eyes closed, playful smile,
short tousled hair, tiny jester pin on a lace-collared jacket, sunny yellow accent embroidery,
soft volumetric rim light, cool dark background with subtle confetti bokeh, 85mm lens
```

Minimalist toy — Moody full body

```
minimalist stylized vinyl toy character, full body, clean jacket with jester emblem,
crossbody pouch, bright yellow accent on matte neutral outfit, white sneakers,
foggy scene, soft top light, rim light, 28mm lens, centered composition
```

---

### Voice Assistant (voice, headphones, mic)

Chibi — Porcelain portrait

```
ultra-detailed porcelain chibi doll, seated, eyes closed, serene listening pose,
sleek over‑ear studio headphones with tiny boom mic, tidy hair, lace tech‑trim dress,
soft volumetric rim light, cool dark studio background, bokeh, 85mm lens
```

Minimalist toy — Moody full body

```
minimalist stylized vinyl toy character, full body, large studio headphones and compact mic,
clean parka, slim audio sling bag, white sneakers, matte materials,
moody foggy background, desaturated palette, soft overhead key and rim, 28mm lens
```

---

### History Scholar (history, scrolls, laurel)

Chibi — Porcelain portrait

```
ultra-detailed porcelain chibi doll, seated, eyes closed, thoughtful scholar,
short neat hair with a minimal laurel accent, lace-trim robe with antique motif embroidery,
tiny rolled scroll in lap, cool neutral rim light, dark studio background, 85mm lens
```

Minimalist toy — Moody full body

```
minimalist stylized vinyl toy character, full body, robe-like coat with subtle classical pattern,
scroll strap pouch, laurel emblem, white sneakers, muted earthy tones,
foggy outdoor background, soft top light and rim, matte plastic, 28mm lens
```

---

### Wellness Coach (health, yoga, calm)

Chibi — Porcelain portrait

```
ultra-detailed porcelain chibi doll, seated, eyes closed, calm supportive vibe,
soft ponytail, lace-trim athletic cardigan with mint-green accent,
folded mini yoga mat beside, soft volumetric rim light, cool dark background, 85mm lens
```

Minimalist toy — Moody full body

```
minimalist stylized vinyl toy character, full body, light athletic jacket with mint accent,
rolled yoga mat sling, white sneakers, desaturated foggy background,
soft overhead light, rim light, matte materials, 28mm lens
```

---

### Edad (warm cardigan, mentor vibe)

Chibi — Porcelain portrait

```
ultra-detailed porcelain chibi doll, seated, eyes closed, warm reassuring expression,
short tidy hair, cozy textured cardigan with subtle stitch detail, muted earthy palette,
soft amber rim light, cool dark studio background, shallow DOF, 85mm lens
```

Minimalist toy — Moody full body

```
minimalist stylized vinyl toy character, full body, cozy cardigan silhouette over tee,
simple crossbody, white sneakers, warm neutral accents, foggy desaturated background,
soft overhead light and rim, matte finish, 28mm lens
```

---

### Mystic Oracle (tarot, crystals, moonlight)

Chibi — Porcelain portrait

```
ultra-detailed porcelain chibi doll, seated, eyes closed, mysterious aura,
long flowing dark hair with crescent pin, lace dress with arcane filigree,
tiny tarot card and crystal charm, cool moonlit rim light, dark studio background, 85mm lens
```

Minimalist toy — Moody full body

```
minimalist stylized vinyl toy character, full body, flowing coat with subtle crescent motif,
small tarot pouch and crystal charm, muted purple/indigo accent, white sneakers,
foggy night ambiance, soft overhead key and rim, matte materials, 28mm lens
```

---

### Amara (romance, heart locket, soft pink)

Chibi — Porcelain portrait

```
ultra-detailed porcelain chibi doll, seated, eyes closed, tender affectionate mood,
long soft brunette hair with gentle waves, lace dress with blush‑pink accents,
tiny heart locket, warm peach rim light, cool dark studio background, bokeh, 85mm lens
```

Minimalist toy — Moody full body

```
minimalist stylized vinyl toy character, full body, soft blush‑pink accent on a neutral outfit,
heart locket detail, minimal crossbody pouch, white sneakers, foggy desaturated scene,
soft top light and rim, matte plastic, 28mm lens
```

---

## Tips

- Keep 1:1 aspect for avatars and marketplace tiles.
- If hands appear, increase distance (crop tighter) or raise steps slightly.
- For stronger lace/embroidery detail in Style A, raise guidance by ~1 and steps by ~5.
- For Style B, keep colors muted; one subtle accent per character prevents clutter.

Happy rendering!
