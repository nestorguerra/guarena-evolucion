// «Diorama extremeño» — the central settings of the diorama look (Ajustes › Estética › Diorama), after the visual spec
// of 4 October 2026: warm stylized realism with the finish of a crafted architectural model. One place for the palette,
// the families of materials, the contact shadows and the final grade; the sky and the sun keep theirs in sky.js
// (KEYS_DIORAMA), the façades theirs in textures.js (DIORAMA_DEF) and buildings.js (tints).
//
// The palette is the spec's (a starting point for production, tuned by eye against its three reference renders):
// ivory whitewash, cream, toasted-ochre plinths, terracotta, deep green doors, warm charcoal iron, sand pavements, warm
// grey asphalt, olive and dark greens, geranium red, a soft blue sky.
export const PALETTE = {
  cal: '#f0e5cd', crema: '#e2d2b5', zocalo: '#be793c', teja: '#ab573a', verde: '#354d3d', hierro: '#30322d',
  acera: '#c4ad87', asfalto: '#56544d', oliva: '#637648', verdeOscuro: '#3d5536', geranio: '#bd4e43', cielo: '#8cb8d6',
};

// families of materials: roughness ranges for a PBR renderer (0..1), from the spec
export const ROUGH = { cal: [0.85, 0.95], teja: [0.7, 0.9], piedra: [0.8, 1.0], asfalto: [0.8, 1.0], metal: [0.55, 0.8] };

export const DIORAMA = {
  // contact shadows: ambient occlusion where things meet (the foot of a wall, under eaves, balconies, pots, people)
  ao: { radius: 2.0, distanceExponent: 1.0, thickness: 2.5, scale: 1.7, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false },
  aoDenoise: { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 },
  aoBlend: 1.0,
};

// the last grade, in linear light before the tone curve: a little more colour, the white balance of a warm afternoon,
// a touch of contrast round the middle greys (the model's light, not a filter: no outlines, no grain, no wash)
export const DioramaGrade = {
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.04 }, uWarm: { value: 0.03 }, uContrast: { value: 1.04 }, uLift: { value: 0 }, uVignette: { value: 0 }, uGain: { value: 1 }, uGrain: { value: 0 }, uSeed: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uSat, uWarm, uContrast, uLift, uVignette, uGain, uGrain, uSeed; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = max(c.rgb, 0.0) * uGain; // (uGain: the claymation's lamps, a hair brighter or dimmer at each pose)
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col *= vec3(1.0 + uWarm, 1.0 + uWarm * 0.3, 1.0 - uWarm * 0.7);
      float k = pow(max(l, 1e-4) / 0.18, uContrast - 1.0);
      col *= clamp(k, 0.6, 1.6);
      col += uLift * vec3(0.2, 0.17, 0.13) * (1.0 - smoothstep(0.0, 0.3, l)); // (the studio's fill in the shadows)
      col *= 1.0 - uVignette * smoothstep(0.4, 1.0, length((vUv - 0.5) * vec2(1.25, 1.0))); // (the lens's corners)
      if (uGrain > 0.0) { // the film's grain, new at every pose: finest in the light, a little more in the mid-tones
        vec2 gp = floor(gl_FragCoord.xy / 1.5) + uSeed * 37.0;
        float n = fract(sin(dot(gp, vec2(12.9898, 78.233))) * 43758.5453) + fract(sin(dot(gp + 17.3, vec2(39.346, 11.135))) * 24634.6345) - 1.0;
        col *= 1.0 + n * uGrain * (1.0 - 0.6 * smoothstep(0.4, 1.2, l));
      }
      gl_FragColor = vec4(col, c.a);
    }`,
};
