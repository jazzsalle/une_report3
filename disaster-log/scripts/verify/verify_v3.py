import os, sys, time, json
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3100"
OUT = os.path.dirname(os.path.abspath(__file__))
errors = []
def shot(page, name): page.screenshot(path=os.path.join(OUT, f"shot3_{name}.png"))
def next_step(page):
    prev = page.locator("div.typo-body-lg.font-bold").first.inner_text()
    page.click("button:has-text('다음')")
    t = prev
    for _ in range(80):
        time.sleep(0.4)
        t = page.locator("div.typo-body-lg.font-bold").first.inner_text()
        if t != prev and page.locator("button:has-text('다음') >> .animate-spin").count() == 0: break
    time.sleep(0.6)
    return t

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1500, "height": 900}, accept_downloads=True)
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))

    # ── 1. 조직·연락처: seed → 조직도/그룹 탭 ──
    page.goto(BASE + "/settings/org")
    page.wait_for_selector("text=조직·연락처 관리", timeout=20000)
    page.click("button:has-text('기본 조직·연락처 불러오기')")
    time.sleep(0.6)
    st = page.evaluate("() => JSON.parse(localStorage.getItem('disaster-log-store-v1')).state")
    print("[org] contacts", len(st["contacts"]), "groups", len(st["groups"]))
    assert len(st["contacts"]) >= 40 and len(st["groups"]) >= 4
    assert page.locator("text=재난상황관리반").count() > 0
    shot(page, "org_tree")
    page.locator("button", has_text="전송그룹 5").first.click()
    time.sleep(0.5)
    assert page.locator("text=13개 협업기능반 반장").count() > 0
    shot(page, "org_groups")
    # 그룹 편집 모달
    page.locator("button:has-text('편집')").first.click()
    page.wait_for_selector("text=전송그룹 편집")
    time.sleep(0.4)
    shot(page, "org_group_edit")
    page.click("button:has-text('취소')")
    # 양식 다운로드 → 업로드 (새 컬럼)
    with page.expect_download() as dl:
        page.click("button:has-text('엑셀 양식 다운로드')")
    path = os.path.join(OUT, "template3.xlsx"); dl.value.save_as(path)
    page.set_input_files("input[type=file]", path)
    page.wait_for_selector("text=엑셀 일괄 업로드 미리보기", timeout=10000)
    time.sleep(0.8)
    shot(page, "org_upload_preview")
    assert page.locator("text=유관기관").count() > 0
    page.click("button:has-text('명 가져오기')")
    time.sleep(0.4)
    print("[org] upload ok")

    # ── 2. 시연 15단계 ──
    page.goto(BASE + "/")
    page.wait_for_selector("text=시연모드", timeout=20000)
    page.click("button:has-text('시연모드')")
    page.wait_for_selector("text=시연 시작 · 대시보드", timeout=10000)
    total = int(page.locator("span.font-mono.opacity-80").first.inner_text().split("/")[1])
    print("[demo] total steps", total)
    for i in range(total - 1):
        t = next_step(page)
        print(f"[demo] {i+2}: {t}")
        if "실행본 확정" in t:
            page.click("button:has-text('확인 · 첫 조치로')")
        if t.startswith("상황전파 발송"):
            time.sleep(0.5); shot(page, "demo_dispatch")
        if t.startswith("현장 요원 응답"):
            time.sleep(0.5)
            assert page.locator("text=상황전파 응답 현황").count() > 0, "dispatch status missing"
            assert page.locator("text=/수신확인: /").count() > 0, "ack event missing"
            shot(page, "demo_ack")
        if t.startswith("실행 완료"):
            page.click("button:has-text('닫기')")
    sid = page.evaluate("() => JSON.parse(sessionStorage.getItem('disaster-log-demo-v1')).state.situationId")
    page.click("button:has-text('시연 종료')")
    time.sleep(0.4)

    # ── 3. 상황전파 발송 모달 → 모바일 링크 → 같은 브라우저 응답 반영 ──
    page.goto(f"{BASE}/situations/{sid}?tab=run")
    page.wait_for_selector("text=기준 SOP", timeout=15000)
    if page.locator("text=SOP 실행이 완료되었습니다").count(): page.click("button:has-text('닫기')")
    page.locator("button:has-text('프로세스')").nth(1).click()
    time.sleep(0.3)
    page.click("button:has-text('상황전파 발송')")
    page.wait_for_selector("text=모바일 페이지 미리보기", timeout=5000)
    time.sleep(0.6)
    shot(page, "dispatch_compose")
    # 추천 탭 or 조직도에서 선택
    if page.locator("text=조치 담당 추천").count():
        page.click("text=조치 담당 추천")
    page.click("text=조직도")
    time.sleep(0.3)
    page.locator("div.fixed.inset-0 button:has-text('그룹 선택'), div.fixed.inset-0 button:has-text('전체')").first.click()
    time.sleep(0.3)
    n_sel = page.locator("text=/\\d+명에게 발송/").count()
    assert n_sel > 0, "no recipients"
    page.click("button:has-text('명에게 발송')")
    page.wait_for_selector("text=모의 수신", timeout=15000)
    time.sleep(0.8)
    shot(page, "dispatch_sent")
    link = page.locator("a:has-text('모의 수신')").first.get_attribute("href")
    print("[dispatch] link", link[:80], "...")
    page.click("button:has-text('닫기')")
    time.sleep(0.3)
    # 모바일 페이지 (갤럭시 폭)
    m = b.new_context(viewport={"width": 390, "height": 800}, is_mobile=True, has_touch=True, user_agent="Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36")
    mp = m.new_page()
    mp.on("console", lambda mm: errors.append("M " + mm.text) if mm.type == "error" else None)
    mp.goto(link)
    mp.wait_for_selector("text=① 수신확인", timeout=15000)
    shot(mp, "mobile_1")
    mp.click("button:has-text('① 수신확인')")
    mp.wait_for_selector("text=수신확인 완료", timeout=10000)
    mp.click("button:has-text('② 임무완료')")
    mp.wait_for_selector("text=2. 임무완료", timeout=10000)
    mp.fill("textarea", "신안리 주민 32명 대피 완료(모의)")
    mp.click("button:has-text('조치사항 보내기')")
    mp.wait_for_selector("text=기록됨", timeout=10000)
    time.sleep(0.5)
    shot(mp, "mobile_done")
    # 상황실 화면 — 폴링(4s) 또는 storage 이벤트로 반영 (다른 context → 서버 폴링 경로)
    ok = False
    for _ in range(20):
        time.sleep(1)
        if page.locator("text=/현장 조치사항: /").count() > 0 and page.locator("text=/임무완료: /").count() > 0:
            ok = True; break
    print("[dispatch] ack reflected via server polling:", ok)
    assert ok, "acks not reflected"
    shot(page, "dispatch_reflected")
    # 상황일지/결과보고에 반영 확인
    page.goto(f"{BASE}/situations/{sid}?tab=report")
    page.wait_for_selector("text=결과보고", timeout=15000)
    time.sleep(0.5)

    real = [e for e in errors if "favicon" not in e and "hydrat" not in e.lower()]
    print("console errors:", len(real))
    for e in real[:10]: print("  ", e[:300])
    b.close()
print("ALL OK")
