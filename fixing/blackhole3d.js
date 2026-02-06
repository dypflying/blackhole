// ============================================================================
// Black Hole 3D Visualization - WebGL Implementation
// Simulates: Gravitational Lensing, Accretion Disk, Multi-body Gravity
// ============================================================================

const c = 299792458.0;
const G = 6.67430e-11;
const solarMass = 1.989e30;

const WORKER_CODE = `
const c = 299792458.0;
const G = 6.67430e-11;
const solarMass = 1.989e30;

class Vec3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x; this.y = y; this.z = z;
    }
    add(v) { return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z); }
    sub(v) { return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z); }
    mul(s) { return new Vec3(this.x * s, this.y * s, this.z * s); }
    dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    cross(v) {
        return new Vec3(
            this.y * v.z - this.z * v.y,
            this.z * v.x - this.x * v.z,
            this.x * v.y - this.y * v.x
        );
    }
    length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
    normalize() {
        const len = this.length();
        return len > 0 ? this.mul(1.0 / len) : new Vec3(0, 0, 0);
    }
    static distance(a, b) {
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
}

class Ray {
    constructor(pos, dir, rs) {
        this.x = pos.x; this.y = pos.y; this.z = pos.z;
        
        this.r = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
        this.theta = Math.acos(this.z / this.r);
        this.phi = Math.atan2(this.y, this.x);
        
        const dx = dir.x, dy = dir.y, dz = dir.z;
        this.dr = Math.sin(this.theta) * Math.cos(this.phi) * dx +
                  Math.sin(this.theta) * Math.sin(this.phi) * dy +
                  Math.cos(this.theta) * dz;
        
        this.dtheta = (Math.cos(this.theta) * Math.cos(this.phi) * dx +
                       Math.cos(this.theta) * Math.sin(this.phi) * dy -
                       Math.sin(this.theta) * dz) / this.r;
        
        this.dphi = (-Math.sin(this.phi) * dx + Math.cos(this.phi) * dy) /
                    (this.r * Math.sin(this.theta));
        
        this.L = this.r * this.r * Math.sin(this.theta) * this.dphi;
        const f = 1.0 - rs / this.r;
        const dt_dλ = Math.sqrt(
            (this.dr * this.dr) / f +
            this.r * this.r * (this.dtheta * this.dtheta +
            Math.sin(this.theta) * Math.sin(this.theta) * this.dphi * this.dphi)
        );
        this.E = f * dt_dλ;
    }

    geodesicRHS(rs) {
        const f = 1.0 - rs / this.r;
        const dt_dλ = this.E / f;
        const sinTheta = Math.sin(this.theta);
        const cosTheta = Math.cos(this.theta);

        return {
            d1: [this.dr, this.dtheta, this.dphi],
            d2: [
                -(rs / (2 * this.r * this.r)) * f * dt_dλ * dt_dλ +
                (rs / (2 * this.r * this.r * f)) * this.dr * this.dr +
                this.r * (this.dtheta * this.dtheta + sinTheta * sinTheta * this.dphi * this.dphi),
                
                -2.0 * this.dr * this.dtheta / this.r + sinTheta * cosTheta * this.dphi * this.dphi,
                
                -2.0 * this.dr * this.dphi / this.r - 2.0 * cosTheta / sinTheta * this.dtheta * this.dphi
            ]
        };
    }

    rk4Step(dλ, rs) {
        const k1 = this.geodesicRHS(rs);
        
        this.r += dλ * k1.d1[0];
        this.theta += dλ * k1.d1[1];
        this.phi += dλ * k1.d1[2];
        this.dr += dλ * k1.d2[0];
        this.dtheta += dλ * k1.d2[1];
        this.dphi += dλ * k1.d2[2];
        
        this.x = this.r * Math.sin(this.theta) * Math.cos(this.phi);
        this.y = this.r * Math.sin(this.theta) * Math.sin(this.phi);
        this.z = this.r * Math.cos(this.theta);
    }
}

self.onmessage = function(e) {
    const { width, height, startRow, endRow, cameraData, blackHole, objects, disk, maxSteps } = e.data;
    
    const camPos = new Vec3(cameraData.position.x, cameraData.position.y, cameraData.position.z);
    const target = new Vec3(cameraData.target.x, cameraData.target.y, cameraData.target.z);
    const forward = target.sub(camPos).normalize();
    const right = new Vec3(0, 1, 0).cross(forward).normalize();
    const up = right.cross(forward);
    
    const aspect = width / height;
    const tanHalfFov = Math.tan((60 * Math.PI / 180) / 2);
    
    const D_LAMBDA = 5e7;
    const ESCAPE_R = 5e13;
    
    const pixels = new Uint8Array(width * (endRow - startRow) * 4);
    
    for (let py = startRow; py < endRow; py++) {
        for (let px = 0; px < width; px++) {
            const u = (2.0 * (px + 0.5) / width - 1.0) * aspect * tanHalfFov;
            const v = (1.0 - 2.0 * (py + 0.5) / height) * tanHalfFov;
            
            const dir = right.mul(u).add(up.mul(v)).add(forward).normalize();
            const ray = new Ray(camPos, dir, blackHole.rs);
            
            let color = [0, 0, 0, 255];
            let prevY = ray.y;
            
            for (let step = 0; step < maxSteps; step++) {
                if (ray.r <= blackHole.rs * 1.1) {
                    color = [0, 0, 0, 255];
                    break;
                }
                
                ray.rk4Step(D_LAMBDA, blackHole.rs);
                
                const newY = ray.y;
                if (prevY * newY < 0) {
                    const r2d = Math.sqrt(ray.x * ray.x + ray.z * ray.z);
                    if (r2d >= disk.r1 && r2d <= disk.r2) {
                        const t = r2d / disk.r2;
                        color = [
                            255,
                            Math.floor(t * 255),
                            51,
                            255
                        ];
                        break;
                    }
                }
                prevY = newY;
                
                let hitObj = false;
                for (const obj of objects) {
                    const objPos = new Vec3(obj.position.x, obj.position.y, obj.position.z);
                    const dist = Vec3.distance(new Vec3(ray.x, ray.y, ray.z), objPos);
                    if (dist <= obj.radius) {
                        const P = new Vec3(ray.x, ray.y, ray.z);
                        const N = P.sub(objPos).normalize();
                        const V = camPos.sub(P).normalize();
                        const diff = Math.max(N.dot(V), 0);
                        const intensity = 0.1 + 0.9 * diff;
                        
                        color = [
                            Math.floor(obj.color[0] * 255 * intensity),
                            Math.floor(obj.color[1] * 255 * intensity),
                            Math.floor(obj.color[2] * 255 * intensity),
                            255
                        ];
                        hitObj = true;
                        break;
                    }
                }
                if (hitObj) break;
                
                if (ray.r > ESCAPE_R) break;
            }
            
            const localRow = py - startRow;
            const idx = (localRow * width + px) * 4;
            pixels[idx] = color[0];
            pixels[idx + 1] = color[1];
            pixels[idx + 2] = color[2];
            pixels[idx + 3] = color[3];
        }
    }
    
    self.postMessage({ pixels, startRow, endRow }, [pixels.buffer]);
};
`;

