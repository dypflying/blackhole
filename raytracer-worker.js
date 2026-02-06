// Raytracer Web Worker for Multi-threaded Black Hole Rendering
// ============================================================================

const c = 299792458.0;
const G = 6.67430e-11;

// ============================================================================
// Vec3 Math Utility
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

// ============================================================================
// Ray with Schwarzschild Geodesic Integration
// ============================================================================
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

// ============================================================================
// Worker Message Handler
// ============================================================================
self.onmessage = function(e) {
    const { type, data } = e.data;
    
    console.log('🔧 Worker received message:', type);
    
    if (type === 'trace') {
        const {
            width, height,
            camPos, camTarget,
            blackHoleRs,
            objects,
            disk,
            maxSteps,
            startRow,
            endRow
        } = data;
        
        console.log(`🔧 Worker starting: rows ${startRow}-${endRow}, resolution ${width}x${height}, Rs=${blackHoleRs}, disk=${disk.r1}-${disk.r2}`);
        
        const pixels = new Uint8Array(width * height * 4);
        
        const camPosVec = new Vec3(camPos.x, camPos.y, camPos.z);
        const camTargetVec = new Vec3(camTarget.x, camTarget.y, camTarget.z);
        
        const forward = camTargetVec.sub(camPosVec).normalize();
        const right = new Vec3(0, 1, 0).cross(forward).normalize();
        const up = right.cross(forward);
        
        const aspect = width / height;
        const tanHalfFov = Math.tan((60 * Math.PI / 180) / 2);
        
        const D_LAMBDA = 5e7;
        const ESCAPE_R = 5e13;
        
        let pixelsWritten = 0;
        
        for (let py = startRow; py < endRow; py++) {
            for (let px = 0; px < width; px++) {
                const u = (2.0 * (px + 0.5) / width - 1.0) * aspect * tanHalfFov;
                const v = (1.0 - 2.0 * (py + 0.5) / height) * tanHalfFov;
                
                const dir = right.mul(u).add(up.mul(v)).add(forward).normalize();
                const ray = new Ray(camPosVec, dir, blackHoleRs);
                
                let color = [0, 0, 0, 255];
                let prevY = ray.y;
                
                for (let step = 0; step < maxSteps; step++) {
                    if (ray.r <= blackHoleRs * 1.1) {
                        color = [0, 0, 0, 255];
                        break;
                    }
                    
                    ray.rk4Step(D_LAMBDA, blackHoleRs);
                    
                    const newY = ray.y;
                    if (prevY * newY < 0) {
                        const r2d = Math.sqrt(ray.x * ray.x + ray.z * ray.z);
                        if (r2d >= disk.r1 && r2d <= disk.r2) {
                            const t = r2d / disk.r2;
                            color = [255, Math.floor(t * 255), 51, 255];
                            pixelsWritten++;
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
                            const V = camPosVec.sub(P).normalize();
                            const diff = Math.max(N.dot(V), 0);
                            const intensity = 0.1 + 0.9 * diff;
                            
                            color = [
                                Math.floor(obj.color[0] * 255 * intensity),
                                Math.floor(obj.color[1] * 255 * intensity),
                                Math.floor(obj.color[2] * 255 * intensity),
                                255
                            ];
                            pixelsWritten++;
                            hitObj = true;
                            break;
                        }
                    }
                    if (hitObj) break;
                    
                    if (ray.r > ESCAPE_R) break;
                }
                
                const idx = (py * width + px) * 4;
                pixels[idx] = color[0];
                pixels[idx + 1] = color[1];
                pixels[idx + 2] = color[2];
                pixels[idx + 3] = color[3];
            }
        }
        
        console.log(`✅ Worker done: ${pixelsWritten} non-black pixels written`);
        
        self.postMessage({
            type: 'result',
            pixels: pixels.buffer,
            startRow,
            endRow
        }, [pixels.buffer]);
    }
};
