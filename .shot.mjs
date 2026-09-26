import { chromium, request } from "@playwright/test";
import { config } from "dotenv";
config({ path: ".env.test", quiet: true });
const BASE="http://localhost:3000", OUT=process.env.SHOT_OUT;
const ctx=await request.newContext({baseURL:BASE});
let state=null;
for(let i=0;i<10;i++){const r=await ctx.post("/api/auth/login",{data:{email:process.env.E2E_EMAIL,password:process.env.E2E_PASSWORD}});if(r.ok()){state=await ctx.storageState();break;}await new Promise(s=>setTimeout(s,4000));}
if(!state){console.log("LOGIN FAILED");process.exit(1);}
const b=await chromium.launch();
const p=await b.newContext({storageState:state,viewport:{width:1440,height:900}}).then(c=>c.newPage());
const e=[]; p.on("pageerror",x=>e.push(String(x).slice(0,120)));
p.on("console",m=>{if(m.type()==="error")e.push(m.text().slice(0,120));});
for(const r of (process.env.SHOT_ROUTES||"/dashboard").split(",")){
  await p.goto(BASE+r,{waitUntil:"domcontentloaded",timeout:60000});
  await p.waitForTimeout(4500);
  await p.screenshot({path:`${OUT}/${r.replace(/\//g,"_")}.png`});
  console.log("shot",r);
}
console.log(e.length?"ERRORS: "+[...new Set(e)].slice(0,3).join(" | "):"no console errors");
await b.close();