// ============================================================================
// Math Utilities
// ============================================================================
class Vec3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x; this.y = y; this.z = z;
    }
    add(v) { return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z); }
    sub(v) { return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z); }
    mul(s) { return new Vec3(this.x * s, this.y * s, this.z * s); }
    dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    cross(v) {
        return new Vec3(
            this.y * v.z - this.z * v.y,
            this.z * v.x - this.x * v.z,
            this.x * v.y - this.y * v.x
        );
    }
    length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
    normalize() {
        const len = this.length();
        return len > 0 ? this.mul(1.0 / len) : new Vec3(0, 0, 0);
    }
    static distance(a, b) {
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
}

class Mat4 {
    constructor() {
        this.m = new Float32Array(16);
        this.identity();
    }
    identity() {
        this.m.fill(0);
        this.m[0] = this.m[5] = this.m[10] = this.m[15] = 1;
        return this;
    }
    perspective(fovy, aspect, near, far) {
        const f = 1.0 / Math.tan(fovy / 2);
        this.m[0] = f / aspect;
        this.m[5] = f;
        this.m[10] = (far + near) / (near - far);
        this.m[11] = -1;
        this.m[14] = (2 * far * near) / (near - far);
        this.m[15] = 0;
        return this;
    }
    lookAt(eye, center, up) {
        const z = eye.sub(center).normalize();
        const x = up.cross(z).normalize();
        const y = z.cross(x);
        
        this.m[0] = x.x; this.m[4] = x.y; this.m[8] = x.z; this.m[12] = -x.dot(eye);
        this.m[1] = y.x; this.m[5] = y.y; this.m[9] = y.z; this.m[13] = -y.dot(eye);
        this.m[2] = z.x; this.m[6] = z.y; this.m[10] = z.z; this.m[14] = -z.dot(eye);
        this.m[3] = 0; this.m[7] = 0; this.m[11] = 0; this.m[15] = 1;
        return this;
    }
    multiply(b) {
        const result = new Mat4();
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                let sum = 0;
                for (let k = 0; k < 4; k++) {
                    sum += this.m[i + k * 4] * b.m[k + j * 4];
                }
                result.m[i + j * 4] = sum;
            }
        }
        return result;
    }
}

