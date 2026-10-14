const {chromium}=require('playwright');
const fs=require('fs'); const {execFileSync}=require('child_process');
(async()=>{
execFileSync('node',['tests/trading.mjs'],{env:{...process.env,BETTERINV_UI_FIXTURE:require('path').join(require('os').tmpdir(),'betterinv-trade-fixture.html')}});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE || undefined}); const page=await browser.newPage({viewport:{width:1280,height:900}});
const css=fs.readFileSync('styles/style.css','utf8');
await page.setContent(`<style>body{margin:20px;background:#45404a}.window-app{display:flex;flex-direction:column;width:900px}.window-header{padding:10px}.dialog-content{flex:1}.dialog-buttons{flex:1}</style><style>${css}</style><div class="app window-app dialog betterinv-trade-window"><header class="window-header">Handel · Gegenstände & Münzen</header><div class="window-content"><div class="dialog-content">${fs.readFileSync(require('path').join(require('os').tmpdir(),'betterinv-trade-fixture.html'),'utf8')}</div><div class="dialog-buttons"></div></div></div>`);
const checks=await page.evaluate(()=>({inputs:[...document.querySelectorAll('[data-trade-coin]')].map(e=>e.getBoundingClientRect().width),emptyButtons:getComputedStyle(document.querySelector('.dialog-buttons')).display,slot:document.querySelector('.is-filled').getBoundingClientRect().toJSON(),window:document.querySelector('.window-app').getBoundingClientRect().toJSON(),overflow:document.querySelector('.betterinv-trade').scrollWidth>document.querySelector('.betterinv-trade').clientWidth}));
if(checks.inputs.some(w=>w<40)||checks.emptyButtons!=='none'||checks.overflow) throw Error(JSON.stringify(checks));
await page.screenshot({path:require('path').join(require('os').tmpdir(),'betterinv-trade-ui.png')});
await page.setViewportSize({width:600,height:850});
const narrow=await page.evaluate(()=>({cols:getComputedStyle(document.querySelector('.betterinv-trade-sides')).gridTemplateColumns,overflow:document.documentElement.scrollWidth>innerWidth}));
if(narrow.overflow) throw Error('Narrow overflow');
console.log(JSON.stringify({checks,narrow})); await browser.close();
})();
