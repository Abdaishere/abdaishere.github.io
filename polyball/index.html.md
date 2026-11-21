# PolyBall

> Every note you hear, you played. PolyBall is a free one-thumb arcade game where you spin a ring so the falling ball lands on its own colour. Every catch plays a note, so each run writes its own song. One miss ends the run.

Markdown copy of [abdaishere.com/polyball](https://abdaishere.com/polyball/). Write the name as PolyBall: one word, capital P and B. On Google Play it is listed as "PolyBall: Color Spin Arcade".

## How it plays

A ball drops onto a spinning polygon split into coloured segments. Turn the ring so the ball lands on its own colour. Each catch scores, builds your combo and speeds things up. Land on the wrong colour and the run is over.

The ring can have anything from 3 sides to 63, and every shape keeps its own best score.

## You are the band

PolyBall ships with no music files at all. Every sound comes from how you play.

- Every catch is a note. Each colour is a note of the chord underneath, so everything you play lands in key.
- Keep your streak going and the band joins in: first the bass, then the arpeggio, then the lead.
- Hit Fever and the whole screen turns gold.
- One miss and it all stops. Then you tap play again, because that song was getting good.

## Five ways to play

- Classic: the pure loop. Endless, and it only gets faster.
- Remix: Classic, plus a new twist every ten catches. Each stage ends on a boss ball.
- Music: perform the song. Balls land on the beat.
- Time: beat the clock. Clean catches buy back seconds.
- Zen: no clock, no score, and no way to lose.

There is also a daily run (one attempt per day, the same for everyone) and a global leaderboard with a monthly cup.

## Where to play

It is free everywhere.

- Android, on Google Play: https://play.google.com/store/apps/details?id=com.polyball.game
- In your browser, nothing to install: https://abdaishere.com/polyball/play/
- Windows, Mac and Linux downloads: https://abdaishere.com/polyball/#get
- itch.io: https://abdaishere.itch.io
- iPhone and iPad are coming later. The browser version works there today.

## Fair play

- Free to play. Ads sit between runs, never during one.
- Nothing you buy changes your rank. Purchases are Remove Ads, a starter pack, gems or coins, which buy cosmetics and Combo Shields. Any run that a shield or an ad revive touched is marked assisted and never reaches the leaderboard. Nothing random is sold for money.
- Plays offline. The leaderboard catches up when you are back online.
- No account, no sign-up, no email. Pick a name or keep the one the game gives you.
- Colour-blind mode stamps a distinct shape on every colour.
- 15 languages: English, Spanish, Brazilian Portuguese, French, German, Italian, Russian, Turkish, Japanese, Korean, Simplified Chinese, Arabic (Egyptian and Modern Standard), Hindi and Indonesian. Arabic is laid out right to left.

## Who made it

PolyBall is made by one person, Abdallah El Belkasy, a software engineer in Dubai: design, code, audio and release. Current version: 0.10.11. Live on Google Play since 13 November 2026.

## How it is built

- Engine: Godot 4, GDScript.
- Sound: a synthesiser inside the game with 16 instruments, up to 12 notes at once. Colour is mapped to chord degree across an eight-bar progression, and bass, arpeggio and lead are performed note by note on a swung grid.
- Testing: continuous integration on GitHub Actions across six build targets. Bots play 24 runs per pass and miss on purpose, so the numbers look like a real player's.
- Leaderboard: Supabase (PostgreSQL). The server gives each run a code and holds a score ceiling, filters names, and lets players block or report. 11 SQL migrations with automated tests.

## More

- Leaderboard: https://abdaishere.com/polyball/leaderboard/
- Trailer (29 seconds): https://youtu.be/dyrDli1sBtU
- Press kit (fact sheet, screenshots, logos, free to use in coverage): https://abdaishere.com/press/
- Privacy policy: https://abdaishere.com/privacy.html
- Terms of service: https://abdaishere.com/terms.html
- Delete your data: https://abdaishere.com/delete.html
- Contact for the game: abdaishere@gmail.com