// ============================================================================
// Camera System
// ============================================================================
class Camera {
    constructor() {
        this.target = new Vec3(0, 0, 0);
        this.radius = 2e11;
        this.minRadius = 5e10;
        this.maxRadius = 5e11;
        this.azimuth = 0;
        this.elevation = Math.PI / 2;
        this.orbitSpeed = 0.01;
        this.zoomSpeed = 1e10;
        this.dragging = false;
        this.panning = false;
        this.lastX = 0;
        this.lastY = 0;
    }

    position() {
        const clampedElevation = Math.max(0.01, Math.min(Math.PI - 0.01, this.elevation));
        return new Vec3(
            this.radius * Math.sin(clampedElevation) * Math.cos(this.azimuth),
            this.radius * Math.cos(clampedElevation),
            this.radius * Math.sin(clampedElevation) * Math.sin(this.azimuth)
        );
    }

    processMouseMove(dx, dy) {
        if (this.dragging && !this.panning) {
            this.azimuth += dx * this.orbitSpeed;
            this.elevation -= dy * this.orbitSpeed;
            this.elevation = Math.max(0.01, Math.min(Math.PI - 0.01, this.elevation));
        }
    }

    processScroll(delta) {
        this.radius -= delta * this.zoomSpeed;
        this.radius = Math.max(this.minRadius, Math.min(this.maxRadius, this.radius));
    }

    reset() {
        this.radius = 2e11;
        this.azimuth = 0;
        this.elevation = Math.PI / 2;
    }
}

// ============================================================================
// Black Hole & Objects
// ============================================================================
class BlackHole {
    constructor(position, mass) {
        this.position = position;
        this.mass = mass;
        this.rs = (2.0 * G * mass) / (c * c);
    }
}

class CelestialObject {
    constructor(position, radius, color, mass) {
        this.position = position;
        this.radius = radius;
        this.color = color;
        this.mass = mass;
        this.velocity = new Vec3(0, 0, 0);
    }
}

// ============================================================================
// Ray Tracing (Geodesic Integration)
// ============================================================================
class Ray {
    constructor(pos, dir, rs) {
        // Cartesian
        this.x = pos.x; this.y = pos.y; this.z = pos.z;
        
        // Spherical
        this.r = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
        this.theta = Math.acos(this.z / this.r);
        this.phi = Math.atan2(this.y, this.x);
        
        // Velocities in spherical basis
        const dx = dir.x, dy = dir.y, dz = dir.z;
        this.dr = Math.sin(this.theta) * Math.cos(this.phi) * dx +
                  Math.sin(this.theta) * Math.sin(this.phi) * dy +
                  Math.cos(this.theta) * dz;
        
        this.dtheta = (Math.cos(this.theta) * Math.cos(this.phi) * dx +
                       Math.cos(this.theta) * Math.sin(this.phi) * dy -
                       Math.sin(this.theta) * dz) / this.r;
        
        this.dphi = (-Math.sin(this.phi) * dx + Math.cos(this.phi) * dy) /
                    (this.r * Math.sin(this.theta));
        
        // Conserved quantities
        this.L = this.r * this.r * Math.sin(this.theta) * this.dphi;
        const f = 1.0 - rs / this.r;
        const dt_dλ = Math.sqrt(
            (this.dr * this.dr) / f +
            this.r * this.r * (this.dtheta * this.dtheta +
            Math.sin(this.theta) * Math.sin(this.theta) * this.dphi * this.dphi)
        );
        this.E = f * dt_dλ;
    }

