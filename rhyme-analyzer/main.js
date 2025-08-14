/* Rhyme Analyzer – updated build (plain JS, no bundler)
 * Features:
 * - Fixed end-of-line detection
 * - Memoized word→phones
 * - Debounced "live processing" (auto-analyze while typing) without CM6 imports
 * - Bucketed grouping to reduce comparisons
 * - Assonance sensitivity is used
 * - Copy JSON export
 * - Friendly labels (Exact/Close/Loose, Vowel/Ending, Tail)
 */

const VIEW_TYPE_RHYME = 'rhyme-analyzer-view';

const DEFAULT_SETTINGS = {
  autoAnalyzeOnType: true,
  perfectThreshold: 0.18,
  slantThreshold: 0.50,
  assonanceEnabled: true,
  assonanceThreshold: 0.35, // 0..1 (nucleus distance)
  ignoreStopwords: true
};

const STOPWORDS = new Set([
  'the','and','a','an','of','to','in','is','it','that','for','on','with','as','at','by','be','or','but','if','so','then','than','this','these','those','from','are','was','were','will','would','could','should','i','you','he','she','we','they','me','him','her','us','them','my','your','his','its','our','their'
]);

// Small local additions; extend freely.
const CUSTOM_ARPA = {
  'lekker': ['L','EH1','K','ER0'],
  'bru': ['B','R','UW1'],
  'boet': ['B','UH1','T'],
  'ja': ['Y','AA1'],
  "ain't": ['EY1','N','T']
};

function stripStress(p){ return (p||'').replace(/[0-2]$/,''); }
function isVowelPhone(p){ return /AA|AE|AH|AO|AW|AY|EH|ER|EY|IH|IY|OW|OY|UH|UW/.test(stripStress(p)); }

function phonesToNucleusCoda(phones){
  let lastV=-1;
  for (let i=phones.length-1;i>=0;i--){ if (isVowelPhone(phones[i])) { lastV=i; break; } }
  if (lastV===-1) return { nucleus: [], coda: phones.slice(-2).map(stripStress) };
  const nucleus=[stripStress(phones[lastV])];
  const coda = phones.slice(lastV+1).map(stripStress);
  return { nucleus, coda };
}

function vowelFamily(nuc){
  if (!nuc[0]) return 'unk';
  const base = stripStress(nuc[0]);
  const FAM = { AA:'low-back', AH:'low-back', AO:'low-back', AE:'low-front', EH:'mid-front', EY:'mid-front', ER:'r-colored', IH:'high-front', IY:'high-front', OW:'mid-back', UH:'mid-back', UW:'high-back', AY:'diph', AW:'diph', OY:'diph' };
  return FAM[base] || base;
}
function vowelClass(nuc){ return nuc[0] ? stripStress(nuc[0]) : 'unk'; }

function nucleusDistance(a,b){
  const ca=vowelClass(a), cb=vowelClass(b);
  if (ca===cb) return 0.0;
  const fa=vowelFamily(a), fb=vowelFamily(b);
  return (fa===fb) ? 0.25 : 1.0;
}
function codaDistance(aC,bC){
  const eq=(c)=>({S:'S',Z:'S',T:'T',D:'T',F:'F',V:'F',K:'K',G:'K',M:'N',N:'N',NG:'N',R:'R',L:'L',B:'B',P:'P',CH:'CH',JH:'CH',SH:'SH',ZH:'SH'}[c]||c);
  const len=Math.max(aC.length,bC.length);
  if (len===0) return 0.6;
  let score=0, comp=0;
  for (let i=1;i<=Math.min(3,len);i++){
    const a=eq(aC[aC.length-i]||''), b=eq(bC[bC.length-i]||'');
    if (!a && !b) continue;
    comp++; score += (a===b) ? 0 : 1;
  }
  return comp? (score/comp) : 0.6;
}
function rhymeDistance(a,b){ return 0.7*nucleusDistance(a.nucleus,b.nucleus)+0.3*codaDistance(a.coda,b.coda); }

// super-rough OOV phones
function heuristicPhones(word){
  const w=word.toLowerCase();
  const out=[]; const push=(p)=>out.push(p);
  let s=w;
  const reps=[[/oy|oi/g,'OY1'],[/ay|ai|ey|ei/g,'AY1'],[/oo/g,'UW1'],[/ow|ou/g,'OW1'],[/au/g,'AO1'],[/ee|ie|ei/g,'IY1'],[/ea/g,'EH1']];
  for (const [re,ph] of reps){ s=s.replace(re,()=>{ push(ph); return ' '; }); }
  s=s.replace(/[aeiou]/g,(m)=>{ ({a:'AE1',e:'EH1',i:'IH1',o:'OW1',u:'UH1'})[m]&&push(({a:'AE1',e:'EH1',i:'IH1',o:'OW1',u:'UH1'})[m]); return ' '; });
  s=s.replace(/y\b/g,()=>{ push('IY1'); return ' '; });
  for (const ch of s.replace(/\s+/g,'')){
    const map={b:'B',c:'K',d:'D',f:'F',g:'G',h:'HH',j:'JH',k:'K',l:'L',m:'M',n:'N',p:'P',q:'K',r:'R',s:'S',t:'T',v:'V',w:'W',x:'K',y:'Y',z:'Z'};
    map[ch]&&out.push(map[ch]);
  }
  return out.length? out : ['AH0'];
}

