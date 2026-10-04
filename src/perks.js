// Each playable character has a real edge over the others: shown on the selection screen and applied all over the game
// (player movement, cars, police, shops, missions, taxi...). Systems read PERK.<key>, where 1 means "no change", so an
// unknown or custom character simply plays neutral.
const BASE = {
  stamina: 1, regen: 1, run: 1, jump: 1, turn: 1, // on foot: sprint drain, recovery, speed, jump height, agility
  hurt: 1, melee: 1, // damage taken, fists and bat
  carTop: 1, carAccel: 1, carGrip: 1, carHurt: 1, dirt: 1, lockpick: false, // driving
  price: 1, pay: 1, taxi: 1, loot: 1, luck: 1, // money
  witness: 1, lose: 1, // police: how often a crime gets reported, time needed to shake them off
};
export const PERKS = {
  alex: { title: 'Repartidor incansable', lines: ['Esprinta el doble de tiempo sin cansarse', 'Recupera el aliento el doble de rápido', 'Corre un poco más (+5 %)'], stamina: 0.45, regen: 2, run: 1.05 },
  manu: { title: 'Fuerza del campo', lines: ['Aguanta un 50 % más de golpes y disparos', 'Puñetazos y batazos un 60 % más fuertes', 'Tractores y todoterrenos no pierden fuerza fuera del asfalto'], hurt: 0.67, melee: 1.6, dirt: 1.35 },
  dani: { title: 'El más rápido', lines: ['Corre y esprinta un 12 % más rápido', 'Salta un 30 % más alto', 'Gira y arranca en seco'], run: 1.12, jump: 1.3, turn: 1.25 },
  lucia: { title: 'Piloto', lines: ['Con ella los coches aceleran y corren un 10 % más', 'Más agarre en las curvas: derrapa menos', 'Frena y recupera el control antes'], carTop: 1.1, carAccel: 1.12, carGrip: 1.2 },
  rocio: { title: 'Mecánica del polígono', lines: ['Sus coches reciben un 40 % menos de daño', 'Abre coches y puertas cerradas sin romper nada ni hacer saltar la alarma', 'Fuerza cerraduras y cajas fuertes en la mitad de tiempo'], carHurt: 0.6, lockpick: true },
  carmen: { title: 'Conoce a todo el pueblo', lines: ['20 % de descuento en la armería y en los bares', '+25 % de pago en misiones y trabajos', 'Pocos la delatan: menos avisos a la policía'], price: 0.8, pay: 1.25, witness: 0.55 },
  annie: { title: 'Suerte y agilidad', lines: ['Encuentra el doble de dinero', 'Gira y esquiva más rápido', 'Cae de pie: los golpes le hacen menos daño (-15 %)'], luck: 2, turn: 1.35, hurt: 0.85, run: 1.04 },
  adri: { title: 'Callejero', lines: ['Despista a la policía en la mitad de tiempo', 'Se sabe los atajos: +30 % en las carreras de taxi', '+30 % de botín en los atracos'], lose: 0.55, taxi: 1.3, loot: 1.3 },
};
export const PERK = { ...BASE, id: null };
// what training at the gym leaves you with (level 0–10), on top of the character's own edge: longer sprints, quicker
// to get your breath back, harder fists, a touch faster
export function applyFitness(level = 0) {
  const k = Math.max(0, Math.min(10, level || 0));
  PERK.stamina *= 1 - 0.035 * k; PERK.regen *= 1 + 0.05 * k; PERK.melee *= 1 + 0.04 * k; PERK.run *= 1 + 0.005 * k;
}
export function setPerk(id) {
  for (const k in PERK) delete PERK[k];
  Object.assign(PERK, BASE, PERKS[id] || {}, { id: PERKS[id] ? id : null });
}
