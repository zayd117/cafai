// Original presentation and interaction contracts: narrow screens, motion/haptics, pending and no-JS.
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
 for(const width of [320,390,700,701,1024,1440]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
  await page.goto(base,{waitUntil:'networkidle'});
  check(`${width}px: no horizontal overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check(`${width}px: page has no entrance transform`,await page.locator('.counter').evaluate(el=>getComputedStyle(el).transform==='none'));
  check(`${width}px: textarea is visible`,await page.getByRole('textbox',{name:'Your project',exact:true}).isVisible());
  check(`${width}px: submit has a 44px target`,(await page.getByRole('button',{name:'What do you recommend?'}).boundingBox()).height>=44);
  check(`${width}px: one shared project form`,await page.locator('form.counter').count()===1);
  check(`${width}px: original 880px maximum composer`,await page.locator('.counter').evaluate(el=>getComputedStyle(el).maxWidth==='880px'));
  check(`${width}px: original centered heading`,await page.locator('.hero').first().evaluate(el=>getComputedStyle(el).textAlign==='center'));
  await page.screenshot({path:`${out}/intake-${width}px.png`,fullPage:true});
  await page.close();
 }
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{window.hapticCalls=[];Object.defineProperty(navigator,'vibrate',{configurable:true,value:ms=>{window.hapticCalls.push(ms);return true;}});});
 await page.goto(base,{waitUntil:'networkidle'});
 check('Haptics do not run on page load',await page.evaluate(()=>hapticCalls.length===0));
 const chip=page.getByRole('checkbox',{name:'Claude Code',exact:true});
 await chip.check();
 check('One short haptic pulse per selection',await page.evaluate(()=>JSON.stringify(hapticCalls)==='[8]'));
 check('Selection has a brief feedback animation',await chip.evaluate(el=>getComputedStyle(el.closest('.chip')).animationName==='choice-feedback'));
 await chip.press('Space');
 check('Keyboard selection has one pulse, without duplicate click feedback',await page.evaluate(()=>JSON.stringify(hapticCalls)==='[8,8]'));
 const submit=page.getByRole('button',{name:'What do you recommend?'});
 const box=await submit.boundingBox(),form=await page.locator('.counter').boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 await page.waitForTimeout(120);
 check('Pressed button gives tactile visual feedback',await submit.evaluate(el=>getComputedStyle(el).transform!=='none'));
 check('Press does not move the surrounding layout',JSON.stringify(await page.locator('.counter').boundingBox())===JSON.stringify(form));
 await page.screenshot({path:`${out}/pressed-button.png`,fullPage:true});
 await page.mouse.move(0,0);await page.mouse.up();
 await page.emulateMedia({reducedMotion:'reduce'});
 await chip.check();
 check('Live reduced-motion preference suppresses haptics',await page.evaluate(()=>hapticCalls.length===2));
 check('Reduced motion removes selection animation',await chip.evaluate(el=>getComputedStyle(el.closest('.chip')).animationName==='none'));
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.locator('.more > summary').click();
 check('Native disclosure opens with a brief reveal',await page.locator('.more .field').evaluate(el=>getComputedStyle(el).animationName==='detail-reveal'&&el.getBoundingClientRect().height>0));
 check('Disclosure keeps native focus',await page.locator('.more > summary').evaluate(el=>document.activeElement===el));
 await page.locator('.more > summary').click();
 await page.getByRole('textbox',{name:'Your project',exact:true}).fill('I am making a calorie tracker app for phones.');
 let release;
 const pending=new Promise(r=>release=r);
 await page.route('**/*',async route=>{if(route.request().method()==='POST')await pending;await route.continue();});
 await page.getByRole('button',{name:'What do you recommend?'}).click();
 await page.getByRole('button',{name:'Finding your picks…'}).waitFor();
 check('Primary and example submits disable during a request',await page.locator('.counter button').evaluateAll(els=>els.length===4&&els.every(el=>el.disabled)));
 check('Pending action has a subtle loading animation',await page.locator('.send').evaluate(el=>getComputedStyle(el).animationName==='request-sheen'&&el.getAttribute('aria-busy')==='true'));
 await page.screenshot({path:`${out}/pending-request.png`,fullPage:true});
 if(process.env.CAFAI_CAPTURE_MOTION==='1'){
  mkdirSync(`${out}/motion`,{recursive:true});
  for(let i=0;i<16;i++){await page.locator('.composer').screenshot({path:`${out}/motion/frame-${String(i).padStart(2,'0')}.png`,animations:'allow'});await page.waitForTimeout(80);}
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 check('Changing preference stops pending animation',await page.locator('.send').evaluate(el=>getComputedStyle(el).animationName==='none'));
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
 const unsupported=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'no-preference'});
 unsupported.on('pageerror',e=>errors.push(e.message));
 await unsupported.addInitScript(()=>Object.defineProperty(navigator,'vibrate',{configurable:true,value:undefined}));
 await unsupported.goto(base,{waitUntil:'networkidle'});
 await unsupported.getByRole('checkbox',{name:'Claude Code',exact:true}).check();
 check('Unsupported vibration leaves native controls working',await unsupported.getByRole('checkbox',{name:'Claude Code',exact:true}).isChecked());
 await unsupported.close();
 const ctx=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844},reducedMotion:'reduce'});
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
 check('No errors in the unsupported-browser fallback',errors.length===0);
 console.log(`${checks.length} design behavior checks passed`);
} finally {await browser.close();}
