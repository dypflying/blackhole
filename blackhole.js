// 物理常数
const c = 299792458.0;
const G = 6.67430e-11;
const PI = Math.PI;

const VIEW_WIDTH = 1e11;
const VIEW_HEIGHT = 7.5e10;
const DEFAULT_ZOOM = 0.5;  // 默认视角缩放，0.5表示视角更远

class BlackHole {
    constructor(x, y, mass) {
        this.x = x;
        this.y = y;
        this.mass = mass;
        this.rs = 2.0 * G * mass / (c * c);
        this.r_s = this.rs;  // 兼容旧代码
        this.massInSolarMasses = mass / 1.98847e30;
    }
    
    draw(engine) {
        const ctx = engine.ctx;
        const screenPos = engine.worldToScreen(this.x, this.y);
        const radius = Math.abs(engine.worldToScreen(this.x + this.rs, this.y).x - screenPos.x);
        
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, radius, 0, 2 * PI);
        ctx.fillStyle = '#000000';
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, radius, 0, 2 * PI);
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        const gradient = ctx.createRadialGradient(
            screenPos.x, screenPos.y, radius * 0.8,
            screenPos.x, screenPos.y, radius * 2
        );
        gradient.addColorStop(0, 'rgba(255, 100, 50, 0.5)');
        gradient.addColorStop(0.5, 'rgba(255, 50, 0, 0.2)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, radius * 2, 0, 2 * PI);
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // 绘制1.5Rs、2Rs、3Rs的虚线圆
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1;
        
        // 1.5Rs - 光子球（黄色）
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, radius * 1.5, 0, 2 * PI);
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)';
        ctx.stroke();
        
        // 2Rs（青色）
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, radius * 2, 0, 2 * PI);
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
        ctx.stroke();
        
        // 3Rs（绿色）
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, radius * 3, 0, 2 * PI);
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.4)';
        ctx.stroke();
        
        ctx.setLineDash([]);
        
        // 添加半径数值标签
        ctx.font = '12px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        const labelOffset = 5;
        
        // 1.5Rs 标签
        ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
        ctx.fillText('1.5Rs', screenPos.x + labelOffset, screenPos.y - radius * 1.5);
        
        // 2Rs 标签
        ctx.fillStyle = 'rgba(0, 255, 255, 0.8)';
        ctx.fillText('2Rs', screenPos.x + labelOffset, screenPos.y - radius * 2);
        
        // 3Rs 标签
        ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
        ctx.fillText('3Rs', screenPos.x + labelOffset, screenPos.y - radius * 3);
    }
}

// 全局黑洞对象（Ray类需要使用）
const SagA = new BlackHole(0, 0, 8.54e36);

class Ray {
    constructor(x, y, vx, vy) {
        this.x = x;
        this.y = y;
        this.r = Math.sqrt(x * x + y * y);
        this.phi = Math.atan2(y, x);
        
        const cos_phi = Math.cos(this.phi);
        const sin_phi = Math.sin(this.phi);
        
        this.dr = vx * cos_phi + vy * sin_phi;
        this.dphi = (-vx * sin_phi + vy * cos_phi) / this.r;
        
        this.L = this.r * this.r * this.dphi;
        const f = 1.0 - SagA.rs / this.r;
        const dt_dlambda = Math.sqrt(
            (this.dr * this.dr) / (f * f) + 
            (this.r * this.r * this.dphi * this.dphi) / f
        );
        this.E = f * dt_dlambda;
        
        this.trail = [{x: x, y: y}];
        this.active = true;
        this.rs = SagA.rs;
    }
    
    step(dlambda) {
        if (!this.active) return;
        if (this.r <= this.rs * 1.01) {
            this.active = false;
            return;
        }
        
        const y0 = [this.r, this.phi, this.dr, this.dphi];
        const k1 = this.geodesicRHS(y0, this.rs);
        
        const y2 = y0.map((v, i) => v + k1[i] * dlambda / 2.0);
        const k2 = this.geodesicRHS(y2, this.rs);
        
        const y3 = y0.map((v, i) => v + k2[i] * dlambda / 2.0);
        const k3 = this.geodesicRHS(y3, this.rs);
        
        const y4 = y0.map((v, i) => v + k3[i] * dlambda);
        const k4 = this.geodesicRHS(y4, this.rs);
        
        this.r = y0[0] + (dlambda / 6.0) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
        this.phi = y0[1] + (dlambda / 6.0) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
        this.dr = y0[2] + (dlambda / 6.0) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
        this.dphi = y0[3] + (dlambda / 6.0) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
        
        this.x = this.r * Math.cos(this.phi);
        this.y = this.r * Math.sin(this.phi);
        
        this.trail.push({x: this.x, y: this.y});
        
        if (this.trail.length > 2000) {
            this.trail.shift();
        }
    }
    
