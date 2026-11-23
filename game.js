const $ = id => document.getElementById(id);
const teamColors = ['#5ce7ff', '#ffba70', '#c5a3ff', '#76e6ac', '#ff93bb', '#eced81'];
const teamNames = ['אוריון', 'נובה', 'אופק', 'אפולו', 'שביט', 'קוסמוס'];
const storageKey = 'technoda-jupiter-race-v1';
const projection = new URLSearchParams(location.search).has('projection');
const phases = { ready: 'ממתינים', open: 'זמזמים פתוחים', locked: 'תור לתשובה', resolved: 'סבב הסתיים' };

function fresh(names = teamNames.slice(0, 3), goal = 16, sound = true) {
  return { started: false, teams: names.map(name => ({ name, score: 0 })), goal, sound,
    question: 0, round: { phase: 'ready', tried: [], active: null, result: '', revealed: false }, end: '' };
}

function loadRace() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved?.teams?.length >= 2 && saved.teams.length <= 6
        && questions[saved.question] && phases[saved.round?.phase]) return saved;
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
    if (!sessionStorage.getItem('technoda-jupiter-host')) race = fresh(race.teams.map(team => team.name), race.setupGoal ?? 16, race.sound);
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

let teamLayout = '';
const shipRows = [];
const buzzButtons = [];
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
  teamLayout = '';
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

function buildTeams() {
  const layout = JSON.stringify(race.teams.map(team => team.name));
  if (layout === teamLayout) return;
  teamLayout = layout;
  $('lanes').replaceChildren();
  $('buzzers').replaceChildren();
  shipRows.length = 0;
  buzzButtons.length = 0;
  race.teams.forEach((team, index) => {
    const lane = makeLane(team.name, teamColors[index]);
    $('lanes').append(lane);
    shipRows.push(lane);

    const buzzer = document.createElement('button');
    buzzer.className = 'buzzer';
    buzzer.style.setProperty('--team', teamColors[index]);
    const name = document.createElement('span');
    name.textContent = team.name;
    const key = document.createElement('kbd');
    key.textContent = index + 1;
    buzzer.append(name, key);
    buzzer.addEventListener('click', () => buzz(index));
    $('buzzers').append(buzzer);
    buzzButtons.push(buzzer);
  });
}