    geodesicRHS(rs) {
        const f = 1.0 - rs / this.r;
        const dt_dλ = this.E / f;
        const sinTheta = Math.sin(this.theta);
        const cosTheta = Math.cos(this.theta);

        return {
            d1: [this.dr, this.dtheta, this.dphi],
            d2: [
                -(rs / (2 * this.r * this.r)) * f * dt_dλ * dt_dλ +
                (rs / (2 * this.r * this.r * f)) * this.dr * this.dr +
                this.r * (this.dtheta * this.dtheta + sinTheta * sinTheta * this.dphi * this.dphi),
                
                -2.0 * this.dr * this.dtheta / this.r + sinTheta * cosTheta * this.dphi * this.dphi,
                
                -2.0 * this.dr * this.dphi / this.r - 2.0 * cosTheta / sinTheta * this.dtheta * this.dphi
            ]
        };
    }

    rk4Step(dλ, rs) {
        const k1 = this.geodesicRHS(rs);
        
        // Simple Euler step for performance (full RK4 is too slow for real-time)
        this.r += dλ * k1.d1[0];
        this.theta += dλ * k1.d1[1];
        this.phi += dλ * k1.d1[2];
        this.dr += dλ * k1.d2[0];
        this.dtheta += dλ * k1.d2[1];
        this.dphi += dλ * k1.d2[2];
        
        // Convert back to Cartesian
        this.x = this.r * Math.sin(this.theta) * Math.cos(this.phi);
        this.y = this.r * Math.sin(this.theta) * Math.sin(this.phi);
        this.z = this.r * Math.cos(this.theta);
    }
}

// ============================================================================
// Raytracer
// ============================================================================
class Raytracer {
    constructor(width, height, blackHole, objects, disk) {
        this.width = width;
        this.height = height;
        this.blackHole = blackHole;
        this.objects = objects;
        this.disk = disk;
        this.pixels = new Uint8Array(width * height * 4);
        this.currentRow = 0;
        this.isComplete = false;
    }

    traceChunk(camera, maxSteps, rowsPerChunk = 5) {
        const camPos = camera.position();
        const forward = camera.target.sub(camPos).normalize();
        const right = new Vec3(0, 1, 0).cross(forward).normalize();
        const up = right.cross(forward);
        
        const aspect = this.width / this.height;
        const tanHalfFov = Math.tan((60 * Math.PI / 180) / 2);
        
        const D_LAMBDA = 5e7;
        const ESCAPE_R = 5e13;
        
        const endRow = Math.min(this.currentRow + rowsPerChunk, this.height);
        
        for (let py = this.currentRow; py < endRow; py++) {
            for (let px = 0; px < this.width; px++) {
                const u = (2.0 * (px + 0.5) / this.width - 1.0) * aspect * tanHalfFov;
                const v = (1.0 - 2.0 * (py + 0.5) / this.height) * tanHalfFov;
                
                const dir = right.mul(u).add(up.mul(v)).add(forward).normalize();
                const ray = new Ray(camPos, dir, this.blackHole.rs);
                
                let color = [0, 0, 0, 255];
                let prevY = ray.y;
                
                for (let step = 0; step < maxSteps; step++) {
                    if (ray.r <= this.blackHole.rs * 1.1) {
                        color = [0, 0, 0, 255];
                        break;
                    }
                    
                    ray.rk4Step(D_LAMBDA, this.blackHole.rs);
                    
                    const newY = ray.y;
                    if (prevY * newY < 0) {
                        const r2d = Math.sqrt(ray.x * ray.x + ray.z * ray.z);
                        if (r2d >= this.disk.r1 && r2d <= this.disk.r2) {
                            const t = r2d / this.disk.r2;
                            color = [
                                255,
                                Math.floor(t * 255),
                                51,
                                255
                            ];
                            break;
                        }
                    }
                    prevY = newY;
                    
                    let hitObj = false;
                    for (const obj of this.objects) {
                        const dist = Vec3.distance(new Vec3(ray.x, ray.y, ray.z), obj.position);
                        if (dist <= obj.radius) {
                            const P = new Vec3(ray.x, ray.y, ray.z);
                            const N = P.sub(obj.position).normalize();
                            const V = camPos.sub(P).normalize();
                            const diff = Math.max(N.dot(V), 0);
                            const intensity = 0.1 + 0.9 * diff;
                            
                            color = [
                                Math.floor(obj.color[0] * 255 * intensity),
                                Math.floor(obj.color[1] * 255 * intensity),
                                Math.floor(obj.color[2] * 255 * intensity),
                                255
                            ];
                            hitObj = true;
                            break;
                        }
                    }
                    if (hitObj) break;
                    
                    if (ray.r > ESCAPE_R) break;
                }
                
                const idx = (py * this.width + px) * 4;
                this.pixels[idx] = color[0];
                this.pixels[idx + 1] = color[1];
                this.pixels[idx + 2] = color[2];
                this.pixels[idx + 3] = color[3];
            }
        }
        
        this.currentRow = endRow;
        this.isComplete = this.currentRow >= this.height;
        
        return {
            pixels: this.pixels,
            progress: this.currentRow / this.height,
            complete: this.isComplete
        };
    }