    geodesicRHS(state, rs) {
        const [r, phi, dr, dphi] = state;
        const f = 1.0 - rs / r;
        const dt_dlambda = this.E / f;
        
        return [
            dr,
            dphi,
            -(rs / (2 * r * r)) * f * dt_dlambda * dt_dlambda +
                (rs / (2 * r * r * f)) * dr * dr +
                (r - rs) * dphi * dphi,
            -2.0 * dr * dphi / r
        ];
    }
    
    draw(engine) {
        if (this.trail.length < 2) return;
        
        const ctx = engine.ctx;
        
        for (let i = 1; i < this.trail.length; i++) {
            const prev = engine.worldToScreen(this.trail[i - 1].x, this.trail[i - 1].y);
            const curr = engine.worldToScreen(this.trail[i].x, this.trail[i].y);
            
            const alpha = Math.max(i / this.trail.length, 0.05);
            
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(curr.x, curr.y);
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        
        const pos = engine.worldToScreen(this.x, this.y);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 3, 0, 2 * PI);
        ctx.fillStyle = '#ff0000';
        ctx.fill();
    }
}

class Engine {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.WIDTH = window.innerWidth;
        this.HEIGHT = window.innerHeight;
        this.canvas.width = this.WIDTH;
        this.canvas.height = this.HEIGHT;
        
        this.width = VIEW_WIDTH;
        this.height = VIEW_HEIGHT;
        
        this.offsetX = 0.0;
        this.offsetY = 0.0;
        this.zoom = 1.0;
        
        this.isPanning = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        
        this.gridSize = 1e10;
    }
    
    clear() {
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.WIDTH, this.HEIGHT);
        this.drawGrid();
    }
    
    worldToScreen(x, y) {
        const scale = this.WIDTH / this.width * this.zoom;
        const centerX = this.WIDTH / 2;
        const centerY = this.HEIGHT / 2;
        
        return {
            x: centerX + (x - this.offsetX) * scale,
            y: centerY - (y - this.offsetY) * scale
        };
    }
    
    screenToWorld(screenX, screenY) {
        const scale = this.width / this.WIDTH / this.zoom;
        const centerX = this.WIDTH / 2;
        const centerY = this.HEIGHT / 2;
        
        return {
            x: this.offsetX + (screenX - centerX) * scale,
            y: this.offsetY - (screenY - centerY) * scale
        };
    }
    
    drawGrid() {
        const ctx = this.ctx;
        
        const left = this.screenToWorld(0, 0).x;
        const right = this.screenToWorld(this.WIDTH, 0).x;
        const startX = Math.floor(left / this.gridSize) * this.gridSize;
        
        ctx.strokeStyle = 'rgba(50, 50, 50, 0.5)';
        ctx.lineWidth = 1;
        
        for (let x = startX; x <= right; x += this.gridSize) {
            const screenX = this.worldToScreen(x, 0).x;
            ctx.beginPath();
            ctx.moveTo(screenX, 0);
            ctx.lineTo(screenX, this.HEIGHT);
            ctx.stroke();
        }
        
        const bottom = this.screenToWorld(0, this.HEIGHT).y;
        const top = this.screenToWorld(0, 0).y;
        const startY = Math.floor(bottom / this.gridSize) * this.gridSize;
        
        for (let y = startY; y <= top; y += this.gridSize) {
            const screenY = this.worldToScreen(0, y).y;
            ctx.beginPath();
            ctx.moveTo(0, screenY);
            ctx.lineTo(this.WIDTH, screenY);
            ctx.stroke();
        }
        
        ctx.strokeStyle = 'rgba(100, 100, 100, 0.8)';
        ctx.lineWidth = 2;
        
        const originX = this.worldToScreen(0, 0).x;
        const originY = this.worldToScreen(0, 0).y;
        
        ctx.beginPath();
        ctx.moveTo(0, originY);
        ctx.lineTo(this.WIDTH, originY);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(originX, 0);
        ctx.lineTo(originX, this.HEIGHT);
        ctx.stroke();
    }
    
    drawEmitterZone() {
        const ctx = this.ctx;
        const worldWidth = this.width / this.zoom;
        const emitterX = -worldWidth * 0.4;
        
        const top = this.worldToScreen(emitterX, this.offsetY + this.height / this.zoom);
        const bottom = this.worldToScreen(emitterX, this.offsetY - this.height / this.zoom);
        
        ctx.strokeStyle = 'rgba(100, 100, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(bottom.x, bottom.y);
        ctx.stroke();
        
        ctx.setLineDash([]);
    }
}

const engine = new Engine();
engine.zoom = DEFAULT_ZOOM;
const blackHole = SagA;  // 使用同一个黑洞对象
const rays = [];
let simulationSpeed = 1.0;
let simulationMode = 'single';

