import json, os, sys, time
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3100"
OUT = os.path.dirname(os.path.abspath(__file__))
errors = []

def shot(page, name):
    page.screenshot(path=os.path.join(OUT, f"shot_{name}.png"), full_page=False)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1500, "height": 900}, accept_downloads=True)
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))

    # ── 1. 시연모드 전체 진행 ──
    page.goto(BASE + "/")
    page.wait_for_selector("text=시연모드", timeout=20000)
    page.click("button:has-text('시연모드')")
    page.wait_for_selector("text=시연 시작 · 대시보드", timeout=10000)
    print("[demo] step 1 shown")
    titles = []
    for i in range(13):
        prev = page.locator("div.typo-body-lg.font-bold").first.inner_text()
        page.click("button:has-text('다음')")
        t = prev
        for _ in range(60):
            time.sleep(0.4)
            t = page.locator("div.typo-body-lg.font-bold").first.inner_text()
            if t != prev and page.locator("button:has-text('다음') >> .animate-spin").count() == 0:
                break
        time.sleep(0.8)
        titles.append(t)
        url = page.url
        print(f"[demo] step {i+2}: {t} → {url.replace(BASE,'')}")
        if "실행본 확정" in t:
            # 시작 안내창 확인
            assert page.locator("text=SOP 실행이 시작되었습니다").count() > 0, "start notice missing"
            shot(page, "run_start_notice")
            page.click("button:has-text('확인 · 첫 조치로')")
            time.sleep(0.5)
            # 플로우 뷰 렌더 확인
            page.click("text=플로우")
            time.sleep(1.2)
            n = page.locator(".react-flow__node").count()
            print("[run] flow nodes rendered:", n)
            assert n > 0, "flow nodes not rendered"
            shot(page, "run_flow")
            page.click("text=목록")
        if "세부행동 체크" in t:
            time.sleep(0.5)
            cnt = page.locator("text=/세부행동 \\d+\\/\\d+/").count()
            print("[run] detail check labels:", cnt)
            shot(page, "run_checks")
        if t.startswith("실행 완료"):
            assert page.locator("text=SOP 실행이 완료되었습니다").count() > 0, "finish notice missing"
            shot(page, "run_finish_notice")
            page.click("button:has-text('닫기')")
        if "상황일지" in t:
            time.sleep(4)
            shot(page, "log")
        if "결과보고서" in t:
            time.sleep(4)
            shot(page, "report")
    assert page.locator("text=시연 종료").count() > 0
    shot(page, "demo_end")
    # 접기
    page.click("[aria-label='접기']")
    time.sleep(0.3)
    assert page.locator("text=/시연 \\d+\\/\\d+/").count() > 0
    page.click("[aria-label='펼치기']")
    page.click("button:has-text('시연 종료')")
    time.sleep(0.5)

    # ── 2. 도움말 툴팁 (상황 변화 대응) ──
    sid = None
    st = page.evaluate("() => JSON.parse(localStorage.getItem('disaster-log-store-v1'))")
    sid = st["state"]["order"][0]
    page.goto(f"{BASE}/situations/{sid}?tab=run")
    page.wait_for_selector("text=상황 변화 대응", timeout=15000)
    if page.locator("text=SOP 실행이 완료되었습니다").count() > 0:
        print("[run] finish notice shown on re-entry (recent) — closing")
        page.click("button:has-text('닫기')")
        time.sleep(0.4)
    page.hover("text=상황 변화 대응 >> xpath=..//span[@aria-label='도움말']")
    time.sleep(0.6)
    assert page.locator("text=상황 변화 대응이란?").count() > 0, "help tooltip missing"
    shot(page, "help_tooltip")
    print("[help] tooltip ok")

    # ── 3. SOP 편집 패널 접기/폭 조절 ──
    page.goto(f"{BASE}/situations/{sid}?tab=sop")
    page.wait_for_selector("[aria-label='속성 패널 숨기기']", timeout=15000)
    aside = page.locator("aside[style*='width']").first
    w0 = aside.evaluate("e => e.getBoundingClientRect().width")
    handle = page.locator("[aria-label='패널 폭 조절']").first
    box = handle.bounding_box()
    page.mouse.move(box["x"] + 4, box["y"] + 200)
    page.mouse.down()
    page.mouse.move(box["x"] - 120, box["y"] + 200, steps=8)
    page.mouse.up()
    time.sleep(0.3)
    w1 = aside.evaluate("e => e.getBoundingClientRect().width")
    print(f"[panel] width {w0} → {w1}")
    assert w1 > w0 + 60, "resize failed"
    shot(page, "sop_panel_wide")
    page.click("[aria-label='속성 패널 숨기기']")
    time.sleep(0.3)
    assert page.locator("aside[style*='width']").count() == 0
    assert page.locator("text=속성 패널 열기").count() > 0
    shot(page, "sop_panel_hidden")
    page.click("text=속성 패널 열기")
    time.sleep(0.3)
    assert page.locator("aside[style*='width']").count() == 1
    print("[panel] hide/show ok")
    # 라이브러리 편집기에서도
    tid = page.evaluate("() => JSON.parse(localStorage.getItem('disaster-log-store-v1')).state.templateOrder[0]")
    page.goto(f"{BASE}/sops/{tid}")
    page.wait_for_selector("[aria-label='속성 패널 숨기기']", timeout=15000)
    page.click("[aria-label='속성 패널 숨기기']")
    time.sleep(0.3)
    assert page.locator("text=속성 패널 열기").count() > 0
    page.click("text=속성 패널 열기")
    print("[panel] library editor ok")

    # ── 4. 조직·연락처: 양식 다운로드 → 업로드 미리보기 → 가져오기 ──
    page.goto(f"{BASE}/settings/org")
    page.wait_for_selector("text=조직·연락처 관리", timeout=15000)
    with page.expect_download() as dl:
        page.click("button:has-text('엑셀 양식 다운로드')")
    path = os.path.join(OUT, "template.xlsx")
    dl.value.save_as(path)
    print("[org] template downloaded", os.path.getsize(path), "bytes")
    page.set_input_files("input[type=file]", path)
    page.wait_for_selector("text=엑셀 일괄 업로드 미리보기", timeout=10000)
    shot(page, "org_preview")
    before = page.evaluate("() => JSON.parse(localStorage.getItem('disaster-log-store-v1')).state.contacts.length")
    page.click("button:has-text('명 가져오기')")
    time.sleep(0.5)
    after = page.evaluate("() => JSON.parse(localStorage.getItem('disaster-log-store-v1')).state.contacts.length")
    print(f"[org] contacts {before} → {after}")
    assert after >= before + 3
    shot(page, "org_list")
    # 개별 등록
    page.click("button:has-text('개별 등록')")
    page.fill("input[placeholder='재난안전상황실']", "테스트과")
    page.fill("input[placeholder='홍길동']", "테스트")
    page.fill("input[placeholder='010-0000-0000']", "01012345678")
    page.locator("div.fixed.inset-0 button", has_text="등록").last.click()
    time.sleep(0.4)
    assert page.locator("text=010-1234-5678").count() > 0, "phone normalize failed"
    print("[org] add ok")

    # ── 5. SMS 모달 연락처 선택 ──
    page.goto(f"{BASE}/situations/{sid}?tab=run")
    page.wait_for_selector("text=기준 SOP", timeout=15000)
    if page.locator("text=SOP 실행이 완료되었습니다").count() > 0:
        page.click("button:has-text('닫기')"); time.sleep(0.4)
    page.locator("button:has-text('프로세스')").first.click()
    time.sleep(0.3)
    page.click("button:has-text('SMS 발송')")
    page.wait_for_selector("text=조직·연락처에서 선택", timeout=5000)
    page.locator("label:has-text('산림녹지과')").first.click()
    page.click("button:has-text('수신대상에 추가')")
    time.sleep(0.3)
    shot(page, "sms_contacts")
    print("[sms] contact picker ok")

    real = [e for e in errors if "favicon" not in e and "hydrat" not in e.lower()]
    print("console errors:", len(real))
    for e in real[:10]:
        print("  ", e[:300])
    b.close()
print("ALL OK")