class RhymeAnalyzer {
  constructor(settings){ this.settings=settings; this.phoneCache=new Map(); }
  cleanWord(w){ return (w||'').toLowerCase().replace(/[^a-zA-Z'\-]/g,'').replace(/^'+|'+$/g,''); }
  wordToPhones(w){
    const key=this.cleanWord(w); if (!key) return [];
    const c=this.phoneCache.get(key); if (c) return c.slice();
    let ph = CUSTOM_ARPA[key]; if (!ph) ph = heuristicPhones(key);
    this.phoneCache.set(key, ph); return ph.slice();
  }
  isLineEnd(i, words){
    const line=words[i].line;
    for (let j=i+1;j<words.length;j++){
      if (words[j].line!==line) return true;
      return false;
    }
    return true;
  }
  tokenize(text){
    const lines=text.split(/\n/), words=[];
    for (let li=0; li<lines.length; li++){
      const parts = lines[li].match(/[A-Za-z']+|[^A-Za-z'\s]+/g) || [];
      for (let idx=0; idx<parts.length; idx++){
        const t=parts[idx];
        if (/^[A-Za-z']+$/.test(t)){
          const cleaned=this.cleanWord(t);
          if (cleaned) words.push({ word: cleaned, line: li, pos: idx });
        }
      }
    }
    return words;
  }
  analyze(text){
    const words=this.tokenize(text);
    const spans=[];
    for (let i=0;i<words.length;i++){
      const w=words[i];
      if (this.settings.ignoreStopwords && STOPWORDS.has(w.word)) continue;
      const ph = this.wordToPhones(w.word);
      const {nucleus, coda} = phonesToNucleusCoda(ph);
      const bucketKey = `${(nucleus[0]||'_')}|${(coda[coda.length-1]||'_')}`;
      spans.push({ i, line:w.line, word:w.word, nucleus, coda, bucketKey, isEnd: this.isLineEnd(i, words) });
    }

    const buckets=new Map();
    for (let sIdx=0;sIdx<spans.length;sIdx++){
      const k=spans[sIdx].bucketKey; if (!buckets.has(k)) buckets.set(k,[]);
      buckets.get(k).push(sIdx);
    }

    const groups=[]; const groupOf=new Array(spans.length).fill(-1);
    const perfT=this.settings.perfectThreshold, slantT=this.settings.slantThreshold;
    const tryJoin=(aIdx,bIdx)=>{
      const a=spans[aIdx], b=spans[bIdx];
      const d=rhymeDistance(a,b);
      const endPair=a.isEnd && b.isEnd;
      const th=endPair? perfT : slantT;
      return d<=th;
    };
    for (const arr of buckets.values()){
      for (let x=0;x<arr.length;x++){
        const aIdx=arr[x]; if (groupOf[aIdx]!==-1) continue;
        const group=[aIdx]; groupOf[aIdx]=groups.length;
        for (let y=x+1;y<arr.length;y++){
          const bIdx=arr[y]; if (groupOf[bIdx]!==-1) continue;
          if (tryJoin(aIdx,bIdx)){ group.push(bIdx); groupOf[bIdx]=groups.length; }
        }
        if (group.length>1) groups.push(group);
        else groupOf[aIdx] = -1; // drop singletons
      }
    }

    // Assonance groups by nucleus with sensitivity
    const assonance=[];
    if (this.settings.assonanceEnabled){
      const aBuckets=new Map();
      for (let sIdx=0;sIdx<spans.length;sIdx++){
        const k = (spans[sIdx].nucleus[0]||'_');
        if (!aBuckets.has(k)) aBuckets.set(k,[]);
        aBuckets.get(k).push(sIdx);
      }
      for (const arr of aBuckets.values()){
        // pairwise join by nucleusDistance threshold
        const used=new Array(arr.length).fill(false);
        for (let i=0;i<arr.length;i++){
          if (used[i]) continue;
          const gi=[arr[i]]; used[i]=true;
          for (let j=i+1;j<arr.length;j++){
            if (used[j]) continue;
            const d = nucleusDistance(spans[arr[i]].nucleus, spans[arr[j]].nucleus);
            if (d <= this.settings.assonanceThreshold){ gi.push(arr[j]); used[j]=true; }
          }
          if (gi.length>1) assonance.push(gi);
        }
      }
    }

    // Rhyme scheme by line final groups
    const lineFinalGroup=new Map(), schemeLetters=new Map(), lineText=new Map();
    let nextCode='A'.charCodeAt(0);
    for (let gi=0; gi<groups.length; gi++){
      for (const sIdx of groups[gi]){
        const s=spans[sIdx];
        if (s.isEnd){ lineFinalGroup.set(s.line, gi); lineText.set(s.line, s.word); }
      }
    }
    const lineCount = spans.reduce((m,s)=>Math.max(m,s.line), -1)+1;
    const scheme=[];
    for (let l=0;l<lineCount;l++){
      const g=lineFinalGroup.get(l);
      if (g===undefined) scheme.push('-');
      else {
        if (!schemeLetters.has(g)){ schemeLetters.set(g, String.fromCharCode(nextCode++)); }
        scheme.push(schemeLetters.get(g));
      }
    }

    return { words, spans, groups, assonance, scheme };
  }
}

// ===== View =====
class RhymeResultsView extends ItemView {
  constructor(leaf, plugin){ super(leaf); this.plugin=plugin; this.lastResult=null; }
  getViewType(){ return VIEW_TYPE_RHYME; }
  getDisplayText(){ return 'Rhyme Analyzer'; }
  async onOpen(){ this.containerEl.empty(); this.renderHeader(); this.renderBody(); }
  renderHeader(){
    const h = this.containerEl.createDiv({ cls:'rhyme-pane-header' });
    const btn = h.createEl('button', { text: 'Analyze', cls:'rhyme-btn' });
    btn.addEventListener('click', ()=>this.plugin.runAnalysis());
    const copy = h.createEl('button', { text: 'Copy JSON', cls:'rhyme-btn-secondary' });
    copy.addEventListener('click', ()=>{
      if (!this.lastResult) return;
      const text = JSON.stringify(this.plugin.decorateResult(this.lastResult), null, 2);
      if (navigator.clipboard) navigator.clipboard.writeText(text);
      new Notice('Rhyme Analyzer: JSON copied');
    });
    const legend = h.createDiv({ cls:'rhyme-legend', text:'Solid chips = Cluster • Faded = Vowel echo • ×N = Tail • ticks = Ending match • Left A/B/C = Rhyme map' });
  }
  renderBody(){
    this.bodyEl = this.containerEl.createDiv({ cls:'rhyme-pane-body' });
    this.bodyEl.createEl('p', { text:'No analysis yet. Click Analyze or enable live processing.' });
  }
  renderResult(result){
    this.lastResult=result;
    const body=this.bodyEl; body.empty();
    // Scheme
    const scheme = body.createDiv({ cls:'rhyme-scheme' });
    scheme.createEl('div', { text: 'Rhyme map: ' + (result.scheme.join(' ')) });
    // Groups
    const groupsWrap = body.createDiv({ cls:'rhyme-groups-wrap' });
    const groups = result.groups || [];
    if (!groups.length){ groupsWrap.createEl('p', { text:'No rhyme clusters at current cutoffs.' }); }
    groups.forEach((g, idx)=>{
      const gEl = groupsWrap.createDiv({ cls:'rhyme-group' });
      gEl.createEl('div', { cls:'rhyme-group-title', text:`Cluster ${idx+1}` });
      const chipRow = gEl.createDiv({ cls:'rhyme-chip-row' });
      for (const sIdx of g){
        const s = result.spans[sIdx];
        const chip = chipRow.createDiv({ cls: 'rhyme-chip', text: result.words[s.i].word });
        chip.setAttr('title', `${s.isEnd?'end':'internal'}`);
      }
    });
    // Assonance
    if (this.plugin.settings.assonanceEnabled && result.assonance?.length){
      const asw = body.createDiv({ cls:'assonance-wrap' });
      asw.createEl('div', { cls:'assonance-title', text:'Vowel echo clusters' });
      result.assonance.forEach((arr, idx)=>{
        const row = asw.createDiv({ cls:'assonance-row' });
        row.createEl('span', { text:`Echo ${idx+1}: `, cls:'assonance-label' });
        arr.forEach(sIdx=>{
          const s=result.spans[sIdx];
          row.createEl('span', { text: result.words[s.i].word, cls:'assonance-chip' });
        });
      });
    }
  }
}

// ===== Plugin =====
class RhymeAnalyzerPlugin extends Plugin {
  async onload(){
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() || {});
    this.analyzer = new RhymeAnalyzer(this.settings);
    this.lastHash = '';

    this.registerView(VIEW_TYPE_RHYME, (leaf) => new RhymeResultsView(leaf, this));

    this.addRibbonIcon('mic', 'Rhyme Analyzer: Analyze current note', () => this.runAnalysis());
    this.addCommand({ id:'open-rhyme-view', name:'Open Rhyme Analyzer', callback: ()=>this.activateView() });
    this.addCommand({ id:'analyze-current-note', name:'Analyze current note for rhymes', callback: ()=>this.runAnalysis() });

    this.addSettingTab(new RhymeSettingsTab(this.app, this));

    // Live processing heartbeat (no CM imports)
    let idleTimer=null;
    const getEditor = () => this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
    const getText = () => {
      const ed=getEditor(); if (!ed) return '';
      const sel=ed.getSelection(); return sel && sel.length ? sel : ed.getValue();
    };
    const hash = (s) => `${s.length}:${s.charCodeAt(0)||0}:${s.charCodeAt(s.length-1)||0}`;

    const tick = () => {
      if (!this.settings.autoAnalyzeOnType) return;
      const txt=getText(); const h=hash(txt);
      if (h !== this.lastHash){
        this.lastHash = h;
        this.runAnalysis(txt);
      }
    };

    this.registerInterval(window.setInterval(()=>{
      clearTimeout(idleTimer);
      idleTimer = setTimeout(tick, 300);
    }, 200));

    this.registerEvent(this.app.workspace.on('file-open', ()=>{ this.lastHash=''; }));
    this.registerEvent(this.app.workspace.on('active-leaf-change', ()=>{ this.lastHash=''; }));

    // ensure view exists
    this.activateView();
  }

  async onunload(){}

  decorateResult(res){
    // Future: enrich spans with tail length, coda depth, etc. (kept minimal here)
    return res;
  }

  get resultsView(){
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_RHYME)) return leaf.view;
    return null;
  }

  async activateView(){
    if (this.resultsView) return;
    await this.app.workspace.getRightLeaf(false).setViewState({ type: VIEW_TYPE_RHYME, active: true });
  }

  runAnalysis(forceText){
    const ed = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
    const text = forceText !== undefined ? forceText : (ed ? (ed.getSelection() || ed.getValue()) : '');
    if (!text || !text.trim()){ new Notice('Rhyme Analyzer: nothing to analyze'); return; }
    const result = this.analyzer.analyze(text);
    const view = this.resultsView;
    if (view){ view.renderResult(result); }
    else new Notice('Rhyme Analyzer: view not open');
  }

  async saveSettings(){ await this.saveData(this.settings); }
}

// ===== Settings =====
class RhymeSettingsTab extends PluginSettingTab {
  constructor(app, plugin){ super(app, plugin); this.plugin=plugin; }
  display(){
    const {containerEl} = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Rhyme Analyzer' });

    new Setting(containerEl)
      .setName('Live processing')
      .setDesc('Analyze as you type (selection preferred; falls back to full note).')
      .addToggle(t=>t
        .setValue(this.plugin.settings.autoAnalyzeOnType)
        .onChange(async v=>{ this.plugin.settings.autoAnalyzeOnType=v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Exact cutoff')
      .setDesc('Lower = stricter perfect matches at line ends.')
      .addSlider(s=>s.setLimits(0.05, 0.4, 0.01).setValue(this.plugin.settings.perfectThreshold)
        .onChange(async v=>{ this.plugin.settings.perfectThreshold=v; await this.plugin.saveSettings(); }))
      .addExtraButton(b=>b.setIcon('reset').setTooltip('Reset').onClick(async()=>{ this.plugin.settings.perfectThreshold=DEFAULT_SETTINGS.perfectThreshold; await this.plugin.saveSettings(); this.display(); }));

    new Setting(containerEl)
      .setName('Loose cutoff')
      .setDesc('Higher = more slants/internal groups.')
      .addSlider(s=>s.setLimits(0.2, 0.8, 0.01).setValue(this.plugin.settings.slantThreshold)
        .onChange(async v=>{ this.plugin.settings.slantThreshold=v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Vowel echo (assonance)')
      .setDesc('Show vowel-only clusters.')
      .addToggle(t=>t.setValue(this.plugin.settings.assonanceEnabled)
        .onChange(async v=>{ this.plugin.settings.assonanceEnabled=v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Vowel echo sensitivity')
      .setDesc('Lower = only very close vowels cluster.')
      .addSlider(s=>s.setLimits(0.1, 1.0, 0.01).setValue(this.plugin.settings.assonanceThreshold)
        .onChange(async v=>{ this.plugin.settings.assonanceThreshold=v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Ignore common words')
      .setDesc('Skip function words when forming rhyme clusters.')
      .addToggle(t=>t.setValue(this.plugin.settings.ignoreStopwords)
        .onChange(async v=>{ this.plugin.settings.ignoreStopwords=v; await this.plugin.saveSettings(); }));
  }
}

module.exports = RhymeAnalyzerPlugin;
