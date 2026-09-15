"""Reproducible browser checks. Requires Playwright, not needed to USE the tool.

Default: --mode http (local server + real browser storage).
--mode content: in-memory HTML and an explicitly emulated Storage API. Useful in
managed environments that block file:/localhost navigation. This mode verifies
serialization/restoration logic, NOT native disk persistence or file: behavior.
"""
import argparse, json, os, sys, tempfile
from pathlib import Path
from functools import partial
from threading import Thread
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--mode',choices=['http','content'],default='http')
parser.add_argument('--chromium',default=os.environ.get('CHROMIUM_PATH'))
args=parser.parse_args()
OUT=ROOT/'evidence';OUT.mkdir(exist_ok=True)
HTML=(ROOT/'index.html').read_text(encoding='utf-8');KEY='catadioptric-lab:session:v1'
results=[];page_errors=[];server=None

def check(name, condition, detail=None):
    results.append({'name':name,'pass':bool(condition),'detail':detail})
    if not condition: raise AssertionError(name+': '+str(detail))

def group(name,fn):
    try:fn()
    except Exception as error:
        results.append({'name':name+' completed','pass':False,'detail':str(error)})
        print('FAIL',name,str(error)[:250],flush=True)
    else: print('PASS',name,flush=True)

if args.mode=='http':
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self,*a):pass
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
    Thread(target=server.serve_forever,daemon=True).start()
    URL=f'http://127.0.0.1:{server.server_port}/index.html'

