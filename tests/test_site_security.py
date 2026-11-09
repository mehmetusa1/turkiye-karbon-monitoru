"""Frontend güvenlik ağı: XSS'e açık API'ler, gevşek CSP ve bütünlüksüz dış script yasak."""

import re
from pathlib import Path

import pytest

SITE = Path(__file__).resolve().parents[1] / "site"
JS_FILES = sorted((SITE / "js").rglob("*.js"))
INDEX = (SITE / "index.html").read_text(encoding="utf-8")

EXPECTED_CSP = (
    "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js; "
    "style-src 'self'; "
    "font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; "
    "base-uri 'self'; form-action 'none'"
)

FORBIDDEN = {
    "innerHTML": r"\binnerHTML\b",
    "outerHTML": r"\bouterHTML\b",
    "insertAdjacentHTML": r"\binsertAdjacentHTML\b",
    "document.write": r"\bdocument\.write(ln)?\s*\(",
    "eval": r"(?<![\w.])eval\s*\(",
    "new Function": r"\bnew\s+Function\s*\(",
    "string timer": r"\bset(Timeout|Interval)\s*\(\s*['\"`]",
    "javascript: url": r"javascript:",
    "createContextualFragment": r"\bcreateContextualFragment\b",
}


def test_js_modules_exist():
    assert JS_FILES, "site/js altında modül bulunamadı"


@pytest.mark.parametrize("path", JS_FILES, ids=lambda p: p.name)
def test_js_has_no_dangerous_sinks(path):
    text = path.read_text(encoding="utf-8")
    for name, pattern in FORBIDDEN.items():
        assert not re.search(pattern, text), f"{path.name}: {name}"


def test_csp_is_strict_and_exact():
    m = re.search(r'http-equiv="Content-Security-Policy"\s+content="([^"]+)"', INDEX)
    assert m, "CSP meta etiketi yok"
    assert m.group(1) == EXPECTED_CSP


def test_no_inline_styles_or_scripts():
    assert 'style="' not in INDEX
    assert "<style" not in INDEX
    for tag in re.findall(r"<script\b[^>]*>", INDEX):
        assert "src=" in tag, f"inline script: {tag}"
    assert not re.search(r"\son[a-z]+\s*=", INDEX), "inline olay işleyicisi (onclick=...)"


def test_external_scripts_have_integrity():
    for tag in re.findall(r"<script\b[^>]*>", INDEX):
        if re.search(r'src="https?://', tag):
            assert "integrity=" in tag and 'crossorigin="anonymous"' in tag, tag


def test_blank_targets_have_noopener():
    for tag in re.findall(r"<a\b[^>]*>", INDEX):
        if 'target="_blank"' in tag:
            assert "noopener" in tag, tag


def test_referrer_policy():
    assert '<meta name="referrer" content="strict-origin-when-cross-origin">' in INDEX


def test_panel_summary_is_not_a_live_region():
    # Saat oynatılırken her 700 ms'de ekran okuyucuya duyuru yağmasın
    m = re.search(r'<section class="panel-now"[^>]*>', INDEX)
    assert m and "aria-live" not in m.group(0)


def test_intro_skip_button_not_inside_aria_hidden():
    m = re.search(r'<div id="intro"[^>]*>', INDEX)
    assert m and "aria-hidden" not in m.group(0)
