import assert from 'node:assert/strict'
import test from 'node:test'

import { mkDurationMin } from '../src/domain'
import { none, some } from '../src/fp'
import {
  noPayload,
  renderReply,
  RenderEnv,
  ReplyPayload,
  replyPayload,
} from '../src/render'

const render = (path: string, args: readonly unknown[]) =>
  [args.length ? `${path}:${args.join(',')}` : path]

const makeEnv = (suffix = '喵'): RenderEnv => ({
  i18n: (path, args) => render(path, args),

  random: (xs) => xs[0],
  suffix,
})

const payload: ReplyPayload = replyPayload('morning', false, some(mkDurationMin(490)), some(3), 2)

test('frist：只渲染时段对应的 frist 文案', () => {
  assert.deepEqual(renderReply('frist', { ...payload, first: true })(makeEnv()), [
    'sleep.morning.frist', '喵',
  ])
  assert.deepEqual(renderReply('frist', { ...payload, first: true, period: 'evening' })(makeEnv()), [
    'sleep.evening.frist', '喵',
  ])
})

test('normal：reply + timer + rank，全部追加 suffix', () => {
  assert.deepEqual(renderReply('normal', payload)(makeEnv()), [
    'sleep.morning.reply',
    'sleep.morning.timer:08,10,00',
    'sleep.morning.rank:3',
    '喵',
  ])
})

test('count：使用 payload.count 且固定走 evening.count', () => {
  assert.deepEqual(renderReply('count', { ...payload, period: 'evening' })(makeEnv()), [
    'sleep.evening.count:2',
    '喵',
  ])
})

test('timer / rank：单独渲染各自的片段', () => {
  assert.deepEqual(renderReply('timer', payload)(makeEnv()), [
    'sleep.morning.timer:08,10,00',
    '喵',
  ])
  assert.deepEqual(renderReply('rank', payload)(makeEnv()), [
    'sleep.morning.rank:3',
    '喵',
  ])
})

test('eveningGag：first 与非 first 路径', () => {
  assert.deepEqual(renderReply('eveningGag', { ...payload, first: true, period: 'evening' })(makeEnv()), [
    'sleep.evening-gag.frist', '喵',
  ])
  assert.deepEqual(renderReply('eveningGag', { ...payload, period: 'evening' })(makeEnv()), [
    'sleep.evening-gag.reply',
    'sleep.evening-gag.timer:08,10,00',
    'sleep.evening-gag.rank:3',
    '喵',
  ])
})

test('outOfRange：早安/晚安后仍说话走各自独立文案', () => {
  assert.deepEqual(renderReply('outOfRange', noPayload('morning'))(makeEnv()), [
    'sleep.morning.outOfRange', '喵',
  ])
  assert.deepEqual(renderReply('outOfRange', noPayload('evening'))(makeEnv()), [
    'sleep.evening.outOfRange', '喵',
  ])
})

test('durationMin / rank 为 None 时不渲染对应片段', () => {
  assert.deepEqual(renderReply('normal', { ...payload, durationMin: none, rank: none })(makeEnv()), [
    'sleep.morning.reply', '喵',
  ])
})

test('suffix 为空时不追加空字符串', () => {
  assert.deepEqual(renderReply('normal', { ...payload, durationMin: none, rank: none })(makeEnv('')), [
    'sleep.morning.reply',
  ])
})
