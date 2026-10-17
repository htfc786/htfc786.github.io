#!/usr/bin/env bash
# 打印冒烟测试：用无头 Chrome 把测试页打成 PDF，检查页数、页面方向、
# 卡片尺寸计算、自动缩字号、以及文字是否仍是矢量文本。
# 用法：bash tests/print.sh http://127.0.0.1:8787
set -euo pipefail

BASE="${1:-http://127.0.0.1:8787}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="${CHROME:-$(command -v google-chrome || command -v chromium || command -v chromium-browser)}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

chrome() {
  "$CHROME" --headless=new --disable-gpu --no-sandbox --disable-dev-shm-usage \
    --no-first-run --no-default-browser-check \
    --user-data-dir="$TMP/profile" --hide-scrollbars "$@"
}
dump() {
  chrome --virtual-time-budget=9000 --dump-dom "$1" 2>/dev/null
}
print_pdf() {
  chrome --virtual-time-budget=9000 --no-pdf-header-footer --print-to-pdf="$2" "$1" >/dev/null 2>&1
}
pages_of() { pdfinfo "$1" | awk '/^Pages/{print $2}'; }
size_of() { pdfinfo "$1" | awk '/^Page size/{print $3" x "$5}'; }

pass=0; fail=0
ok()   { echo "PASS  $1"; pass=$((pass+1)); }
bad()  { echo "FAIL  $1"; fail=$((fail+1)); }

# ---------- p4：横版 4×4，45 张 => 3 组双面 => 6 页 ----------
ASSERT4="$(dump "$BASE/tests/print.html?preset=p4&n=45" | grep -o 'preset=p4[^<]*' | head -1)"
if echo "$ASSERT4" | grep -q "sheets=6 perPage=16 card=74.25x52.50 text=59.25x52.50 overflow=0"; then
  ok "横版 4×4：45 张 / 每页 16 张 => 6 页；卡片 74.25×52.50mm；自动缩字号无溢出"
else
  bad "横版 4×4 计算不对：$ASSERT4"
fi

print_pdf "$BASE/tests/print.html?preset=p4&n=45" "$TMP/p4.pdf"
got="$(pages_of "$TMP/p4.pdf")"
[ "$got" = "6" ] && ok "横版 PDF 实际 6 页（没有多出空白页）" \
                 || bad "横版期望 6 页，实际 $got 页"
read -r P4W _ P4H <<< "$(size_of "$TMP/p4.pdf")"
awk -v w="$P4W" -v h="$P4H" 'BEGIN{exit !(w>h && w>830 && h>585 && h<600)}' \
  && ok "横版页面是 A4 横向（${P4W} × ${P4H} pt）" \
  || bad "横版页面方向/尺寸不对：$(size_of "$TMP/p4.pdf")"
pdftotext "$TMP/p4.pdf" - | grep -q "card1" \
  && ok "文字是矢量文本（pdftotext 能提取 card1）" \
  || bad "提取不到文字，可能被光栅化"
pdftotext "$TMP/p4.pdf" - | grep -q "正面 ·" \
  && bad "屏幕辅助标记「正面 ·」被打进了 PDF" \
  || ok "屏幕辅助标记没有进 PDF"

# ---------- p1：竖版 16×3，45 张 => 1 组双面 => 2 页 ----------
ASSERT1="$(dump "$BASE/tests/print.html?preset=p1&n=45" | grep -o 'preset=p1[^<]*' | head -1)"
if echo "$ASSERT1" | grep -q "sheets=2 perPage=48 card=70.00x18.56 text=55.00x18.56 overflow=0"; then
  ok "竖版 16×3：45 张 / 每页 48 张 => 2 页；卡片 70.00×18.56mm；安全区左 15mm"
else
  bad "竖版 16×3 计算不对：$ASSERT1"
fi

print_pdf "$BASE/tests/print.html?preset=p1&n=45" "$TMP/p1.pdf"
got="$(pages_of "$TMP/p1.pdf")"
[ "$got" = "2" ] && ok "竖版 PDF 实际 2 页" || bad "竖版期望 2 页，实际 $got 页"
read -r P1W _ P1H <<< "$(size_of "$TMP/p1.pdf")"
awk -v w="$P1W" -v h="$P1H" 'BEGIN{exit !(h>w && w>585 && w<600 && h>830)}' \
  && ok "竖版页面是 A4 竖向（${P1W} × ${P1H} pt）" \
  || bad "竖版页面方向/尺寸不对：$(size_of "$TMP/p1.pdf")"

# ---------- 背面内容确实在第二页 ----------
if pdftotext "$TMP/p1.pdf" - | grep -q "释义1"; then
  ok "第二页包含反面释义（双面数据成对）"
else
  bad "第二页没有反面释义"
fi

echo "----"
echo "通过 $pass 项，失败 $fail 项"
[ "$fail" = "0" ]
