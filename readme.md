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

- open the `plugin market` and search `sleep-manage`.
- click the `apply` button.
- Congratulation! You have to click the `start plugin` button to start the plugin of the config page.

Or in your terminal:

```bash
yarn add koishi-plugin-sleep-manage
# or use npm:
npm i koishi-plugin-sleep-manage
## or use koishi desktop terminal(unsafe, may cause you can't get help from the qq group):
koi yarn -n default add koishi-plugin-sleep-manage
```

## 🎮Usage

Just like communicating with a human, send your greeting to the Bot!

### Tigger in message

- `早安` - Good morning.
- `晚安` - Good night.
  
> You can also use other words to trigger the bot, but you need to set it yourself of config page.

### Commands

`sleep` - Show the command helper.

`sleep.timezone` - Set your timezone. (default: bot's timezone) (e.g. +8)

(WIP) `sleep.sleep` - Set your sleep time. (e.g. 23:00) if you are still send message, the bot will remind you to sleep.

`sleep.auto` - Switch auto trig morning for your a frist message.

`sleep.week` - Your sleep weekly report.

`sleep.month` - Your sleep monthly report.

`sleep.year` - Your sleep yearly report.

## 🔧 Config

- `kuchiguse` : Pet Phrase.
- `command`: Switch command.
- `timezone` : Bot's timezone.
- `interval` : repeated over a period of time.
- `morning`: Switch morning auto trigger.
- `toomany`: Switch too many message.
- `morningSpan`: Morning trigger time span.
- `eveningSpan`: Evening trigger time span.
- `morningPet`: Response word of morning.
- `eveningPet`: Response word of evening.

## 📄 License

The project is licensed under the [MIT License](./LICENSE).
