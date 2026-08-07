import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) {
  console.error('使い方: node tools/gen-dummy-assets.mjs novels/<作品ID>/public')
  process.exit(1)
}

const BG = {
  clubroom_day: ['#e8dcc0', '部室・昼'],
  corridor_evening: ['#3a4a63', '廊下・夕'],
  rooftop_door: ['#6b7a8f', '屋上前'],
  black: ['#000000', ''],
}
const CHARA = {
  mika: '#d98b8b',
  tooru: '#7fa8d9',
}
const EXPR = ['normal', 'smile', 'surprised', 'think', 'sad']
const BGM = { daily: 392, tension: 233, memory: 330 } // Hz
const SE = { door_open: 180, paper: 900, wind: 300, phone: 1200 }

/** 1280x720 の単色板に名前を書いた SVG */
function bgSvg(color, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
<rect width="1280" height="720" fill="${color}"/>
<text x="640" y="380" font-size="64" text-anchor="middle" fill="#00000066">${label}</text>
</svg>`
}

/** 立ち絵。透過の板に名前と表情を書く */
function charaSvg(color, id, expr) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="700">
<rect x="60" y="120" width="280" height="580" rx="24" fill="${color}" opacity="0.85"/>
<circle cx="200" cy="130" r="90" fill="${color}"/>
<text x="200" y="300" font-size="44" text-anchor="middle" fill="#fff">${id}</text>
<text x="200" y="360" font-size="32" text-anchor="middle" fill="#ffffffcc">${expr}</text>
</svg>`
}

/** 16bit モノラル 22050Hz のサイン波 WAV */
function wav(freq, seconds) {
  const rate = 22050
  const n = Math.floor(rate * seconds)
  const data = Buffer.alloc(n * 2)
  for (let i = 0; i < n; i++) {
    const fade = Math.min(1, i / 400, (n - i) / 400) // 端のプチノイズを消す
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 6000 * fade), i * 2)
  }
  const head = Buffer.alloc(44)
  head.write('RIFF', 0)
  head.writeUInt32LE(36 + data.length, 4)
  head.write('WAVE', 8)
  head.write('fmt ', 12)
  head.writeUInt32LE(16, 16)
  head.writeUInt16LE(1, 20)
  head.writeUInt16LE(1, 22)
  head.writeUInt32LE(rate, 24)
  head.writeUInt32LE(rate * 2, 28)
  head.writeUInt16LE(2, 32)
  head.writeUInt16LE(16, 34)
  head.write('data', 36)
  head.writeUInt32LE(data.length, 40)
  return Buffer.concat([head, data])
}

for (const kind of ['bg', 'bgm', 'se', 'chara']) mkdirSync(join(out, kind), { recursive: true })

for (const [name, [color, label]] of Object.entries(BG)) {
  writeFileSync(join(out, 'bg', `${name}.svg`), bgSvg(color, label))
}
for (const [id, color] of Object.entries(CHARA)) {
  for (const expr of EXPR) {
    writeFileSync(join(out, 'chara', `${id}_${expr}.svg`), charaSvg(color, id, expr))
  }
}
for (const [name, freq] of Object.entries(BGM)) {
  writeFileSync(join(out, 'bgm', `${name}.wav`), wav(freq, 4))
}
for (const [name, freq] of Object.entries(SE)) {
  writeFileSync(join(out, 'se', `${name}.wav`), wav(freq, 0.25))
}

console.log(`ダミー素材を ${out} に生成した`)
