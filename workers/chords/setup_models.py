"""Install pinned BTC assets and the published Beat This! small0 checkpoint."""
import argparse
from pathlib import Path
from urllib.request import urlopen
from model_integrity import MODEL_SHA256, verify_model

BTC_REVISION = "2682317be668032e6e4b269ded36adaa2ad57df0"
BTC_FILES = (
    "LICENSE", "btc_model.py", "utils/transformer_modules.py", "utils/hparams.py",
    "test/btc_model_large_voca.pt",
)
BEAT_THIS_SMALL0_URL = (
    "https://cloud.cp.jku.at/public.php/dav/files/7ik4RrBKTS273gp/small0.ckpt"
)


def install_btc(destination: Path) -> None:
    for relative in BTC_FILES:
        target = destination / "btc" / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        url = f"https://raw.githubusercontent.com/jayg996/BTC-ISMIR19/{BTC_REVISION}/{relative}"
        with urlopen(url, timeout=120) as response:
            target.write_bytes(response.read())
    verify_model(
        destination / "btc/test/btc_model_large_voca.pt",
        MODEL_SHA256["btc/test/btc_model_large_voca.pt"],
    )
    # Upstream predates numpy 2; this alias has the same float64 semantics.
    module = destination / "btc/utils/transformer_modules.py"
    module.write_text(module.read_text().replace("np.float)", "float)"), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", type=Path, default=Path(__file__).parent / "models")
    parser.add_argument("--btc-only", action="store_true")
    args = parser.parse_args()
    args.models.mkdir(parents=True, exist_ok=True)
    install_btc(args.models)
    if not args.btc_only:
        target = args.models / "beat-small0.ckpt"
        with urlopen(BEAT_THIS_SMALL0_URL, timeout=120) as response:
            target.write_bytes(response.read())
        verify_model(target, MODEL_SHA256["beat-small0.ckpt"])


if __name__ == "__main__":
    main()
