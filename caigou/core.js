(function(root){
  const digit={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
  const units=['公斤','千克','毫升','斤','两','克','kg','g','升','ml','个','颗','棵','根','把','捆','袋','盒','包','箱','瓶','桶','只','条','块','份','元','卷','盘','筐','提','板','件'];
  const unitPattern=units.join('|');
  const qtyPattern='(?:半|(?:\\d+(?:\\.\\d+)?|\\.\\d+)|[零〇一二两三四五六七八九十百千万点]+)';
  const productHints=['西红柿','胡萝卜','金针蘑','西兰花','小白菜','油麦菜','娃娃菜','上海青','圆白菜','紫甘蓝','杏鲍菇','蟹味菇','海鲜菇','白萝卜','西葫芦','黄瓜','尖椒','青椒','油菜','菠菜','香菜','土豆','白菜','生菜','芹菜','韭菜','茄子','冬瓜','南瓜','山药','莲藕','红薯','莴笋','丝瓜','苦瓜','秋葵','豇豆','扁豆','香菇','平菇','木耳','豆腐','豆干','鸡蛋','豆芽','口蘑','豆皮','腐竹','大葱','小葱','蒜苗','茼蒿','空心菜','姜','蒜','辣椒'];

  function number(s){
    if(/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(s))return String(Number(s));
    if(s==='半')return s;
    if(s.includes('点')){const [a,b='']=s.split('点');return number(a||'零')+'.'+[...b].map(x=>digit[x]??x).join('');}
    let total=0,section=0,current=0;
    for(const x of s){
      if(x in digit){current=digit[x];continue;}
      const u={十:10,百:100,千:1000,万:10000}[x];
      if(!u)continue;
      if(u===10000){section=(section+current)*u;total+=section;section=0;current=0;}
      else{section+=(current||1)*u;current=0;}
    }
    return String(total+section+current);
  }

  function smartSplitPart(part){
    const text=part.trim();
    if(!text)return [];
    const boundary=new RegExp(`${qtyPattern}\\s*(?:捆儿|块钱|${unitPattern})(?:半)?`,'gi');
    const matches=[...text.matchAll(boundary)];
    if(!matches.length){
      const starts=[];
      for(const name of productHints){let pos=text.indexOf(name);while(pos>=0){starts.push(pos);pos=text.indexOf(name,pos+name.length);}}
      const points=[...new Set(starts)].sort((a,b)=>a-b);
      if(points.length>1&&points[0]===0){const guessed=points.map((p,i)=>text.slice(p,points[i+1]??text.length).trim()).filter(Boolean);const hasQty=new RegExp(`${qtyPattern}$`);if(guessed.every(x=>hasQty.test(x)))return guessed;}
      return [text];
    }
    const out=[];let start=0;
    for(const match of matches){
      const end=match.index+match[0].length;
      const segment=text.slice(start,end).trim();
      if(segment)out.push(segment);
      start=end;
    }
    const tail=text.slice(start).trim();
    if(tail)out.push(tail);
    return out;
  }

  function split(text){
    const lines=String(text||'').split(/[\r\n]+/).map(x=>x.trim()).filter(Boolean);
    const out=[];
    for(const line of lines){
      const punctuation=line.split(/[、，,；;。！？!?]+/).map(x=>x.trim()).filter(Boolean);
      for(const part of punctuation)out.push(...smartSplitPart(part));
    }
    return out;
  }

  function parseOne(raw){
    const clean=String(raw).replace(/\s+/g,' ').trim();
    const withUnit=new RegExp(`^(.+?)\\s*(${qtyPattern})\\s*(捆儿|块钱|${unitPattern})(半)?$`,'i');
    const withoutUnit=new RegExp(`^(.+?)\\s*(${qtyPattern})$`,'i');
    const m=clean.match(withUnit)||clean.match(withoutUnit);
    if(!m)return {raw:clean,text:clean,recognized:false,name:clean,qty:'',unit:''};
    const qty=number(m[2]);
    const unit=(m[3]||'').replace('儿','').replace('块钱','元');
    return {raw:clean,text:m[1].trim()+' '+qty+unit+(m[4]||''),recognized:true,name:m[1].trim(),qty,unit};
  }

  function parse(text){return split(text).map(parseOne);}

  function display(text){
    const matcher=new RegExp(`^(.+?)\\s*((?:\\d+(?:\\.\\d+)?|半)\\s*(?:${unitPattern})?(?:半)?)$`,'i');
    const m=String(text).match(matcher);
    return m?m[1].trim()+'\u3000\u3000'+m[2].replace(/\s+/g,''):String(text);
  }

  root.ListCore={parse,parseOne,split,number,display,units};
  if(typeof module!=='undefined')module.exports=root.ListCore;
})(typeof window!=='undefined'?window:globalThis);
