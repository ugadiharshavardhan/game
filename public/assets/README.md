# Runtime game assets

Files Phaser loads by URL at runtime belong here — `PreloadScene` requests them
as `assets/images/…` and `assets/audio/…`.
Anything in `public/` is copied verbatim into the build and is **not** processed
or hashed by Vite. That is what we want for game assets: Phaser builds its load
paths as strings at runtime, so they must not be renamed by the bundler.

UI images that React imports directly (`import logo from './logo.svg'`) are the
opposite case and belong in `src/`, where Vite can hash and inline them.

Phase 0  ships no files here on purpose — placeholder art is generated at runtime
in `src/game/graphics/placeholderTextures.ts`.
 