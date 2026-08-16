<!-- markdownlint-disable MD033 MD041 -->
<p align="center">
  <img src="https://koishi.chat/logo.png" width="120" height="120" alt="koishi logo">
</p>

<div align="center">

# [Koishi Plugin](https://koishi.chat): Sleep-Manage

_🎈 Manage your sleep time with Koishi Bot! 🎈_

[![npm](https://img.shields.io/npm/v/koishi-plugin-sleep-manage?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-sleep-manage) ![Rating](https://badge.koishi.chat/rating/koishi-plugin-sleep-manage)

</div>

## 📦 Installation

In Koishi console WebUI or Koishi Desktop App:

- open the `Plugin Market` and search for `sleep-manage`.
- click the `Add` button of the first one.
- Congratulations! You can now click the `Enable` button of the config page and voilà!

Or in your terminal:

```bash
yarn add koishi-plugin-sleep-manage
# or use npm:
npm i koishi-plugin-sleep-manage
# or use koishi desktop terminal:
koi yarn -n default add koishi-plugin-sleep-manage
```

## 🎮 Usage

Just like communicating with a human, say `早安` / `晚安` to the Bot!

### Triggers

- `早安` - Say good morning to the Bot indicating that you are awake.
- `晚安` - Say good night to the Bot indicating that you are asleep.

> Trigger words and time ranges are configurable. All reply texts live in
> `src/locales/zh-cn.yml` as `<random>` lists, not in the config page.

### Reply slots

The vivid UX slot system is restored:

| Slot | When | Example |
|---|---|---|
| `frist` | first record ever | `早安！第一次记录...` |
| `normal` | normal accepted trigger | `早安...` + duration + rank |
| `count` | repeated good-night inside cooldown | `这是你第 2 次说晚安了` |
| `timer` | normal morning / evening | `睡眠时长 08时10分00秒` |
| `rank` | guild chat normal trigger | `你是本群今天第 1 个起床的哦` |
| `eveningGag` | personal gagme is on | independent gag copy + mute |
| `outOfRange` | keeps talking after saying good night | `说晚安了就别玩手机啦` |

Every reply appends `kuchiguse` (the old `suffix`).

### Commands

- `sleep` - Show the command helper.
- `sleep.timezone <tz>` - Set your timezone (`+8`, `-5`, `LOCAL`, `UTC`).
- `sleep.sleep [HH:mm]` - Set / view your bedtime; the bot reminds you at that time.
- `sleep.auto` - Toggle "first message of the day counts as good morning".
- `sleep.gagme [-o|-x]` - Toggle your personal gag switch.
- `sleep.rank` - Today's early-bird / early-sleeper ranking in this guild.
- `sleep.week` / `sleep.month` / `sleep.year` - Sleep reports.

## 🔧 Config

- `kuchiguse` : Suffix phrase appended to every reply (default `喵`).
- `gagme` : Global default gag (mute) switch for good-night triggers.
- `timezone` : Default timezone (`true` = LOCAL, or a UTC offset).
- `interval` : Cooldown window in hours for repeated triggers.
- `firstMorning` : Treat everyone's first message of a day as `good morning`.
- `multiTrigger` : Max repeated responses inside one cooldown window.
- `gagMinutes` : Mute duration in minutes.
- `morningSpan` : Morning trigger time range, e.g. `[6, 12]`.
- `eveningSpan` : Evening trigger time range, may cross midnight, e.g. `[21, 3]`.
- `morningWord` : Morning trigger words.
- `eveningWord` : Evening trigger words.

## 📐 About this plugin

This innocent-looking section hides a small formal model of the plugin.

### Model

Let $R$ be the set of `sleep_record` rows, $\bot$ the null wake time, and
$r.s$ / $r.w$ the sleep / wake timestamps of a row:

$$
open(u) = \{\, r \in R \mid r.\text{user} = u \land r.\text{wake} = \bot \,\}
$$

$$
phase(u) = \text{SLEEPING} \iff open(u) \neq \varnothing
$$

$$
duration(r) = r.\text{wake} - r.\text{sleep}
$$

### State migration

The transition function is exactly what `src/domain.ts` `transition`
implements (`MORNING` = `MORNING_TRIGGER`, `EVENING` = `EVENING_TRIGGER`,
`FIRST` = `FIRST_MESSAGE`, `BEDTIME` = `BEDTIME_REACHED`):

$$
\delta(\text{AWAKE}, \text{EVENING}) = \text{OPEN}
$$

$$
\delta(\text{SLEEPING}, \text{MORNING}) = \delta(\text{SLEEPING}, \text{FIRST}) = \text{CLOSE}
$$

$$
\delta(p, e) = \text{NOOP} \quad \text{otherwise}
$$

**Tabular form:**

<div align="center">

| phase × event | MORNING | EVENING | FIRST_MESSAGE | BEDTIME |
| :---: | :---: | :---: | :---: | :---: |
| AWAKE | NOOP | OPEN | NOOP | NOOP |
| SLEEPING | CLOSE | NOOP | CLOSE | NOOP |

</div>

`REPLY` and `MUTE` effects are layered on top of this table by
`PolicyDecision`; they never change the record-state part.

### Safety invariants

$$
S_1 \text{ unique open interval:}\quad \forall u.\ |open(u)| \le 1
$$

$$
S_2 \text{ closure consistency:}\quad r.w \neq \bot \implies duration(r) = r.w - r.s \ge 0
$$

$$
S_3 \text{ state consistency:}\quad phase(u) = \text{SLEEPING} \iff \exists r \in R.\ r.\text{user} = u \land r.\text{wake} = \bot
$$

$$
S_4 \text{ non-overlapping intervals:}\quad \forall i.\ r_i.w < r_{i+1}.s
$$

### Liveness

$$
L_1 \text{ good-night opens:}\quad \text{EVENING} \times \text{AWAKE}\ \text{accepted} \implies \Diamond\, open(u) \neq \varnothing
$$

$$
L_2 \text{ good-morning closes:}\quad \text{MORNING} \times \text{SLEEPING}\ \text{accepted} \implies \Diamond\, \bigl(open(u) = \varnothing \land duration(r)\ \text{written}\bigr)
$$

### Proof sketches

**S1 — induction on traces.** The base is trivial, and the inductive step is:

$$
\forall t.\ \Bigl(|open_t(u)| \le 1 \implies |open_{t+1}(u)| \le 1\Bigr)
$$

`OPEN_RECORD` is only emitted in state `AWAKE`, where
$open(u) = \varnothing$; the interpreter then performs a
transactional `findOpen → create` and returns `Left(OPEN_EXISTS)`
whenever a row already exists, so the step cannot produce $|open(u)| > 1$.

**S2 — conditional close.** `CLOSE_RECORD` writes exactly once:

$$
\Delta r = \bigl[\, r.\text{id} = k \land r.\text{wake} = \bot \,\bigr]\,(r.\text{wake} \mapsto t,\ duration \mapsto t - r.\text{sleep})
$$

so `wake` can never be overwritten and duration is always derived from the
same stored pair $(r.s, r.w)$.

**S3 — state is derived, not stored.** Since
$phase(u) \iff open(u) \neq \varnothing$ is the
only definition, storage and state cannot diverge by construction.

**S4 — non-overlap.** New `OPEN_RECORD` is only emitted after the previous
record is closed; combined with the conditional write in S2:

$$
r_i.\text{wake} < r_{i+1}.\text{sleep}
$$

**L1 / L2.** Read directly from $\delta$; the effect interpreter in
`src/index.ts` executes exactly the effects returned by `transition`, so the
next state of $open(u)$ is the one predicted by $\delta$.

### Test mapping

| Proposition | Test |
|---|---|
| S1 | `test/repo.test.ts` → `repo：open/close/phase 状态由记录派生` (duplicate open returns `Left(OPEN_EXISTS)`) |
| S2 | `test/repo.test.ts` (duration) and `test/index.test.ts` → morning closes with `durationMin = 540` |
| S3 | `test/domain.test.ts` → 2 × 4 migration table, `test/repo.test.ts` → phase derived from rows |
| S4 | `test/repo.test.ts` → consecutive records cannot overlap |
| L1 | `test/index.test.ts` → good-night opens exactly one row |
| L2 | `test/index.test.ts` → good-morning closes the row and writes duration |
| Exhaustiveness | `test/types.test.ts` → missing `DomainEvent` branch fails to compile |
| Pure rendering | `test/render.test.ts` → every slot renders a deterministic Fragment |

### Disclaimer

This section is a pencil-and-paper proof sketch. The machine-checkable part
is carried by the `matchW` exhaustiveness checks and `test/types.test.ts`
(`@ts-expect-error`); a full machine verification can be extended to TLA+/Coq.

## 🥰 Thanks

<a href="https://jb.gg/OpenSourceSupport"><img src="https://resources.jetbrains.com/storage/products/company/brand/logos/jb_beam.svg" height="80" width="80" alt="JetBrains Logo (Main) logo."></a>

Thanks to JetBrains for supporting my open source project!

### Contributors

[![Star History Chart](https://contrib.rocks/image?repo=Lipraty/koishi-plugin-sleep-manage)](https://github.com/Lipraty/koishi-plugin-sleep-manage/graphs/contributors)

## 📄 License

The project is licensed under the [MIT License](./LICENSE).
