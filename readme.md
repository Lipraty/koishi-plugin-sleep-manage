<!-- markdownlint-disable MD033 MD041 -->
<p align="center">
  <img src="https://koishi.chat/logo.png" width="120" height="120" alt="koishi logo">
</p>

<div align="center">

# [Koishi](https://koishi.chat) Plugin: Sleep-Manage

_🎈 Manage your sleep time with Koishi Bot! 🎈_

[![npm](https://img.shields.io/npm/v/koishi-plugin-sleep-manage?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-sleep-manage) ![Rating](https://badge.koishi.chat/rating/koishi-plugin-sleep-manage)

</div>

## 📦Installsation

In Koishi console WebUI or Koishi Desktop App:

- open the `Plugin Market` and search for `sleep-manage`.
- click the `Add` button of the first one.
- Congratulation! You can now click the `Enable` button of the config page and voilà!

Or in your terminal:

```bash
yarn add koishi-plugin-sleep-manage
# or use npm:
npm i koishi-plugin-sleep-manage
## or use koishi desktop terminal(unsafe, may cause you can't get help from the qq group):
koi yarn -n default add koishi-plugin-sleep-manage
```

## 🎮Usage

Just like communicating with a human, say hello to the Bot!

### Triggers

- `早安` - Say good morning to the Bot indicating that you are awake.
- `晚安` - Say good night to the Bot indicating that you are asleep.
  
> You can also use other words as triggers, there are several related configuration in the config page of the plugin.

### Commands

`sleep` - Show the command helper.

`sleep.timezone` - Set your own timezone instead of the default one. (e.g. `+8` for UTC +0800)

(WIP) `sleep.sleep` - Set the time for bed. (e.g. 23:00) if you are still chating, the bot will remind you to go to bed.

`sleep.auto` - Set whether to automatically regard your first message in a day as the `good morning` trigger.

`sleep.week` - Show your weekly report for your sleep.

`sleep.month` - Show your monthly report for your sleep.

`sleep.year` - Show your yearly report for your sleep.

## 🔧 Config

- `kuchiguse` : Suffix phrase adding to every sentence the Bot saying.
- `command`: Prefix for every commands, default is `sleep`.
- `timezone` : Default timezone.
- `interval` : Set amount of time to supress trigger greetings.
- `morning`: Set whether to automatically regard everyone's first message in a day as the `good morning` trigger.
- `toomany`: Set whether to respond user triggers multiple times in `interval` amount of time.
- `morningSpan`: Morning trigger time span.
- `eveningSpan`: Evening trigger time span.
- `morningPet`: Response word of morning.
- `eveningPet`: Response word of evening.

## 📄 License

The project is licensed under the [MIT License](./LICENSE).
