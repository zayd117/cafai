// Additional contracts for the visual refresh: narrow screens, native scrolling, motion preferences, pending and no-JS.
// Uses the same fixture/mock database preparation and Chromium path as scripts/flow.mjs.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
const [base='http://localhost:3100',out='.screenshots/design']=process.argv.slice(2);
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',args:['--no-sandbox']});
const checks=[];
 const check=(label,value)=>{assert.ok(value,label);checks.push(`PASS ${label}`);console.log(checks.at(-1));};
try {
 for(const width of [320,390,760,761,1024,1440]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
  await page.goto(base,{waitUntil:'networkidle'});
  check(`${width}px: no horizontal overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check(`${width}px: motion is absent under reduced motion`,await page.locator('.counter').evaluate(el=>getComputedStyle(el).transform==='none'));
  check(`${width}px: textarea is visible`,await page.getByRole('textbox',{name:'Your project',exact:true}).isVisible());
  check(`${width}px: submit has a 44px target`,(await page.getByRole('button',{name:'What do you recommend?'}).boundingBox()).height>=44);
  check(`${width}px: one shared project form`,await page.locator('form.counter').count()===1);
  if(width>760){
   const intro=await page.locator('.intake-intro').boundingBox();
   const form=await page.locator('.counter').boundingBox();
   check(`${width}px: original centered desktop composition`,intro.y+intro.height<=form.y&&Math.abs(intro.x+intro.width/2-width/2)<1&&Math.abs(form.x+form.width/2-width/2)<1);
   check(`${width}px: desktop headline keeps original text color`,await page.locator('.hero h1').evaluate(el=>getComputedStyle(el).color===getComputedStyle(el.querySelector('span')).color));
  }else{
   check(`${width}px: mobile keeps the expanded introduction`,await page.locator('.intake-description').isVisible());
  }
  await page.screenshot({path:`${out}/intake-${width}px.png`,fullPage:true});
  await page.close();
 }
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(base,{waitUntil:'networkidle'});
 await page.waitForTimeout(800);
 check('Entrance transform clears after completion',await page.locator('.counter').evaluate(el=>getComputedStyle(el).transform==='none'));
 check('Entrance does not capture focus',await page.evaluate(()=>document.activeElement===document.body));
 await page.emulateMedia({reducedMotion:'reduce'});
 check('Changing motion preference removes transforms',await page.locator('.counter').evaluate(el=>getComputedStyle(el).transform==='none'));
 await page.getByRole('textbox',{name:'Your project',exact:true}).fill('I am making a calorie tracker app for phones.');
 let release;
 const pending=new Promise(r=>release=r);
 await page.route('**/*',async route=>{if(route.request().method()==='POST')await pending;await route.continue();});
 await page.getByRole('button',{name:'What do you recommend?'}).click();
 await page.getByRole('button',{name:'Finding your picks…'}).waitFor();
 check('Primary and example submits disable during a request',await page.locator('.counter button').evaluateAll(els=>els.length===4&&els.every(el=>el.disabled)));
 await page.screenshot({path:`${out}/pending-request.png`,fullPage:true});
 release();
 await page.waitForURL(/\/r\//);
 await page.unroute('**/*');
 check('No uncaught or CSP console errors',errors.length===0);
 // Crafted hidden values exercise the real rerun action as well as the pipeline's privacy boundary.
 if(!await page.locator('.readback').evaluate(el=>el.open))await page.locator('.readback > summary').click();
 const key='sk-CANARYcanary1234567890';
 const email='canary@example.com';
 await page.locator('.readback-form').evaluate((form,{key,email})=>{
  const fields={item_id:'edit1',item_kind:'goal',item_text:`Tracker ${key}`,item_tag:email,item_quote:email,item_suggestions:JSON.stringify([key,email,'Tracker'])};
  form.querySelectorAll('input[name^="item_"]').forEach(el=>el.remove());
  for(const [name,value] of Object.entries(fields)){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);}
 },{key,email});
 const previous=page.url();
 await page.locator('.readback-form').getByRole('button',{name:'Update my picks',exact:true}).click();
 await page.waitForURL(url=>url.toString()!==previous);
 const savedHtml=await page.content();
 check('Rerun action removes secrets from every posted read-back field',!savedHtml.includes(key)&&!savedHtml.includes(email)&&savedHtml.includes('Tracker [redacted]'));
 await page.screenshot({path:`${out}/redacted-readback.png`,fullPage:true});
 await page.close();
 const ctx=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
 const native=await ctx.newPage();
 await native.goto(base);
 check('No JS: project composer remains visible',await native.getByRole('textbox',{name:'Your project',exact:true}).isVisible());
 await native.getByRole('textbox',{name:'Your project',exact:true}).fill('I am making a calorie tracker app for phones.');
 // Native keyboard activation avoids Playwright's animation-stability polling in a JS-disabled context.
 // Pointer activation and motion are covered above; this exercises actual browser form submission.
 await native.getByRole('button',{name:'What do you recommend?'}).press('Enter');
 await native.waitForURL(/\/r\//);
 check('No JS: native project submission reaches results',native.url().includes('/r/'));
 await native.screenshot({path:`${out}/no-js-results.png`,fullPage:true});
 await native.goto(base);
 await native.getByRole('button',{name:/Calorie tracker app:/}).press('Enter');
 await native.waitForURL(/\/r\//);
 check('No JS: saved example submits natively',await native.getByText('Expo',{exact:true}).count()>0);
 await ctx.close();
 console.log(`${checks.length} design behavior checks passed`);
} finally {await browser.close();}
