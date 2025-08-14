// Minimal variant: command-only analyzer (prints scheme to console/notice)
class RhymeAnalyzerSimple extends Plugin {
  async onload(){
    this.addCommand({ id:'rhyme-simple-run', name:'Rhyme Analyzer (simple): Show rhyme map', callback: ()=>this.run() });
  }
  run(){
    const ed = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
    const text = ed ? (ed.getSelection() || ed.getValue()) : '';
    if (!text.trim()){ new Notice('Rhyme Analyzer (simple): nothing to analyze'); return; }
    const scheme = this.scheme(text);
    console.log('Rhyme map', scheme.join(' '));
    new Notice('Rhyme map: '+scheme.join(' '));
  }
  scheme(text){
    const lines=text.split(/\n/).map(s=>s.trim()).filter(Boolean);
    const ends=lines.map(l=> (l.match(/[A-Za-z']+/g)||[]).pop()?.toLowerCase() || '');
    const classOf=(w)=>{
      const m=w.match(/(oy|oi|ay|ai|ey|ei|oo|ow|ou|au|ee|ie|ei|ea|[aeiouy])(?!.*(oy|oi|ay|ai|ey|ei|oo|ow|ou|au|ee|ie|ei|ea|[aeiouy]))/);
      if (!m) return '_';
      const v=m[1];
      const map={oy:'OY',oi:'OY',ay:'AY',ai:'AY',ey:'AY',ei:'AY',oo:'UW',ow:'OW',ou:'OW',au:'AO',ee:'IY',ie:'IY',ea:'EH'};
      return map[v] || ({a:'AE',e:'EH',i:'IH',o:'AO',u:'UH',y:'IH'}[v]||'_');
    };
    const cod=(w)=>{
      const m=w.match(/(?:.*[aeiouy])([a-z']*)$/);
      return (m? m[1] : '').slice(-2);
    };
    const labels={}; let nxt=65; const out=[];
    for (let i=0;i<ends.length;i++){
      let lab='-';
      for (let j=0;j<i;j++){
        if (classOf(ends[i])===classOf(ends[j]) && cod(ends[i])===cod(ends[j])){
          labels[j] ??= String.fromCharCode(nxt++);
          lab = labels[j]; break;
        }
      }
      if (lab==='-') { labels[i] = String.fromCharCode(nxt++); lab = labels[i]; }
      out.push(lab);
    }
    return out;
  }
}
module.exports = RhymeAnalyzerSimple;
