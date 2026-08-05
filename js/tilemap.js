/* ---------- Tile-based map with pixel destruction ---------- */
const TileMap = (() => {
  const TILE = 40;
  const COLS = 30;
  const ROWS = 18;
  const WATER_ROW = 14;
  const WATER_Y = WATER_ROW * TILE; // 575px

  // Full-res pixel data (same as old Terrain: 0=empty, 1=solid)
  let pixelData = new Uint8Array(CFG.W * CFG.H);
  // Snapshot of original terrain (never modified by destruction)
  let originalPixelData = new Uint8Array(CFG.W * CFG.H);

  // Tile grid: 'T'=top, 'L'=left, 'R'=right, 'M'=middle, 0=empty
  const tileGrid = [];
  for (let r = 0; r < ROWS; r++) tileGrid[r] = new Array(COLS).fill(0);

  // Tile images
  let tileImgs = {};
  let tileReady = false;
  let readyPromise = null;
  let currentWorld = 'clay';

  // Canvases
  const cv = document.createElement('canvas');
  cv.width = CFG.W;
  cv.height = CFG.H;
  const ctx = cv.getContext('2d');
  const cleanCv = document.createElement('canvas');
  cleanCv.width = CFG.W;
  cleanCv.height = CFG.H;
  const cleanCtx = cleanCv.getContext('2d');

  let clouds = [];
  let windVal = 0;
  let timeVal = 0;

  const spawnCols = [3, 6, 9, 12, 17, 20, 23, 26]; // 51 cols, spread out

  /* ---------- loading ---------- */
  function preload() {
    if (readyPromise) return readyPromise;
    const keys = ['Clay_Top', 'Clay_L', 'Clay_R', 'Clay_middle'];
    readyPromise = Promise.all(keys.map(k => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('tile ' + k));
        img.src = 'picture/Clay/' + k + '.png';
      });
    })).then(imgs => {
      tileImgs = { top: imgs[0], left: imgs[1], right: imgs[2], middle: imgs[3] };
      tileReady = true;
    });
    return readyPromise;
  }

  /* ---------- tile helpers ---------- */
  function idx(x, y) { return y * CFG.W + x; }

  function solid(px, py) {
    px |= 0; py |= 0;
    if (px < 0 || px >= CFG.W || py < 0 || py >= CFG.H) return false;
    return pixelData[idx(px, py)] === 1;
  }

  function surfaceY(x) {
    x |= 0;
    if (x < 0 || x >= CFG.W) return -1;
    for (let y = 0; y <= WATER_Y; y++) {
      if (pixelData[idx(x, y)]) return y;
    }
    return WATER_Y;
  }

  function topAt(x) { return surfaceY(x); }

  /* ---------- hill generation ---------- */
  function initGrid() {
    for (let r = 0; r < ROWS; r++) tileGrid[r].fill(0);
    pixelData.fill(0);
    originalPixelData.fill(0);
  }

  function setTile(row, col, type) {
    if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
      tileGrid[row][col] = type;
    }
  }

  function genHill(peakCol, peakRow, baseLeft, baseRight, baseRow) {
    const h = baseRow - peakRow;
    if (h <= 0) return;
    for (let y = peakRow; y <= baseRow; y++) {
      const t = (y - peakRow) / Math.max(1, h);
      const left = Math.round(peakCol - (peakCol - baseLeft) * t);
      const right = Math.round(peakCol + (baseRight - peakCol) * t);
      for (let x = left; x <= right; x++) {
        if (x < 0 || x >= COLS) continue;
        if (y === peakRow) {
          if (left === right) setTile(y, x, 'T');
          else if (x === left) setTile(y, x, 'L');
          else if (x === right) setTile(y, x, 'R');
          else setTile(y, x, 'T');
        } else {
          if (x === left && x === right) setTile(y, x, 'M');
          else if (x === left) setTile(y, x, 'L');
          else if (x === right) setTile(y, x, 'R');
          else setTile(y, x, 'M');
        }
      }
    }
  }

  function generate(mode) {
    initGrid();
    const baseRow = WATER_ROW - 1;
    const maxPeakRow = Math.max(1, Math.floor(WATER_ROW * 0.2));
    const minPeakRow = Math.max(maxPeakRow + 2, Math.floor(WATER_ROW * 0.7));

    function rndPeak() {
      return minPeakRow + Math.floor(Math.random() * Math.max(1, maxPeakRow - minPeakRow + 1));
    }

    function hill(cx, lw, rw) {
      const pc = Math.floor(cx * COLS + (Math.random() - 0.5) * 5);
      const pr = rndPeak();
      const ap = Math.min(pr, baseRow - 1);
      const bl = Math.max(0, pc - lw + Math.floor(Math.random() * 3));
      const br = Math.min(COLS - 1, pc + rw + Math.floor(Math.random() * 3));
      genHill(Math.max(1, Math.min(COLS - 2, pc)), ap, bl, br, baseRow);
    }

    if (!mode || mode === 'random') mode = [1, 2, 3][Math.floor(Math.random() * 3)];
    if (mode === 1) {
      hill(0.5, Math.floor(COLS * 0.34), Math.floor(COLS * 0.34));
    } else if (mode === 2) {
      hill(0.22, Math.floor(COLS * 0.17), Math.floor(COLS * 0.25));
      hill(0.78, Math.floor(COLS * 0.25), Math.floor(COLS * 0.17));
    } else {
      hill(0.13, Math.floor(COLS * 0.12), Math.floor(COLS * 0.15));
      hill(0.50, Math.floor(COLS * 0.14), Math.floor(COLS * 0.14));
      hill(0.87, Math.floor(COLS * 0.15), Math.floor(COLS * 0.12));
    }

    // Fill gaps below hills
    for (let x = 0; x < COLS; x++) {
      let bottom = -1;
      for (let y = ROWS - 1; y >= 0; y--) {
        if (tileGrid[y][x] !== 0) { bottom = y; break; }
      }
      if (bottom >= 0) {
        for (let y = bottom + 1; y < WATER_ROW; y++) {
          if (tileGrid[y][x] === 0) tileGrid[y][x] = 'M';
        }
      }
    }

    // Ensure top tiles have something below
    for (let y = 0; y < WATER_ROW - 1; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = tileGrid[y][x];
        if ((t === 'T' || t === 'L' || t === 'R') && tileGrid[y + 1][x] === 0) {
          tileGrid[y + 1][x] = (t === 'R' ? 'R' : (t === 'L' ? 'L' : 'M'));
        }
      }
    }

    // Build pixel data from tile grid + render
    buildPixelData();
    renderAll();
  }

  function buildPixelData() {
    pixelData.fill(0);
    for (let r = 0; r < ROWS; r++) {
      const y0 = r * TILE;
      for (let c = 0; c < COLS; c++) {
        if (tileGrid[r][c] === 0) continue;
        const x0 = c * TILE;
        for (let dy = 0; dy < TILE; dy++) {
          const rowOff = (y0 + dy) * CFG.W;
          for (let dx = 0; dx < TILE; dx++) {
            pixelData[rowOff + x0 + dx] = 1;
          }
        }
      }
    }
    // Save snapshot for destruction masking
    originalPixelData.set(pixelData);
  }

  /* ---------- rendering ---------- */
  function renderAll() {
    ctx.clearRect(0, 0, CFG.W, CFG.H);

    // Draw tiles
    if (tileReady) {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const t = tileGrid[r][c];
          if (!t) continue;
          let img = null;
          if (t === 'T') img = tileImgs.top;
          else if (t === 'L') img = tileImgs.left;
          else if (t === 'R') img = tileImgs.right;
          else if (t === 'M') img = tileImgs.middle;
          if (img) ctx.drawImage(img, c * TILE, r * TILE, TILE, TILE);
        }
      }
    }

    // Water gradient
    const wg = ctx.createLinearGradient(0, WATER_Y, 0, CFG.H);
    wg.addColorStop(0, 'rgba(28,80,160,0.85)');
    wg.addColorStop(0.4, 'rgba(18,55,120,0.92)');
    wg.addColorStop(1, 'rgba(8,30,70,0.98)');
    ctx.fillStyle = wg;
    ctx.fillRect(0, WATER_Y, CFG.W, CFG.H - WATER_Y);

    // Water waves
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = k === 0
        ? 'rgba(120,190,255,0.26)'
        : (k === 1 ? 'rgba(80,150,220,0.16)' : 'rgba(60,120,200,0.09)');
      ctx.beginPath();
      for (let x = 0; x <= CFG.W; x += 12) {
        const y = WATER_Y + 2 + k * 7 + Math.sin(x * 0.02 + timeVal * 1.5 + k * 2.8) * 3.5;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineTo(CFG.W, CFG.H);
      ctx.lineTo(0, CFG.H);
      ctx.closePath();
      ctx.fill();
    }

    // Save clean copy
    cleanCtx.clearRect(0, 0, CFG.W, CFG.H);
    cleanCtx.drawImage(cv, 0, 0);
  }

  /* ---------- pixel-based destruction ---------- */
  function carveData(cx, cy, r) {
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(CFG.W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(CFG.H - 1, Math.ceil(cy + r));
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      const rowOff = y * CFG.W;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r2) {
          pixelData[rowOff + x] = 0;
        }
      }
    }
  }

  function destroyCircle(cx, cy, r) {
    const x0 = Math.max(0, Math.floor(cx - r) - 2);
    const y0 = Math.max(0, Math.floor(cy - r) - 2);
    const x1 = Math.min(CFG.W - 1, Math.ceil(cx + r) + 2);
    const y1 = Math.min(CFG.H - 1, Math.ceil(cy + r) + 2);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;

    carveData(cx, cy, r);

    // Restore pristine area from clean canvas
    ctx.clearRect(x0, y0, w, h);
    ctx.drawImage(cleanCv, x0, y0, w, h, x0, y0, w, h);

    // Build mask: erase pixels that were originally terrain and are now destroyed
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = w;
    maskCanvas.height = h;
    const maskCtx = maskCanvas.getContext('2d');
    const maskImgData = maskCtx.createImageData(w, h);
    for (let y = y0; y <= y1; y++) {
      const rowOff = y * CFG.W;
      for (let x = x0; x <= x1; x++) {
        const pi = (y - y0) * w + (x - x0);
        if (originalPixelData[rowOff + x] && !pixelData[rowOff + x]) {
          maskImgData.data[pi * 4 + 3] = 255;
        }
      }
    }
    maskCtx.putImageData(maskImgData, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(maskCanvas, x0, y0);
    ctx.restore();
  }

  function renderRegion(x0, y0, x1, y1) {
    x0 = Math.max(0, Math.floor(x0));
    y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(CFG.W - 1, Math.ceil(x1));
    y1 = Math.min(CFG.H - 1, Math.ceil(y1));
    const w = x1 - x0 + 1, h = y1 - y0 + 1;

    // Restore pristine
    ctx.clearRect(x0, y0, w, h);
    ctx.drawImage(cleanCv, x0, y0, w, h, x0, y0, w, h);

    // Mask out all destroyed terrain pixels
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = w;
    maskCanvas.height = h;
    const maskCtx = maskCanvas.getContext('2d');
    const maskImgData = maskCtx.createImageData(w, h);
    for (let y = y0; y <= y1; y++) {
      const rowOff = y * CFG.W;
      for (let x = x0; x <= x1; x++) {
        if (originalPixelData[rowOff + x] && !pixelData[rowOff + x]) {
          const di = ((y - y0) * w + (x - x0)) * 4;
          maskImgData.data[di + 3] = 255;
        }
      }
    }
    maskCtx.putImageData(maskImgData, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(maskCanvas, x0, y0);
    ctx.restore();
  }

  function draw(ctx2) {
    ctx2.drawImage(cv, 0, 0);
  }

  /* ---------- build ---------- */
  function build(mode) {
    if (!tileReady) {
      preload().then(() => build(mode));
      return;
    }
    generate(mode);
    currentWorld = 'clay';
    spawnClouds();
    windVal = (Math.random() - 0.5) * 20;
  }

  function spawnClouds() {
    clouds = [];
    for (let i = 0; i < 6; i++) {
      clouds.push({
        x: Math.random() * CFG.W,
        y: 20 + Math.random() * WATER_Y * 0.3,
        w: 44 + Math.random() * 80,
        h: 10 + Math.random() * 12,
        s: 0.12 + Math.random() * 0.4,
        alpha: 0.08 + Math.random() * 0.10
      });
    }
  }

  /* ---------- public API ---------- */
  return {
    build, preload, solid, surfaceY, topAt, destroyCircle, renderRegion, draw, generate,
    get tileReady() { return tileReady; },
    get cv() { return cv; },
    get bg() { return null; },
    get key() { return currentWorld; },
    get imgs() { return null; },
    get spawnXs() { return spawnCols.map(s => s * TILE + TILE / 2); },
    get castle() { return null; },
    get wind() { return windVal; },
    set wind(v) { windVal = v; },
    get clouds() { return clouds; },
    get time() { return timeVal; },
    set time(v) { timeVal = v; },
    get COLS() { return COLS; },
    get ROWS() { return ROWS; },
    get TILE() { return TILE; },
    get WATER_ROW() { return WATER_ROW; },
    get WATER_Y() { return WATER_Y; },
    get pixelData() { return pixelData; }
  };
})();
