// 物理常数
const c = 299792458.0;
const G = 6.67430e-11;

class Engine {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.WIDTH = window.innerWidth;
        this.HEIGHT = window.innerHeight;
        this.canvas.width = this.WIDTH;
        this.canvas.height = this.HEIGHT;
        
        this.width = 100000000000.0;
        this.height = 75000000000.0;
        
        this.offsetX = 0.0;
        this.offsetY = 0.0;
        this.zoom = 1.0;
        this.isPanning = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        
        window.addEventListener('resize', () => {
            this.WIDTH = window.innerWidth;
            this.HEIGHT = window.innerHeight;
            this.canvas.width = this.WIDTH;
            this.canvas.height = this.HEIGHT;
        });
    }
    
    screenToWorld(screenX, screenY) {
        const worldWidth = this.width / this.zoom;
        const worldHeight = this.height / this.zoom;
        
        const x = (screenX / this.WIDTH - 0.5) * 2 * worldWidth + this.offsetX;
        const y = -(screenY / this.HEIGHT - 0.5) * 2 * worldHeight + this.offsetY;
        
        return { x, y };
    }
    
    worldToScreen(worldX, worldY) {
        const worldWidth = this.width / this.zoom;
        const worldHeight = this.height / this.zoom;
        
        const screenX = ((worldX - this.offsetX) / (2 * worldWidth) + 0.5) * this.WIDTH;
        const screenY = (-(worldY - this.offsetY) / (2 * worldHeight) + 0.5) * this.HEIGHT;
        
        return { x: screenX, y: screenY };
    }
    
    clear() {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.WIDTH, this.HEIGHT);
    }
    
    drawEmitterZone() {
        const worldWidth = this.width / this.zoom;
        const emitterWorldX = -worldWidth * 0.8;
        const emitterTop = engine.worldToScreen(emitterWorldX, this.height / this.zoom);
        const emitterBottom = engine.worldToScreen(emitterWorldX, -this.height / this.zoom);
        
        this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(emitterTop.x, emitterTop.y);
        this.ctx.lineTo(emitterBottom.x, emitterBottom.y);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }
}

class BlackHole {
    constructor(x, y, mass) {
        this.x = x;
        this.y = y;
        this.mass = mass;
        this.r_s = 2.0 * G * mass / (c * c);
        this.name = "Sagittarius A*";
        const solarMass = 1.989e30;
        this.massInSolarMasses = mass / solarMass;
    }
    
    draw(engine) {
        const center = engine.worldToScreen(this.x, this.y);
        const edge = engine.worldToScreen(this.x + this.r_s, this.y);
        const radius = Math.abs(edge.x - center.x);
        
        const ctx = engine.ctx;
        
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1;
        
        const edge15 = engine.worldToScreen(this.x + this.r_s * 1.5, this.y);
        const radius15 = Math.abs(edge15.x - center.x);
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius15, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(100, 100, 255, 0.5)';
        ctx.stroke();
        
        const edge20 = engine.worldToScreen(this.x + this.r_s * 2.0, this.y);
        const radius20 = Math.abs(edge20.x - center.x);
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius20, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(100, 255, 100, 0.5)';
        ctx.stroke();
        
        const edge30 = engine.worldToScreen(this.x + this.r_s * 3.0, this.y);
        const radius30 = Math.abs(edge30.x - center.x);
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius30, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(255, 255, 100, 0.5)';
        ctx.stroke();
        
        ctx.restore();
        
        ctx.beginPath();
        ctx.arc(center.x, center.y, Math.max(radius, 5), 0, 2 * Math.PI);
        ctx.fillStyle = '#ff0000';
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(center.x, center.y, Math.max(radius, 5), 0, 2 * Math.PI);
        ctx.strokeStyle = '#ff6666';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = 'white';
        ctx.font = '13px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.name, center.x, center.y - Math.max(radius, 5) - 10);
        
        ctx.font = '11px Arial';
        ctx.fillStyle = 'rgba(100, 100, 255, 0.8)';
        ctx.fillText('1.5Rs', center.x + radius15 + 5, center.y - 5);
        
        ctx.fillStyle = 'rgba(100, 255, 100, 0.8)';
        ctx.fillText('2Rs', center.x + radius20 + 5, center.y - 5);
        
        ctx.fillStyle = 'rgba(255, 255, 100, 0.8)';
        ctx.fillText('3Rs', center.x + radius30 + 5, center.y - 5);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fillText('Rs', center.x + Math.max(radius, 5) + 5, center.y);
    }
}

