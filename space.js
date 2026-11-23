(() => {
  const canvas = document.getElementById('space');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const nebula = new Image();
  const planets = [
    { x: .17, scale: 1, kind: 'jupiter', colors: ['#ffe5b7','#f1bc83','#b66f56','#ffdcaa','#9f5a4a','#e3a16e','#f6c38e','#a2615b','#f8d5a7'] },
    { x: .65, scale: .36, kind: 'mars', colors: ['#f5b889','#d57959','#8e453d','#d68a6a'] },
    { x: .87, scale: .47, kind: 'earth', colors: ['#79e6ff','#287ab7','#134893','#316aac'] }
  ];

  let seed = 832;
  function random() {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const stars = Array.from({length: 150}, () => [random(), random(), random(), random()]);
  const rocks = Array.from({length: 16}, () => [random(), random(), random(), random()]);

  function disk(planet) {
    const image = document.createElement('canvas');
    image.width = image.height = 312;
    const paint = image.getContext('2d');
    const middle = 156;
    const radius = 144;
    paint.translate(middle, middle);
    paint.beginPath();
    paint.arc(0, 0, radius, 0, Math.PI * 2);
    paint.clip();
    paint.rotate(-.16);

    for (let y = -radius; y < radius; y += 1) {
      if (planet.kind === 'jupiter') {
        const band = (y + radius) / (2 * radius) * planet.colors.length;
        paint.globalAlpha = .8 + random() * .2;
        paint.fillStyle = planet.colors[Math.floor(band)];
        paint.fillRect(-radius, y, radius * 2, 1.8);
      } else {
        paint.fillStyle = planet.colors[0];
        paint.fillRect(-radius, y, radius * 2, 1.8);
      }
    }
    paint.globalAlpha = 1;

    if (planet.kind === 'jupiter') {
      for (let step = 0; step < 410; step++) {
        const y = random() * radius * 2 - radius;
        const x = random() * radius * 2 - radius;
        paint.strokeStyle = random() < .5 ? '#fff2cf35' : '#72335029';
        paint.lineWidth = 1 + random() * 3;
        paint.beginPath();
        paint.moveTo(x, y);
        paint.bezierCurveTo(x + 25, y - 8, x + 43, y + 7, x + 81, y - 2);
        paint.stroke();
      }
      for (let i = 0; i < 13; i++) {
        paint.strokeStyle = ['#f3b789','#b44744','#cf6552','#ef8c67'][i % 4];
        paint.lineWidth = 3.5;
        paint.beginPath();
        paint.ellipse(51 + i * .5, 45, 36 - i * 2.3, 15 - i * .85, -.13, 0, Math.PI * 2);
        paint.stroke();
      }
    } else {
      for (let i = 0; i < 70; i++) {
        const x = random() * 288 - 144;
        const y = random() * 288 - 144;
        const isEarth = planet.kind === 'earth';
        paint.globalAlpha = .16 + random() * .44;
        paint.fillStyle = (isEarth ? ['#173c84','#2b84b4','#77d4a6','#d3f3eb'] : planet.colors)[i % 4];
        paint.beginPath();
        paint.ellipse(x, y, 8 + random() * 53, 3 + random() * 19, random() - .6, 0, Math.PI * 2);
        paint.fill();
      }
    }

    paint.globalAlpha = 1;
    const shade = paint.createRadialGradient(-69, -78, 3, 9, 10, radius + 25);
    shade.addColorStop(0, '#fff2d94d');
    shade.addColorStop(.42, '#ffffff00');
    shade.addColorStop(.74, '#19133020');
    shade.addColorStop(1, '#070b27ed');
    paint.fillStyle = shade;
    paint.fillRect(-170, -170, 340, 340);
    return image;
  }

  planets.forEach(planet => { planet.sprite = disk(planet); });
  let width = 0;
  let height = 0;
  let frame;
  let planetY = 0;
  let unit = 0;
  function draw(time = 0) {
    const t = time / 1000;
    ctx.clearRect(0, 0, width, height);
    if (nebula.complete && nebula.naturalWidth) {
      const zoom = Math.max(width / nebula.width, height / nebula.height);
      ctx.globalAlpha = .77;
      ctx.drawImage(nebula, (width - nebula.width * zoom) / 2, (height - nebula.height * zoom) / 2, nebula.width * zoom, nebula.height * zoom);
      ctx.globalAlpha = 1;
    }
    stars.forEach(([x, y, size, wave]) => {
      ctx.fillStyle = `rgba(224,239,255,${.19 + size * .28 + Math.sin(t * 1.8 + wave * 40) * .14})`;
      ctx.beginPath();
      ctx.arc(x * width, y * height, .4 + size * 1.05, 0, Math.PI * 2);
      ctx.fill();
    });

    rocks.forEach(([a,b,c,d]) => {
      const x = (.40 + a * .17) * width + Math.sin(t * .3 + c * 15) * 7;
      const y = planetY - 55 + b * 94;
      const r = 2 + 7 * c;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * (d - .45) * .6 + a * 5);
      ctx.beginPath();
      ctx.moveTo(-r, -r * .18);
      ctx.lineTo(-r * .57, -r * .88);
      ctx.lineTo(r * .43, -r * .65);
      ctx.lineTo(r, 0);
      ctx.lineTo(r * .6, r * .65);
      ctx.lineTo(-r * .26, r * .69);
      ctx.closePath();
      ctx.fillStyle = '#b08eaf90';
      ctx.fill();
      ctx.strokeStyle = '#e4bcd260';
      ctx.stroke();
      ctx.restore();
    });

    planets.forEach((planet, index) => {
      const x = planet.x * width + Math.sin(t * .45 + index) * (index ? 7 : 4);
      const y = planetY + Math.cos(t * .61 + index) * 6;
      const size = unit * planet.scale;
      if (!index) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-.27);
        ctx.strokeStyle = '#ffd8a054';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 1.43, size * .42, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sin(t * .22 + index) * .1);
      ctx.shadowBlur = index ? 14 : 29;
      ctx.shadowColor = index === 2 ? '#50c8ff80' : '#ff945079';
      ctx.drawImage(planet.sprite, -size, -size, size * 2, size * 2);
      ctx.restore();
      if (!index) {
        const angle = t * .48;
        const moonX = x + Math.cos(angle) * size * 1.37;
        const moonY = y + Math.sin(angle) * size * .43 - (moonX - x) * .23;
        if (Math.sin(angle) > 0 || Math.abs(moonX - x) > size * .93) {
          ctx.fillStyle = '#f9dcad';
          ctx.beginPath();
          ctx.arc(moonX, moonY, Math.max(2, size * .05), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
    if (!motion.matches) frame = requestAnimationFrame(draw);
  }

  function restart() {
    cancelAnimationFrame(frame);
    draw(motion.matches ? 1100 : performance.now());
  }

  new ResizeObserver(() => {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    planetY = width < 540 ? 185 : Math.max(220, Math.min(271, innerHeight * .29));
    unit = Math.min(width * .145, 132);
    for (const planet of planets) {
      const label = document.getElementById(`label-${planet.kind}`);
      label.style.left = `${planet.x * 100}%`;
      label.style.top = `${planetY + unit * planet.scale + 11}px`;
    }
    document.getElementById('label-asteroids').style.top = `${planetY + 58}px`;
    canvas.parentElement.style.setProperty('--map-top', `${planetY + unit + 47}px`);
    const scale = Math.min(devicePixelRatio, 2);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    restart();
  }).observe(canvas);
  motion.addEventListener('change', restart);
  nebula.onload = restart;
  nebula.src = './nebula.webp';
})();
