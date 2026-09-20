// Converts a Markdown file to .docx: headings, lists, tables, code blocks, "> " callouts, page breaks (<<pagebreak>>)
// and images written as ![caption](figure-name), which are looked up as <figure-name>.png in the figure folder.
//
//   FOOTER_TEXT='LeafLimits: förklaring för nybörjare, sida ' \
//   NODE_PATH=/dir/with/node_modules node docs/figures/md-to-docx.js docs/LEAFLIMITS_FORKLARING_SV.md out.docx /dir/with/pngs
//
// Needs the npm package "docx". The figures come from docs/figures/build-figures.js.
const fs=require('fs');
const {Document,Packer,Paragraph,TextRun,HeadingLevel,Table,TableRow,TableCell,WidthType,ShadingType,BorderStyle,LevelFormat,AlignmentType,Footer,PageNumber,ImageRun,PageBreak}=require('docx');
const [,, src, out, figDir]=process.argv;
const path=require('path');
const FOOTER=process.env.FOOTER_TEXT||'LeafLimits plan – page ';
function pngSize(b){return {w:b.readUInt32BE(16),h:b.readUInt32BE(20)};}
const W=9026;
function runs(t,base={}){const o=[];const re=/(\*\*[^*]+\*\*|`[^`]+`)/g;let last=0,m;
  while((m=re.exec(t))){if(m.index>last)o.push(new TextRun({text:t.slice(last,m.index),...base}));
    const s=m[0];if(s.startsWith('**'))o.push(new TextRun({text:s.slice(2,-2),bold:true,...base}));
    else o.push(new TextRun({text:s.slice(1,-1),font:"Consolas",size:19,color:base.color}));
    last=m.index+s.length;}
  if(last<t.length)o.push(new TextRun({text:t.slice(last),...base}));return o;}
const bd={style:BorderStyle.SINGLE,size:4,color:"BFC5CD"};const borders={top:bd,bottom:bd,left:bd,right:bd};
function table(rows){
  const cells=rows.map(r=>r.split('|').slice(1,-1).map(s=>s.trim()));
  const head=cells[0],body=cells.slice(2),n=head.length;
  const weight=head.map((_,i)=>Math.max(8,Math.min(60,Math.max(...[head,...body].map(r=>(r[i]||'').replace(/[`*]/g,'').length)))));
  const tot=weight.reduce((a,b)=>a+b,0);let widths=weight.map(w=>Math.max(900,Math.round(W*w/tot)));
  const diff=W-widths.reduce((a,b)=>a+b,0);widths[widths.length-1]+=diff;
  const cell=(t,w,h)=>new TableCell({width:{size:w,type:WidthType.DXA},borders,margins:{top:60,bottom:60,left:90,right:90},
    shading:h?{type:ShadingType.CLEAR,fill:"1F4E5F"}:undefined,
    children:[new Paragraph({children:h?[new TextRun({text:t,bold:true,color:"FFFFFF",size:20})]:runs(t,{size:20})})]});
  return new Table({width:{size:W,type:WidthType.DXA},columnWidths:widths,rows:[
    new TableRow({tableHeader:true,children:head.map((t,i)=>cell(t,widths[i],true))}),
    ...body.map(r=>new TableRow({children:head.map((_,i)=>cell(r[i]||'',widths[i],false))}))]});
}
const lines=fs.readFileSync(src,'utf8').split('\n');
const kids=[];const numbering=[{reference:"b",levels:[{level:0,format:LevelFormat.BULLET,text:"•",alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:540,hanging:270}}}}]}];
let nlist=0,inNum=false,i=0;
while(i<lines.length){const l=lines[i];
  if(l.startsWith('```')){const buf=[];i++;while(i<lines.length&&!lines[i].startsWith('```')){buf.push(lines[i]);i++;}i++;
    buf.forEach(b=>kids.push(new Paragraph({spacing:{after:0},shading:{type:ShadingType.CLEAR,fill:"F2F4F7"},children:[new TextRun({text:b||" ",font:"Consolas",size:17})]})));
    kids.push(new Paragraph({spacing:{after:100},children:[]}));inNum=false;continue;}
  if(l.startsWith('|')){const buf=[];while(i<lines.length&&lines[i].startsWith('|')){buf.push(lines[i]);i++;}
    kids.push(table(buf));kids.push(new Paragraph({spacing:{after:100},children:[]}));inNum=false;continue;}
  let m;
  if((m=l.match(/^# (.*)/))){kids.push(new Paragraph({spacing:{before:200,after:120},border:{bottom:{style:BorderStyle.SINGLE,size:8,color:"1F4E5F",space:6}},children:[new TextRun({text:m[1],size:44,bold:true,color:"1F4E5F"})]}));}
  else if((m=l.match(/^## (.*)/))){kids.push(new Paragraph({heading:HeadingLevel.HEADING_1,children:[new TextRun(m[1])]}));inNum=false;}
  else if((m=l.match(/^### (.*)/))){kids.push(new Paragraph({heading:HeadingLevel.HEADING_2,children:[new TextRun(m[1])]}));inNum=false;}
  else if((m=l.match(/^!\[(.*?)\]\((.*?)\)\s*$/))){
    const buf=fs.readFileSync(path.join(figDir||'.',m[2]+'.png')); const s=pngSize(buf);
    const W=600, maxH=780; let w=W, h=Math.round(W*s.h/s.w); if(h>maxH){h=maxH; w=Math.round(maxH*s.w/s.h);}
    kids.push(new Paragraph({alignment:AlignmentType.CENTER,keepNext:true,keepLines:true,spacing:{before:120,after:40},children:[new ImageRun({type:'png',data:buf,transformation:{width:w,height:h},altText:{title:m[1],description:m[1],name:m[2]}})]}));
    kids.push(new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:200},children:[new TextRun({text:m[1],italics:true,size:19,color:'5A6770'})]}));inNum=false;}
  else if(l.trim()==='<<pagebreak>>'){kids.push(new Paragraph({children:[new PageBreak()]}));inNum=false;}
  else if((m=l.match(/^> ?(.*)/))){kids.push(new Paragraph({spacing:{before:40,after:120},indent:{left:240},shading:{type:ShadingType.CLEAR,fill:"E8F1F4"},border:{left:{style:BorderStyle.SINGLE,size:24,color:"1F4E5F",space:8}},children:runs(m[1])}));inNum=false;}
  else if((m=l.match(/^- (.*)/))){kids.push(new Paragraph({numbering:{reference:"b",level:0},spacing:{after:60},children:runs(m[1])}));inNum=false;}
  else if((m=l.match(/^\d+\. (.*)/))){
    if(!inNum){nlist++;numbering.push({reference:"n"+nlist,levels:[{level:0,format:LevelFormat.DECIMAL,text:"%1.",alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:540,hanging:360}}}}]});inNum=true;}
    kids.push(new Paragraph({numbering:{reference:"n"+nlist,level:0},spacing:{after:60},children:runs(m[1])}));}
  else if(l.trim()===''){/* skip */}
  else{kids.push(new Paragraph({spacing:{after:120},children:runs(l)}));inNum=false;}
  i++;}
const doc=new Document({
  styles:{default:{document:{run:{font:"Calibri",size:22}}},paragraphStyles:[
    {id:"Heading1",name:"Heading 1",basedOn:"Normal",next:"Normal",quickFormat:true,run:{size:30,bold:true,font:"Calibri",color:"1F4E5F"},paragraph:{spacing:{before:320,after:140},outlineLevel:0,keepNext:true}},
    {id:"Heading2",name:"Heading 2",basedOn:"Normal",next:"Normal",quickFormat:true,run:{size:25,bold:true,font:"Calibri",color:"1F4E5F"},paragraph:{spacing:{before:220,after:100},outlineLevel:1,keepNext:true}}]},
  numbering:{config:numbering},
  sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1300,bottom:1200,left:1440,right:1440}}},
    footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:FOOTER,size:18,color:"888888"}),new TextRun({children:[PageNumber.CURRENT],size:18,color:"888888"})]})]})},
    children:kids}]});
Packer.toBuffer(doc).then(b=>{fs.writeFileSync(out,b);console.log('wrote',out,b.length)});
