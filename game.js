const $ = id => document.getElementById(id);
const teamColors = ['#5ce7ff', '#ffba70', '#c5a3ff', '#76e6ac', '#ff93bb', '#eced81'];
const storageKey = 'technoda-jupiter-race-v1';
const projection = new URLSearchParams(location.search).has('projection');
const phases = { ready: 'ממתינים', open: 'שאלה פתוחה', resolved: 'סבב הסתיים' };

function fresh(goal = 16, sound = true) {
  return { goal, sound, question: 0, round: {phase: 'ready', result: '', revealed: false}, end: '' };
}

function loadRace() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved?.mobile && questions[saved.question] && phases[saved.round?.phase]) return saved;
    if (saved) return fresh([10,16,22].includes(saved.goal) ? saved.goal : 16, saved.sound !== false);
  } catch { /* The board can run for this session if storage is unavailable. */ }
  return fresh();
}

let race = loadRace();
let audio;
let liveRoom = null;
let liveUIBusy = false;
let renderRoom = () => {};
if (!projection && race.mobile) {
  try {
    if (!sessionStorage.getItem('technoda-jupiter-host')) race = fresh(race.setupGoal ?? 16, race.sound);
  } catch { race = fresh(); }
}
document.body.classList.toggle('projection', projection);

const optionRows = 'אבגד'.split('').map(letter => {
  const item = document.createElement('li');
  const marker = document.createElement('i');
  marker.textContent = letter;
  const answer = document.createElement('span');
  item.append(marker, answer);
  $('options').append(item);
  return { item, answer };
});

function makeLane(name, color) {
  const lane = document.createElement('div');
  lane.className = 'lane';
  lane.style.setProperty('--team', color);
  lane.innerHTML = '<div class="track" aria-hidden="true"><div class="ship-position"><div class="ship"><div class="flame"></div></div></div></div><div class="lane-meta"><span dir="auto"></span><b></b></div>';
  lane.querySelector('span').textContent = name;
  return lane;
}

const soloLanes = new Map();
let soloOrder = '';
function renderSoloLanes(standings, goal) {
  const leaders = standings;
  const order = leaders.map(player => player.id).join(',');
  if (order !== soloOrder || $('lanes').children.length !== leaders.length) {
    const active = new Set(leaders.map(player => player.id));
    for (const id of soloLanes.keys()) if (!active.has(id)) soloLanes.delete(id);
    const rows = leaders.map(player => {
      if (!soloLanes.has(player.id)) soloLanes.set(player.id, makeLane(player.name, teamColors[player.id % teamColors.length]));
      return soloLanes.get(player.id);
    });
    $('lanes').replaceChildren(...rows);
    soloOrder = order;
  }
  for (const player of leaders) {
    const lane = soloLanes.get(player.id);
    lane.style.setProperty('--progress', Math.min(player.score / goal, 1));
    lane.querySelector('b').textContent = `${player.score}/${goal}`;
  }
  $('route').style.setProperty('--lane-height', `${Math.min(35, Math.max(15, 375 / Math.max(1, leaders.length)))}px`);
  $('route').classList.toggle('dense-map', leaders.length > 14);
  $('awaiting-players').hidden = !!leaders.length;
}

