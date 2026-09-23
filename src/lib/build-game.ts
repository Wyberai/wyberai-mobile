// Mobile port of the web app's build-time filler game
// (wyberai/src/lib/build-game.ts) — shown full-screen in a WebView while a
// user's FIRST build runs, instead of a bare spinner. Runner-only, not a
// straight copy: the original has 3 games (Runner/Snake/Breakout) picked via
// header tabs, but Snake had NO touch input at all (arrow-key steering only)
// and Breakout's touch-drag paddle was unverified in a real WebView on a
// real device — rather than ship two touch control schemes nobody's
// confirmed actually work, this keeps only Runner, whose control is a
// single, unambiguous tap-to-jump (its `click` handler already called
// rJump() on web, so touch parity here is a tap listener, not a redesign).
// No tabs/game-switching UI since there's only one game.
export const WYBER_GAME_SRC = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Building...</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
html,body{width:100%;height:100%;overflow:hidden;background:#09090b;font-family:system-ui,sans-serif;display:flex;flex-direction:column}
#hdr{
  flex-shrink:0;height:42px;
  display:flex;align-items:center;gap:8px;
  padding:0 12px;background:#09090b;
  border-bottom:1px solid rgba(139,92,246,0.25);
}
.dot{width:8px;height:8px;border-radius:50%;background:#8b5cf6;animation:pulse 1.4s ease-in-out infinite;flex-shrink:0}
#hdr-t{font:600 11px system-ui;color:#a78bfa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
#hdr-s{font:700 12px monospace;color:#fbbf24;flex-shrink:0}
#wrap{flex:1;min-height:0;position:relative;overflow:hidden}
canvas{position:absolute;top:0;left:0;width:100%;height:100%;display:block;outline:none;touch-action:none}
#ftr{
  flex-shrink:0;height:26px;
  display:flex;align-items:center;justify-content:center;
  background:rgba(9,9,11,0.9);font:10px monospace;color:#3f3f46;
}
@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
</style>
</head>
<body>
<div id="hdr">
  <div class="dot"></div>
  <span id="hdr-t">&#x1F3D7; Coding your full app &mdash; auth, dashboard, settings + every feature you asked for</span>
  <span id="hdr-s">&#x26A1; 0 cr</span>
