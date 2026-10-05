// The look of the game, chosen before anything is built: 'anime' (flat colours, two tones of light, ink lines, a
// painted sky — after the web game Messenger), 'real' (the photographic town) or 'diorama' (warm stylized realism, an
// architectural model's finish: the real town's materials in the warm palette of whitewash, ochre plinths and
// terracotta, a blue afternoon sky, contact shadows; no ink — its settings in src/diorama.js). Read by
// the textures, materials, sky, trees and characters while they are made; changing it needs a restart.
// 'plastilina' is Guareña as a claymation film (src/plastilina.js): built on the diorama, so STYLE.diorama is on for it too.
export const STYLE = { anime: true, name: 'anime', diorama: false, plastilina: false };
export const LOOK_NAMES = ['real', 'diorama', 'plastilina']; // (the looks that are not the anime one)
export function setStyle(name) {
  STYLE.name = LOOK_NAMES.includes(name) ? name : 'anime';
  STYLE.anime = STYLE.name === 'anime';
  STYLE.plastilina = STYLE.name === 'plastilina';
  STYLE.diorama = STYLE.name === 'diorama' || STYLE.plastilina;
}
