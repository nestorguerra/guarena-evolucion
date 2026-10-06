// The look of the game, chosen before anything is built (Ajustes › Estética; it takes a restart to change):
//  - 'plastilina' (the default): Guareña as a stop-motion claymation film — src/plastilina.js;
//  - 'real': the photographic town.
// Read by the textures, materials, sky, trees and characters while they are made.
export const STYLE = { name: 'plastilina', plastilina: true };
export const LOOKS = [['plastilina', 'Plastilina'], ['real', 'Realista']];
// any other name (an old save's 'anime' or 'diorama', a mistyped ?estilo=) is the default look
export function setStyle(name) {
  STYLE.name = name === 'real' ? 'real' : 'plastilina';
  STYLE.plastilina = STYLE.name === 'plastilina';
}
