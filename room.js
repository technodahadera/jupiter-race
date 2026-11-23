(() => {
  const service = 'https://technoda-jupiter-rooms.workspace-022996.chatgpt.site';
  const hostStorage = 'technoda-jupiter-host';
  const roomPattern = /^[A-Z2-9]{8}$/;
  const params = new URLSearchParams(location.search);

  function address(code = '1') {
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('join', code);
    return url.href;
  }

  async function request(path, { body, host, player } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (host) headers['X-Race-Host'] = host;
    if (player) headers['X-Race-Player'] = player;
    let response;
    try {
      response = await fetch(service + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers, body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(7500)
      });
    } catch {
      throw Object.assign(new Error('connection'), { code: 'connection' });
    }
    if (response.redirected) throw Object.assign(new Error('connection'), { code: 'connection' });
    let data;
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok || !Object.keys(data).length) {
      throw Object.assign(new Error(data.error || 'connection'), { code: data.error || 'connection', status: response.status });
    }
    return data;
  }

  function message(id, value) {
    const target = $(id);
    if (target.textContent !== value) target.textContent = value;
    target.hidden = !value;
  }

  function readStorage(storage, key) {
    try { return storage.getItem(key); } catch { return null; }
  }

  function writeStorage(storage, key, value) {
    try {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    } catch { /* The current page can stay connected without storage. */ }
  }

  function delayTime() { return document.hidden ? 1600 : 850; }

  if (params.has('join') && !projection) {
    runStudent();
    return;
  }

  renderRoom = () => {
    const state = race.mobile;
    $('room-board').hidden = !state;
    if (!state) return;
    const joined = state.joined.reduce((sum, count) => sum + count, 0);
    $('room-code').textContent = state.code;
    const timing = race.round.phase === 'open' ? ` · ${Math.ceil(state.remaining / 1000)} שניות` : '';
    const counts = `${joined} טלפונים מחוברים · ${state.submissions} תשובות${timing}`;
    if ($('room-counts').textContent !== counts) $('room-counts').textContent = counts;
  };
  render();
  if (projection) return;

  let credentials;
  let timer;
  let currentState;
  let queryGeneration = 0;

  function cacheIdentity(value) {
    credentials = value;
    writeStorage(sessionStorage, hostStorage, value ? JSON.stringify(value) : null);
  }

  function applyState(state) {
    const old = currentState;
    currentState = state;
    const phase = state.phase === 'closing' ? 'open' : state.phase;
    race.teams = state.teams;
    race.goal = state.goal;
    race.question = state.question;
    race.mobile = { code: state.code, remaining: state.remaining, joined: state.joined, submissions: state.submissions };
    race.end = state.ended || '';
    race.winner = state.result?.winner;
    race.round = {
      phase, tried: [], active: null, revealed: !!state.result,
      result: state.result ? state.result.awards.map(({ team, points, first }) =>
        `${state.teams[team].name} +${points}${first ? ' ⚡' : ''}`).join(' · ') || 'בסבב הזה לא התקבלה תשובה נכונה.' : ''
    };
    if (old && old.phase !== state.phase) {
      if (state.phase === 'open') tone([430, 680]);
      if (state.phase === 'resolved' && state.result?.awards.length) tone(race.end ? [523,659,784,1047,1319] : [523,659,880]);
    }
    commit();
  }

  function setupHost() {
    liveRoom = { action: doAction, restart: restartRoom };
    $('live-room').textContent = '📱 חדר טלפונים פעיל';
    $('live-room').disabled = false;
    render();
  }

  function clearRoom() {
    clearTimeout(timer);
    queryGeneration++;
    cacheIdentity(null);
    currentState = null;
    liveRoom = null;
    liveUIBusy = false;
    race = fresh(race.teams.map(team => team.name), race.goal, race.sound);
    $('live-room').textContent = '📱 משחק בטלפונים';
    $('live-room').disabled = false;
    message('room-message', '');
    commit();
  }

  async function refreshRoom() {
    if (!credentials) return;
    const generation = queryGeneration;
    try {
      const state = await request(`/rooms/${credentials.code}`, { host: credentials.hostKey });
      if (generation !== queryGeneration || !credentials) return;
      if (!state.duration) { clearRoom(); return; }
      if (!liveUIBusy) applyState(state);
    } catch (err) {
      if (generation !== queryGeneration) return;
      if (err.code === 'missing') {
        clearRoom();
        alert('חדר הטלפונים נסגר או שפג תוקפו. אפשר לפתוח חדר חדש.');
        return;
      }
      message('room-message', 'החיבור לחדר נקטע. מנסים להתחבר מחדש.');
    } finally {
      if (generation === queryGeneration && credentials) timer = setTimeout(refreshRoom, delayTime());
    }
  }

  async function openRoom(skipConfirm = false) {
    if (credentials || liveUIBusy) return;
    const inProgress = race.question > 0 || race.round.phase !== 'ready' || race.teams.some(team => team.score);
    if (!skipConfirm && inProgress && !confirm('פתיחת חדר טלפונים תתחיל מרוץ חדש. להמשיך?')) return;
    liveUIBusy = true;
    $('live-room').disabled = true;
    $('live-room').textContent = 'פותחים חדר…';
    try {
      const result = await request('/rooms', { body: { names: race.teams.map(team => team.name), goal: race.goal, question: 0 } });
      cacheIdentity({ code: result.code, hostKey: result.hostKey });
      setupHost();
      applyState({ code: result.code, phase: 'ready', question: 0, teams: race.teams.map(team => ({...team, score: 0})),
        goal: race.goal, joined: race.teams.map(() => 0), submissions: 0, remaining: 0 });
      message('room-message', 'שתפו את קישור ההצטרפות או הציגו לכיתה את קוד החדר.');
      refreshRoom();
    } catch {
      $('live-room').textContent = '📱 משחק בטלפונים';
      alert('לא הצלחנו לפתוח חדר טלפונים. בדקו את החיבור ונסו שוב.');
    } finally {
      liveUIBusy = false;
      $('live-room').disabled = false;
      render();
    }
  }

  async function doAction(action) {
    if (liveUIBusy || !credentials || !currentState) return;
    clearTimeout(timer);
    const generation = ++queryGeneration;
    liveUIBusy = true;
    render();
    try {
      const data = await request(`/rooms/${credentials.code}/${action}`, {
        host: credentials.hostKey, body: { question: currentState.question, round: currentState.round }
      });
      if (action === 'delete') clearRoom();
      else {
        applyState(data);
        message('room-message', '');
      }
      return true;
    } catch (err) {
      if (err.code === 'missing' && action === 'delete') { clearRoom(); return true; }
      message('room-message', 'לא הצלחנו לעדכן את החדר. נסו שוב.');
      return false;
    } finally {
      liveUIBusy = false;
      render();
      if (generation === queryGeneration && credentials) timer = setTimeout(refreshRoom, delayTime());
    }
  }

  async function restartRoom() {
    if (await doAction('delete')) openRoom(true);
  }

  $('live-room').onclick = () => {
    if (credentials) $('room-board').scrollIntoView({block:'nearest'});
    else openRoom();
  };
  $('join-page').onclick = () => { location.href = address(); };
  $('end-room').onclick = () => {
    if (confirm('לסגור את החדר ולנתק את הטלפונים?')) doAction('delete');
  };
  $('copy-room').onclick = async () => {
    if (!credentials) return;
    const url = address(credentials.code);
    try {
      await navigator.clipboard.writeText(url);
      message('room-message', 'הקישור הועתק. אפשר לשלוח אותו לתלמידים.');
    } catch {
      message('room-message', url);
    }
  };

  try {
    const saved = JSON.parse(readStorage(sessionStorage, hostStorage));
    if (roomPattern.test(saved?.code) && typeof saved.hostKey === 'string') {
      credentials = saved;
      setupHost();
      refreshRoom();
    }
  } catch { /* A stale host session does not prevent a new game. */ }

  function runStudent() {
    document.querySelector('.shell').hidden = true;
    $('student').hidden = false;
    const input = $('join-code');
    let code = '';
    let player;
    let state;
    let timer;
    let generation = 0;
    let busy = false;
    let lastChoice = null;
    let teamLayout = '';
    const teamChoices = $('team-choices');

    const answers = 'אבגד'.split('').map((letter, choice) => {
      const button = document.createElement('button');
      button.className = 'light';
      const marker = document.createElement('span');
      marker.textContent = letter;
      const text = document.createElement('span');
      button.append(marker, text);
      button.onclick = () => submit(choice);
      $('student-answers').append(button);
      return { button, text };
    });

    function renderStudent() {
      const hasTeam = state?.team != null;
      $('join-card').hidden = hasTeam;
      $('join-form').hidden = !!state;
      $('choose-team').hidden = !state || hasTeam;
      $('student-game').hidden = !hasTeam;
      if (!state) return;
      if (!hasTeam) {
        const layout = JSON.stringify(state.teams.map(team => team.name));
        if (layout !== teamLayout) {
          teamLayout = layout;
          teamChoices.replaceChildren();
          state.teams.forEach((team, index) => {
            const button = document.createElement('button');
            button.className = 'buzzer';
            button.style.setProperty('--team', teamColors[index]);
            button.textContent = team.name;
            button.onclick = () => joinTeam(index);
            teamChoices.append(button);
          });
        }
        for (const button of teamChoices.children) button.disabled = busy || !!state.ended;
        return;
      }

      const team = state.teams[state.team];
      const open = state.phase === 'open' && state.remaining > 0 && !state.ended;
      const resolved = !!state.result;
      const choice = state.choice ?? (lastChoice?.round === state.round ? lastChoice.choice : null);
      $('student-team').textContent = team.name;
      $('student-timer').textContent = open ? `${Math.ceil(state.remaining / 1000)} שניות`
        : state.ended ? 'המשימה הסתיימה' : resolved ? 'תוצאות' : 'ממתינים למורה';
      $('student-question').textContent = state.phase === 'ready' ? (state.ended ? 'המרוץ הסתיים!' : 'מחכים לפתיחת השאלה') : state.prompt;
      $('student-answers').hidden = state.phase === 'ready';
      answers.forEach(({button, text}, index) => {
        text.textContent = state.options[index];
        button.disabled = !open || choice !== null || busy;
        button.classList.toggle('selected', choice === index);
        button.classList.toggle('answer-correct', resolved && state.result.answer === index);
        button.classList.toggle('answer-incorrect', resolved && choice === index && state.result.answer !== index);
        button.setAttribute('aria-pressed', String(choice === index));
      });
      const feedback = resolved
        ? `${choice === state.result.answer ? 'עניתם נכון! ' : ''}${state.result.explanation}`
        : choice !== null ? 'התשובה נקלטה. מחכים לסיום הסבב.' : open ? 'בחרו תשובה אחת.' : '';
      if (feedback !== $('student-feedback').textContent) $('student-feedback').textContent = feedback;
      const winner = state.result?.winner;
      const orbit = winner == null ? '' : ` · ${state.teams[winner].name} הגיעה למסלול צדק!`;
      $('student-score').textContent = `${team.score} מתוך ${state.goal} צעדים לצדק${orbit}`;
    }

    function update(data) {
      state = data;
      if (lastChoice && data.round !== lastChoice.round) lastChoice = null;
      renderStudent();
    }

    async function refresh() {
      const at = generation;
      if (!code) return;
      try {
        const data = await request(`/rooms/${code}`, { player });
        if (at !== generation || busy) return;
        update(data);
        message('student-message', '');
      } catch (err) {
        if (at !== generation) return;
        if (err.code === 'missing') {
          code = '';
          state = null;
          renderStudent();
          message('student-message', 'החדר הזה סגור או שקוד החדר שגוי. בדקו את הקוד שמופיע אצל המורה.');
        } else message('student-message', 'החיבור נקטע. מנסים להתחבר שוב.');
      } finally {
        if (at === generation && code) timer = setTimeout(refresh, delayTime());
      }
    }

    async function joinTeam(team) {
      if (busy || !code) return;
      busy = true;
      renderStudent();
      const at = generation;
      try {
        const data = await request(`/rooms/${code}/join`, { body: { team }, player });
        if (at !== generation) return;
        update(data);
        message('student-message', '');
      } catch (err) {
        if (at === generation) message('student-message', err.code === 'full' ? 'החדר מלא או שהמשחק הסתיים.' : 'ההצטרפות לא הצליחה. נסו שוב.');
      } finally {
        if (at === generation) { busy = false; renderStudent(); }
      }
    }

    async function submit(choice) {
      if (busy || state?.phase !== 'open' || state.choice !== null || lastChoice?.round === state.round) return;
      const round = state.round;
      const at = generation;
      busy = true;
      renderStudent();
      try {
        const data = await request(`/rooms/${code}/answer`, { body: { round, choice }, player });
        if (at !== generation) return;
        lastChoice = data;
        message('student-message', '');
      } catch (err) {
        if (at === generation) message('student-message', err.code === 'closed' ? 'חלון התשובות כבר נסגר.' : 'התשובה עדיין לא אושרה. נסו שוב אם הזמן טרם נגמר.');
      } finally {
        if (at === generation) { busy = false; renderStudent(); }
      }
    }

    function enter(value) {
      const normalized = value.trim().toUpperCase();
      if (!roomPattern.test(normalized)) {
        message('student-message', 'הקלידו את שמונת התווים שמופיעים בקוד החדר.');
        return;
      }
      clearTimeout(timer);
      generation++;
      code = normalized;
      state = null;
      lastChoice = null;
      busy = false;
      const key = 'technoda-jupiter-phone-' + code;
      player = readStorage(localStorage, key) || crypto.randomUUID().replaceAll('-', '');
      writeStorage(localStorage, key, player);
      input.value = code;
      history.replaceState(null, '', address(code));
      message('student-message', 'בודקים את קוד החדר…');
      refresh();
    }

    $('join-form').onsubmit = event => { event.preventDefault(); enter(input.value); };
    $('student-exit').onclick = () => {
      if (!code && !state) { location.href = new URL(location.pathname, location.href).href; return; }
      clearTimeout(timer);
      generation++;
      code = '';
      state = null;
      lastChoice = null;
      busy = false;
      input.value = '';
      history.replaceState(null, '', address());
      message('student-message', '');
      renderStudent();
    };

    const initial = params.get('join').trim().toUpperCase();
    if (roomPattern.test(initial)) enter(initial);
  }
})();