    reset() {
        this.currentRow = 0;
        this.isComplete = false;
        this.pixels.fill(0);
    }
}

// ============================================================================
// WebGL Grid Renderer
// ============================================================================
class GridRenderer {
    constructor(gl) {
        this.gl = gl;
        this.setupShaders();
    }

    setupShaders() {
        const gl = this.gl;
        
        const vertSrc = `
            attribute vec3 aPos;
            uniform mat4 uViewProj;
            void main() {
                gl_Position = uViewProj * vec4(aPos, 1.0);
            }
        `;
        
        const fragSrc = `
            precision mediump float;
            void main() {
                gl_FragColor = vec4(0.5, 0.5, 0.5, 0.7);
            }
        `;
        
        const vertShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertShader, vertSrc);
        gl.compileShader(vertShader);
        
        const fragShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragShader, fragSrc);
        gl.compileShader(fragShader);
        
        this.program = gl.createProgram();
        gl.attachShader(this.program, vertShader);
        gl.attachShader(this.program, fragShader);
        gl.linkProgram(this.program);
        
        this.aPos = gl.getAttribLocation(this.program, 'aPos');
        this.uViewProj = gl.getUniformLocation(this.program, 'uViewProj');
    }

    generateGrid(objects, blackHole) {
        const gridSize = 25;
        const spacing = 1e10;
        const vertices = [];
        const indices = [];
        
        for (let z = 0; z <= gridSize; z++) {
            for (let x = 0; x <= gridSize; x++) {
                const worldX = (x - gridSize / 2) * spacing;
                const worldZ = (z - gridSize / 2) * spacing;
                let y = 0;
                
                // Warp grid using Schwarzschild geometry
                for (const obj of objects) {
                    const dx = worldX - obj.position.x;
                    const dz = worldZ - obj.position.z;
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    const rs = (2.0 * G * obj.mass) / (c * c);
                    
                    if (dist > rs) {
                        const deltaY = 2.0 * Math.sqrt(rs * (dist - rs));
                        y += deltaY - 3e10;
                    } else {
                        y += 2.0 * Math.sqrt(rs * rs) - 3e10;
                    }
                }
                
                vertices.push(worldX, y, worldZ);
            }
        }
        
        // Generate line indices
        for (let z = 0; z < gridSize; z++) {
            for (let x = 0; x < gridSize; x++) {
                const i = z * (gridSize + 1) + x;
                indices.push(i, i + 1);
                indices.push(i, i + gridSize + 1);
            }
        }
        
        return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
    }

    draw(objects, blackHole, viewProjMatrix) {
        const gl = this.gl;
        const grid = this.generateGrid(objects, blackHole);
        
        // Create buffers
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, grid.vertices, gl.DYNAMIC_DRAW);
        
        const ebo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, grid.indices, gl.STATIC_DRAW);
        
        // Draw
        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.uViewProj, false, viewProjMatrix.m);
        
        gl.enableVertexAttribArray(this.aPos);
        gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0);
        
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.DEPTH_TEST);
        
        gl.drawElements(gl.LINES, grid.indices.length, gl.UNSIGNED_SHORT, 0);
        
        gl.enable(gl.DEPTH_TEST);
        
        // Cleanup
        gl.deleteBuffer(vbo);
        gl.deleteBuffer(ebo);
    }
}

