"""Optional independent PDF inspection, run with Python + pypdf after the
Electron review-artifact capture. No application/runtime Python dependency."""
from pathlib import Path
from pypdf import PdfReader

root = Path(__file__).resolve().parents[1] / "docs" / "debriefing-pdf"
names = {
    "sample-certificate": "Alex Morgan — Synthetic Learner",
    "long-name": ("Alexandre María Johnson " * 9)[:200],
    "international": "José Gonçalves — Zoë Müller / 李明",
    "hostile": 'Synthetic <img src="https://invalid.test/x" onerror="alert(1)"> & "Learner"',
}
for stem, name in names.items():
    reader = PdfReader(root / (stem + ".pdf"))
    assert len(reader.pages) == 1, stem
    page = reader.pages[0]
    text = " ".join(page.extract_text().split())
    assert " ".join(name.split()) in text, (stem, "learner text")
    for expected in ["CERTIFICATE OF COMPLETION", "Working at Height Learning Track",
                     "NR-35 Weather and Safety Focus", "INTERMEDIATE",
                     "Completion date: 10/18/2026", "Additional review is recommended"]:
        assert expected in text, (stem, expected)
    assert not reader.trailer["/Root"].get("/JavaScript")
    assert page.mediabox.width > page.mediabox.height
    print(f"PASS independent PDF inspection: {stem}: one page; searchable Unicode text, identity, readiness, date and qualification verified")
