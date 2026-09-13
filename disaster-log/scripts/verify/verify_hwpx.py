import os, sys, time, zipfile, re
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3100"
OUT = os.path.dirname(os.path.abspath(__file__))
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1500, "height": 900}, accept_downloads=True)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(BASE + "/")
    page.wait_for_selector("text=부산 풍수해 Seed 불러오기", timeout=20000)
    page.click("button:has-text('부산 풍수해 Seed 불러오기')")
    page.wait_for_url("**/situations/**", timeout=20000)
    time.sleep(1)
    sid = page.url.split("/situations/")[1].split("?")[0]
    # 플로우 뷰 확인 (focus zoom)
    page.goto(f"{BASE}/situations/{sid}?tab=run")
    page.wait_for_selector("text=기준 SOP", timeout=15000)
    if page.locator("text=SOP 실행이 시작되었습니다").count(): page.click("button:has-text('확인 · 첫 조치로')")
    page.click("text=플로우")
    time.sleep(1.5)
    vp = page.evaluate("() => { const v = document.querySelector('.react-flow__viewport'); return v ? v.style.transform : null }")
    box = page.locator(".react-flow").first.bounding_box()
    print("[flow] transform:", vp, "canvas h:", box and box["height"])
    page.screenshot(path=os.path.join(OUT, "shot4_run_flow_focus.png"))
    # 조치 완료 → 다음 노드로 이동하는지 (현재 노드 클릭 후 완료)
    if page.locator("button:has-text('완료')").count():
        page.locator("button:has-text('완료')").first.click()
        time.sleep(0.5)
        if page.locator("text=조치결과 없이 완료할까요").count(): page.click("button:has-text('결과 없이 완료')")
        time.sleep(1.2)
        vp2 = page.evaluate("() => document.querySelector('.react-flow__viewport').style.transform")
        print("[flow] after complete:", vp2, "moved:", vp2 != vp)
        page.screenshot(path=os.path.join(OUT, "shot4_run_flow_next.png"))
    # 결과보고 HWPX 내보내기
    page.goto(f"{BASE}/situations/{sid}?tab=report")
    page.wait_for_selector("text=결과보고", timeout=15000)
    time.sleep(0.8)
    btn = page.locator("button:has-text('HWPX')").first
    with page.expect_download(timeout=30000) as dl:
        btn.click()
    path = os.path.join(OUT, "sample_v2.hwpx"); dl.value.save_as(path)
    z = zipfile.ZipFile(path)
    print("[hwpx] entries:", z.namelist()[:3], "mimetype stored:", z.getinfo("mimetype").compress_type == 0)
    h = z.read("Contents/header.xml").decode("utf-8")
    ids = re.findall(r'<hh:charPr id="(\d+)"', h); pids = re.findall(r'<hh:paraPr id="(\d+)"', h)
    print("[hwpx] charPr order:", ids)
    print("[hwpx] paraPr order:", pids)
    print("[hwpx] counts:", re.search(r'charProperties itemCnt="(\d+)"', h).group(1), re.search(r'paraProperties itemCnt="(\d+)"', h).group(1))
    for pid in ("22", "23", "24"):
        m = re.search(rf'<hh:paraPr id="{pid}".*?</hh:paraPr>', h, re.S)
        print(f"[hwpx] paraPr {pid}:", re.findall(r'<hc:(intent|left) value="(-?\d+)"', m.group(0))[:2])
    sec = z.read("Contents/section0.xml").decode("utf-8")
    ps = re.findall(r'<hp:p [^>]*paraPrIDRef="(\d+)"[^>]*>(.*?)</hp:p>', sec, re.S)
    for pid, body in ps[:14]:
        runs = re.findall(r'charPrIDRef="(\d+)"', body); txt = "".join(re.findall(r'<hp:t>(.*?)</hp:t>', body))[:50]
        print(f"  p{pid} cp={runs[:3]} {txt}")
    # XML well-formed
    import xml.dom.minidom
    xml.dom.minidom.parseString(sec.encode("utf-8")); xml.dom.minidom.parseString(h.encode("utf-8"))
    print("[hwpx] xml ok, errors:", errs)
    b.close()
print("ALL OK")
