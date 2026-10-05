// The look of the game, chosen before anything is built: 'anime' (flat colours, two tones of light, ink lines, a
// painted sky — after the web game Messenger), 'real' (the photographic town) or 'diorama' (warm stylized realism, an
// architectural model's finish: the real town's materials in the warm palette of whitewash, ochre plinths and
// terracotta, a blue afternoon sky, contact shadows; no ink — its settings in src/diorama.js). Read by
// the textures, materials, sky, trees and characters while they are made; changing it needs a restart.
export const STYLE = { anime: true, name: 'anime', diorama: false };
export function setStyle(name) {
  STYLE.name = name === 'real' || name === 'diorama' ? name : 'anime';
  STYLE.anime = STYLE.name === 'anime';
  STYLE.diorama = STYLE.name === 'diorama';
}