with sync_playwright() as p:
    options={'headless':True}
    if args.chromium: options['executable_path']=args.chromium
    browser=p.chromium.launch(**options)
    contexts=[]
    def mount(width=1440,height=1000,seed=None,storage='ok'):
        context=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=1,accept_downloads=True)
        contexts.append(context);page=context.new_page();page.set_default_timeout(4000)
        page.on('pageerror',lambda e:page_errors.append(str(e)))
        if args.mode=='content' or storage!='ok':
            script='''(d)=>{const backing={...d.seed};const storage={getItem(k){return backing[k]??null},setItem(k,v){if(d.mode==='quota')throw new DOMException('test quota','QuotaExceededError');backing[k]=String(v)},removeItem(k){delete backing[k]}};Object.defineProperty(window,'localStorage',{configurable:true,get(){if(d.mode==='blocked')throw new DOMException('test denied','SecurityError');return storage}})}'''
            setup={'seed':seed or {},'mode':storage}
            if args.mode=='content':page.evaluate(script,setup)
            else:page.add_init_script('('+script+')('+json.dumps(setup)+')')
        elif seed:
            page.add_init_script('for(const [k,v] of Object.entries('+json.dumps(seed)+'))localStorage.setItem(k,v)')
        if args.mode=='content':page.set_content(HTML)
        else:page.goto(URL)
        page.wait_for_function("window.CatadioptricLab?.version === '7.0.0'")
        page.wait_for_timeout(80)
        return page
    def js(page,s):return page.evaluate(s)
    def get_state(page):return js(page,'CatadioptricLab.getState()')
    def history(page):return js(page,'CatadioptricLab.getHistory()')
    def record(page):return page.evaluate('(k)=>localStorage.getItem(k)',KEY)
    def shot(page,name):
        page.evaluate('window.scrollTo(0,0)');page.wait_for_timeout(120)
        # Let status overlays finish so they do not obscure the release preview.
        page.evaluate("document.getElementById('toast').classList.remove('show')")
        page.wait_for_timeout(240)
        page.screenshot(path=str(OUT/name),full_page=True)

    def layout():
        page=mount()
        for width in [1440,990,720,390,360]:
            page.set_viewport_size({'width':width,'height':1000 if width>720 else 844})
            for dest in ['design','camera','panorama','assembly','formulas','files']:
                page.evaluate('(s)=>CatadioptricLab.navigate(s)',dest);page.wait_for_timeout(80)
                metric=js(page,"""({inner:innerWidth,scroll:document.documentElement.scrollWidth,bad:[...document.querySelectorAll('.nav-button,.history-button,.spec-primary,.stage-toolbar')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left < -1) }).map(e=>e.className)})""")
                check(f'{width}px {dest}: no horizontal page/control overflow',metric['scroll']<=width and not metric['bad'],metric)
                small=js(page,"""[...document.querySelectorAll('.scene-visual text[data-min-css]')].filter(e=>{let m=e.getScreenCTM(),r=e.getBoundingClientRect();return r.width>0&&m&&parseFloat(getComputedStyle(e).fontSize)*Math.hypot(m.a,m.b)+.15<+e.dataset.minCss}).map(e=>e.textContent)""")
                check(f'{width}px {dest}: SVG labels keep their minimum screen size',not small,small)
                if width==1440 and dest=='design':shot(page,'desktop_1440.png')
                if width==990 and dest=='design':shot(page,'desktop_990.png')
                if width==390 and dest=='design':shot(page,'mobile_390.png')
        page.set_viewport_size({'width':990,'height':700});js(page,"CatadioptricLab.navigate('design')");page.click('#formulaLink');page.wait_for_timeout(80)
        check('short viewport formula does not trap a tall sticky stage',js(page,"getComputedStyle(document.getElementById('stage')).position")=='relative')
        page.close()
    group('responsive layout and readable diagrams',layout)

    def gestures():
        page=mount();old=js(page,'CatadioptricLab.getResult().diameter');frame=js(page,'CatadioptricLab.getView().frames')
        page.evaluate("""()=>{const el=document.querySelector('[data-slider="scale"]');el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));for(const v of [.9,.8,.7,.6,.5]){el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));}}""")
        page.wait_for_timeout(100)
        check('diagram updates before slider release',abs(js(page,'CatadioptricLab.getResult().diameter')-old/2)<1e-8 and js(page,'CatadioptricLab.getView().frames')>frame)
        check('unfinished drag does not create repeated undo steps',history(page)['undo']==0 and history(page)['pending'])
        page.evaluate("document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))")
        check('one drag commits one step',history(page)['undo']==1)
        page.click('#historyUndo');check('undo restores size and ring',get_state(page)['scale']==1)
        page.click('#historyRedo');check('redo restores changed size',get_state(page)['scale']==.5)
        page.click('#historyUndo');page.locator('[data-input="f"]').fill('6.4');page.locator('[data-input="f"]').press('Tab')
        page.wait_for_timeout(80);check('new edit discards redo branch',history(page)['redo']==0 and get_state(page)['f']==6.4)
        page.click('#formulaLink');check('corresponding formula opens without page navigation',js(page,'CatadioptricLab.getView().page')=='design' and page.locator('#inlineFormula').is_visible())
        txt=page.locator('[data-inline-live]').inner_text();page.locator('[data-input="f"]').fill('7');page.locator('[data-input="f"]').press('Tab');page.wait_for_timeout(80)
        check('inline formula substitutes live changed values',page.locator('[data-inline-live]').inner_text()!=txt)
        shot(page,'inline_formula.png')
        page.click('#closeInlineFormula');check('formula can be closed',not page.locator('#inlineFormula').is_visible())
        page.click('#pinQuick');check('baseline action is visible and pins current design',js(page,'CatadioptricLab.getView().pinned') is True)
        page.click('#historyUndo');check('baseline pin can be undone',js(page,'CatadioptricLab.getView().pinned') is False)
        js(page,"CatadioptricLab.navigate('camera')");page.keyboard.press('Control+z');page.wait_for_timeout(50)
        check('cross-page keyboard undo works without changing page',js(page,'CatadioptricLab.getView().page')=='camera' and get_state(page)['f']==6.4)
        page.keyboard.press('Control+Shift+z');check('keyboard redo works',get_state(page)['f']==7)
        page.click('#fitView');page.wait_for_timeout(80);before=js(page,'CatadioptricLab.getView().sensorZoom')
        page.click('#resetView');page.click('#historyUndo');check('view reset is undoable',abs(js(page,'CatadioptricLab.getView().sensorZoom')-before)<1e-12)
        page.click('#reset');check('full reset restores numeric default',get_state(page)['f']==4.8);page.click('#historyUndo');check('full reset preserves recoverability',get_state(page)['f']==7)
        page.close()
    group('live interaction, undo/redo, formulas and baseline',gestures)

    def specs():
        page=mount();js(page,"CatadioptricLab.navigate('camera')")
        start=get_state(page);page.click('[data-camera-preset="OS04A10"]')
        check('extraction alone does not change current design',get_state(page)==start)
        check('source status is visible',page.locator('#origin-f').is_visible() and '原文提取' in page.locator('#origin-f').inner_text())
        page.click('#specApply');check('preset applies all four fields',all(get_state(page)[k]==v for k,v in dict(nx=2688,ny=1520,pitch=2.9,f=4.9).items()))
        check('preset application is one undo step',history(page)['undo']==1)
        check('original exposure metadata not silently corrected',js(page,'CatadioptricLab.getCameraProfile().metadata.exposure')=='45s')
        page.click('#historyUndo');check('undo restores parameters AND source record',get_state(page)==start and js(page,'CatadioptricLab.getCameraProfile()') is None)
        page.click('#historyRedo');check('redo restores source record',js(page,'CatadioptricLab.getCameraProfile().model')=='OS04A10')
        page.locator('#specText').fill('Resolution: 2688x1520, 1920x1080\nPixel pitch: 2.9um\nFocal length: 2.8–12mm');page.click('#specExtract')
        check('ambiguous specification disables Apply',page.locator('#specApply').is_disabled() and page.locator('#spec-f').input_value()=='' and page.locator('#spec-nx').input_value()=='')
        check('resolution choice starts empty',page.locator('[data-spec-choice]').input_value()=='')
        shot(page,'camera_ambiguity_1440.png')
        page.locator('[data-spec-choice]').select_option('1');page.locator('#spec-f').fill('4.9')
        check('manual focal confirmation is labeled',page.locator('#origin-f').inner_text()=='手动确认')
        page.click('#specApply');check('chosen resolution, not first listed resolution, is applied',get_state(page)['nx']==1920 and get_state(page)['ny']==1080)
        check('ambiguity evidence stays with applied source',len(js(page,'CatadioptricLab.getCameraProfile().reviewIssues'))==2)
        page.locator('#specText').fill('型号：<img src=x onerror="window.xss=1">\n分辨率：1920x1080\n像素间距：2.9um\n镜头焦距：4.9mm');page.click('#specExtract');page.click('#specApply')
        check('source text is escaped, not interpreted as markup',js(page,'window.xss === undefined') and page.locator('#specCurrent img').count()==0)
        page.locator('#specText').fill('型号：只有名字');check('editing source invalidates previously extracted fields',page.locator('#specApply').is_disabled());page.click('#specExtract');check('missing fields do not borrow prior camera values',page.locator('#spec-f').input_value()=='' and page.locator('#spec-pitch').input_value()=='')
        page.set_viewport_size({'width':390,'height':844});page.locator('#specText').fill('Resolution: 2688x1520, 1920x1080\nPixel pitch: 2.9um\nFocal length: 2.8–12mm');page.click('#specExtract');shot(page,'camera_ambiguity_390.png')
        check('ambiguous source view has no mobile overflow',js(page,'document.documentElement.scrollWidth')<=390)
        page.close()
    group('specification extraction and explicit confirmation',specs)

    def invalids_and_files():
        page=mount();js(page,"CatadioptricLab.navigate('panorama');CatadioptricLab.setState({panoWidth:-5})")
        check('invalid full-width input cannot produce a successful result',not js(page,'CatadioptricLab.getResult().ok'))
        check('diagnostic names the field and exposes correction entry',page.locator('#warning [data-jump="panoWidth"]').count()==1)
        page.click('#historyUndo');check('invalid temporary edit can be undone',js(page,'CatadioptricLab.getResult().ok'))
        js(page,"CatadioptricLab.navigate('files')")
        old={'schema':'catadioptric-lab-v1','uiVersion':'6','parameters':{**get_state(page),'f':6.1}}
        page.locator('#importFile').set_input_files({'name':'v6.json','mimeType':'application/json','buffer':json.dumps(old).encode()});page.wait_for_timeout(100)
        check('v6 JSON remains importable',get_state(page)['f']==6.1)
        good=get_state(page);n=history(page)['undo'];bad={**old,'parameters':{**good,'panoWidth':-5}}
        page.locator('#importFile').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':json.dumps(bad).encode()});page.wait_for_timeout(100)
        check('bad JSON is rejected atomically without history mutation',get_state(page)==good and history(page)['undo']==n)
        bad={'schema':'catadioptric-lab-v999','parameters':good};page.locator('#importFile').set_input_files({'name':'future.json','mimeType':'application/json','buffer':json.dumps(bad).encode()});page.wait_for_timeout(80)
        check('unknown schema does not replace current design',get_state(page)==good)
        for button,kind in [('exportJSON','json'),('exportCSV','csv'),('exportXYZ','xyz')]:
            with page.expect_download() as d:page.click('#'+button)
            content=Path(d.value.path()).read_text()
            if kind=='json':
                data=json.loads(content);check('export identifies v7 and preserves current parameter values',data['uiVersion']=='7.0.0' and data['parameters']==good)
            if kind=='csv':check('mapping CSV has 361 data rows and no NaN',len(content.strip().splitlines())==362 and 'NaN' not in content)
            if kind=='xyz':check('CAD profile has 401 finite XYZ triplets',len(content.strip().splitlines())==401 and all(len(l.split())==3 for l in content.strip().splitlines()) and 'NaN' not in content)
        page.close()
    group('invalid inputs, atomic imports and portable exports',invalids_and_files)

    def persistence():
        page=mount();js(page,"CatadioptricLab.setState({f:6.25})");page.wait_for_timeout(450);saved=record(page);data=json.loads(saved)
        check('committed parameters are serialized with a schema',data['schema']=='catadioptric-session-v1' and data['document']['state']['f']==6.25)
        check('source data are excluded by default',data['document']['cameraProfile'] is None and data['includeSource'] is False)
        js(page,"CatadioptricLab.setState({panoWidth:-5})");page.wait_for_timeout(450)
        check('invalid edit preserves last good persisted record',record(page)==saved)
        check('invalid edit has visible non-saving status','无效' in page.locator('#localStatus').inner_text())
        new=mount(seed={KEY:saved});check('reopening offers restore without autoapplying',new.locator('#recoveryBanner').is_visible() and get_state(new)['f']==4.8)
        js(new,"CatadioptricLab.setState({f:5.5})");new.wait_for_timeout(450);check('pending recovery is not overwritten by new edits',record(new)==saved)
        new.click('#recoverSession');new.wait_for_timeout(80);check('restore recovers the chosen design',get_state(new)['f']==6.25)
        new.click('#historyUndo');check('restore itself can be undone',get_state(new)['f']==5.5)
        new.click('#historyRedo');js(new,"CatadioptricLab.navigate('camera')");new.click('[data-camera-preset="OS04A10"]');new.click('#specApply');new.wait_for_timeout(450)
        check('default storage contains no applied camera name or raw text','OS04A10' not in record(new) and '最长曝光' not in record(new))
        js(new,"CatadioptricLab.navigate('files')");new.check('#localSourceConsent');new.wait_for_timeout(100)
        check('source record is persisted only after explicit opt-in','OS04A10' in record(new) and '最长曝光' in record(new))
        new.uncheck('#localSourceConsent');new.wait_for_timeout(100);check('opting out removes previously stored source text','OS04A10' not in record(new))
        new.evaluate("localStorage.setItem('unrelated','keep')");new.click('#clearSession');new.wait_for_timeout(450)
        check('clear removes only this tool record',record(new) is None and js(new,"localStorage.getItem('unrelated')")=='keep')
        new.evaluate("window.dispatchEvent(new Event('pagehide'))")
        check('closing immediately after Clear does not recreate the record',record(new) is None)
        js(new,"CatadioptricLab.setState({f:5})");new.wait_for_timeout(450);check('next genuine edit resumes local saving',json.loads(record(new))['document']['state']['f']==5)
        for seed_text in ['{broken','{"schema":"future-session"}','{"schema":"catadioptric-session-v1","document":{"state":[]}}']:
            corrupt=mount(seed={KEY:seed_text});check('corrupt/unknown session is not applied: '+seed_text[:30],corrupt.locator('#recoveryBanner').is_visible() and not corrupt.locator('#recoverSession').is_visible() and get_state(corrupt)['f']==4.8);corrupt.click('#discardSession');check('corrupt session can be explicitly cleared',record(corrupt) is None);corrupt.close()
        blocked=mount(storage='blocked');js(blocked,"CatadioptricLab.setState({f:6})");blocked.wait_for_timeout(450)
        check('denied storage falls back without breaking the app',js(blocked,'CatadioptricLab.getResult().ok') and '不可用' in blocked.locator('#localStatus').inner_text())
        quota=mount(storage='quota');js(quota,"CatadioptricLab.setState({f:6})");quota.wait_for_timeout(450)
        check('quota failure falls back to export with a visible notice','不可用' in quota.locator('#localStatus').inner_text() and js(quota,'CatadioptricLab.getResult().ok'))
        if args.mode=='http':
            real=mount();js(real,"CatadioptricLab.setState({f:6.7})");real.wait_for_timeout(450);real.reload();real.wait_for_timeout(100)
            check('real HTTP origin localStorage survives page reload',real.locator('#recoveryBanner').is_visible());real.click('#recoverSession');check('native reload recovers same focal length',get_state(real)['f']==6.7);real.close()
        page.close();new.close();blocked.close();quota.close()
    group('local recovery, privacy and storage failure handling',persistence)

    check('no uncaught page JavaScript errors',not page_errors,page_errors)
    for context in contexts:context.close()
    browser.close()
if server:server.shutdown()
report={'mode':args.mode,'storage_validation':'in-memory Storage API double; NOT native persistence evidence' if args.mode=='content' else 'native localStorage on a temporary HTTP origin, plus injected failure modes','results':results,'page_errors':page_errors}
(OUT/'browser_checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
passed=sum(r['pass'] for r in results);print(f'{passed}/{len(results)} browser assertions passed. Mode={args.mode}')
sys.exit(0 if passed==len(results) else 1)
