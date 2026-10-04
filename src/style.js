// The look of the game, chosen before anything is built: 'anime' (flat colours, two tones of light, ink lines, a
// painted sky — after the web game Messenger), 'real' (the photographic town) or 'diorama' (warm stylized realism, an
// architectural model's finish: the real town's materials in the warm palette of whitewash, ochre plinths and
// terracotta, a blue afternoon sky, contact shadows; no ink — its settings in src/diorama.js). Read by
// the textures, materials, sky, trees and characters while they are made; changing it needs a restart.
// 'miniatura' is the diorama as a handmade miniature in modelling clay, shot with a macro lens (tilt-shift, golden hour,
// stop motion): it is built on the diorama, so STYLE.diorama is on for it too.
export const STYLE = { anime: true, name: 'anime', diorama: false, miniatura: false };
export const LOOK_NAMES = ['real', 'diorama', 'miniatura']; // (the looks that are not the anime one)
export function setStyle(name) {
  STYLE.name = LOOK_NAMES.includes(name) ? name : 'anime';
  STYLE.anime = STYLE.name === 'anime';
  STYLE.miniatura = STYLE.name === 'miniatura';
  STYLE.diorama = STYLE.name === 'diorama' || STYLE.miniatura;
}