document.getElementById('massValue').textContent = `${blackHole.massInSolarMasses.toExponential(2)} M☉`;
document.getElementById('rsValue').textContent = `${(blackHole.r_s / 1e9).toFixed(2)} × 10⁹ m`;

function clearAndReset() {
    rays.length = 0;
    engine.offsetX = 0;
    engine.offsetY = 0;
    engine.zoom = DEFAULT_ZOOM;
}

engine.canvas.addEventListener('click', (e) => {
    const world = engine.screenToWorld(e.clientX, e.clientY);
    
    if (simulationMode === 'single') {
        const worldWidth = engine.width / engine.zoom;
        const emitterWorldX = -worldWidth * 0.4;
        rays.push(new Ray(emitterWorldX, world.y, c, 0));
    } else if (simulationMode === 'batch') {
        rays.length = 0; // 批量模式下清空之前的光线
        const worldWidth = engine.width / engine.zoom;
        const worldHeight = engine.height / engine.zoom;
        const emitterWorldX = -worldWidth * 0.4;
        const numRays = 100;
        const spacing = (2 * worldHeight) / (numRays + 1);
        
        for (let i = 1; i <= numRays; i++) {
            const y = -worldHeight + i * spacing;
            rays.push(new Ray(emitterWorldX, y, c, 0));
        }
    } else if (simulationMode === 'click') {
        const dx = blackHole.x - world.x;
        const dy = blackHole.y - world.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > blackHole.r_s * 1.01) {
            const vx = -dy / dist * c;
            const vy = dx / dist * c;
            
            rays.push(new Ray(world.x, world.y, vx, vy));
        }
    }
});

engine.canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    engine.zoom *= zoomFactor;
    
    engine.zoom = Math.max(0.1, Math.min(engine.zoom, 10));
});

engine.canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0 && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        engine.isPanning = true;
        engine.lastMouseX = e.clientX;
        engine.lastMouseY = e.clientY;
    }
});

engine.canvas.addEventListener('mousemove', (e) => {
    if (engine.isPanning) {
        const dx = e.clientX - engine.lastMouseX;
        const dy = e.clientY - engine.lastMouseY;
        
        const worldWidth = engine.width / engine.zoom;
        const worldHeight = engine.height / engine.zoom;
        
        engine.offsetX -= (dx / engine.WIDTH) * 2 * worldWidth;
        engine.offsetY += (dy / engine.HEIGHT) * 2 * worldHeight;
        
        engine.lastMouseX = e.clientX;
        engine.lastMouseY = e.clientY;
    }
});

engine.canvas.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
        engine.isPanning = false;
    }
});

document.getElementById('clearBtn').addEventListener('click', () => {
    rays.length = 0;
});

document.getElementById('resetBtn').addEventListener('click', () => {
    engine.offsetX = 0;
    engine.offsetY = 0;
    engine.zoom = DEFAULT_ZOOM;
});

document.getElementById('modeSelect').addEventListener('change', (e) => {
    simulationMode = e.target.value;
    clearAndReset();
});

const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
speedSlider.addEventListener('input', (e) => {
    simulationSpeed = parseFloat(e.target.value);
    speedValue.textContent = simulationSpeed.toFixed(1);
});

// 国际化支持
const i18n = {
    en: {
        title: 'Black Hole Simulation',
        mode: 'Mode:',
        modeSingle: 'Single Ray',
        modeBatch: 'Batch Rays',
        modeClick: 'Click Tangential',
        speed: 'Speed',
        clear: 'Clear',
        reset: 'Reset',
        mass: 'Mass:',
        rs: 'Schwarzschild Radius Rs:',
        blackHoleName: 'Sagittarius A*'
    },
    zh: {
        title: '黑洞引力透镜模拟',
        mode: '模式:',
        modeSingle: '单光线模拟',
        modeBatch: '批量光线模拟',
        modeClick: '点击切线模式',
        speed: '速度',
        clear: '清除',
        reset: '重置',
        mass: '质量:',
        rs: '史瓦西半径 Rs:',
        blackHoleName: '人马座A*'
    }
};

let currentLang = 'en';

function updateLanguage() {
    const texts = i18n[currentLang];
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (texts[key]) {
            el.textContent = texts[key];
        }
    });
}

document.getElementById('langSelect').addEventListener('change', (e) => {
    currentLang = e.target.value;
    updateLanguage();
});

function animate() {
    engine.clear();
    
    if (simulationMode === 'single' || simulationMode === 'batch') {
        engine.drawEmitterZone();
    }
    
    blackHole.draw(engine);
    
    rays.forEach(ray => {
        for (let i = 0; i < 5 * simulationSpeed; i++) {
            ray.step(1.0);
        }
        ray.draw(engine);
    });
    
    requestAnimationFrame(animate);
}

animate();
