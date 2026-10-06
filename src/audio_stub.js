// Silent fallback with the same API as GameAudio (used only if audio.js fails to load).
export class GameAudio {
  constructor() { this.stationIndex = 0; }
  async unlock() {}
  get ready() { return false; }
  get stationName() { return 'Radio Apagada'; }
  setVolumes() {} setListener() {} update() {} setEngine() {} setSkid() {} setOffroad() {} setWind() {} setRain() {} horn() {}
  sfx() {} sirenStart() {} sirenPos() {} sirenStop() {} sirenStopAll() {}
  radioOn() {} radioNext() { return 'Radio Apagada'; } radioPrev() { return 'Radio Apagada'; }
  setAmbient() {} setChurchPos() {} bells() {} storks() {} pauseAll() {} loopAt() {}
}
export default GameAudio;