function render() {
  const { teams, goal, question, round, end } = race;
  const [topic, prompt, options, answer, explanation, double] = questions[question];
  const solo = race.mobile?.mode === 'solo';
  const lobby = race.mobile ? round.phase === 'ready' && question === 0 && !end
    : !race.started && round.phase === 'ready' && question === 0 && !end;
  document.body.classList.toggle('lobby', lobby);
  $('round-console').hidden = lobby;
  $('flight-rules').hidden = lobby;
  $('lobby-actions').hidden = !lobby || !!liveRoom || !!race.mobile;
  $('live-room').hidden = lobby && !race.mobile;
  if (solo) renderSoloLanes(race.mobile.standings, goal);
  else {
    soloOrder = '';
    soloLanes.clear();
    $('route').style.removeProperty('--lane-height');
    $('route').classList.remove('dense-map');
    $('awaiting-players').hidden = true;
    buildTeams();
  }
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
  $('phase').textContent = solo && round.phase === 'open' ? 'שאלה פתוחה' : phases[round.phase];
  const active = teams[round.active];
  $('instruction').textContent = {
    ready: 'מקריאים את השאלה ואז פותחים את הזמזמים.',
    open: 'לחצו על מקש הקבוצה או על הכפתור שלה. עם משרוקיות, המורה בוחר את הקבוצה ששמע ראשונה.',
    locked: active ? `${active.name}, תורכם לענות בקול.` : '',
    resolved: 'אפשר לעבור לשאלה הבאה.'
  }[round.phase];
  $('turn-info').textContent = round.result;
  $('arm').hidden = round.phase !== 'ready' && !(liveRoom && round.phase === 'open');
  $('arm').textContent = liveRoom ? (round.phase === 'open' ? 'סגירת תשובות וחשיפה' : solo ? 'פתיחת השאלה הראשונה' : 'פתיחת תשובות בטלפונים') : 'פתיחת זמזמים';
  $('arm').disabled = liveUIBusy || !!end;
  $('settings').disabled = !!liveRoom;
  $('reveal').hidden = !!liveRoom;
  $('buzzers').hidden = !!liveRoom;
  $('wrong-rule').textContent = liveRoom ? 'תשובה אחת מכל טלפון' : 'טעות מעבירה את התור';
  if (liveRoom) $('instruction').textContent = round.phase === 'ready'
    ? 'מקריאים את השאלה ופותחים את חלון התשובות בטלפונים למשך 18 שניות.'
    : round.phase === 'open' ? (solo ? 'כל תלמיד עונה בטלפון שלו. החלליות מתקדמות בסיום הסבב.' : 'התלמידים יכולים לבחור תשובה בטלפונים. כל קבוצה שענתה נכון תתקדם.')
    : 'אפשר לעבור לשאלה הבאה.';
  $('right').hidden = $('wrong').hidden = round.phase !== 'locked';
  $('next').disabled = round.phase === 'open' || round.phase === 'locked' || (solo && round.phase === 'ready') || !!end || liveUIBusy;
  $('next').textContent = question === questions.length - 1 ? 'סיום המרוץ' : 'לשאלה הבאה';
  $('reveal').disabled = round.revealed || round.phase === 'locked';
  $('reveal').textContent = round.phase === 'open' ? 'סגירת זמזמים וחשיפה' : 'חשיפת תשובה';
  $('sound').setAttribute('aria-pressed', String(race.sound));
  $('sound').textContent = race.sound ? '♪ צליל פעיל' : '♪ צליל כבוי';
  if (!solo) teams.forEach((team, index) => {
    const lane = shipRows[index];
    lane.style.setProperty('--progress', Math.min(team.score / goal, 1));
    lane.querySelector('b').textContent = `${team.score}/${goal}`;
    const buzzer = buzzButtons[index];
    buzzer.disabled = !!end || round.phase !== 'open' || round.tried.includes(index);
    buzzer.classList.toggle('current', round.active === index);
  });
  $('win').hidden = !end;
  if (end && solo) {
    const lead = race.mobile.standings[0];
    $('winner').textContent = end === 'orbit' ? `${race.winnerName} במקום הראשון!` :
      lead?.score ? `${lead.name} במקום הראשון!` : 'המרוץ הסתיים';
    $('win-detail').textContent = end === 'orbit' ? 'החללית הראשונה הגיעה למסלול סביב צדק.' :
      lead?.score ? `${lead.score} מתוך ${goal} צעדים לצדק` : 'בסיבוב הזה לא נצברו צעדים.';
  } else if (end) {
    const best = Math.max(...teams.map(team => team.score));
    const leaders = teams.filter(team => team.score === best).map(team => team.name);
    const orbitTeam = teams[race.winner]?.name ?? leaders[0];
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

function buzz(index) {
  const round = race.round;
  if (projection || liveRoom || race.end || round.phase !== 'open' || !race.teams[index] || round.tried.includes(index)) return;
  round.phase = 'locked';
  round.active = index;
  round.result = round.tried.length ? 'תשובה נכונה תזכה בצעדי הבסיס של השאלה.' : 'זמזום ראשון! תשובה נכונה תזכה בבונוס של צעד.';
  tone([750, 1050]);
  commit();
}

function grade(correct) {
  const round = race.round;
  if (race.end || round.phase !== 'locked' || round.active === null) return;
  const team = race.teams[round.active];
  if (correct) {
    const bonus = round.tried.length === 0 ? 1 : 0;
    const steps = (questions[race.question][5] ? 4 : 2) + bonus;
    team.score = Math.min(race.goal, team.score + steps);
    round.result = `${team.name} מתקדמת ${steps} צעדים${bonus ? ' כולל בונוס מהירות' : ''}!`;
    round.phase = 'resolved';
    round.revealed = true;
    if (team.score >= race.goal) race.end = 'orbit';
    tone(race.end ? [523, 659, 784, 1047, 1319] : [523, 659, 880]);
  } else {
    round.tried.push(round.active);
    const more = round.tried.length < race.teams.length;
    round.phase = more ? 'open' : 'resolved';
    round.revealed = !more;
    round.result = more ? 'התור פתוח לקבוצות שעדיין לא ניסו.' : 'כל הקבוצות קיבלו הזדמנות.';
    tone([250, 180]);
  }
  round.active = null;
  commit();
}

function nextQuestion() {
  const next = race.question + 1;
  if (next >= questions.length) race.end = 'questions';
  else {
    race.question = next;
    race.round = fresh().round;
  }
  commit();
}

function renderInputs(names) {
  $('names').replaceChildren();
  for (let index = 0; index < Number($('count').value); index++) {
    const label = document.createElement('label');
    label.textContent = `קבוצה ${index + 1} · מקש ${index + 1}`;
    const input = document.createElement('input');
    input.value = names[index] ?? teamNames[index];
    input.maxLength = 24;
    input.required = true;
    label.append(input);
    $('names').append(label);
  }
}

if (projection) {
  window.addEventListener('storage', event => {
    if (event.key === storageKey) {
      race = loadRace();
      render();
    }
  });
} else {
  $('local-start').onclick = () => {
    race.started = true;
    commit();
  };
  $('lobby-invite').onclick = () => $('live-room').click();
  $('arm').onclick = () => {
    if (liveRoom) return liveRoom.action(race.round.phase === 'open' ? 'close' : 'open');
    if (race.round.phase !== 'ready' || race.end) return;
    race.round.phase = 'open';
    tone([420, 610]);
    commit();
  };
  $('right').onclick = () => grade(true);
  $('wrong').onclick = () => grade(false);
  $('next').onclick = () => liveRoom ? liveRoom.action('next') : nextQuestion();
  $('reveal').onclick = () => {
    race.round.phase = 'resolved';
    race.round.revealed = true;
    race.round.result = '';
    commit();
  };
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
    $('count').value = race.teams.length;
    $('goal').value = race.goal;
    renderInputs(race.teams.map(team => team.name));
    $('setup').showModal();
  };
  $('count').onchange = () => renderInputs(Array.from($('names').querySelectorAll('input'), input => input.value));
  $('close').onclick = () => $('setup').close();
  $('setup-form').onsubmit = event => {
    event.preventDefault();
    const names = Array.from($('names').querySelectorAll('input'), (input, index) => input.value.trim() || teamNames[index]);
    const goal = Number($('goal').value);
    const newRace = names.length !== race.teams.length || goal !== race.goal;
    const inProgress = race.question > 0 || race.round.phase !== 'ready' || race.teams.some(team => team.score);
    if (newRace && inProgress && !confirm('שינוי מספר הקבוצות או אורך המסלול יתחיל מרוץ חדש. להמשיך?')) return;
    if (newRace) race = fresh(names, goal, race.sound);
    else race.teams.forEach((team, index) => { team.name = names[index]; });
    $('setup').close();
    commit();
  };
  $('reset').onclick = () => {
    if (!confirm('לאפס את ההתקדמות ולהתחיל מחדש?')) return;
    $('setup').close();
    startAgain();
  };
  $('again').onclick = () => liveRoom ? liveRoom.restart() : startAgain();
  window.addEventListener('keydown', event => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || $('setup').open) return;
    if (/^[1-6]$/.test(event.key)) buzz(Number(event.key) - 1);
  });
}

function startAgain() {
  race = fresh(race.teams.map(team => team.name), race.goal, race.sound);
  commit();
}

render();
