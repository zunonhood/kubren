'use strict'

const fs = require('fs')
const path = require('path')
const mineflayer = require('mineflayer')
const OpenAI = require('openai')

const root = path.resolve(__dirname, '..')
const configPath = path.join(root, 'config.json')
const statePath = path.join(root, 'state.json')

if (!fs.existsSync(configPath)) {
  console.error('Missing config.json. Copy config.example.json to config.json first.')
  process.exit(1)
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const mc = config.minecraft
const build = config.builder
const aiConfig = config.ai || {}
const ai = aiConfig.apiKey
  ? new OpenAI({ apiKey: aiConfig.apiKey, baseURL: aiConfig.baseURL })
  : null

let state = { nextPlot: 0, buildings: [] }
try {
  state = { ...state, ...JSON.parse(fs.readFileSync(statePath, 'utf8')) }
} catch (_) {}

const bot = mineflayer.createBot({
  host: mc.host,
  port: mc.port,
  username: mc.username,
  auth: mc.auth || 'offline'
})

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const saveState = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2))
const command = async text => {
  bot.chat(text)
  await sleep(180)
}
const fill = (x1, y1, z1, x2, y2, z2, block) =>
  command(`/fill ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} minecraft:${block}`)

const materials = [
  'bricks', 'stone_bricks', 'smooth_stone', 'quartz_block',
  'white_concrete', 'light_gray_concrete', 'terracotta'
]

function fallbackPlan(index) {
  const presets = [
    { name: 'Brick Workshop', material: 'bricks', width: 9, depth: 9, height: 8 },
    { name: 'Quartz Studio', material: 'quartz_block', width: 8, depth: 10, height: 11 },
    { name: 'Stone Library', material: 'stone_bricks', width: 11, depth: 9, height: 9 }
  ]
  return presets[index % presets.length]
}

function sanitizePlan(value, index) {
  const fallback = fallbackPlan(index)
  const material = materials.includes(value.material) ? value.material : fallback.material
  return {
    name: String(value.name || fallback.name).replace(/[\r\n/]/g, ' ').slice(0, 48),
    material,
    width: Math.max(7, Math.min(11, Math.round(Number(value.width) || fallback.width))),
    depth: Math.max(7, Math.min(11, Math.round(Number(value.depth) || fallback.depth))),
    height: Math.max(7, Math.min(16, Math.round(Number(value.height) || fallback.height)))
  }
}

async function requestPlan(index) {
  if (!ai) return fallbackPlan(index)
  const response = await ai.chat.completions.create({
    model: aiConfig.model,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'Design one compact Minecraft city building. Return JSON only with name, material, width, depth, height. Material must be one of: ' + materials.join(', ') + '. Width/depth 7-11; height 7-16.'
      },
      { role: 'user', content: `Create building number ${index + 1}. Keep it different from earlier plots.` }
    ]
  })
  return sanitizePlan(JSON.parse(response.choices[0].message.content), index)
}

function plotPosition(index) {
  const columns = 10
  const col = index % columns
  const row = Math.floor(index / columns)
  return {
    x: build.originX + (col - Math.floor(columns / 2)) * build.cellSize,
    z: build.originZ + row * build.cellSize
  }
}

async function buildStructure(plan, position) {
  const y = build.groundY
  const x1 = position.x
  const z1 = position.z
  const x2 = x1 + plan.width - 1
  const z2 = z1 + plan.depth - 1
  const top = y + plan.height

  await fill(x1, y, z1, x2, y, z2, 'polished_andesite')
  await fill(x1, y + 1, z1, x2, top, z2, plan.material)
  await fill(x1 + 1, y + 1, z1 + 1, x2 - 1, top - 1, z2 - 1, 'air')
  await fill(x1 + 1, top, z1 + 1, x2 - 1, top, z2 - 1, 'smooth_stone')

  const doorX = x1 + Math.floor(plan.width / 2)
  await fill(doorX, y + 1, z1, doorX, y + 2, z1, 'air')

  for (let floorY = y + 3; floorY < top; floorY += 3) {
    await fill(x1 + 2, floorY, z1, x2 - 2, floorY, z1, 'light_blue_stained_glass')
    await fill(x1 + 2, floorY, z2, x2 - 2, floorY, z2, 'light_blue_stained_glass')
  }

  await command(`/say Kubren completed: ${plan.name}`)
}

let working = false
async function buildNext() {
  if (working) return
  working = true
  const index = state.nextPlot
  try {
    const plan = sanitizePlan(await requestPlan(index), index)
    const position = plotPosition(index)
    console.log('Building', plan.name, 'at', position)
    await buildStructure(plan, position)
    state.buildings.push({ ...plan, ...position, completedAt: new Date().toISOString() })
    state.nextPlot += 1
    saveState()
  } catch (error) {
    console.error('Build failed:', error.message)
  } finally {
    working = false
  }
}

bot.once('spawn', async () => {
  console.log(`Kubren connected to ${mc.host}:${mc.port}`)
  await command(`/gamemode creative ${mc.username}`)
  await buildNext()
  setInterval(buildNext, Math.max(10000, build.intervalMs || 30000))
})

bot.on('kicked', reason => console.error('Kicked:', reason))
bot.on('error', error => console.error('Minecraft error:', error.message))