import pytest

from app.settings import env_flag


@pytest.mark.parametrize(
    "value, expected",
    [(None, True), ("", True), ("true", True), (" TRUE ", True), ("false", False), ("False", False)],
)
def test_env_flag_reads_true_false_or_default(monkeypatch, value, expected):
    if value is None:
        monkeypatch.delenv("OCR_ENABLED", raising=False)
    else:
        monkeypatch.setenv("OCR_ENABLED", value)

    assert env_flag("OCR_ENABLED", default=True) is expected


@pytest.mark.parametrize("value", ["0", "no", "flase", "off"])
def test_env_flag_rejects_unknown_value(monkeypatch, value):
    # Yazım hatası OCR'ı sessizce açık bırakmasın (D-055): fail fast.
    monkeypatch.setenv("OCR_ENABLED", value)

    with pytest.raises(RuntimeError, match="OCR_ENABLED"):
        env_flag("OCR_ENABLED", default=True)
