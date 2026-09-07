(function(){
  const tracks = [
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3'
  ];
  const defaults = { muted:false, master:.7, music:.16, sfx:.3, track:0 };
  let settings = defaults;
  try { settings = { ...defaults, ...JSON.parse(localStorage.getItem('sound-settings') || '{}') }; } catch (_) { localStorage.removeItem('sound-settings'); }
  let audio = null;
  function save(){ localStorage.setItem('sound-settings', JSON.stringify(settings)); update(); }
  function update(){ if(audio) audio.volume = settings.muted ? 0 : settings.master * settings.music; }
  function start(){
    if(!audio || audio.dataset.track !== String(settings.track)){
      if(audio) audio.pause();
      audio = new Audio(tracks[settings.track]);
      audio.dataset.track = String(settings.track);
      audio.loop = true;
    }
    audio.volume = settings.muted ? 0 : settings.master * settings.music;
    audio.play().then(update).catch(() => {});
  }
  window.PageAudio = { start, setTrack(track){ settings.track=Number(track); save(); start(); }, setMuted(muted){ settings.muted=!!muted; save(); } };
  update();
  start();
})();
