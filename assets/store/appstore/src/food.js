// Flat food illustrations, drawn in a 200x200 box. Usage: <div class="food" data-food="pasta"></div>
// Deterministic pseudo-random so every render is identical.
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

const FOODS = {
  cookie(bg = '#f3d9c4') {
    const r = rng(7); let chips = '';
    const spots = [[78,72],[118,64],[64,112],[104,104],[140,118],[92,144],[126,150],[72,82]];
    spots.forEach(([x,y]) => {
      const w = 9 + r()*4;
      chips += `<rect x="${x-w}" y="${y-w*.75}" width="${w*2}" height="${w*1.5}" rx="${w*.6}" fill="#4a2c22" transform="rotate(${r()*90} ${x} ${y})"/>`;
    });
    return `<rect width="200" height="200" fill="${bg}"/>
      <ellipse cx="102" cy="168" rx="70" ry="10" fill="#000" opacity=".12"/>
      <path d="M100 30 a72 72 0 1 0 70 60 a14 14 0 0 1 -18 -16 a14 14 0 0 1 -20 -18 a14 14 0 0 1 -16 -20 a12 12 0 0 1 -16 -6z" fill="#d79a5c"/>
      <path d="M100 30 a72 72 0 1 0 70 60 a14 14 0 0 1 -18 -16 a14 14 0 0 1 -20 -18 a14 14 0 0 1 -16 -20 a12 12 0 0 1 -16 -6z" fill="none" stroke="#b97a40" stroke-width="5"/>
      <circle cx="80" cy="64" r="22" fill="#e6b47c" opacity=".55"/>${chips}`;
  },
  pasta(bg = '#f6e7d8') {
    const r = rng(3); let pen = '';
    for (let i = 0; i < 34; i++) {
      const a = r()*Math.PI*2, d = Math.sqrt(r())*52;
      const x = 100 + Math.cos(a)*d, y = 98 + Math.sin(a)*d*.8;
      pen += `<rect x="${x-14}" y="${y-5}" width="28" height="11" rx="4" fill="${r()>.5?'#e8893a':'#d9692b'}" transform="rotate(${r()*180} ${x} ${y})"/>`;
    }
    return `<rect width="200" height="200" fill="${bg}"/>
      <ellipse cx="100" cy="108" rx="88" ry="78" fill="#000" opacity=".1"/>
      <ellipse cx="100" cy="100" rx="86" ry="76" fill="#fff"/>
      <ellipse cx="100" cy="100" rx="66" ry="56" fill="#c94a24" opacity=".85"/>${pen}
      <ellipse cx="76" cy="78" rx="12" ry="7" fill="#3f8a3a" transform="rotate(-30 76 78)"/>
      <ellipse cx="128" cy="116" rx="12" ry="7" fill="#4f9d47" transform="rotate(25 128 116)"/>
      <circle cx="112" cy="82" r="4" fill="#fff3d6"/><circle cx="90" cy="120" r="3" fill="#fff3d6"/><circle cx="124" cy="96" r="3" fill="#fff3d6"/>`;
  },
  salad(bg = '#dbe8dc') {
    const r = rng(11); let leaves = '';
    for (let i = 0; i < 26; i++) {
      const a = r()*Math.PI*2, d = Math.sqrt(r())*56, x = 100+Math.cos(a)*d, y = 100+Math.sin(a)*d;
      leaves += `<ellipse cx="${x}" cy="${y}" rx="${14+r()*8}" ry="${8+r()*4}" fill="${['#3f8a3a','#5aa84a','#2f6e2c','#7bbf55'][i%4]}" transform="rotate(${r()*180} ${x} ${y})"/>`;
    }
    const toms = [[78,82],[128,90],[104,128],[70,124],[136,132]].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="10" fill="#e0453a"/><circle cx="${x-3}" cy="${y-3}" r="3" fill="#ff8a7a"/>`).join('');
    const cukes = [[100,74],[118,112],[84,104]].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="12" fill="#cfe8b0" stroke="#3f7a2e" stroke-width="3"/>`).join('');
    return `<rect width="200" height="200" fill="${bg}"/>
      <circle cx="100" cy="106" r="84" fill="#000" opacity=".1"/>
      <circle cx="100" cy="100" r="84" fill="#2b2f3a"/><circle cx="100" cy="100" r="72" fill="#232731"/>
      ${leaves}${cukes}${toms}
      <path d="M70 70 q30 -10 60 4" stroke="#8a3a7a" stroke-width="4" fill="none"/>
      <path d="M80 138 q24 8 50 -6" stroke="#8a3a7a" stroke-width="4" fill="none"/>`;
  },
  oats(bg = '#e9e2f2') {
    const berries = [[86,84,'#3b3f8f'],[100,78,'#4a4fa8'],[112,88,'#3b3f8f'],[124,104,'#c43a5a'],[78,110,'#c43a5a'],[132,82,'#4a4fa8']]
      .map(([x,y,c]) => `<circle cx="${x}" cy="${y}" r="9" fill="${c}"/><circle cx="${x-3}" cy="${y-3}" r="2.5" fill="#fff" opacity=".5"/>`).join('');
    return `<rect width="200" height="200" fill="${bg}"/>
      <circle cx="100" cy="108" r="80" fill="#000" opacity=".1"/>
      <circle cx="100" cy="100" r="80" fill="#f4efe6"/><circle cx="100" cy="100" r="66" fill="#e8d6b4"/>
      <circle cx="80" cy="92" r="30" fill="#efe1c4"/><circle cx="118" cy="120" r="26" fill="#efe1c4"/>
      <path d="M70 128 q30 -14 64 -40" stroke="#c48a2c" stroke-width="7" fill="none" stroke-linecap="round" opacity=".85"/>
      ${berries}
      <ellipse cx="106" cy="134" rx="16" ry="9" fill="#f2d24a"/><ellipse cx="88" cy="134" rx="14" ry="8" fill="#f5dc6a"/>`;
  },
  shakshuka(bg = '#f4ddd3') {
    const eggs = [[78,84],[124,80],[100,126]].map(([x,y]) =>
      `<path d="M${x-24} ${y} q4 -22 26 -20 q24 2 22 22 q-2 22 -24 20 q-26 -2 -24 -22z" fill="#fffaf0"/><circle cx="${x+1}" cy="${y+1}" r="11" fill="#f5a623"/><circle cx="${x-3}" cy="${y-3}" r="3.5" fill="#ffd27a"/>`).join('');
    return `<rect width="200" height="200" fill="${bg}"/>
      <rect x="160" y="92" width="40" height="16" rx="8" fill="#2a2630"/>
      <circle cx="100" cy="106" r="84" fill="#000" opacity=".12"/>
      <circle cx="100" cy="100" r="84" fill="#2a2630"/><circle cx="100" cy="100" r="72" fill="#b7341f"/>
      <circle cx="80" cy="120" r="20" fill="#c94a2a"/><circle cx="130" cy="112" r="18" fill="#a52d1a"/>
      ${eggs}
      <circle cx="140" cy="130" r="4" fill="#3f8a3a"/><circle cx="64" cy="104" r="4" fill="#3f8a3a"/><circle cx="116" cy="62" r="4" fill="#3f8a3a"/>`;
  },
  ramen(bg = '#e0e8f0') {
    let noodles = '';
    for (let i = 0; i < 7; i++) noodles += `<path d="M48 ${92+i*9} q13 -10 26 0 t26 0 t26 0 t26 0" stroke="#f3d27a" stroke-width="5" fill="none"/>`;
    return `<rect width="200" height="200" fill="${bg}"/>
      <circle cx="100" cy="108" r="84" fill="#000" opacity=".1"/>
      <circle cx="100" cy="100" r="84" fill="#1f2a3a"/><circle cx="100" cy="100" r="72" fill="#d99a4e"/>
      <clipPath id="rb"><circle cx="100" cy="100" r="72"/></clipPath><g clip-path="url(#rb)">${noodles}</g>
      <path d="M72 58 q14 -14 30 0 q-2 22 -15 22 q-15 -2 -15 -22z" fill="#fffaf0"/><circle cx="87" cy="64" r="9" fill="#f5a623"/>
      <rect x="112" y="60" width="38" height="26" rx="8" fill="#a5523a" transform="rotate(14 131 73)"/>
      <rect x="62" y="122" width="30" height="40" rx="4" fill="#1b2a1e" transform="rotate(-18 77 142)"/>
      <circle cx="126" cy="128" r="12" fill="#fff" /><circle cx="126" cy="128" r="6" fill="none" stroke="#e27c9b" stroke-width="3"/>
      <circle cx="104" cy="104" r="4" fill="#5aa84a"/><circle cx="114" cy="98" r="4" fill="#5aa84a"/><circle cx="96" cy="94" r="4" fill="#5aa84a"/>`;
  },
  lemon(bg = '#fbf1c7') {
    return `<rect width="200" height="200" fill="${bg}"/>
      <ellipse cx="100" cy="106" rx="70" ry="54" fill="#f2c81f" transform="rotate(-20 100 106)"/>
      <ellipse cx="82" cy="90" rx="22" ry="10" fill="#fff6b0" opacity=".7" transform="rotate(-20 82 90)"/>
      <path d="M150 64 q26 -30 40 -10 q-20 26 -40 10z" fill="#4f9d47"/>`;
  },
};

document.querySelectorAll('.food').forEach(el => {
  const fn = FOODS[el.dataset.food];
  el.innerHTML = `<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">${fn(el.dataset.bg)}</svg>`;
});