// ============================================================================
// Main Engine
// ============================================================================
class Engine {
    constructor(canvas) {
        console.log('🔧 Engine constructor started');
        
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
        
        if (!this.gl) {
            console.error('❌ WebGL not supported!');
            alert('WebGL not supported');
            return;
        }
        
        console.log('✅ WebGL context created');
        console.log(`WebGL Version: ${this.gl.getParameter(this.gl.VERSION)}`);
        console.log(`WebGL Vendor: ${this.gl.getParameter(this.gl.VENDOR)}`);
        
        this.camera = new Camera();
        this.blackHole = new BlackHole(new Vec3(0, 0, 0), 8.54e36);
        
        console.log(`🕳️ Black hole created: Rs = ${(this.blackHole.rs / 1e10).toFixed(2)}×10¹⁰ m`);
        
        this.objects = [
            new CelestialObject(new Vec3(4e11, 0, 0), 4e10, [1, 1, 0], 1.98892e30),
            new CelestialObject(new Vec3(0, 0, 4e11), 4e10, [1, 0, 0], 1.98892e30),
        ];
        
        console.log(`🌟 Created ${this.objects.length} celestial objects`);
        
        this.disk = {
            r1: this.blackHole.rs * 2.2,
            r2: this.blackHole.rs * 5.2
        };
        
        console.log(`💿 Accretion disk: ${(this.disk.r1 / 1e10).toFixed(2)}×10¹⁰ m - ${(this.disk.r2 / 1e10).toFixed(2)}×10¹⁰ m`);
        
        this.resolution = 150;
        this.maxSteps = 5000;
        this.gravityEnabled = false;
        this.rendering = false;
        this.raytracer = null;
        this.raytracing = false;
        
        this.workers = [];
        this.workerCount = 4;
        this.workerResults = [];
        this.createWorkers(this.workerCount);
        
        console.log('🎨 Setting up WebGL resources...');
        this.gridRenderer = new GridRenderer(this.gl);
        this.setupTexture();
        this.setupQuad();
        this.setupEventListeners();
        
        this.lastFrameTime = performance.now();
        this.frameCount = 0;
        this.fps = 0;
        
        console.log('✅ Engine initialization complete');
    }

    createWorkers(count) {
        this.terminateWorkers();
        
        const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
        const workerURL = URL.createObjectURL(blob);
        
        for (let i = 0; i < count; i++) {
            this.workers.push(new Worker(workerURL));
        }
        
        this.workerCount = count;
        console.log('👷 Created ' + count + ' workers');
    }

    terminateWorkers() {
        for (const worker of this.workers) {
            worker.terminate();
        }
        this.workers = [];
    }

    setupTexture() {
        const gl = this.gl;
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    setupQuad() {
        const gl = this.gl;
        
        const vertSrc = `
            attribute vec2 aPos;
            attribute vec2 aTexCoord;
            varying vec2 vTexCoord;
            void main() {
                gl_Position = vec4(aPos, 0.0, 1.0);
                vTexCoord = aTexCoord;
            }
        `;
        
        const fragSrc = `
            precision mediump float;
            varying vec2 vTexCoord;
            uniform sampler2D uTexture;
            void main() {
                gl_FragColor = texture2D(uTexture, vTexCoord);
            }
        `;
        
        const vertShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertShader, vertSrc);
        gl.compileShader(vertShader);
        
        const fragShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragShader, fragSrc);
        gl.compileShader(fragShader);
        
        this.quadProgram = gl.createProgram();
        gl.attachShader(this.quadProgram, vertShader);
        gl.attachShader(this.quadProgram, fragShader);
        gl.linkProgram(this.quadProgram);
        
        const vertices = new Float32Array([
            -1, 1, 0, 1,
            -1, -1, 0, 0,
            1, -1, 1, 0,
            -1, 1, 0, 1,
            1, -1, 1, 0,
            1, 1, 1, 1
        ]);
        
