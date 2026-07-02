(async () => {
  const $ = id => document.getElementById(id);
  const CLASS = {Fighter:'鬥士',Defender:'防禦',Supporter:'輔助',Assassin:'刺客',Healer:'治療'};
  const ELEM  = {Fire:'火',Water:'水',Wind:'風',Light:'光',Dark:'暗'};
  const RAR   = {1:'R',2:'SR',3:'SSR',4:'SSR+'}; // boneStar→稀有度標籤（同 erodex）

  let chars, skills, strings, skillById = {};
  try {
    [chars, skills, strings] = await Promise.all([
      fetch('../data/characters.json?v=2').then(r=>r.json()),
      fetch('../data/skills.json?v=2').then(r=>r.json()),
      fetch('../data/strings.json?v=2').then(r=>r.json()),
    ]);
  } catch(e){ $('char-list').innerHTML = '<div class="muted">資料載入失敗：'+e+'</div>'; return; }
  skills.forEach(s => skillById[s.id] = s);
  const name = idx => strings[idx] || ('#'+idx);
  const rar  = v => RAR[v] || String(v);

  // 依稀有度(boneStar)→元素排序
  chars.sort((a,b)=> (b.boneStar-a.boneStar) || (a.element||'').localeCompare(b.element||''));

  let picked = null;

  function renderList(filter){
    const q = (filter||'').trim().toLowerCase();
    const box = $('char-list'); box.innerHTML='';
    chars.forEach(c=>{
      const nm = name(c.nameIndex);
      if(q && !nm.toLowerCase().includes(q)) return;
      const d = document.createElement('div');
      d.className = 'char-chip' + (picked && picked.id===c.id ? ' active':'');
      d.innerHTML = '<img src="../data/portraits/char_tex_'+c.id+'.png" alt="" loading="lazy">'
        + '<div class="nm">'+nm+'</div><div class="rr">'+rar(c.boneStar)+' · '+(ELEM[c.element]||c.element||'')+'</div>';
      d.addEventListener('click',()=>pick(c));
      box.appendChild(d);
    });
    if(!box.children.length) box.innerHTML='<div class="muted">找不到符合的角色。</div>';
  }

  function pick(c){
    picked = c;
    const bs = c.baseStats||{};
    $('picked').innerHTML = '<b>'+name(c.nameIndex)+'</b>（'+rar(c.boneStar)+' · '+(ELEM[c.element]||c.element)+' · '+(CLASS[c.class]||c.class)+'）'
      + '<div class="stats">ATK '+Math.round(bs.ATK)+' ｜ DEF '+Math.round(bs.DEF)+' ｜ HP '+Math.round(bs.HP)
      + ' ｜ CRI '+bs.CRI+' ｜ CRI_DMG '+bs.CRI_DMG+' ｜ SPD '+bs.SPD+'</div>';
    // 預填參數（暴擊率/暴傷以原始值推估：CRI/100 → %；CRI_DMG/100 → 總倍率%）
    $('p-atk').value = Math.round(bs.ATK||0);
    $('p-cri').value = (bs.CRI!=null ? +(bs.CRI/100).toFixed(1) : 5);
    $('p-cridmg').value = (bs.CRI_DMG!=null ? Math.round(bs.CRI_DMG/100) : 150);
    renderList($('char-search').value);
    compute();
  }

  function compute(){
    if(!picked){ return; }
    const atk = (+$('p-atk').value||0) * (1 + (+$('p-atkbuff').value||0)/100);
    const criP = Math.max(0, Math.min(100, +$('p-cri').value||0)) / 100;
    const criDmg = (+$('p-cridmg').value||150) / 100;         // 總倍率，如 1.5
    const def = Math.max(0, +$('p-def').value||0);
    const K   = Math.max(1, +$('p-k').value||1000);
    const elem = +$('p-elem').value||1;
    const mitig = 1 - def/(def+K);

    $('formula').innerHTML = '公式（估算）：單擊 = ATK × 技能倍率% × 減傷 × 屬性　｜　'
      + '減傷 = 1 − DEF ÷ (DEF + K) = <b>'+(mitig*100).toFixed(1)+'%</b>　｜　'
      + '期望 = 單擊 × (1 + 暴擊率 × (暴傷倍率 − 1))　｜　屬性 ×'+elem
      + '<br>註：CRI/CRI_DMG 原始值的百分比尺度未經官方證實，已用 CRI÷100、CRI_DMG÷100 推估並填入，可自行修改。';

    const out = $('skill-out'); out.innerHTML='';
    const ids = picked.skillIds||[];
    let any=false;
    ids.forEach(sid=>{
      const s = skillById[sid]; if(!s) return;
      const nm = name(s.nameIndex);
      const mult = (s.valueMins&&s.valueMins[0])||0;
      const multMax = (s.valueMaxs&&s.valueMaxs[0])||mult;
      const el = document.createElement('div'); el.className='skill';
      if(s.type==='Attack' && mult>0){
        any=true;
        const base = atk * (mult/100) * mitig * elem;
        const baseMax = atk * (multMax/100) * mitig * elem;
        const crit = base * criDmg;
        const expect = base * (1 + criP*(criDmg-1));
        el.innerHTML = '<div class="sn">'+nm+'</div>'
          + '<div class="sm">攻擊 · 倍率 '+mult+(multMax!==mult?('~'+multMax):'')+'% · 目標 '+(s.targetCount||1)+'</div>'
          + '<div class="row"><span>單擊（非暴）</span><b>'+fmt(base)+(baseMax!==base?('~'+fmt(baseMax)):'')+'</b></div>'
          + '<div class="row"><span>暴擊</span><b>'+fmt(crit)+'</b></div>'
          + '<div class="row"><span>期望值/擊</span><b class="big">'+fmt(expect)+'</b></div>'
          + '<div class="row"><span>期望 × 目標數</span><b>'+fmt(expect*(s.targetCount||1))+'</b></div>';
      } else {
        const t = ({PassiveBuff:'被動增益',Buff:'增益',Debuff:'減益',Heal:'治療'})[s.type]||s.type||'非傷害';
        el.innerHTML = '<div class="sn">'+nm+'</div><div class="sm">'+t+'</div><div class="nonatk">非直接傷害技能（增益／被動／治療等），不列入傷害估算。</div>';
      }
      out.appendChild(el);
    });
    if(!out.children.length) out.innerHTML='<div class="muted">此角色無技能資料。</div>';
    else if(!any) out.insertAdjacentHTML('afterbegin','<div class="muted" style="grid-column:1/-1">此角色技能多為輔助／被動，無直接傷害技能。</div>');
  }

  function fmt(n){ return Math.round(n).toLocaleString(); }

  ['p-atk','p-atkbuff','p-cri','p-cridmg','p-def','p-k','p-elem'].forEach(id=>{
    $(id).addEventListener('input', compute);
    $(id).addEventListener('change', compute);
  });
  $('char-search').addEventListener('input', e=>renderList(e.target.value));
  renderList('');
})();
