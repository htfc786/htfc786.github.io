#!/usr/bin/env bash
# 排版冒烟测试：用无头 Chrome 把页面打成 PDF，检查页数、"没有多出空白页"、
# 卡片尺寸计算、以及文字是否仍然是矢量文本。
# 需要 google-chrome / chromium，以及 poppler 的 pdfinfo / pdftotext。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="${CHROME:-$(command -v google-chrome || command -v chromium || command -v chromium-browser)}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

chrome() {
  "$CHROME" --headless=new --disable-gpu --no-sandbox \
    --user-data-dir="$TMP/profile" --hide-scrollbars "$@"
}
print_pdf() { # $1=html $2=out.pdf
  chrome --virtual-time-budget=6000 --no-pdf-header-footer --print-to-pdf="$2" "file://$1" >/dev/null 2>&1
}
pages_of() { pdfinfo "$1" | awk '/^Pages/{print $2}'; }

pass=0; fail=0
ok()   { echo "PASS  $1"; pass=$((pass+1)); }
bad()  { echo "FAIL  $1"; fail=$((fail+1)); }

# ---------- 用例 1：45 张卡片 / 4×5 => 6 页 ----------
print_pdf "$ROOT/tests/smoke.html" "$TMP/smoke.pdf"
got="$(pages_of "$TMP/smoke.pdf")"
[ "$got" = "6" ] && ok "45 张卡片 / 4×5 双面 => 6 页" \
                 || bad "期望 6 页，实际 $got 页（多出的通常是空白页）"

# ---------- 用例 2：卡片尺寸由数量和纸张算出来 ----------
dom="$(chrome --virtual-time-budget=6000 --dump-dom "file://$ROOT/tests/smoke.html" 2>/dev/null)"
assert_line="$(echo "$dom" | grep -o 'sheets=[^<]*' | head -1)"
if echo "$assert_line" | grep -q "card=74.25x42.00 text=68.25x36.00 perPage=20"; then
  ok "卡片尺寸 74.25×42.00mm，四边安全区各 3mm 后内容可用 68.25×36.00mm"
else
  bad "卡片尺寸计算不对：$assert_line"
fi

# ---------- 用例 3：安全区四边独立（数值 + 真的落到 padding 上） ----------
if echo "$assert_line" | grep -q "pad=12/1/3/5"; then
  ok "安全区四边独立：上12/右1/下3/左5mm 真的落到了 .cell 的 padding 上"
else
  bad "安全区四边没有生效：$assert_line"
fi
if echo "$assert_line" | grep -q "safe2=68.25x27.00"; then
  ok "非对称安全区下内容可用 68.25×27.00mm（只扣掉实际设置的那几边）"
else
  bad "非对称安全区的可用区域算错：$assert_line"
fi

# ---------- 用例 4：背面的安全区按镜像方式翻到同一条物理边 ----------
# 设定 上12/右1/下3/左5：左夹子在两面必须对应同一条物理边
if echo "$assert_line" | grep -q "safeModes=none:12/1/3/5,flipX:12/5/3/1,flipY:3/1/12/5,rot180:3/5/12/1"; then
  ok "背面安全区按镜像翻：flipX 左右互换 / flipY 上下互换 / rot180 两轴都对调"
else
  bad "背面安全区没有正确镜像：$(echo "$assert_line" | grep -o 'safeModes=[^ ]*')"
fi

# ---------- 用例 5：内容位置和卡片序号也跟着镜像 ----------
if echo "$assert_line" | grep -q "layout=flipX:right|flex-end|flex-start|0 flipY:left|flex-start|flex-end|-1 off:left|flex-start|flex-start|0"; then
  ok "背面内容位置跟随镜像（flipX 翻左右；flipY 翻上下并把附加信息移到正文上方；可关闭）"
else
  bad "背面内容位置没有正确镜像：$(echo "$assert_line" | grep -o 'layout=[^ ]*')"
fi
if echo "$assert_line" | grep -q "nums=flipX:l/-/-/b flipY:-/r/t/-"; then
  ok "卡片序号落到镜像后的同一个物理角"
else
  bad "卡片序号没有跟着镜像：$(echo "$assert_line" | grep -o 'nums=[^ ]*')"
fi

# ---------- 用例 6：默认界面 10 张卡片 / 4×5 => 2 页 ----------
print_pdf "$ROOT/index.html" "$TMP/index.pdf"
got="$(pages_of "$TMP/index.pdf")"
[ "$got" = "2" ] && ok "默认界面 10 张卡片 => 2 页" \
                 || bad "默认界面期望 2 页，实际 $got 页"

# ---------- 用例 7：纵向纸张 ----------
cat > "$TMP/portrait.html" <<EOF
<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<link rel="stylesheet" href="file://$ROOT/src/print.css">
<style id="page-rule">@page { size: A4 portrait; margin: 0; }</style></head>
<body><div id="sheets"></div>
<script src="file://$ROOT/src/card.js"></script>
<script>
var cfg = CardKit.defaultConfig();
cfg.page.orientation = 'portrait'; cfg.grid.cols = 2; cfg.grid.rows = 4;
CardKit.applyPageVars(cfg);
var cards = []; for (var i = 1; i <= 6; i++) cards.push({ front: '词' + i, back: '释义' + i });
var sheets = CardKit.paginate(cards, cfg);
var frag = document.createDocumentFragment();
sheets.forEach(function (s, i) { frag.appendChild(CardKit.createSheet(s, cfg, i, sheets.length)); });
document.getElementById('sheets').appendChild(frag);
if (cfg.extras.autoFit) CardKit.autoFitAll(document.getElementById('sheets'), cfg.extras.autoFitMin);
</script></body></html>
EOF
print_pdf "$TMP/portrait.html" "$TMP/portrait.pdf"
got="$(pages_of "$TMP/portrait.pdf")"
size="$(pdfinfo "$TMP/portrait.pdf" | awk '/^Page size/{print $3" x "$5}')"
[ "$got" = "2" ] && ok "纵向 A4：6 张卡片 / 2×4 => 2 页（$size pt）" \
                 || bad "纵向期望 2 页，实际 $got 页"

# ---------- 用例 8：文字必须是矢量文本，不是图片 ----------
if pdftotext "$TMP/index.pdf" - | grep -q "abandon"; then
  ok "文字是矢量文本（可由 pdftotext 提取）"
else
  bad "提取不到文字，可能被光栅化了"
fi

echo "----"
echo "通过 $pass 项，失败 $fail 项"
[ "$fail" = "0" ]