        this.quadVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        
        this.aQuadPos = gl.getAttribLocation(this.quadProgram, 'aPos');
        this.aQuadTexCoord = gl.getAttribLocation(this.quadProgram, 'aTexCoord');
    }

    setupEventListeners() {
        const canvas = this.canvas;
        
        canvas.addEventListener('mousedown', (e) => {
            this.camera.dragging = true;
            this.camera.panning = e.metaKey || e.ctrlKey;
            this.camera.lastX = e.clientX;
            this.camera.lastY = e.clientY;
            this.stopRaytracing();
        });
        
        canvas.addEventListener('mousemove', (e) => {
            if (this.camera.dragging) {
                const dx = e.clientX - this.camera.lastX;
                const dy = e.clientY - this.camera.lastY;
                this.camera.processMouseMove(dx, dy);
                this.camera.lastX = e.clientX;
                this.camera.lastY = e.clientY;
            }
        });
        
        canvas.addEventListener('mouseup', () => {
            this.camera.dragging = false;
            this.camera.panning = false;
            this.startRaytracing();
        });
        
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.camera.processScroll(e.deltaY);
            this.stopRaytracing();
            clearTimeout(this.scrollTimeout);
            this.scrollTimeout = setTimeout(() => {
                this.startRaytracing();
            }, 500);
        });
        
        document.getElementById('resolutionSlider').addEventListener('input', (e) => {
            this.resolution = parseInt(e.target.value);
            document.getElementById('resValue').textContent = this.resolution;
            this.stopRaytracing();
        });
        
        document.getElementById('stepsSlider').addEventListener('input', (e) => {
            this.maxSteps = parseInt(e.target.value);
            document.getElementById('stepsValue').textContent = (this.maxSteps / 1000).toFixed(0) + 'k';
        });
        
        document.getElementById('workerCount').addEventListener('change', (e) => {
            const count = parseInt(e.target.value);
            this.createWorkers(count);
        });
        
        document.getElementById('renderBtn').addEventListener('click', () => {
            this.stopRaytracing();
            setTimeout(() => this.startRaytracing(), 100);
        });
        
        document.getElementById('resetBtn').addEventListener('click', () => {
            this.camera.reset();
            this.startRaytracing();
        });
    }

    stopRaytracing() {
        this.raytracing = false;
        if (this.raytracer) {
            console.log('⏸️ Raytracing stopped');
        }
    }

    startRaytracing() {
        if (this.raytracing) return;
        
        console.log('▶️ Starting multi-worker raytracing (' + this.workerCount + ' workers)...');
        this.raytracing = true;
        
        const width = this.resolution;
        const height = this.resolution;
        const rowsPerWorker = Math.ceil(height / this.workerCount);
        
        this.workerResults = new Array(this.workerCount);
        let completedWorkers = 0;
        const startTime = performance.now();
        
        document.getElementById('progress').style.display = 'block';
        
        const cameraData = {
            position: this.camera.position(),
            target: this.camera.target
        };
        
        const objectsData = this.objects.map(obj => ({
            position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
            radius: obj.radius,
            color: obj.color,
            mass: obj.mass
        }));
        
        for (let i = 0; i < this.workerCount; i++) {
            const startRow = i * rowsPerWorker;
            const endRow = Math.min(startRow + rowsPerWorker, height);
            
            if (startRow >= height) break;
            
            this.workers[i].onmessage = (e) => {
                this.workerResults[i] = e.data;
                completedWorkers++;
                
                const progress = completedWorkers / this.workerCount;
                document.getElementById('progressValue').textContent = Math.round(progress * 100) + '%';
                
                if (completedWorkers === this.workerCount) {
                    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
                    console.log('✅ Raytracing complete in ' + elapsed + 's');
                    
                    this.mergeWorkerResults(width, height);
                    this.raytracing = false;
                    
                    setTimeout(() => {
                        document.getElementById('progress').style.display = 'none';
                    }, 1000);
                }
            };
            
            this.workers[i].postMessage({
                width,
                height,
                startRow,
                endRow,
                cameraData,
                blackHole: { rs: this.blackHole.rs },
                objects: objectsData,
                disk: { r1: this.disk.r1, r2: this.disk.r2 },
                maxSteps: this.maxSteps
            });
        }
    }

    mergeWorkerResults(width, height) {
        const finalPixels = new Uint8Array(width * height * 4);
        
        for (let i = 0; i < this.workerResults.length; i++) {
            const result = this.workerResults[i];
            if (!result) continue;
            
            const { pixels, startRow, endRow } = result;
            const rowCount = endRow - startRow;
            const sourceSize = width * rowCount * 4;
            const destOffset = startRow * width * 4;
            
            finalPixels.set(new Uint8Array(pixels), destOffset);
        }
        
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, finalPixels);
    }

    updateGravity(dt) {
        if (!this.gravityEnabled) return;
        
        for (let i = 0; i < this.objects.length; i++) {
            for (let j = 0; j < this.objects.length; j++) {
                if (i === j) continue;
                
                const obj1 = this.objects[i];
                const obj2 = this.objects[j];
                
                const dx = obj2.position.x - obj1.position.x;
                const dy = obj2.position.y - obj1.position.y;
                const dz = obj2.position.z - obj1.position.z;
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                
                if (distance > 0) {
                    const force = (G * obj1.mass * obj2.mass) / (distance * distance);
                    const acc = force / obj1.mass;
                    
                    obj1.velocity.x += (dx / distance) * acc * dt;
                    obj1.velocity.y += (dy / distance) * acc * dt;
                    obj1.velocity.z += (dz / distance) * acc * dt;
                }
            }
        }
        
        for (const obj of this.objects) {
            obj.position.x += obj.velocity.x * dt;
            obj.position.y += obj.velocity.y * dt;
            obj.position.z += obj.velocity.z * dt;
        }
    }

    render() {
        if (this.rendering) return;
        this.rendering = true;
        
        const gl = this.gl;
        const now = performance.now();
        const dt = (now - this.lastFrameTime) / 1000;
        this.lastFrameTime = now;
        
        this.updateGravity(dt);
        
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        
        this.drawRaytracedTexture();
        
        const view = new Mat4().lookAt(this.camera.position(), this.camera.target, new Vec3(0, 1, 0));
        const proj = new Mat4().perspective(60 * Math.PI / 180, this.canvas.width / this.canvas.height, 1e9, 1e14);
        const viewProj = proj.multiply(view);
        
        this.gridRenderer.draw(this.objects, this.blackHole, viewProj);
        
        this.frameCount++;
        if (now - this.fpsTime > 1000) {
            this.fps = Math.round(this.frameCount * 1000 / (now - this.fpsTime));
            this.frameCount = 0;
            this.fpsTime = now;
            document.getElementById('fps').textContent = this.fps;
            document.getElementById('rayCount').textContent = (this.resolution * this.resolution).toLocaleString();
        }
        
        this.rendering = false;
        requestAnimationFrame(() => this.render());
    }

    drawRaytracedTexture() {
        const gl = this.gl;
        
        gl.useProgram(this.quadProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
        
        gl.enableVertexAttribArray(this.aQuadPos);
        gl.vertexAttribPointer(this.aQuadPos, 2, gl.FLOAT, false, 16, 0);
        
        gl.enableVertexAttribArray(this.aQuadTexCoord);
        gl.vertexAttribPointer(this.aQuadTexCoord, 2, gl.FLOAT, false, 16, 8);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        
        gl.disable(gl.DEPTH_TEST);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.enable(gl.DEPTH_TEST);
    }

    start() {
        this.fpsTime = performance.now();
        
        setTimeout(() => {
            document.getElementById('loading').classList.add('hidden');
            this.startRaytracing();
        }, 1000);
        
        this.render();
    }
}

// ============================================================================
// Initialize
// ============================================================================
window.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing Black Hole 3D Visualization...');
    
    const canvas = document.getElementById('glCanvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    console.log(`📐 Canvas size: ${canvas.width}x${canvas.height}`);
    
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        console.log(`📐 Canvas resized: ${canvas.width}x${canvas.height}`);
    });
    
    console.log('⚙️ Creating engine...');
    const engine = new Engine(canvas);
    
    console.log('✅ Engine created successfully!');
    console.log(`🎯 Initial settings:
    - Resolution: ${engine.resolution}x${engine.resolution}
    - Max steps: ${engine.maxSteps}
    - Black hole Rs: ${(engine.blackHole.rs / 1e10).toFixed(2)}×10¹⁰ m`);
    
    engine.start();
    console.log('▶️ Rendering started!');
});