function render() {
  const { goal, question, round, end } = race;
  const [topic, prompt, options, answer, explanation, double] = questions[question];
  const solo = race.mobile?.mode === 'solo';
  const lobby = !race.mobile || (round.phase === 'ready' && question === 0 && !end);
  document.body.classList.toggle('lobby', lobby);
  $('round-console').hidden = lobby;
  $('flight-rules').hidden = lobby;
  $('lobby-actions').hidden = !lobby || !!liveRoom || !!race.mobile;
  $('live-room').hidden = lobby && !race.mobile;
  const standings = solo ? race.mobile.standings : (race.teams ?? []).map((team, id) => ({...team, id}));
  renderSoloLanes(standings, goal);
  $('route').hidden = lobby && !race.mobile;
  $('topic').textContent = lobby ? '' : topic;
  $('counter').textContent = `שאלה ${question + 1} / ${questions.length}`;
  $('double').hidden = !double;
  $('question-title').textContent = lobby ? '' : prompt;
  optionRows.forEach((row, index) => {
    row.answer.textContent = lobby ? '' : options[index];
    row.item.classList.toggle('correct', round.revealed && answer === index);
  });
  $('explanation').hidden = !round.revealed;
  $('explanation').textContent = round.revealed ? explanation : '';
  $('phase').textContent = phases[round.phase];
  $('instruction').textContent = {
    ready: 'פותחים את חלון התשובות בטלפונים למשך 18 שניות.',
    open: 'התלמידים עונים בטלפונים. החלליות מתקדמות בסיום הסבב.',
    resolved: 'אפשר לעבור לשאלה הבאה.'
  }[round.phase];
  $('turn-info').textContent = round.result;
  $('arm').hidden = !liveRoom || (round.phase !== 'open' && (solo || round.phase !== 'ready'));
  $('arm').textContent = round.phase === 'open' ? 'סגירת תשובות וחשיפה' : 'פתיחת תשובות בטלפונים';
  $('arm').disabled = liveUIBusy || !!end;
  $('settings').disabled = !!liveRoom;
  $('next').disabled = !liveRoom || round.phase === 'open' || (solo && round.phase === 'ready') || !!end || liveUIBusy;
  $('next').textContent = question === questions.length - 1 ? 'סיום המרוץ' : 'לשאלה הבאה';
  $('sound').setAttribute('aria-pressed', String(race.sound));
  $('sound').textContent = race.sound ? '♪ צליל פעיל' : '♪ צליל כבוי';
  $('win').hidden = !end;
  if (end && solo) {
    const lead = race.mobile.standings[0];
    $('winner').textContent = end === 'orbit' ? `${race.winnerName} במקום הראשון!` :
      lead?.score ? `${lead.name} במקום הראשון!` : 'המרוץ הסתיים';
    $('win-detail').textContent = end === 'orbit' ? 'החללית הראשונה הגיעה למסלול סביב צדק.' :
      lead?.score ? `${lead.score} מתוך ${goal} צעדים לצדק` : 'בסיבוב הזה לא נצברו צעדים.';
  } else if (end) {
    const best = Math.max(...standings.map(team => team.score));
    const leaders = standings.filter(team => team.score === best).map(team => team.name);
    const orbitTeam = standings[race.winner]?.name ?? leaders[0];
    $('winner').textContent = end === 'orbit' ? `${orbitTeam} הגיעה למסלול צדק!` :
      best === 0 ? 'המרוץ הסתיים' : leaders.length > 1 ? 'תיקו בהובלה!' : `${leaders[0]} מובילה במרוץ!`;
    $('win-detail').textContent = end === 'orbit' ? 'המשימה הושלמה. כל הכבוד לצוותי החלל!' :
      best === 0 ? 'לא נצברו צעדים בסיבוב הזה.' : `${leaders.join(' · ')} | ${best} מתוך ${goal} צעדים`;
  }
  renderRoom();
}

function commit() {
  try { localStorage.setItem(storageKey, JSON.stringify(race)); } catch { /* Keep local gameplay available. */ }
  render();
}

function tone(notes) {
  if (!race.sound) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  try {
    audio ??= new Audio();
    const play = () => notes.forEach((frequency, index) => {
      const start = audio.currentTime + index * .095;
      const oscillator = audio.createOscillator();
      const volume = audio.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = frequency;
      volume.gain.setValueAtTime(.085, start);
      volume.gain.exponentialRampToValueAtTime(.001, start + .15);
      oscillator.connect(volume).connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + .16);
    });
    if (audio.state === 'suspended') audio.resume().then(play).catch(() => {});
    else play();
  } catch { /* Sound is optional. */ }
}

if (projection) {
  window.addEventListener('storage', event => {
    if (event.key === storageKey) {
      race = loadRace();
      render();
    }
  });
} else {
  $('lobby-invite').onclick = () => $('live-room').click();
  $('arm').onclick = () => liveRoom?.action(race.round.phase === 'open' ? 'close' : 'open');
  $('next').onclick = () => liveRoom?.action('next');
  $('sound').onclick = () => {
    race.sound = !race.sound;
    tone([550]);
    commit();
  };
  $('project').onclick = () => {
    commit();
    const url = new URL(location.href);
    url.searchParams.set('projection', '1');
    window.open(url.href, 'jupiter-class-projection', 'popup,width=1200,height=850');
  };
  $('settings').onclick = () => {
    $('goal').value = race.goal;
    $('setup').showModal();
  };
  $('close').onclick = () => $('setup').close();
  $('setup-form').onsubmit = event => {
    event.preventDefault();
    race.goal = Number($('goal').value);
    $('setup').close();
    commit();
  };
  $('again').onclick = () => liveRoom?.restart();
}

render();
