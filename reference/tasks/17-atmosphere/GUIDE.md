# Piece 17: Atmosphere

## Goal

Time and weather that both look good and change play:

- day and night
- seasons that repaint the world
- weather that slows armies, changes farm yield and grounds aircraft

## Already decided

- Weather and seasons affect gameplay.
- Day and night with lights.
- Palettes exist for five seasons: spring, summer, autumn, winter and a dry season for the tropics.

## Depends on

Piece 1 (drawing) and piece 6 (farms).

## Example code

`example/atmosphere.js` and 5 tests.

- **`WorldClock`.** Game time from real time, with a speed multiplier. Defaults: one game day per real hour, six days per season, so a real day is a full game year.
  - `day`, `dayFraction`, `seasonIndex` and `seasonProgress` are all derived, so nothing needs saving except the start time and the settings.
- **`seasonAt(clock, now, latitude)`.** The season for a place:
  - The southern hemisphere is shifted by two seasons, so it is winter in Australia while Europe has summer.
  - Between 23.5 degrees north and south, the seasons are wet and dry instead.
- **`blendPalettes`.** In the last quarter of a season, the palette blends into the next one, so autumn slides into winter over the last 90 minutes of real time rather than switching in one frame.
- **`daylight(f)` and `nightTint(f)`.** A smooth curve: dawn from 0.2 to 0.3 of the day, dusk from 0.72 to 0.82. `nightTint` gives the exact fill the renderer and asset browser use, peaking at 0.62 at midnight.
- **Weather.** Eight states, each with a movement multiplier, a farm multiplier, whether aircraft can fly, and a visibility factor:

  | State | Movement | Farm | Air | Visibility |
  | --- | --- | --- | --- | --- |
  | clear | 1 | 1 | yes | 1 |
  | cloudy | 1 | 0.95 | yes | 0.9 |
  | rain | 1.25 | 1.1 | yes | 0.8 |
  | storm | 1.6 | 0.9 | no | 0.5 |
  | snow | 1.7 | 0.5 | yes | 0.7 |
  | blizzard | 2.5 | 0.3 | no | 0.4 |
  | fog | 1.1 | 1 | no | 0.4 |
  | sandstorm | 2 | 0.6 | no | 0.3 |

- **`WeatherGrid`.** Coarse cells, for example 32 by 32 plots. Each cell keeps its state and picks the next from its climate and season, with a 60 percent chance of staying. Deserts never snow, and cold climates get blizzards in winter.

## Steps

1. Create the clock at world start from the host settings, and put `day`, `dayFraction` and the season into `state` messages so every client agrees.
2. **Renderer.**
   - Tint by `nightTint(dayFraction)` and draw the `_lights` sprites, which piece 1 already does.
   - Blend palettes near the end of a season and rebuild the terrain canvas when the blend changes enough, for example every 2 percent.
   - Draw weather overlays with the tileable sprites: `weather_rain_0` to `_2`, `weather_snow_*`, `weather_fog`, `weather_sandstorm`, plus `lightning_0` and `_1` in storms and `cloud_shadow` drifting on clear days.
3. **Gameplay hooks.**
   - Stack speed divides by the movement multiplier of the weather where the stack is.
   - Farm yield multiplies by the farm multiplier, which the piece 6 producer already reads as `weatherMult`.
   - Aircraft missions are refused in storms, blizzards, fog and sandstorms, with a clear message.
   - Visibility can shrink the fog-of-war reveal radius.
4. **Season effects.**
   - Crops follow the season, and winter drops farm output to a fifth, which makes granaries matter.
   - Snow terrain in winter at high latitudes: either change the palette only (cheap and safe) or actually change the terrain type in the far north for the season (more work, more effect on movement). Start with palettes only.
5. **A small forecast panel.** The current weather, the season and days until the next one. It is also a natural thing for the market to sell (piece 10's price forecast, or a weather forecast product).

## Done when

- The tests pass.
- A full day passes in an hour with a visible dawn, day, dusk and lit night.
- Seasons blend rather than snapping, and the south is opposite the north.
- Moving an army through a blizzard is visibly slower, and aircraft are grounded.

## Pitfalls

- Everything here must be derived from world time so catch-up stays consistent. Never store "current season" as a saved value that can drift.
- Do not rebuild the whole terrain canvas every frame during a blend. Rebuild on a threshold, or cross-fade two canvases.
- Weather that only annoys is bad. Rain helping farms while slowing armies is a trade-off. Keep at least one upside per state.

## Thoughts

Seasons are the strongest pacing tool you have for a long world. A winter that slows offensives and drops food production creates a natural lull where people build and plot, then spring opens the campaign season. Length is a host setting, so try six days per season first, then experiment with longer winters.
