const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
async function contactSheet(out,shots){
 const list=shots.map(a=>`file '${path.join(out,a.file).replaceAll('\\','/')}'\nduration 1`).join('\n');
 fs.writeFileSync(path.join(out,'contact-sheet-inputs.txt'),list);
 const labels=shots.map((a,i)=>`drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='${a.file}':fontsize=15:fontcolor=black:x=${(i%5)*384+8}:y=${Math.floor(i/5)*260+218}`);
 const filter=['fps=1','scale=368:207','pad=384:260:8:0:color=0xe9edf2','tile=5x3:nb_frames='+shots.length,...labels].join(',');
 const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',path.join(out,'contact-sheet-inputs.txt'),'-vf',filter,'-frames:v','1',path.join(out,'contact-sheet.png')],{encoding:'utf8'});
 if(result.status!==0)throw Error(result.stderr||String(result.error));
}
module.exports=contactSheet;
if(require.main===module){const out=path.resolve(process.argv[2]);contactSheet(out,JSON.parse(fs.readFileSync(path.join(out,'manifest.json'))).assets.filter(a=>a.type==='screenshot')).catch(e=>{console.error(e);process.exitCode=1;});}