class Ray {
    constructor(posX, posY, dirX, dirY, blackHole) {
        this.x = posX;
        this.y = posY;
        
        this.r = Math.sqrt(posX * posX + posY * posY);
        this.phi = Math.atan2(posY, posX);
        
        this.dr = dirX * Math.cos(this.phi) + dirY * Math.sin(this.phi);
        this.dphi = (-dirX * Math.sin(this.phi) + dirY * Math.cos(this.phi)) / this.r;
        
        this.L = this.r * this.r * this.dphi;
        const f = 1.0 - blackHole.r_s / this.r;
        const dt_dlambda = Math.sqrt((this.dr * this.dr) / (f * f) + (this.r * this.r * this.dphi * this.dphi) / f);
        this.E = f * dt_dlambda;
        
        this.trail = [{ x: this.x, y: this.y }];
        this.active = true;
        this.rs = blackHole.r_s;
    }
    
    step(dlambda) {
        if (!this.active) return;
        if (this.r <= this.rs * 1.01) {
            this.active = false;
            return;
        }
        
        const oldR = this.r;
        this.rk4Step(dlambda);
        
        this.x = this.r * Math.cos(this.phi);
        this.y = this.r * Math.sin(this.phi);
        
        if (this.r <= this.rs * 1.01) {
            this.active = false;
            return;
        }
        
        this.trail.push({ x: this.x, y: this.y });
        
        if (this.trail.length > 2000) {
            this.trail.shift();
        }
    }
    
    geodesicRHS(r, dr, dphi) {
        const f = 1.0 - this.rs / r;
        const dt_dlambda = this.E / f;
        
        const rhs = new Array(4);
        rhs[0] = dr;
        rhs[1] = dphi;
        
        rhs[2] = -(this.rs / (2 * r * r)) * f * (dt_dlambda * dt_dlambda)
                + (this.rs / (2 * r * r * f)) * (dr * dr)
                + (r - this.rs) * (dphi * dphi);
        
        rhs[3] = -2.0 * dr * dphi / r;
        
        return rhs;
    }
    
    addState(a, b, factor) {
        return a.map((val, i) => val + b[i] * factor);
    }
    
    rk4Step(dlambda) {
        const y0 = [this.r, this.phi, this.dr, this.dphi];
        
        const k1 = this.geodesicRHS(y0[0], y0[2], y0[3]);
        
        const temp2 = this.addState(y0, k1, dlambda / 2.0);
        const k2 = this.geodesicRHS(temp2[0], temp2[2], temp2[3]);
        
        const temp3 = this.addState(y0, k2, dlambda / 2.0);
        const k3 = this.geodesicRHS(temp3[0], temp3[2], temp3[3]);
        
        const temp4 = this.addState(y0, k3, dlambda);
        const k4 = this.geodesicRHS(temp4[0], temp4[2], temp4[3]);
        
        this.r += (dlambda / 6.0) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
        this.phi += (dlambda / 6.0) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
        this.dr += (dlambda / 6.0) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
        this.dphi += (dlambda / 6.0) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
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
        ctx.arc(pos.x, pos.y, 3, 0, 2 * Math.PI);
        ctx.fillStyle = '#ff0000';
        ctx.fill();
    }
}

const engine = new Engine();
const blackHole = new BlackHole(0, 0, 8.54e36);
const rays = [];
let simulationSpeed = 1.0;
let simulationMode = 'single';

document.getElementById('massValue').textContent = `${blackHole.massInSolarMasses.toExponential(2)} M☉`;
document.getElementById('rsValue').textContent = `${(blackHole.r_s / 1e9).toFixed(2)} × 10⁹ m`;

function clearAndReset() {
    rays.length = 0;
    engine.offsetX = 0;
    engine.offsetY = 0;
    engine.zoom = 1.0;
}

engine.canvas.addEventListener('click', (e) => {
    const world = engine.screenToWorld(e.clientX, e.clientY);
    
    if (simulationMode === 'single') {
        const worldWidth = engine.width / engine.zoom;
        const emitterWorldX = -worldWidth * 0.8;
        rays.push(new Ray(emitterWorldX, world.y, c, 0, blackHole));
    } else if (simulationMode === 'batch') {
        const worldWidth = engine.width / engine.zoom;
        const worldHeight = engine.height / engine.zoom;
        const emitterWorldX = -worldWidth * 0.8;
        const numRays = 20;
        const spacing = (2 * worldHeight) / (numRays + 1);
        
        for (let i = 1; i <= numRays; i++) {
            const y = -worldHeight + i * spacing;
            rays.push(new Ray(emitterWorldX, y, c, 0, blackHole));
        }
    } else if (simulationMode === 'click') {
        const dx = world.x - blackHole.x;
        const dy = world.y - blackHole.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > blackHole.r_s * 1.5) {
            const tangentDirX = dy / dist;
            const tangentDirY = -dx / dist;
            
            rays.push(new Ray(world.x, world.y, tangentDirX * c, tangentDirY * c, blackHole));
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
    engine.zoom = 1.0;
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
