const CFG = {
W: 1280,
H: 720,
WATER_Y: 660,
WORM_R: 11,
HP: 100,
GRAVITY: 0.55,
JUMP: 11.5,
MOVE: 2.6,
MAXFALL: 16,
TURN_TIME: 30,
WIND_RANGE: 16,
PARTICLE_CAP: 420,
MAX_FOTO_MB: 5,
PLANE_EVERY: 6
};
function rand(a, b) { return a + Math.random() * (b - a); }
function irand(a, b) { return Math.floor(rand(a, b + 1)); }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function dist(x1, y1, x2, y2) { return Math.hypot(x1 - x2, y1 - y2); }
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) {
let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
return a + d * t;
}
function angDiff(a, b) {
return ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}
const TEXTURES = {
travnik: { name: 'Trávník', icon: '🌿',
top: [92, 158, 62], top2: [76, 134, 48], mid: [126, 94, 60], mid2: [110, 80, 50], deep: [78, 56, 36], deep2: [64, 46, 30], lava: false },
pisky: { name: 'Poušť', icon: '🏜️',
top: [226, 198, 142], top2: [212, 182, 124], mid: [202, 172, 116], mid2: [188, 158, 104], deep: [156, 128, 84], deep2: [140, 114, 74], lava: false },
snih: { name: 'Sníh', icon: '❄️',
top: [242, 246, 254], top2: [226, 232, 246], mid: [198, 212, 232], mid2: [182, 198, 220], deep: [148, 166, 194], deep2: [132, 150, 178], lava: false },
sopka: { name: 'Sopka', icon: '🌋',
top: [118, 106, 112], top2: [98, 88, 96], mid: [76, 68, 76], mid2: [60, 54, 60], deep: [38, 34, 40], deep2: [26, 24, 28], lava: true },
kamen: { name: 'Skály', icon: '🪨',
top: [142, 146, 154], top2: [126, 130, 140], mid: [110, 114, 124], mid2: [96, 100, 110], deep: [72, 76, 84], deep2: [58, 62, 70], lava: false }
};
const Sfx = (() => {
let ctx = null;
function ensure() {
if (!ctx) {
const AC = window.AudioContext || window.webkitAudioContext;
if (AC) {
try { ctx = new AC(); } catch (e) { return null; }
}
}
if (ctx && ctx.state === 'suspended') ctx.resume();
return ctx;
}
function noiseBuf(sec) {
const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
const d = b.getChannelData(0);
for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
return b;
}
function tone(freq, dur, type, vol, slideTo) {
const o = ctx.createOscillator();
const g = ctx.createGain();
o.type = type;
o.frequency.setValueAtTime(freq, ctx.currentTime);
if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), ctx.currentTime + dur);
g.gain.setValueAtTime(vol, ctx.currentTime);
g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
o.connect(g);
g.connect(ctx.destination);
o.start();
o.stop(ctx.currentTime + dur + 0.02);
}
function noise(dur, vol, cutoff) {
const src = ctx.createBufferSource();
src.buffer = noiseBuf(dur);
const f = ctx.createBiquadFilter();
f.type = 'lowpass';
f.frequency.value = cutoff;
const g = ctx.createGain();
g.gain.setValueAtTime(vol, ctx.currentTime);
g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
src.connect(f);
f.connect(g);
g.connect(ctx.destination);
src.start();
}
function play(name) {
if (!ensure()) return;
try {
if (name === 'shoot') tone(260, 0.1, 'square', 0.14, 90);
else if (name === 'boom') { noise(0.5, 0.4, 260); tone(85, 0.45, 'sine', 0.32, 40); }
else if (name === 'splash') noise(0.6, 0.22, 950);
else if (name === 'pickup') {
tone(660, 0.11, 'sine', 0.22, 0);
setTimeout(function () { tone(990, 0.14, 'sine', 0.22, 0); }, 90);
}
else if (name === 'jump') tone(170, 0.1, 'square', 0.09, 90);
else if (name === 'fizz') { noise(0.1, 0.1, 3400); tone(4300, 0.06, 'square', 0.025, 2600); }
else if (name === 'click') tone(1100, 0.05, 'square', 0.06, 500);
} catch (e) {}
}
return { play, ensure };
})();
const Terrain = (() => {
const cv = document.createElement('canvas');
cv.width = CFG.W;
cv.height = CFG.H;
const ctx = cv.getContext('2d');
let data = new Uint8Array(CFG.W * CFG.H);
const surface = new Int16Array(CFG.W).fill(-1);
let texKey = 'travnik';
function idx(x, y) { return y * CFG.W + x; }
function solid(px, py) {
px |= 0; py |= 0;
if (px < 0 || px >= CFG.W || py < 0 || py >= CFG.H) return false;
return data[idx(px, py)] === 1;
}
function rebuildSurface(x0, x1) {
const a = clamp(x0, 0, CFG.W - 1);
const b = clamp(x1, 0, CFG.W - 1);
for (let x = a; x <= b; x++) {
surface[x] = -1;
for (let y = 0; y <= CFG.WATER_Y; y++) {
if (data[idx(x, y)]) { surface[x] = y; break; }
}
}
}
function renderRegion(x0, y0, x1, y1) {
x0 = clamp(Math.floor(x0), 0, CFG.W - 1);
y0 = clamp(Math.floor(y0), 0, CFG.H - 1);
x1 = clamp(Math.ceil(x1), 0, CFG.W - 1);
y1 = clamp(Math.ceil(y1), 0, CFG.H - 1);
const tex = TEXTURES[texKey] || TEXTURES.travnik;
const lava = !!tex.lava;
const w = x1 - x0 + 1;
const h = y1 - y0 + 1;
const img = ctx.createImageData(w, h);
const px = img.data;
for (let y = y0; y <= y1; y++) {
for (let x = x0; x <= x1; x++) {
const si = idx(x, y);
if (!data[si]) continue;
const di = ((y - y0) * w + (x - x0)) * 4;
const s = surface[x];
let c;
if (y <= s + 6) c = ((x + y) & 1) ? tex.top : tex.top2;
else if (y <= s + 60) c = ((x + y) & 1) ? tex.mid : tex.mid2;
else c = ((x + y) & 1) ? tex.deep : tex.deep2;
if (lava && y >= s + 90 && ((x * 73856093 ^ y * 19349663) & 0xFFFF) % 37 === 0) {
c = ((x * 7 + y * 13) & 1) ? [255, 140, 50] : [190, 60, 34];
}
px[di] = c[0]; px[di + 1] = c[1]; px[di + 2] = c[2]; px[di + 3] = 255;
}
}
ctx.putImageData(img, x0, y0);
}
function renderAll() {
rebuildSurface(0, CFG.W - 1);
renderRegion(0, 0, CFG.W - 1, CFG.H - 1);
}
function carveData(cx, cy, r) {
const x0 = clamp(Math.floor(cx - r), 0, CFG.W - 1);
const x1 = clamp(Math.ceil(cx + r), 0, CFG.W - 1);
const y0 = clamp(Math.floor(cy - r), 0, CFG.WATER_Y - 1);
const y1 = clamp(Math.ceil(cy + r), 0, CFG.WATER_Y - 1);
const r2 = r * r;
for (let y = y0; y <= y1; y++) {
for (let x = x0; x <= x1; x++) {
const dx = x - cx, dy = y - cy;
if (dx * dx + dy * dy <= r2) data[idx(x, y)] = 0;
}
}
}
function fillData(cx, cy, r) {
const x0 = clamp(Math.floor(cx - r), 0, CFG.W - 1);
const x1 = clamp(Math.ceil(cx + r), 0, CFG.W - 1);
const y0 = clamp(Math.floor(cy - r), 0, CFG.WATER_Y - 1);
const y1 = clamp(Math.ceil(cy + r), 0, CFG.WATER_Y - 1);
const r2 = r * r;
for (let y = y0; y <= y1; y++) {
for (let x = x0; x <= x1; x++) {
const dx = x - cx, dy = y - cy;
if (dx * dx + dy * dy <= r2) data[idx(x, y)] = 1;
}
}
}
function destroyCircle(cx, cy, r) {
carveData(cx, cy, r);
rebuildSurface(Math.floor(cx - r) - 2, Math.ceil(cx + r) + 2);
renderRegion(Math.floor(cx - r) - 2, Math.floor(cy - r) - 2, Math.ceil(cx + r) + 2, Math.ceil(cy + r) + 2);
}
function topAt(x) {
for (let y = 0; y <= CFG.WATER_Y; y++) {
if (data[idx(x, y)]) return y;
}
return -1;
}
function genHills() {
const p1 = rand(0, 1000), p2 = rand(0, 1000), p3 = rand(0, 1000), p4 = rand(0, 1000);
for (let x = 0; x < CFG.W; x++) {
let h = 240
+ 110 * Math.sin(x * 0.0032 + p1)
+ 65 * Math.sin(x * 0.0075 + p2)
+ 36 * Math.sin(x * 0.017 + p3)
+ 18 * Math.sin(x * 0.041 + p4);
const top = clamp(Math.round(h), 80, 450);
for (let y = top; y < CFG.WATER_Y; y++) data[idx(x, y)] = 1;
}
const spawnCols = [0.14, 0.25, 0.36, 0.47, 0.53, 0.64, 0.75, 0.86].map(function (f) { return f * CFG.W; });
function nearSpawn(x) {
for (const s of spawnCols) if (Math.abs(x - s) < 110) return true;
return false;
}
const sinks = irand(5, 11);
for (let i = 0; i < sinks; i++) {
const x = irand(80, CFG.W - 80);
if (nearSpawn(x)) continue;
const sy = topAt(x);
if (sy < 0) continue;
carveData(x, sy + irand(-4, 12), irand(15, 34));
}
const bumps = irand(5, 9);
for (let i = 0; i < bumps; i++) {
const x = irand(80, CFG.W - 80);
if (nearSpawn(x)) continue;
const sy = topAt(x);
if (sy < 0) continue;
fillData(x, sy - irand(10, 26), irand(18, 42));
}
for (let i = 0; i < 240; i++) {
const x = irand(0, CFG.W - 1);
const sy = topAt(x);
if (sy < 0) continue;
carveData(x, sy + irand(-4, 8), irand(2, 6));
}
}
function build(key) {
texKey = TEXTURES[key] ? key : 'travnik';
data = new Uint8Array(CFG.W * CFG.H);
genHills();
renderAll();
}
function surfaceY(x) {
const sx = clamp(x | 0, 0, CFG.W - 1);
return surface[sx];
}
function draw(ctx2) {
ctx2.drawImage(cv, 0, 0);
}
return {
draw, solid, surfaceY, destroyCircle, build, cv,
get key() { return texKey; }
};
})();
const Phys = (() => {
const r = CFG.WORM_R;
function collides(x, y) {
const x0 = Math.floor(x - r);
const x1 = Math.ceil(x + r);
const y0 = Math.floor(y - r);
const y1 = Math.ceil(y + r);
const r2 = r * r;
for (let py = y0; py <= y1; py++) {
for (let px = x0; px <= x1; px++) {
if (!Terrain.solid(px, py)) continue;
const dx = px + 0.5 - x;
const dy = py + 0.5 - y;
if (dx * dx + dy * dy <= r2) return true;
}
}
return false;
}
function step(w, dt) {
w.vy = Math.min(w.vy + CFG.GRAVITY * dt * 60, CFG.MAXFALL);
w.onGround = false;
const nx = w.x + w.vx * dt * 60;
if (!collides(nx, w.y)) w.x = nx;
else w.vx = 0;
const ny = w.y + w.vy * dt * 60;
if (!collides(w.x, ny)) {
w.y = ny;
} else {
const dir = w.vy > 0 ? -1 : 1;
let steps = 0;
while (collides(w.x, w.y) && steps < 12) {
w.y += dir;
steps++;
}
if (w.vy > 0) {
w.onGround = true;
w.landVy = w.vy;
}
w.vy = 0;
}
}
return { step, collides };
})();
const WEAPONS = {
bazooka:  { name: 'Bazooka',    icon: '🚀', desc: 'Dlouhý dostřel, výbuch',       maxDmg: 48, radius: 64, fuse: 0,   bounce: false, spd: 1.0,  ammo: 6 },
granat:   { name: 'Granát',     icon: '💣', desc: 'Odrazí se, pak výbuch',        maxDmg: 40, radius: 56, fuse: 2.4, bounce: true,  spd: 0.92, ammo: 6 },
shotgun:  { name: 'Brokovnice', icon: '🔫', desc: 'Krátký dosah, 5 střel',        pellets: 5, dmg: 16, range: 640, ammo: 4 },
dynamit:  { name: 'Dynamit',    icon: '🧨', desc: 'Položíš, knot doutná 5 s – uteč!', maxDmg: 78, radius: 92, fuse: 5.0, bounce: false, spd: 0.95, ammo: 3 }
};
const WEAPON_ORDER = ['bazooka', 'granat', 'shotgun', 'dynamit'];
function speedFor(power, wpn) {
return (7 + power * 0.13) * wpn.spd;
}
function teamAmmo() {
return {
bazooka: WEAPONS.bazooka.ammo,
granat: WEAPONS.granat.ammo,
shotgun: WEAPONS.shotgun.ammo,
dynamit: WEAPONS.dynamit.ammo
};
}
const Projectiles = (() => {
let list = [];
function clear() { list = []; }
function count() { return list.length; }
function add(p) { list.push(p); }
function fuseFxFor(p, dt) {
if (p.wtype !== 'dynamit') return;
p.fuseTick = (p.fuseTick || 0) - dt;
Game.fuseFx(p.x, p.y - 11);
if (p.fuseTick <= 0) {
Sfx.play('fizz');
p.fuseTick = 0.25;
}
}
function update(dt) {
for (let i = list.length - 1; i >= 0; i--) {
const p = list[i];
if (p.dead) continue;
if (p.stuck) {
p.fuse -= dt;
fuseFxFor(p, dt);
if (p.fuse <= 0) {
Game.explode(p.x, p.y, p.radius, p.maxDmg, p.wtype === 'dynamit');
p.dead = true;
}
continue;
}
p.airTime += dt;
if (p.fuse > 0) {
if (p.airTime > 1.2 || p.fuseAlways) p.fuse -= dt;
if (p.fuse <= 0) {
Game.explode(p.x, p.y, p.radius, p.maxDmg, p.wtype === 'dynamit');
p.dead = true;
continue;
}
}
fuseFxFor(p, dt);
const step = dt * 60;
const n = 2;
for (let s = 0; s < n && !p.dead; s++) {
const h = step / n;
p.vy += CFG.GRAVITY * h;
p.vx += Game.wind * 0.008 * h;
const nx = p.x + p.vx * h;
const ny = p.y + p.vy * h;
if (Terrain.solid(nx, ny)) {
if (p.bounce) {
p.vx *= 0.55;
p.vy = -p.vy * 0.45;
if (Math.abs(p.vy) < 0.9 && Math.abs(p.vx) < 0.7) p.stuck = true;
} else if (p.wtype === 'dynamit') {
p.stuck = true;
} else {
Game.explode(p.x, p.y, p.radius, p.maxDmg, p.wtype === 'dynamit');
p.dead = true;
}
} else {
p.x = nx;
p.y = ny;
}
if (p.stuck) break;
if (!p.dead && p.y >= CFG.WATER_Y - 3) {
if (p.wtype === 'dynamit') {
Game.explode(p.x, CFG.WATER_Y - 3, p.radius, p.maxDmg, true);
p.dead = true;
} else {
Game.splash(p.x, p.y);
p.dead = true;
}
}
if (!p.dead && (p.y > CFG.H + 50 || p.x < -60 || p.x > CFG.W + 60)) p.dead = true;
}
}
for (let i = list.length - 1; i >= 0; i--) {
if (list[i].dead) list.splice(i, 1);
}
}
function draw(ctx) {
for (const p of list) {
ctx.save();
ctx.translate(p.x, p.y);
if (p.wtype === 'granat') {
ctx.fillStyle = '#3f8f3f';
ctx.beginPath();
ctx.arc(0, 0, 5, 0, Math.PI * 2);
ctx.fill();
ctx.fillStyle = '#e8e8e8';
ctx.beginPath();
ctx.arc(-1.5, -1.5, 1.6, 0, Math.PI * 2);
ctx.fill();
const sp = (Math.random() > 0.6) ? 1 : 0;
if (sp) {
ctx.fillStyle = '#ffd24a';
ctx.beginPath();
ctx.arc(Math.random() * 4 - 2, -7 + Math.random() * 2, 1.4, 0, Math.PI * 2);
ctx.fill();
}
} else if (p.wtype === 'dynamit') {
ctx.fillStyle = '#c0392b';
ctx.fillRect(-3, -6, 6, 12);
ctx.strokeStyle = '#8a6d3b';
ctx.lineWidth = 1.5;
ctx.beginPath();
ctx.moveTo(0, -6);
ctx.lineTo(1.5, -11);
ctx.stroke();
const fl = 2.6 + Math.random() * 1.6;
ctx.fillStyle = '#ff9a2b';
ctx.beginPath();
ctx.arc(1.5, -13, fl, 0, Math.PI * 2);
ctx.fill();
ctx.fillStyle = '#ffe08a';
ctx.beginPath();
ctx.arc(1.5, -13, fl * 0.45, 0, Math.PI * 2);
ctx.fill();
if (Math.random() > 0.7) {
ctx.fillStyle = '#ffd24a';
ctx.beginPath();
ctx.arc(2 + Math.random() * 4, -13 - Math.random() * 3, 1.3, 0, Math.PI * 2);
ctx.fill();
}
} else {
ctx.fillStyle = '#333a44';
ctx.beginPath();
ctx.arc(0, 0, 4, 0, Math.PI * 2);
ctx.fill();
ctx.fillStyle = '#e0563f';
ctx.beginPath();
ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
ctx.fill();
}
ctx.restore();
}
}
return { update, draw, clear, count, add };
})();
const Crates = (() => {
let plane = null;
let crates = [];
function spawnPlane() {
if (plane) return;
plane = { x: -80, y: 64, speed: 5.2, dropped: false, bob: 0 };
}
function update(dt) {
if (plane) {
plane.x += plane.speed * dt * 60;
plane.bob += dt;
if (!plane.dropped && plane.x > CFG.W * 0.5) {
plane.dropped = true;
crates.push({ x: plane.x, y: plane.y + 34, vy: 0.5, grounded: false, t: 0, dead: false });
}
if (plane.x > CFG.W + 140) plane = null;
}
for (const c of crates) {
if (c.dead) continue;
if (!c.grounded) {
c.vy = Math.min(c.vy + 0.09, 2.2);
c.x += Math.sin(c.t * 3) * 0.5;
c.y += c.vy;
if (Terrain.solid(c.x, c.y + 15)) c.grounded = true;
if (c.y > CFG.WATER_Y - 22) {
c.dead = true;
Sfx.play('splash');
Game.splash(c.x, c.y);
}
}
c.t += dt;
}
for (const w of Game.worms) {
if (!w.alive) continue;
for (const c of crates) {
if (c.dead || !c.grounded) continue;
if (dist(w.x, w.y, c.x, c.y) < 36) {
const heal = Math.min(CFG.HP - w.hp, 25);
if (heal > 0) {
w.hp += heal;
UI.message(Game.wormName(w) + ' +' + heal + ' životů!', 'pickup');
} else {
UI.message(Game.wormName(w) + ' má plné zdraví.', 'pickup');
}
Sfx.play('pickup');
Game.sparkle(c.x, c.y);
c.dead = true;
UI.updateTeams();
}
}
}
for (let i = crates.length - 1; i >= 0; i--) {
if (crates[i].dead) crates.splice(i, 1);
}
}
function draw(ctx) {
if (plane) {
const p = plane;
ctx.save();
ctx.translate(p.x, p.y);
ctx.fillStyle = '#5b6575';
ctx.beginPath();
ctx.ellipse(0, 0, 34, 9, 0, 0, Math.PI * 2);
ctx.fill();
ctx.fillStyle = '#4a5260';
ctx.fillRect(-38, -4, 76, 5);
ctx.fillRect(-30, 6, 10, 7);
ctx.fillRect(20, 6, 10, 7);
ctx.fillStyle = '#2b313c';
ctx.beginPath();
ctx.moveTo(-30, 0);
ctx.lineTo(-50, -2);
ctx.lineTo(-30, 4);
ctx.fill();
ctx.fillStyle = '#e8e8e8';
ctx.beginPath();
ctx.arc(0, 0, 4, 0, Math.PI * 2);
ctx.fill();
ctx.restore();
}
for (const c of crates) {
ctx.save();
ctx.translate(c.x, c.y);
if (!c.grounded) {
ctx.strokeStyle = '#cfd6e0';
ctx.lineWidth = 1.4;
ctx.beginPath();
ctx.moveTo(-10, -6);
ctx.lineTo(-6, -22);
ctx.moveTo(10, -6);
ctx.lineTo(6, -22);
ctx.stroke();
ctx.fillStyle = 'rgba(224,232,242,0.85)';
ctx.beginPath();
ctx.arc(0, -24, 13, 0, Math.PI * 2);
ctx.fill();
} else {
ctx.strokeStyle = '#ffd24a';
ctx.lineWidth = 2;
ctx.globalAlpha = 0.6 + 0.4 * Math.sin(c.t * 5);
ctx.strokeRect(-13, -11, 26, 22);
ctx.globalAlpha = 1;
}
ctx.fillStyle = '#a5723f';
ctx.fillRect(-11, -9, 22, 18);
ctx.fillStyle = '#e0563f';
ctx.fillRect(-2, -9, 4, 18);
ctx.fillRect(-11, -2, 22, 4);
ctx.restore();
}
}
return { update, draw, spawnPlane, active: function () { return plane !== null || crates.length > 0; } };
})();
const AI = (() => {
let plan = null;
function chooseWorm() {
const alive = Game.worms.filter(function (w) { return w.team === 1 && w.alive; });
if (!alive.length) return null;
return alive[irand(0, alive.length - 1)];
}
function closestEnemy(from) {
let best = null, bd = 1e9;
for (const w of Game.worms) {
if (w.team !== 0 || !w.alive) continue;
const d = dist(from.x, from.y, w.x, w.y);
if (d < bd) { bd = d; best = w; }
}
return best;
}
function simulate(w, target, weapon, angleRad, power) {
const wpn = WEAPONS[weapon];
const speed = speedFor(power, wpn);
const mp = Game.muzzle(w, angleRad);
let x = mp[0];
let y = mp[1];
let vx = Math.cos(angleRad) * speed;
let vy = Math.sin(angleRad) * speed;
let minD = 1e9;
let landed = false;
let hit = false;
for (let i = 0; i < 520; i++) {
vx += Game.wind * 0.008;
vy += CFG.GRAVITY;
x += vx;
y += vy;
const d = dist(x, y, target.x, target.y);
if (d < minD) minD = d;
if (minD < 24) { hit = true; break; }
if (Terrain.solid(x, y)) { landed = true; break; }
if (y >= CFG.WATER_Y - 3) { break; }
if (y > CFG.H + 40) break;
}
let landD = 1000;
if (!hit && landed) landD = dist(x, y, target.x, target.y);
return { hit, minD, landD };
}
function searchShot(w, target, weapon) {
const base = Math.atan2(target.y - w.y, target.x - w.x);
const powers = [30, 50, 70, 90];
let best = null, bestScore = -1e9;
for (let e = -70; e <= 70; e += 10) {
const a = base + e * Math.PI / 180;
for (const p of powers) {
const res = simulate(w, target, weapon, a, p);
let score;
if (res.hit) score = 1500 - res.minD * 2;
else score = -res.landD * 1.1;
if (score > bestScore) {
bestScore = score;
best = { angle: a, power: p };
}
}
}
if (!best) best = { angle: base - Math.PI / 4, power: 60 };
return best;
}
function planTurn() {
const w = chooseWorm();
if (!w) { plan = { pass: true }; return; }
Game.selectWorm(w);
const team = Game.teams[1];
const target = closestEnemy(w);
if (!target) { plan = { pass: true }; return; }
const d = dist(w.x, w.y, target.x, target.y);
const opts = [];
if (team.ammo.dynamit > 0 && d < 55) opts.push(['dynamit', 0]);
if (team.ammo.shotgun > 0 && d < 300) opts.push(['shotgun', 1]);
if (team.ammo.granat > 0) opts.push(['granat', 2]);
if (team.ammo.bazooka > 0) opts.push(['bazooka', 3]);
opts.sort(function (a, b) { return a[1] - b[1]; });
if (!opts.length) { plan = { pass: true }; return; }
const weapon = opts[0][0];
if (weapon === 'shotgun') {
plan = { worm: w, weapon: weapon, target: target, t: 0 };
} else if (weapon === 'dynamit') {
plan = { worm: w, weapon: weapon, angle: Math.atan2(target.y - w.y, target.x - w.x), power: 60, t: 0 };
} else {
const best = searchShot(w, target, weapon);
plan = {
worm: w,
weapon: weapon,
angle: best.angle + rand(-0.07, 0.07),
power: clamp(best.power + irand(-8, 8), 15, 100),
t: 0
};
}
}
function tick(dt) {
if (!plan) planTurn();
if (!plan) return;
if (plan.pass) { plan = null; Game.endTurn(); return; }
const p = plan;
if (p.worm !== Game.selected) Game.selectWorm(p.worm);
const wpn = WEAPONS[p.weapon];
p.t += dt;
if (p.weapon === 'shotgun') {
const want = Math.atan2(p.target.y - p.worm.y, p.target.x - p.worm.x);
Game.aimAngle = lerpAngle(Game.aimAngle, want, Math.min(1, dt * 4));
if (p.t > 0.7) {
Game.charge = 100;
Game.fire();
plan = null;
}
return;
}
Game.aimAngle = lerpAngle(Game.aimAngle, p.angle, Math.min(1, dt * 2.2));
Game.charge = Math.min(p.power, Game.charge + dt * 150);
const doneAim = p.t > 0.9 && Math.abs(angDiff(Game.aimAngle, p.angle)) < 0.03;
const donePower = Game.charge >= p.power - 0.5;
if (doneAim && donePower) {
Game.fire();
plan = null;
}
}
return { tick, reset: function () { plan = null; } };
})();
const Game = (() => {
let mode = 'ai';
const state = {
st: 'menu',
teams: [],
worms: [],
currentTeam: 0,
wind: 0,
turnCount: 0,
turnTime: 0,
selected: null,
charging: false,
charge: 0,
aimAngle: Math.PI / 4,
resolveWait: 0,
shake: 0,
particles: [],
tracers: [],
clouds: [],
time: 0,
winner: null
};
function teamOf(i) { return state.teams[i]; }
function wormName(w) {
return (w.team === 0 ? 'Č' : 'M') + (w.id + 1);
}
function init(m) {
mode = m;
state.st = 'aiming';
state.wind = irand(-CFG.WIND_RANGE, CFG.WIND_RANGE);
state.turnCount = 0;
state.currentTeam = 0;
state.selected = null;
state.charging = false;
state.charge = 0;
state.aimAngle = Math.PI / 4;
state.particles = [];
state.tracers = [];
state.winner = null;
state.time = 0;
state.shake = 0;
state.teams = [
{ color: '#e04040', light: '#ff8a8a', name: 'Hráč 1', ammo: teamAmmo() },
{ color: '#3f7fd9', light: '#8ab8f5', name: m === 'ai' ? 'Počítač' : 'Hráč 2', ammo: teamAmmo() }
];
state.worms = [];
const slots = [
[0.14, 0], [0.25, 0], [0.36, 0], [0.47, 0],
[0.53, 1], [0.64, 1], [0.75, 1], [0.86, 1]
];
let id = 0;
for (const s of slots) {
const x = s[0] * CFG.W + rand(-18, 18);
let sy = Terrain.surfaceY(x);
if (sy < 0) sy = CFG.WATER_Y - 40;
const w = {
team: s[1], id: id++,
x: x, y: sy - CFG.WORM_R - 4,
vx: 0, vy: 0, hp: CFG.HP,
alive: true, aim: Math.PI / 4,
onGround: false, landVy: 0,
dmgFlash: 0
};
state.worms.push(w);
state.teams[s[1]].worms = state.teams[s[1]].worms || [];
state.teams[s[1]].worms.push(w);
}
Projectiles.clear();
AI.reset();
for (let i = 0; i < 4; i++) {
state.clouds.push({ x: rand(0, CFG.W), y: rand(20, 130), w: rand(70, 150), s: rand(0.2, 0.6) });
}
UI.enterGame();
startTurn();
}
function isHumanTurn() {
if (state.st !== 'aiming') return false;
if (mode === 'ai') return state.currentTeam === 0;
return true;
}
function selectWorm(w) {
if (w && w.alive && w.team === state.currentTeam) state.selected = w;
}
function firstAliveOf(team) {
for (const w of state.worms) {
if (w.team === team && w.alive) return w;
}
return null;
}
function startTurn() {
state.st = 'aiming';
state.turnCount++;
state.turnTime = CFG.TURN_TIME;
state.wind = irand(-CFG.WIND_RANGE, CFG.WIND_RANGE);
state.charging = false;
state.charge = 0;
if (state.turnCount > 1 && state.turnCount % CFG.PLANE_EVERY === 0) {
Crates.spawnPlane();
UI.message('Letadlo s dárkem přilétá!', 'pickup');
}
const t = teamOf(state.currentTeam);
state.selected = firstAliveOf(state.currentTeam);
UI.message('Tah: ' + t.name + ' (' + (state.currentTeam === 0 ? 'červený' : 'modrý') + ')', 'turn');
UI.updateHUD();
if (mode === 'ai' && state.currentTeam === 1) AI.reset();
}
function firstAvailable(team) {
for (const key of WEAPON_ORDER) {
if (team.ammo[key] > 0) return key;
}
return null;
}
function muzzle(w, a) {
const cands = [
[w.x + Math.cos(a) * 14, w.y + Math.sin(a) * 14 - 4],
[w.x + Math.cos(a) * 8, w.y - 4],
[w.x, w.y - 4]
];
for (const c of cands) {
if (!Terrain.solid(c[0], c[1])) return c;
}
let x = w.x;
let y = w.y - 4;
for (let k = 0; k < 12 && Terrain.solid(x, y); k++) y -= 2;
return [x, y];
}
function fire() {
if (state.st !== 'aiming') return;
const t = teamOf(state.currentTeam);
let w = state.selected;
if (!w || !w.alive) {
w = firstAliveOf(state.currentTeam);
if (!w) { state.st = 'resolving'; state.resolveWait = 0.6; return; }
state.selected = w;
}
let key = UI.selectedWeapon;
if (!key || t.ammo[key] <= 0) {
key = firstAvailable(t);
UI.selectedWeapon = key;
UI.refreshWeapons();
}
if (!key) {
UI.message('Došla munice!', 'warn');
state.st = 'resolving';
state.resolveWait = 0.8;
return;
}
const wpn = WEAPONS[key];
t.ammo[key]--;
state.st = 'resolving';
state.resolveWait = 1.15;
const power = state.charging ? state.charge : Math.max(state.charge, 40);
state.charging = false;
state.charge = 0;
const a = state.aimAngle;
if (key === 'shotgun') {
fireShotgun(w, wpn);
} else if (key === 'dynamit') {
const mp = muzzle(w, a);
Projectiles.add({
wtype: 'dynamit',
x: mp[0],
y: mp[1],
vx: Math.cos(a) * 1.2,
vy: -4.2,
fuse: wpn.fuse,
fuseAlways: true,
bounce: false,
radius: wpn.radius,
maxDmg: wpn.maxDmg,
airTime: 0,
fuseTick: 0,
stuck: false,
dead: false
});
w.vx -= Math.cos(a) * 0.6;
} else {
const mp = muzzle(w, a);
const speed = speedFor(power, wpn);
Projectiles.add({
wtype: key,
x: mp[0],
y: mp[1],
vx: Math.cos(a) * speed,
vy: Math.sin(a) * speed,
fuse: wpn.fuse,
fuseAlways: key === 'dynamit',
bounce: !!wpn.bounce,
radius: wpn.radius,
maxDmg: wpn.maxDmg,
airTime: 0,
stuck: false,
dead: false
});
w.vx -= Math.cos(a) * 1.7;
w.vy -= Math.sin(a) * 0.8;
}
Sfx.play('shoot');
UI.message(t.name + ': ' + wpn.name + '!', 'turn');
UI.refreshWeapons();
}
function fireShotgun(w, wpn) {
for (let i = 0; i < wpn.pellets; i++) {
const a = state.aimAngle + (Math.random() - 0.5) * 0.16;
let x = w.x + Math.cos(a) * 14;
let y = w.y + Math.sin(a) * 14;
let hit = null;
for (let d = 0; d < wpn.range; d += 3) {
x += Math.cos(a) * 3;
y += Math.sin(a) * 3;
if (y >= CFG.WATER_Y - 4) break;
if (Terrain.solid(x, y)) break;
let found = false;
for (const o of state.worms) {
if (!o.alive || o === w) continue;
if (dist(x, y, o.x, o.y) < CFG.WORM_R + 3) { hit = o; found = true; break; }
}
if (found) break;
}
if (hit) damageWorm(hit, wpn.dmg, w.x, w.y);
state.tracers.push({ x1: w.x + Math.cos(a) * 14, y1: w.y + Math.sin(a) * 14, x2: x, y2: y, life: 0.16 });
}
}
function explode(x, y, radius, maxDmg, big) {
Terrain.destroyCircle(x, y, radius * 0.75);
state.shake = Math.min(state.shake + (big ? 8 : 4), 12);
Sfx.play('boom');
const n = clamp(Math.round(radius * 0.55), 18, 85);
for (let i = 0; i < n; i++) {
if (state.particles.length >= CFG.PARTICLE_CAP) break;
const a = rand(0, Math.PI * 2);
const sp = rand(1, 5.5);
state.particles.push({
type: i % 3 === 0 ? 'smoke' : 'fire',
x: x, y: y,
vx: Math.cos(a) * sp,
vy: Math.sin(a) * sp - 1.5,
life: rand(0.35, 0.85),
maxLife: 0.85,
size: rand(2, 5)
});
}
const dn = clamp(Math.round(radius * 0.3), 10, 40);
for (let i = 0; i < dn; i++) {
if (state.particles.length >= CFG.PARTICLE_CAP) break;
const a = rand(0, Math.PI * 2);
const sp = rand(1, 6);
state.particles.push({
type: 'dirt',
x: x, y: y,
vx: Math.cos(a) * sp,
vy: Math.sin(a) * sp - 2,
life: rand(0.4, 1),
maxLife: 1,
size: rand(1.5, 3.5)
});
}
for (const w of state.worms) {
if (!w.alive) continue;
const d = dist(x, y, w.x, w.y);
if (d < radius) {
const dmg = Math.round(maxDmg * (1 - d / radius) * rand(0.85, 1.15));
if (dmg > 0) damageWorm(w, dmg, x, y);
}
}
}
function damageWorm(w, dmg, fromX, fromY) {
if (!w.alive) return;
w.hp = Math.max(0, w.hp - dmg);
w.dmgFlash = 0.45;
const d = Math.max(dist(fromX, fromY, w.x, w.y), 8);
const kx = (w.x - fromX) / d;
const ky = (w.y - fromY) / d;
w.vx += kx * 6.5;
w.vy += ky * 6.5 - 2.5;
UI.message('Zásah! -' + dmg + ' HP (' + wormName(w) + ')', 'dmg');
if (w.hp <= 0) killWorm(w);
}
function killWorm(w) {
if (!w.alive) return;
w.alive = false;
UI.message(wormName(w) + ' zničen!', 'dmg');
Sfx.play('boom');
Terrain.destroyCircle(w.x, w.y, 12);
for (let i = 0; i < 20; i++) {
if (state.particles.length >= CFG.PARTICLE_CAP) break;
const a = rand(0, Math.PI * 2);
state.particles.push({
type: 'fire',
x: w.x, y: w.y,
vx: Math.cos(a) * rand(1, 4),
vy: Math.sin(a) * rand(1, 4) - 1,
life: rand(0.3, 0.7),
maxLife: 0.7,
size: rand(2, 4)
});
}
UI.updateTeams();
}
function splash(x, y) {
Sfx.play('splash');
for (let i = 0; i < 26; i++) {
if (state.particles.length >= CFG.PARTICLE_CAP) break;
state.particles.push({
type: 'splash',
x: x + rand(-4, 4), y: y,
vx: rand(-2.5, 2.5),
vy: rand(-4.5, -1.5),
life: rand(0.3, 0.6),
maxLife: 0.6,
size: rand(1.5, 3)
});
}
}
function fuseFx(x, y) {
if (state.particles.length >= CFG.PARTICLE_CAP) return;
if (Math.random() < 0.45) {
state.particles.push({
type: 'smoke',
x: x + rand(-1, 1), y: y,
vx: rand(-0.3, 0.3),
vy: rand(-0.9, -0.3),
life: rand(0.25, 0.55),
maxLife: 0.55,
size: rand(1.5, 2.5)
});
} else {
state.particles.push({
type: 'fire',
x: x + rand(-1, 1), y: y,
vx: rand(-0.4, 0.4),
vy: rand(-0.7, 0),
life: rand(0.12, 0.3),
maxLife: 0.3,
size: rand(1, 2)
});
}
}
function sparkle(x, y) {
for (let i = 0; i < 18; i++) {
if (state.particles.length >= CFG.PARTICLE_CAP) break;
const a = rand(0, Math.PI * 2);
state.particles.push({
type: 'sparkle',
x: x, y: y,
vx: Math.cos(a) * rand(0.5, 2.5),
vy: Math.sin(a) * rand(0.5, 2.5) - 1,
life: rand(0.5, 0.9),
maxLife: 0.9,
size: rand(1, 2)
});
}
}
function checkDrowning() {
for (const w of state.worms) {
if (!w.alive) continue;
if (w.y > CFG.WATER_Y + 10 || w.x < -30 || w.x > CFG.W + 30) {
w.alive = false;
splash(w.x, Math.min(w.y, CFG.WATER_Y + 4));
UI.message(wormName(w) + ' spadl do vody!', 'dmg');
UI.updateTeams();
}
}
}
function aliveCount(team) {
let n = 0;
for (const w of state.worms) {
if (w.team === team && w.alive) n++;
}
return n;
}
function checkWin() {
if (state.st === 'gameover') return;
const a = aliveCount(0);
const b = aliveCount(1);
if (a === 0 && b === 0) { state.winner = 'remize'; state.st = 'gameover'; }
else if (a === 0) { state.winner = 1; state.st = 'gameover'; }
else if (b === 0) { state.winner = 0; state.st = 'gameover'; }
if (state.st === 'gameover') {
let text;
if (state.winner === 'remize') text = 'Remíza!';
else if (mode === 'ai') text = state.winner === 0 ? '🏆 Vyhrál jsi!' : '🤖 Vyhrál počítač!';
else text = '🏆 Vyhrál ' + teamOf(state.winner).name + ' (' + (state.winner === 0 ? 'červený' : 'modrý') + ')!';
UI.showGameOver(text);
}
}
function endTurn() {
state.currentTeam = 1 - state.currentTeam;
startTurn();
}
function updateParticles(dt) {
for (const p of state.particles) {
p.life -= dt;
if (p.type === 'fire') { p.vy -= 0.02; p.vx *= 0.98; }
else if (p.type === 'smoke') { p.vy -= 0.04; p.vx *= 0.985; p.size += 0.03; }
else if (p.type === 'dirt') { p.vy += 0.28; p.vx *= 0.985; }
else if (p.type === 'splash') { p.vy += 0.3; p.vx *= 0.99; }
else if (p.type === 'sparkle') { p.vy -= 0.05; p.vx *= 0.97; }
p.x += p.vx;
p.y += p.vy;
}
for (let i = state.particles.length - 1; i >= 0; i--) {
if (state.particles[i].life <= 0) state.particles.splice(i, 1);
}
for (const t of state.tracers) t.life -= dt;
for (let i = state.tracers.length - 1; i >= 0; i--) {
if (state.tracers[i].life <= 0) state.tracers.splice(i, 1);
}
}
function trajectoryPts(w, angle, power) {
const wpn = WEAPONS[UI.selectedWeapon] || WEAPONS.bazooka;
if (UI.selectedWeapon === 'dynamit') {
const mp = muzzle(w, angle);
let x = mp[0];
let y = mp[1];
let vx = Math.cos(angle) * 1.2;
let vy = -4.2;
const pts = [];
for (let i = 0; i < 70; i++) {
vy += CFG.GRAVITY;
x += vx;
y += vy;
if (i % 4 === 0) pts.push([x, y]);
if (Terrain.solid(x, y)) break;
}
return pts;
}
if (!wpn.spd) return [];
const speed = speedFor(power, wpn);
const mp = muzzle(w, angle);
let x = mp[0];
let y = mp[1];
let vx = Math.cos(angle) * speed;
let vy = Math.sin(angle) * speed;
const pts = [];
for (let i = 0; i < 90; i++) {
vx += state.wind * 0.008;
vy += CFG.GRAVITY;
x += vx;
y += vy;
if (i % 6 === 0) pts.push([x, y]);
if (Terrain.solid(x, y) || y >= CFG.WATER_Y - 3) break;
}
return pts;
}
function update(dt) {
if (state.st === 'menu' || state.st === 'gameover') {
if (state.st !== 'menu') updateParticles(dt);
return;
}
state.time += dt;
state.shake = Math.max(0, state.shake - dt * 22);
for (const w of state.worms) {
if (!w.alive) continue;
w.dmgFlash = Math.max(0, w.dmgFlash - dt);
Phys.step(w, dt);
if (w.onGround && w.landVy > 12) {
const d = Math.round((w.landVy - 12) * 2);
if (d > 0) damageWorm(w, d, w.x, w.y - 10);
}
}
checkDrowning();
checkWin();
if (state.st === 'aiming') {
const w = state.selected;
if (w && w.alive && isHumanTurn()) {
const isP1 = state.currentTeam === 0;
const L = isP1 ? Input.p1L : Input.p2L;
const R = isP1 ? Input.p1R : Input.p2R;
const jump = isP1 ? Input.p1Jump : Input.p2Jump;
const dir = (R ? 1 : 0) - (L ? 1 : 0);
w.vx = dir * CFG.MOVE * (w.onGround ? 1 : 0.6);
if (jump && w.onGround) {
w.vy = -CFG.JUMP;
w.vx += dir * 2.2;
Sfx.play('jump');
}
if (isP1) Input.p1Jump = false; else Input.p2Jump = false;
}
state.turnTime -= dt;
if (state.turnTime <= 0) {
state.turnTime = 0;
UI.message('Čas vypršel!', 'warn');
fire();
}
if (mode === 'ai' && state.currentTeam === 1) AI.tick(dt);
} else if (state.st === 'resolving') {
Projectiles.update(dt);
if (Projectiles.count() === 0) {
state.resolveWait -= dt;
if (state.resolveWait <= 0) {
state.resolveWait = 0;
if (checkWinEarly()) return;
endTurn();
}
}
}
Crates.update(dt);
updateParticles(dt);
UI.updateHUD();
}
function checkWinEarly() {
checkWin();
return state.st === 'gameover';
}
function draw() {
const ctx = UI.ctx;
const sh = state.shake;
ctx.save();
ctx.translate(rand(-sh, sh), rand(-sh, sh));
const sky = ctx.createLinearGradient(0, 0, 0, CFG.H);
sky.addColorStop(0, '#1c2f4a');
sky.addColorStop(0.65, '#31517a');
sky.addColorStop(1, '#4a5f7a');
ctx.fillStyle = sky;
ctx.fillRect(-12, -12, CFG.W + 24, CFG.H + 24);
ctx.fillStyle = 'rgba(255,244,200,0.9)';
ctx.beginPath();
ctx.arc(CFG.W - 120, 90, 34, 0, Math.PI * 2);
ctx.fill();
ctx.fillStyle = 'rgba(255,244,200,0.25)';
ctx.beginPath();
ctx.arc(CFG.W - 120, 90, 50, 0, Math.PI * 2);
ctx.fill();
for (const c of state.clouds) {
c.x += c.s * 0.3;
if (c.x > CFG.W + c.w) c.x = -c.w;
ctx.fillStyle = 'rgba(210,220,235,0.16)';
ctx.beginPath();
ctx.ellipse(c.x, c.y, c.w, 22, 0, 0, Math.PI * 2);
ctx.fill();
ctx.beginPath();
ctx.ellipse(c.x + c.w * 0.3, c.y + 10, c.w * 0.7, 16, 0, 0, Math.PI * 2);
ctx.fill();
}
Terrain.draw(ctx);
const wg = ctx.createLinearGradient(0, CFG.WATER_Y, 0, CFG.H);
wg.addColorStop(0, 'rgba(52,116,196,0.9)');
wg.addColorStop(1, 'rgba(18,48,104,0.95)');
ctx.fillStyle = wg;
ctx.fillRect(-12, CFG.WATER_Y, CFG.W + 24, CFG.H - CFG.WATER_Y + 12);
const t = state.time;
for (let k = 0; k < 2; k++) {
ctx.fillStyle = k === 0 ? 'rgba(150,200,255,0.25)' : 'rgba(120,180,255,0.15)';
ctx.beginPath();
for (let x = -12; x <= CFG.W + 12; x += 16) {
const y = CFG.WATER_Y + 4 + k * 8 + Math.sin(x * 0.02 + t * 1.6 + k * 3) * 3;
if (x === -12) ctx.moveTo(x, y);
else ctx.lineTo(x, y);
}
ctx.lineTo(CFG.W + 12, CFG.H + 12);
ctx.lineTo(-12, CFG.H + 12);
ctx.closePath();
ctx.fill();
}
Crates.draw(ctx);
for (const t2 of state.tracers) {
ctx.strokeStyle = 'rgba(255,235,150,' + Math.max(0, t2.life * 5) + ')';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(t2.x1, t2.y1);
ctx.lineTo(t2.x2, t2.y2);
ctx.stroke();
}
Projectiles.draw(ctx);
for (const w of state.worms) drawWorm(ctx, w);
drawParticles(ctx);
const sel = state.selected;
if (sel && sel.alive && state.st === 'aiming') {
const a = state.aimAngle;
ctx.strokeStyle = 'rgba(255,255,255,0.55)';
ctx.lineWidth = 2;
ctx.setLineDash([5, 5]);
ctx.beginPath();
ctx.moveTo(sel.x + Math.cos(a) * 16, sel.y + Math.sin(a) * 16);
ctx.lineTo(sel.x + Math.cos(a) * 42, sel.y + Math.sin(a) * 42);
ctx.stroke();
ctx.setLineDash([]);
if (state.charging || state.charge > 0) {
const pts = trajectoryPts(sel, a, state.charging ? state.charge : 40);
ctx.fillStyle = 'rgba(255,255,255,0.5)';
for (let i = 0; i < pts.length; i++) {
ctx.globalAlpha = 0.55 - i * 0.008;
ctx.beginPath();
ctx.arc(pts[i][0], pts[i][1], 2.2, 0, Math.PI * 2);
ctx.fill();
}
ctx.globalAlpha = 1;
}
}
ctx.restore();
}
function shade(hex, amt) {
const n = parseInt(hex.slice(1), 16);
const r = clamp((n >> 16) + amt, 0, 255);
const g = clamp(((n >> 8) & 255) + amt, 0, 255);
const b = clamp((n & 255) + amt, 0, 255);
return 'rgb(' + r + ',' + g + ',' + b + ')';
}
function drawWorm(ctx, w) {
if (!w.alive) return;
const team = teamOf(w.team);
const a = w.aim;
const t = state.time;
ctx.fillStyle = 'rgba(0,0,0,0.3)';
ctx.beginPath();
ctx.ellipse(w.x + 4, w.y + 9, 13, 4.5, 0, 0, Math.PI * 2);
ctx.fill();
const segs = 6;
for (let i = segs; i >= 1; i--) {
const d = i * 1.35;
const wig = Math.sin(t * 5 + i * 1.15) * 2.2 * (i / segs);
const bx = w.x - Math.cos(a) * d * 2.3 + Math.cos(a + Math.PI / 2) * wig;
const by = w.y - Math.sin(a) * d * 2.3 + Math.sin(a + Math.PI / 2) * wig + i * i * 0.12;
const r = 6.4 - i * 0.55;
ctx.fillStyle = (i % 2 === 0) ? team.color : shade(team.color, 22);
ctx.strokeStyle = 'rgba(0,0,0,0.55)';
ctx.lineWidth = 1.5;
ctx.beginPath();
ctx.arc(bx, by, r, 0, Math.PI * 2);
ctx.fill();
ctx.stroke();
}
const g = ctx.createRadialGradient(w.x - 3, w.y - 4, 2, w.x, w.y, 8.4);
g.addColorStop(0, team.light);
g.addColorStop(1, team.color);
ctx.fillStyle = g;
ctx.strokeStyle = 'rgba(0,0,0,0.55)';
ctx.lineWidth = 1.5;
ctx.beginPath();
ctx.arc(w.x, w.y, 7.4, 0, Math.PI * 2);
ctx.fill();
ctx.stroke();
ctx.fillStyle = shade(team.color, -45);
ctx.strokeStyle = 'rgba(0,0,0,0.6)';
ctx.lineWidth = 1.2;
ctx.beginPath();
ctx.arc(w.x - Math.cos(a) * 1.2, w.y - 3.6, 6.4, Math.PI, Math.PI * 2);
ctx.closePath();
ctx.fill();
ctx.stroke();
const px = -Math.sin(a);
const py = Math.cos(a);
for (const s of [-1, 1]) {
const ex = w.x + px * s * 3.4 + Math.cos(a) * 1.6;
const ey = w.y + py * s * 3.4 + Math.sin(a) * 1.6;
ctx.fillStyle = '#fff';
ctx.beginPath();
ctx.arc(ex, ey, 2.6, 0, Math.PI * 2);
ctx.fill();
ctx.strokeStyle = 'rgba(0,0,0,0.5)';
ctx.lineWidth = 0.8;
ctx.stroke();
ctx.fillStyle = '#1c1e24';
ctx.beginPath();
ctx.arc(ex + Math.cos(a) * 1.5, ey + Math.sin(a) * 1.5, 1.3, 0, Math.PI * 2);
ctx.fill();
}
ctx.fillStyle = 'rgba(30,20,16,0.85)';
ctx.beginPath();
ctx.ellipse(w.x + Math.cos(a) * 5.2, w.y + Math.sin(a) * 5.2 + 1, 1.7, 1.1, a, 0, Math.PI * 2);
ctx.fill();
if (w.dmgFlash > 0) {
ctx.fillStyle = 'rgba(255,60,40,' + (w.dmgFlash / 0.45) * 0.45 + ')';
ctx.beginPath();
ctx.arc(w.x, w.y, 9, 0, Math.PI * 2);
ctx.fill();
}
const hw = 26;
const hpPct = w.hp / CFG.HP;
ctx.fillStyle = 'rgba(0,0,0,0.5)';
ctx.fillRect(w.x - hw / 2, w.y - 20, hw, 5);
ctx.fillStyle = hpPct > 0.5 ? '#5fd45f' : (hpPct > 0.25 ? '#e8a33d' : '#e05858');
ctx.fillRect(w.x - hw / 2, w.y - 20, hw * hpPct, 5);
if (state.selected === w && state.st === 'aiming' && (state.charging || state.charge > 0)) {
ctx.fillStyle = 'rgba(0,0,0,0.5)';
ctx.fillRect(w.x - hw / 2, w.y - 27, hw, 4);
ctx.fillStyle = '#f0c04a';
ctx.fillRect(w.x - hw / 2, w.y - 27, hw * state.charge / 100, 4);
}
if (state.selected === w) {
const pulse = 0.5 + 0.4 * Math.sin(state.time * 6);
ctx.strokeStyle = 'rgba(255,255,255,' + pulse + ')';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.arc(w.x, w.y, 12.5, 0, Math.PI * 2);
ctx.stroke();
}
}
function drawParticles(ctx) {
for (const p of state.particles) {
const k = Math.max(p.life / p.maxLife, 0);
let col;
if (p.type === 'fire') col = '255,' + Math.round(140 + 60 * k) + ',70';
else if (p.type === 'smoke') col = '170,170,180';
else if (p.type === 'dirt') col = '110,80,50';
else if (p.type === 'splash') col = '150,200,255';
else col = '255,215,90';
ctx.fillStyle = 'rgba(' + col + ',' + k + ')';
ctx.beginPath();
ctx.arc(p.x, p.y, p.size * (p.type === 'smoke' ? (2 - k) : 1), 0, Math.PI * 2);
ctx.fill();
}
}
return {
init, update, draw,
explode, splash, sparkle, fuseFx, muzzle, damageWorm,
fire, selectWorm, endTurn,
isHumanTurn, wormName,
get state() { return state; },
get mode() { return mode; },
get charging() { return state.charging; },
set charging(v) { state.charging = v; },
get charge() { return state.charge; },
set charge(v) { state.charge = v; },
get aimAngle() { return state.aimAngle; },
set aimAngle(v) { state.aimAngle = v; },
get selected() { return state.selected; },
get currentTeam() { return state.currentTeam; },
get wind() { return state.wind; },
get teams() { return state.teams; },
get worms() { return state.worms; },
get st() { return state.st; },
get stateObj() { return state; },
startTurn
};
})();
const UI = (() => {
const $ = (id) => document.getElementById(id);
let ctx = null;
let mode = 'ai';
let paused = false;
let msgTimer = null;
let chipRefs = [];
let wormRefs = [];
let selectedTexture = 'travnik';
function init() {
const canvas = $('game-canvas');
ctx = canvas.getContext('2d');
$('btn-single').addEventListener('click', function () {
mode = 'ai';
Sfx.play('click');
openSetup();
});
$('btn-local').addEventListener('click', function () {
mode = 'local';
Sfx.play('click');
openSetup();
});
$('btn-online').addEventListener('click', function () {
Sfx.play('click');
message('Online hra přijde brzy: místnost = název (8–32 znaků) + časový limit, server s WebSocketem.', 'warn');
});
$('btn-back').addEventListener('click', function () {
show('screen-menu');
});
$('btn-start').addEventListener('click', startGame);
$('btn-gen-map').addEventListener('click', function () {
Terrain.build(selectedTexture);
renderPreview();
message('Vygenerován nový tvar mapy!', 'pickup');
});
$('btn-pause').addEventListener('click', showPause);
$('btn-resume').addEventListener('click', resume);
$('btn-pause-menu').addEventListener('click', function () {
resume();
$('screen-game').classList.add('hidden');
show('screen-menu');
});
$('btn-rematch').addEventListener('click', function () {
$('overlay').classList.add('hidden');
Game.init(mode);
});
$('btn-menu').addEventListener('click', function () {
$('overlay').classList.add('hidden');
$('screen-game').classList.add('hidden');
show('screen-menu');
});
buildWeaponTable();
buildTeamPanels();
buildTexPicker();
window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', function (e) {
const k = e.key.toLowerCase();
if (k === 'a') Input.p1L = false;
if (k === 'd') Input.p1R = false;
if (k === 'arrowleft') Input.p2L = false;
if (k === 'arrowright') Input.p2R = false;
});
}
function show(id) {
const screens = ['screen-menu', 'screen-setup', 'screen-game'];
for (const s of screens) $(s).classList.toggle('hidden', s !== id);
}
function openSetup() {
$('setup-title').textContent = mode === 'ai' ? 'Příprava mapy – proti počítači' : 'Příprava mapy – 2 hráči (jeden počítač)';
Terrain.build(selectedTexture);
refreshTexPicker();
renderPreview();
show('screen-setup');
}
function renderPreview() {
const c = $('map-preview');
const cx = c.getContext('2d');
cx.clearRect(0, 0, c.width, c.height);
cx.drawImage(Terrain.cv, 0, 0, c.width, c.height);
}
function buildTexPicker() {
const wrap = $('tex-picker');
wrap.textContent = '';
for (const key of Object.keys(TEXTURES)) {
const tex = TEXTURES[key];
const btn = document.createElement('button');
btn.className = 'tex-btn';
btn.dataset.key = key;
const sw = document.createElement('canvas');
sw.width = 88;
sw.height = 36;
drawSwatch(sw, tex);
const nm = document.createElement('span');
nm.textContent = tex.icon + ' ' + tex.name;
btn.appendChild(sw);
btn.appendChild(nm);
btn.addEventListener('click', function () {
selectedTexture = key;
Sfx.play('click');
Terrain.build(selectedTexture);
refreshTexPicker();
renderPreview();
});
wrap.appendChild(btn);
}
}
function drawSwatch(c, tex) {
const cx = c.getContext('2d');
const W = c.width;
const H = c.height;
for (let y = 0; y < H; y++) {
const t = y / H;
const col = t < 0.15 ? tex.top : (t < 0.5 ? tex.mid : tex.deep);
cx.fillStyle = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';
cx.fillRect(0, y, W, 1);
}
for (let i = 0; i < 70; i++) {
const x = Math.random() * W;
const y = Math.random() * H;
const t = y / H;
const base = t < 0.15 ? tex.top : (t < 0.5 ? tex.mid : tex.deep);
const v = (Math.random() < 0.5 ? 1 : -1) * 14;
cx.fillStyle = 'rgba(' + (base[0] + v) + ',' + (base[1] + v) + ',' + (base[2] + v) + ',0.5)';
cx.fillRect(x, y, 1.6, 1.6);
}
}
function refreshTexPicker() {
const btns = document.querySelectorAll('.tex-btn');
for (const b of btns) {
b.classList.toggle('selected', b.dataset.key === selectedTexture);
}
}
function startGame() {
Game.init(mode);
}
function showPause() {
const st = Game.stateObj;
if (st.st === 'gameover' || st.st === 'menu') return;
paused = true;
$('pause-overlay').classList.remove('hidden');
}
function resume() {
paused = false;
$('pause-overlay').classList.add('hidden');
}
let selectedWeapon = 'bazooka';
function buildWeaponTable() {
const wrap = $('weapon-table');
wrap.textContent = '';
for (const key of WEAPON_ORDER) {
const w = WEAPONS[key];
const btn = document.createElement('button');
btn.className = 'wbtn';
btn.dataset.key = key;
const ic = document.createElement('span');
ic.className = 'ic';
ic.textContent = w.icon;
const nm = document.createElement('span');
nm.className = 'nm';
nm.textContent = w.name;
const am = document.createElement('span');
am.className = 'am';
am.textContent = w.desc;
btn.appendChild(ic);
btn.appendChild(nm);
btn.appendChild(am);
btn.addEventListener('click', function () {
selectWeapon(key);
});
wrap.appendChild(btn);
}
selectedWeapon = 'bazooka';
refreshWeapons();
}
function selectWeapon(key) {
if (paused) return;
const st = Game.stateObj;
if (st.st === 'gameover') return;
if (!Game.isHumanTurn() && Game.mode === 'ai') {
message('Počkej na svůj tah.', 'warn');
return;
}
if (st.st !== 'aiming') return;
const t = Game.teams[Game.currentTeam];
if (t.ammo[key] <= 0) {
message('Tahle zbraň už nemá munici.', 'warn');
return;
}
selectedWeapon = key;
Sfx.play('click');
refreshWeapons();
}
function refreshWeapons() {
const st = Game.stateObj;
const t = Game.teams[Game.currentTeam];
const btns = document.querySelectorAll('.wbtn');
for (const b of btns) {
const key = b.dataset.key;
const ammo = t ? t.ammo[key] : 0;
b.classList.toggle('selected', key === selectedWeapon);
b.classList.toggle('empty', ammo <= 0);
const am = b.querySelector('.am');
if (am) am.textContent = ammo > 0 ? WEAPONS[key].desc + ' · ' + ammo + '×' : 'Bez munice';
}
}
function buildTeamPanels() {
const red = $('team-red');
const blue = $('team-blue');
red.textContent = '';
blue.textContent = '';
chipRefs = [];
wormRefs = [];
for (let t = 0; t < 2; t++) {
const panel = t === 0 ? red : blue;
const head = document.createElement('div');
head.className = 't-head';
const name = document.createElement('span');
name.textContent = '—';
const hp = document.createElement('span');
hp.textContent = '';
head.appendChild(name);
head.appendChild(hp);
const chips = document.createElement('div');
chips.className = 'chips';
panel.appendChild(head);
panel.appendChild(chips);
const panelRefs = [];
for (let i = 0; i < 4; i++) {
const chip = document.createElement('div');
chip.className = 'chip';
const cn = document.createElement('span');
cn.className = 'c-name';
cn.textContent = (t === 0 ? 'Č' : 'M') + (i + 1);
const bar = document.createElement('div');
bar.className = 'bar';
const fill = document.createElement('div');
fill.className = 'fill';
bar.appendChild(fill);
chip.appendChild(cn);
chip.appendChild(bar);
chips.appendChild(chip);
panelRefs.push({ chip: chip, fill: fill });
}
chipRefs.push(panelRefs);
wormRefs.push({ name: name, hp: hp });
}
}
function updateTeams() {
const st = Game.stateObj;
for (let t = 0; t < 2; t++) {
const team = Game.teams[t];
wormRefs[t].name.textContent = team.name;
let total = 0;
const worms = st.worms.filter(function (w) { return w.team === t; });
for (let i = 0; i < 4; i++) {
const w = worms[i];
const refs = chipRefs[t][i];
if (!w) continue;
refs.chip.classList.toggle('dead', !w.alive);
refs.fill.style.width = (w.alive ? Math.max(w.hp, 0) / CFG.HP * 100 : 0) + '%';
refs.fill.className = 'fill';
if (w.alive) {
const pct = w.hp / CFG.HP;
if (pct > 0.5) refs.fill.classList.add('ok');
else if (pct > 0.25) refs.fill.classList.add('mid');
else refs.fill.classList.add('low');
}
if (w.alive) total += w.hp;
}
wormRefs[t].hp.textContent = total + ' HP';
const panel = $('team-' + (t === 0 ? 'red' : 'blue'));
panel.classList.toggle('active', st.st !== 'gameover' && st.currentTeam === t);
panel.classList.toggle('dead', total === 0);
}
}
function updateHUD() {
const st = Game.stateObj;
updateTeams();
const bar = $('turn-bar');
const pct = clamp(st.turnTime / CFG.TURN_TIME, 0, 1);
bar.style.width = (pct * 100) + '%';
bar.className = '';
if (pct > 0.5) bar.classList.add('ok');
else if (pct > 0.2) bar.classList.add('mid');
else bar.classList.add('low');
$('turn-label').textContent = st.st === 'gameover'
? 'Konec hry'
: 'Tah: ' + Game.teams[st.currentTeam].name;
const wind = Game.wind;
const ar = $('wind-arrow');
ar.style.transform = 'rotate(' + (wind * 3) + 'deg)';
$('wind-val').textContent = (wind > 0 ? '+' : '') + Math.round(wind);
}
function message(text, cls) {
const el = $('msg');
el.textContent = text;
el.className = 'show ' + (cls || '');
clearTimeout(msgTimer);
msgTimer = setTimeout(function () {
el.classList.remove('show');
}, 2400);
}
function showGameOver(text) {
$('overlay-text').textContent = text;
$('overlay').classList.remove('hidden');
updateHUD();
}
function onKeyDown(e) {
const k = e.key.toLowerCase();
if (k === 'arrowleft' || k === 'arrowright' || k === 'arrowup' || k === ' ' || k === 'enter') {
e.preventDefault();
}
if (k === 'a') Input.p1L = true;
if (k === 'd') Input.p1R = true;
if (k === 'arrowleft') Input.p2L = true;
if (k === 'arrowright') Input.p2R = true;
if ((k === 'w' || k === ' ') && !e.repeat) Input.p1Jump = true;
if ((k === 'arrowup' || k === 'enter') && !e.repeat) Input.p2Jump = true;
if (k === 'escape') {
if (paused) {
resume();
return;
}
const st = Game.stateObj;
if (st.st === 'aiming' && Game.charging) {
Game.charging = false;
} else if (st.st === 'aiming' || st.st === 'resolving') {
showPause();
}
}
const num = parseInt(k, 10);
if (num >= 1 && num <= 4) {
selectWeapon(WEAPON_ORDER[num - 1]);
}
}
function enterGame() {
show('screen-game');
selectedWeapon = 'bazooka';
refreshWeapons();
updateTeams();
updateHUD();
resizeCanvas();
}
function resizeCanvas() {
const wrap = $('canvas-wrap');
const canvas = $('game-canvas');
const w = wrap.clientWidth;
const h = wrap.clientHeight;
const scale = Math.min(w / CFG.W, h / CFG.H);
canvas.style.width = Math.floor(CFG.W * scale) + 'px';
canvas.style.height = Math.floor(CFG.H * scale) + 'px';
}
return {
init, enterGame, message, showGameOver, updateHUD, updateTeams, refreshWeapons,
resizeCanvas, showPause, resume,
get ctx() { return ctx; },
get paused() { return paused; },
set paused(v) { paused = v; },
get selectedWeapon() { return selectedWeapon; },
set selectedWeapon(v) { selectedWeapon = v; }
};
})();
const RoomAPI = (() => {
const NAME_MIN = 8;
const NAME_MAX = 32;
const TIME_MIN = 60;
const TIME_MAX = 1800;
const DEFAULT_TIME = 300;
const NAME_RE = /^[A-Za-z0-9_-]{8,32}$/;
function validateName(n) {
if (typeof n !== 'string') return false;
return NAME_RE.test(n);
}
function sanitizeName(n) {
if (typeof n !== 'string') return '';
return n.slice(0, NAME_MAX);
}
function validateTimeLimit(t) {
if (typeof t !== 'number' || isNaN(t)) return DEFAULT_TIME;
return clamp(Math.round(t), TIME_MIN, TIME_MAX);
}
function createRoom(name, timeLimit) {
if (!validateName(name)) return null;
return {
name: sanitizeName(name),
timeLimit: validateTimeLimit(timeLimit),
createdAt: Date.now(),
maxPlayers: 2,
players: []
};
}
return {
NAME_MIN, NAME_MAX, TIME_MIN, TIME_MAX, DEFAULT_TIME,
validateName, sanitizeName, validateTimeLimit, createRoom,
status: function () { return 'offline'; }
};
})();
const Input = {
p1L: false, p1R: false, p1Jump: false,
p2L: false, p2R: false, p2Jump: false
};
(function () {
const canvas = document.getElementById('game-canvas');
function mousePos(e) {
const rect = canvas.getBoundingClientRect();
return {
x: (e.clientX - rect.left) / rect.width * CFG.W,
y: (e.clientY - rect.top) / rect.height * CFG.H
};
}
canvas.addEventListener('pointermove', function (e) {
if (Game.st !== 'aiming') return;
if (!Game.isHumanTurn()) return;
const m = mousePos(e);
const sel = Game.selected;
if (!sel || !sel.alive) return;
Game.aimAngle = Math.atan2(m.y - sel.y, m.x - sel.x);
});
canvas.addEventListener('pointerdown', function (e) {
e.preventDefault();
if (e.button === 2) {
Game.charging = false;
return;
}
if (Game.st !== 'aiming' || !Game.isHumanTurn()) return;
const m = mousePos(e);
const sel = Game.selected;
if (!sel) return;
let picked = null;
for (const w of Game.worms) {
if (w.team !== Game.currentTeam || !w.alive) continue;
if (dist(m.x, m.y, w.x, w.y) < 26) { picked = w; break; }
}
if (picked) Game.selectWorm(picked);
const s2 = Game.selected;
Game.aimAngle = Math.atan2(m.y - s2.y, m.x - s2.x);
Game.charging = true;
Game.charge = 0;
});
window.addEventListener('pointerup', function (e) {
if (e.button === 0 && Game.charging) {
Game.fire();
}
});
canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
window.addEventListener('resize', UI.resizeCanvas);
document.addEventListener('keydown', function (e) {
Sfx.ensure();
});
let last = performance.now();
function frame(now) {
const dt = clamp((now - last) / 1000, 0, 0.05);
last = now;
if (Game.st !== 'menu') {
if (!UI.paused) {
const st = Game.stateObj;
if (st.st === 'aiming' && Game.charging) Game.charge = Math.min(100, Game.charge + dt * 85);
Game.update(dt);
}
Game.draw();
}
requestAnimationFrame(frame);
}
window.addEventListener('DOMContentLoaded', function () {
UI.init();
requestAnimationFrame(frame);
});
})();