// TerranPlanet.js
import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";

/* ===== GLSL: simplex 3D + fBm ===== */
const NOISE = /* glsl */`
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2  C = vec2(1.0/6.0, 1.0/3.0);
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ) );
  float n_ = 0.142857142857; // 1/7
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x;  p1 *= norm.y;  p2 *= norm.z;  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m*m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
}
float fbm(vec3 p){
  float a = 0.5; float f = 0.0;
  for(int i=0;i<5;i++){ f += a * snoise(p); p *= 2.03; a *= 0.53; }
  return f;
}`;

/* ===== Shadery planety ===== */
const planetVS = /* glsl */`
varying vec3 vPos; varying vec3 vNormal; varying vec2 vUv;
void main(){
  vPos=(modelMatrix*vec4(position,1.)).xyz;
  vNormal=normalize(normalMatrix*normal);
  vUv=uv;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}`;

const planetFS = /* glsl */`
precision highp float; ${NOISE}
varying vec3 vPos; varying vec3 vNormal; varying vec2 vUv;
uniform vec3 uSunDir; uniform float uTime; uniform float uWater; uniform float uContinent; uniform float uSeed;
uniform vec3 uDeepOcean, uShallow, uBeach, uLowland, uHighland, uSnow;
void main(){
  vec3 n = normalize(vNormal);
  vec3 p = n * uContinent + uSeed;
  vec3 warp = vec3(fbm(p*1.7+3.1), fbm(p*1.3-4.7), fbm(p*2.3+1.9));
  p += (warp-0.5)*0.9;
  float height = fbm(p);
  height = mix(height, snoise(p*0.5), 0.25);
  float h = height - uWater;

  float NdotL = max(dot(n, normalize(uSunDir)), 0.0);
  vec3 V = normalize(cameraPosition - vPos);
  vec3 H = normalize(V + normalize(uSunDir));
  float spec = pow(max(dot(n,H),0.0), 64.0);

  vec3 col;
  if(h < 0.0){
    float d = clamp(-h*2.0,0.0,1.0);
    col = mix(uShallow, uDeepOcean, d);
    col += spec*0.15;
  }else{
    float t = clamp(h*1.6,0.0,1.0);
    col = mix(uBeach, uLowland, smoothstep(0.0,0.25,t));
    col = mix(col, uHighland, smoothstep(0.25,0.7,t));
    float lat = abs(n.y);
    float snowMask = smoothstep(0.65,0.9,t)*0.6 + smoothstep(0.7,0.95,lat)*0.6;
    col = mix(col, uSnow, clamp(snowMask,0.0,1.0));
  }

  float ao = mix(1.0, 0.8, clamp(h*0.6,0.0,1.0));
  col *= (0.15 + 0.85*NdotL) * ao;
  col *= 0.55 + 0.45*pow(NdotL,0.6);
  gl_FragColor = vec4(col,1.0);
}`;

const cloudsVS = planetVS;
const cloudsFS = /* glsl */`
precision highp float; ${NOISE}
varying vec3 vPos; varying vec3 vNormal; uniform float uTime; uniform vec3 uSunDir;
void main(){
  vec3 n = normalize(vNormal);
  vec3 p = n * 2.2 + vec3(uTime*0.02,0.0,uTime*0.015);
  float d = fbm(p); d = smoothstep(0.55,0.75,d);
  float lit = max(dot(n, normalize(uSunDir)), 0.0);
  vec3 col = mix(vec3(0.7), vec3(1.0), lit);
  float alpha = d * 0.6; gl_FragColor = vec4(col, alpha);
}`;

const atmoVS = /* glsl */`varying vec3 vNormal; void main(){ vNormal=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const atmoFS = /* glsl */`
precision highp float; varying vec3 vNormal; uniform vec3 uSunDir;
void main(){
  float viewDot = pow(1.0 - max(dot(normalize(vNormal), vec3(0,0,1)), 0.0), 2.0);
  float sunDot = max(dot(normalize(vNormal), normalize(uSunDir)), 0.0);
  float glow = viewDot * (0.6 + 0.4*sunDot);
  vec3 col = vec3(0.35,0.6,1.0)*glow; gl_FragColor = vec4(col, glow);
}`;

/* ===== API: createTerranPlanet ===== */
export function createTerranPlanet({ radius=1, seed=123.0, waterLevel=0.08, continentScale=3.2 }={}){
  const group = new THREE.Group();

  const geo = new THREE.SphereGeometry(radius, 256, 128);
  const mat = new THREE.ShaderMaterial({
    vertexShader: planetVS, fragmentShader: planetFS,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(1,0.4,0.2).normalize() },
      uTime: { value: 0 }, uWater: { value: waterLevel },
      uContinent: { value: continentScale }, uSeed: { value: seed },
      uDeepOcean: { value: new THREE.Color("#064273") },
      uShallow:   { value: new THREE.Color("#2a9df4") },
      uBeach:     { value: new THREE.Color("#d9c089") },
      uLowland:   { value: new THREE.Color("#5aa25a") },
      uHighland:  { value: new THREE.Color("#6e7e5e") },
      uSnow:      { value: new THREE.Color("#f5f7fb") }
    }
  });
  const planet = new THREE.Mesh(geo, mat); group.add(planet);

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(radius*1.01, 192, 96),
    new THREE.ShaderMaterial({
      vertexShader: cloudsVS, fragmentShader: cloudsFS,
      transparent:true, depthWrite:false,
      uniforms:{ uTime:{value:0}, uSunDir:{ value: mat.uniforms.uSunDir.value } }
    })
  );
  group.add(clouds);

  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(radius*1.07, 128, 64),
    new THREE.ShaderMaterial({
      vertexShader: atmoVS, fragmentShader: atmoFS,
      side: THREE.BackSide, transparent:true, depthWrite:false,
      blending: THREE.AdditiveBlending,
      uniforms:{ uSunDir:{ value: mat.uniforms.uSunDir.value } }
    })
  );
  group.add(atmo);

  function setSunDirection(dir){ mat.uniforms.uSunDir.value.copy(dir).normalize(); }
  function update(t){ mat.uniforms.uTime.value=t; clouds.material.uniforms.uTime.value=t; }

  return { group, update, setSunDirection };
}
