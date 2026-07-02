(async () => {
  const res  = await fetch('/enemyfinder/data/enemies.json');
  const data = await res.json();
  const grid = document.getElementById('portrait-grid');

  for (const [id, enemy] of Object.entries(data.enemies)) {
    // Skip 100xx bosses (10001–10099)
    if (/^100/.test(id)) continue;

    const img = enemy.image ?? '';
    if (!img.startsWith('char_tex_')) continue;
    const numId = img.replace('char_tex_', '').replace('.png', '');

    const card = document.createElement('figure');
    card.className = 'portrait-card';

    const portrait = document.createElement('img');
    portrait.src    = `/enemies/portraits/portrait_${numId}.webp`;
    portrait.alt    = enemy.name;
    portrait.draggable = false;

    const label = document.createElement('figcaption');
    label.className   = 'portrait-name';
    label.textContent = enemy.name;

    card.append(portrait, label);
    grid.appendChild(card);
  }
})();
