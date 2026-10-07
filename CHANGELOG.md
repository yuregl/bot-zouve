# Changelog

## [1.7.0](https://github.com/yuregl/bot-zouve/compare/v1.6.0...v1.7.0) (2026-10-07)


### Features

* leave the voice channel after 5 minutes idle ([662d314](https://github.com/yuregl/bot-zouve/commit/662d3144f6b965707af9407cbb69e3eb4430f8e7))
* leave the voice channel after 5 minutes idle ([96cdcb7](https://github.com/yuregl/bot-zouve/commit/96cdcb73645a3d27e66b82998f8e4543a600d3c5))
* leave the voice channel when no one is listening ([e5be389](https://github.com/yuregl/bot-zouve/commit/e5be389e4caa5e1a89f541162530b48f6f276a7f))
* queue YouTube playlists and Mixes, up to 50 tracks ([1ee7801](https://github.com/yuregl/bot-zouve/commit/1ee7801b23fda19389890f7afe403cc9bc7e8667))
* read inactivity timeouts from environment variables ([d95af5a](https://github.com/yuregl/bot-zouve/commit/d95af5a928fd0c89795dc84a09309b24898bca0e))
* remove a range of tracks with /remove ([6c37d19](https://github.com/yuregl/bot-zouve/commit/6c37d19cfaa0319a439d259c621db197c090174e))
* vote to skip tracks requested by someone else ([d5a858f](https://github.com/yuregl/bot-zouve/commit/d5a858f8aba491790ddaae964c4dda279a14d93d))

## [1.6.0](https://github.com/yuregl/bot-zouve/compare/v1.5.0...v1.6.0) (2026-10-06)


### Features

* play Spotify track links through YouTube ([49a999e](https://github.com/yuregl/bot-zouve/commit/49a999ebac84bc7536f6be18a9fdb3929b88513f))
* play Spotify track links through YouTube ([907ff11](https://github.com/yuregl/bot-zouve/commit/907ff119ab571ac144f17135e12bc97586ad3487))

## [1.5.0](https://github.com/yuregl/bot-zouve/compare/v1.4.0...v1.5.0) (2026-10-05)


### Features

* add /remove command ([b8b32d3](https://github.com/yuregl/bot-zouve/commit/b8b32d31bf6d3361e9ac67b64e8c103849cc2fbc))
* add /remove command ([e7a7a44](https://github.com/yuregl/bot-zouve/commit/e7a7a446af87e892a479fa8fea5b7d424889bfa0))
* add /seek command ([cdcf3c0](https://github.com/yuregl/bot-zouve/commit/cdcf3c06be35bde8b402db607253677d3cac4641))
* add /seek command ([e4f04cd](https://github.com/yuregl/bot-zouve/commit/e4f04cd4e9e28a1c77cc7667fbc0c4cd18a7970c))

## [1.4.0](https://github.com/yuregl/bot-zouve/compare/v1.3.0...v1.4.0) (2026-10-05)


### Features

* add /resume command ([d507e56](https://github.com/yuregl/bot-zouve/commit/d507e56a9c0051d0c0807e9b2440f026fea80c7b))
* add /resume command ([f82c369](https://github.com/yuregl/bot-zouve/commit/f82c36998698649904a7481f52e59dae57c22231))
* search YouTube by song name in /play ([80e0279](https://github.com/yuregl/bot-zouve/commit/80e0279b5b71713fc625b89098c9bfd48c7e3dde))
* search YouTube by song name in /play ([724f261](https://github.com/yuregl/bot-zouve/commit/724f261ea3f99fca4e444e3a26568738a8bd827b))

## [1.3.0](https://github.com/yuregl/bot-zouve/compare/v1.2.0...v1.3.0) (2026-10-05)


### Features

* add /skip command ([48c7922](https://github.com/yuregl/bot-zouve/commit/48c79222f73155024738cc520d7677c00156323a))
* add /skip command ([017d2d4](https://github.com/yuregl/bot-zouve/commit/017d2d4b8331294c7dd4b476bfc7864b0ebfbcc6))


### Performance Improvements

* refresh the next track's audio link while the current one plays ([cdfae06](https://github.com/yuregl/bot-zouve/commit/cdfae06c72a185a5a98a9698a94d4294afa19928))
* start playback from the audio link resolved by /play ([ebc48e4](https://github.com/yuregl/bot-zouve/commit/ebc48e4d12ea90f7901be7323f3dbe010364549c))

## [1.2.0](https://github.com/yuregl/bot-zouve/compare/v1.1.0...v1.2.0) (2026-10-05)


### Features

* add /queue command ([a2705a6](https://github.com/yuregl/bot-zouve/commit/a2705a6bcc9eef8e9b2a4e4ed8a10cac33c7a3f3))
* add /queue command ([4daebf6](https://github.com/yuregl/bot-zouve/commit/4daebf669ee225e63a27e9a05bb9bef65f4fb06e))
* add /stop command ([ceedc28](https://github.com/yuregl/bot-zouve/commit/ceedc2802c72de9175b08d6f6325165723f524f6))


### Bug Fixes

* stop logging yt-dlp as failed when playback is stopped ([f81d0a7](https://github.com/yuregl/bot-zouve/commit/f81d0a78032e31b11ae520f850a70f6270c9f07b))

## [1.1.0](https://github.com/yuregl/bot-zouve/compare/v1.0.0...v1.1.0) (2026-10-05)


### Features

* add /leave command ([a41552e](https://github.com/yuregl/bot-zouve/commit/a41552e1dc6bbcc4064f807c1c07b15f00ef1c74))


### Bug Fixes

* discard queue when the voice connection is destroyed ([725e99d](https://github.com/yuregl/bot-zouve/commit/725e99df6031ba9c78ff3adadb22efbc96b0f9d4))
