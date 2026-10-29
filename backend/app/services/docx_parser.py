"""DOCX ayrıştırması: file_service'in her DOCX için başlattığı alt süreçte çalışır (D-060).

Bu modül yalnız python-docx'e bağlıdır: alt süreç app.settings'i ve diğer ağır bağımlılıkları yüklemez.
"""

import io

import docx
from docx.text.paragraph import Paragraph


def parse_docx(content: bytes) -> str:
    """Paragraflar ve tablo hücreleri belge sırasıyla alınır; header/footer, textbox vb. V1 dışında."""
    _prefer_oom_kill()
    document = docx.Document(io.BytesIO(content))
    parts = []
    for block in document.iter_inner_content():
        if isinstance(block, Paragraph):
            parts.append(block.text)
            continue
        seen_cells = set()
        for row in block.rows:
            for cell in row.cells:
                # Birleştirilmiş hücreler row.cells içinde tekrar döner; aynı <w:tc> yalnızca bir kez alınır.
                if cell._tc in seen_cells:
                    continue
                seen_cells.add(cell._tc)
                parts.append(cell.text)
    return "\n".join(parts)


def _prefer_oom_kill() -> None:
    """Container bellek sınırında çekirdek API süreci yerine bu alt süreci öldürsün (D-060). Linux dışında atlanır."""
    try:
        with open("/proc/self/oom_score_adj", "w") as f:
            f.write("1000")
    except OSError:
        pass