</div>
<div id="wrap"><canvas id="cvs" tabindex="0"></canvas></div>
<div id="ftr"><span>Tap to jump (x2) &bull; dodge bugs, collect credits</span></div>
<script>
(function(){
  var wrap=document.getElementById('wrap');
  var cvs=document.getElementById('cvs');
  var ctx=cvs.getContext('2d');
  var W=0,H=0,score=0,animId=null;

  function resize(){
    W=cvs.width=wrap.clientWidth||wrap.offsetWidth||400;
    H=cvs.height=wrap.clientHeight||wrap.offsetHeight||300;
  }
  resize();
  requestAnimationFrame(resize);
  window.addEventListener('resize',function(){resize();rInit();});

  function setScore(s){score=s;document.getElementById('hdr-s').textContent='\\u26A1 '+s+' cr';}

  // tap (touch) and click (in case a host ever attaches a mouse) both jump
  cvs.addEventListener('touchstart',function(e){e.preventDefault();rJump();},{passive:false});
  cvs.addEventListener('click',function(){rJump();});
  cvs.focus();

  var GV=0.55,JV=-12,GH=55;
  function gTop(){return H-GH;}
  var P,rSpd,rF,rDead,plats,rCoins,rBugs,rParts,bgC;

  function mkCode(){
    var l=['{}','<>','=>','//','[]','++','()','fn','if','&&'];
    return{x:Math.random()*W,y:Math.random()*H*0.8+20,
      t:l[0|Math.random()*l.length],a:0.03+Math.random()*0.04,s:0.2+Math.random()*0.4};
  }

  function rInit(){
    P={x:70,y:0,w:22,h:26,vy:0,on:false,j:0};
    rSpd=3.5;rF=0;rDead=false;
    plats=[];rCoins=[];rBugs=[];rParts=[];bgC=[];
    for(var i=0;i<25;i++) bgC.push(mkCode());
    setScore(0);
  }

  function rJump(){
    if(rDead){rInit();return;}
    if(P.j<2){P.vy=JV;P.j++;P.on=false;}
  }

  function addPart(x,y,c){
    for(var i=0;i<8;i++)
      rParts.push({x:x,y:y,vx:(Math.random()-.5)*6,vy:(Math.random()-.5)*6-2,l:1,c:c});
  }

  function rSpawnPlat(){
    var py=gTop()-70-Math.random()*120,pw=75+Math.random()*80,px=W+Math.random()*60;
    plats.push({x:px,y:py,w:pw,h:10});
    if(Math.random()>.35) rCoins.push({x:px+pw/2,y:py-22,r:9,a:true});
  }

  function rUpd(){
    if(rDead) return;
    rF++;rSpd=Math.min(10,3.5+rF*0.0015);
    P.vy+=GV;P.y+=P.vy;P.on=false;
    if(P.y+P.h>=gTop()){P.y=gTop()-P.h;P.vy=0;P.on=true;P.j=0;}
    for(var i=0;i<plats.length;i++){
      var pl=plats[i];
      if(P.vy>=0&&P.x+P.w>pl.x&&P.x<pl.x+pl.w&&P.y+P.h>=pl.y&&P.y+P.h<=pl.y+pl.h+12){
        P.y=pl.y-P.h;P.vy=0;P.on=true;P.j=0;
      }
    }
    if(P.y>H+50){rDead=true;return;}
    for(var i=0;i<plats.length;i++) plats[i].x-=rSpd;
    for(var i=0;i<rCoins.length;i++) rCoins[i].x-=rSpd;
    for(var i=0;i<rBugs.length;i++) rBugs[i].x-=rSpd;
    for(var i=0;i<rParts.length;i++){
      var pt=rParts[i];pt.x+=pt.vx;pt.y+=pt.vy;pt.vy+=0.15;pt.l-=0.05;
    }
    for(var i=0;i<rCoins.length;i++){
      var c=rCoins[i];if(!c.a) continue;
      var dx=P.x+P.w/2-c.x,dy=P.y+P.h/2-c.y;
      if(Math.sqrt(dx*dx+dy*dy)<c.r+12){c.a=false;setScore(score+10);addPart(c.x,c.y,'#fbbf24');}
    }
    for(var i=0;i<rBugs.length;i++){
      var b=rBugs[i];
      if(P.x+P.w-4>b.x&&P.x+4<b.x+b.w&&P.y+P.h-4>b.y&&P.y+4<b.y+b.h){
        rDead=true;addPart(P.x+P.w/2,P.y+P.h/2,'#8b5cf6');return;
      }
    }
    plats=plats.filter(function(p){return p.x+p.w>-50;});
    rCoins=rCoins.filter(function(c){return c.x>-20;});
    rBugs=rBugs.filter(function(b){return b.x+b.w>-50;});
    rParts=rParts.filter(function(p){return p.l>0;});
    var lp=plats[plats.length-1];
    if(!lp||lp.x<W-200) rSpawnPlat();
    var bi=Math.max(65,160-rF*0.05);
    if(rF%Math.round(bi)===0) rBugs.push({x:W+30,y:gTop()-22,w:20,h:22});
    if(rF%95===55) rCoins.push({x:W+20,y:gTop()-70-Math.random()*90,r:9,a:true});
  }

  function rDraw(){
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#09090b';ctx.fillRect(0,0,W,H);
    for(var i=0;i<bgC.length;i++){
      var cd=bgC[i];cd.x-=cd.s;
      if(cd.x<-20){cd.x=W+10;cd.y=Math.random()*H*0.7+20;}
      ctx.fillStyle='rgba(139,92,246,'+cd.a+')';
      ctx.font='11px monospace';ctx.textAlign='left';ctx.fillText(cd.t,cd.x,cd.y);
    }
    ctx.fillStyle='#18181b';ctx.fillRect(0,gTop(),W,GH);
    ctx.fillStyle='#8b5cf6';ctx.fillRect(0,gTop(),W,2);
    for(var i=0;i<plats.length;i++){
      var pl=plats[i];
      ctx.fillStyle='#27272a';ctx.fillRect(pl.x,pl.y,pl.w,pl.h);
      ctx.fillStyle='#6d28d9';ctx.fillRect(pl.x,pl.y,pl.w,2);
    }
    ctx.textAlign='center';ctx.textBaseline='middle';
    for(var i=0;i<rCoins.length;i++){
      var c=rCoins[i];if(!c.a) continue;
      var pulse=0.7+0.3*Math.sin(rF*0.12+c.x*0.05);
      ctx.fillStyle='rgba(251,191,36,'+(0.2*pulse)+')';
      ctx.beginPath();ctx.arc(c.x,c.y,c.r+5,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#fbbf24';ctx.beginPath();ctx.arc(c.x,c.y,c.r,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#78350f';ctx.font='bold 9px monospace';ctx.fillText('C',c.x,c.y);
    }
    ctx.textAlign='left';ctx.textBaseline='alphabetic';
    for(var i=0;i<rBugs.length;i++){
      var b=rBugs[i];
      ctx.fillStyle='#ef4444';ctx.fillRect(b.x,b.y,b.w,b.h);
      ctx.fillStyle='#fca5a5';ctx.font='7px monospace';
      ctx.textAlign='center';ctx.fillText('bug',b.x+b.w/2,b.y+b.h-2);ctx.textAlign='left';
    }
    for(var i=0;i<rParts.length;i++){
      var pt=rParts[i];ctx.globalAlpha=pt.l;ctx.fillStyle=pt.c;ctx.fillRect(pt.x-2,pt.y-2,4,4);
    }
    ctx.globalAlpha=1;
    var x=P.x,y=P.y,leg=Math.floor(rF/6)%2;
    ctx.fillStyle='#8b5cf6';ctx.fillRect(x+2,y+9,P.w-4,P.h-9);
    ctx.fillStyle='#fde68a';ctx.beginPath();ctx.arc(x+P.w/2,y+7,7,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#f59e0b';ctx.fillRect(x+2,y+1,P.w-4,5);ctx.fillRect(x-1,y+4,P.w+2,3);
    ctx.fillStyle='#6d28d9';
    if(P.on){
      ctx.fillRect(x+3,y+P.h-8,6,8);ctx.fillRect(x+P.w-9,y+P.h-8,6,8);
      if(leg===0) ctx.fillRect(x+3,y+P.h-10,6,8);
      else ctx.fillRect(x+P.w-9,y+P.h-10,6,8);
    } else {
      ctx.fillRect(x+3,y+P.h-6,6,6);ctx.fillRect(x+P.w-9,y+P.h-6,6,6);
    }
    ctx.fillStyle='rgba(139,92,246,0.35)';
    ctx.font='11px monospace';ctx.textAlign='right';
    ctx.fillText(Math.floor(rF*0.1)+'m',W-8,H-6);
    ctx.textAlign='left';
    if(rDead){
      ctx.fillStyle='rgba(9,9,11,0.88)';ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#e4e4e7';ctx.font='bold 22px system-ui';ctx.textAlign='center';
      ctx.fillText('A bug got you!',W/2,H/2-24);
      ctx.fillStyle='#8b5cf6';ctx.font='15px system-ui';
      ctx.fillText('Credits: '+score,W/2,H/2+8);
      ctx.fillStyle='#52525b';ctx.font='12px system-ui';
      ctx.fillText('Tap to try again',W/2,H/2+35);
      ctx.textAlign='left';
    }
  }

  function loop(){
    rUpd();rDraw();
    animId=requestAnimationFrame(loop);
  }

  rInit();
  loop();
})();
</script>
</body>
</html>`;
