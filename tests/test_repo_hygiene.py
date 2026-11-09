"""Gizli dosyaların repoya girmesini engelleyen .gitignore kurallarını korur."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _ignore_rules() -> set[str]:
    text = (ROOT / ".gitignore").read_text(encoding="utf-8")
    return {line.strip() for line in text.splitlines() if line.strip() and not line.startswith("#")}


def test_env_files_are_ignored():
    rules = _ignore_rules()
    assert ".env" in rules
    assert "!.env.example" in rules


def test_eptr2_session_cache_is_ignored():
    # eptr2, EPİAŞ oturum anahtarını (TGT) proje kökünde .eptr2-tgt dosyasına yazar.
    assert ".eptr2-tgt" in _ignore_rules()


def test_workflow_actions_are_pinned_to_commit_sha():
    # Etiketler (v4 gibi) sonradan başka koda taşınabilir; yalnızca 40 haneli SHA kabul edilir.
    import re

    for wf in (ROOT / ".github" / "workflows").glob("*.yml"):
        for line in wf.read_text(encoding="utf-8").splitlines():
            m = re.search(r"uses:\s*(\S+)", line)
            if m and not m.group(1).startswith("./"):
                assert re.fullmatch(r"[\w.-]+/[\w./-]+@[0-9a-f]{40}", m.group(1)), f"{wf.name}: {m.group(1)}"


def test_env_example_has_no_real_values():
    for line in (ROOT / ".env.example").read_text(encoding="utf-8").splitlines():
        if line.startswith("EPTR_"):
            assert line.split("=", 1)[1].strip() == "", f"örnek dosyada değer var: {line.split('=')[0]}"
