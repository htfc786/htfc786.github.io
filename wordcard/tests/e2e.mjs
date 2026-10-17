/* ============================================================
 * e2e.mjs —— 导入页 / 制作页端到端测试
 * 用法：node tests/e2e.mjs http://127.0.0.1:8787
 * ============================================================ */
import { launch } from './cdp.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:8787';
let pass = 0;
let fail = 0;

function check(condition, label, detail = '') {
  if (condition) {
    console.log('PASS  ' + label);
    pass++;
  } else {
    console.log('FAIL  ' + label + (detail ? '  → ' + detail : ''));
    fail++;
  }
}

const browser = await launch({ url: BASE + '/import.html' });
try {
  await browser.waitFor("document.querySelectorAll('#data-body tr').length > 0", { label: '导入页载入预设词表' });

  /* ---------- 导入页 ---------- */
  const totalText = await browser.evaluate("document.querySelector('#stat-total').textContent");
  const total = Number(totalText.replace(/[^0-9]/g, ''));
  check(total >= 5, '预设词表自动载入（' + totalText + ' 条）', 'total=' + totalText);
  check(await browser.evaluate("document.querySelector('#source-state').textContent === '预设词表'"),
    '来源标记为预设词表');

  /* 从预览里取前 4 个真实序号，测试范围筛选（不依赖具体数据文件） */
  const firstSeqs = await browser.evaluate(`[...document.querySelectorAll('#data-body .seq-badge')]
    .slice(0, 4).map((n) => Number(n.textContent))`);
  check(firstSeqs.length === 4 && firstSeqs.every(Number.isFinite),
    '预览里能读到序号', JSON.stringify(firstSeqs));
  const rangeStart = firstSeqs[0];
  const rangeEnd = firstSeqs[3];

  await browser.evaluate(`(() => {
    document.querySelector('#range-min').value = '${rangeStart}';
    document.querySelector('#range-max').value = '${rangeEnd}';
    document.querySelector('#range-apply').click();
    return true;
  })()`);
  await browser.waitFor("document.querySelectorAll('#data-body tr').length === 4", { label: '范围筛选为 4 行' });
  check(await browser.evaluate("document.querySelector('#top-count').textContent === '4 张'"),
    '顶部计数随范围变化');
  check(await browser.evaluate(`document.querySelector('#data-body .seq-badge').textContent === '${rangeStart}'`),
    `范围从序号 ${rangeStart} 开始`);
  check(await browser.evaluate("document.querySelectorAll('#range-hint').length === 1"),
    '范围提示存在');

  /* 直接编辑单元格 */
  await browser.evaluate(`(() => {
    const el = document.querySelector('#data-body .cell-edit[data-field="front"]');
    el.focus();
    el.textContent = 'TESTWORD';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.blur();
    return true;
  })()`);
  await browser.sleep(900);
  const edited = await browser.evaluate(`(() => {
    const work = JSON.parse(localStorage.getItem('wordcard.v3.work'));
    const item = work.items.find((x) => x.i === ${rangeStart});
    return item && item.front;
  })()`);
  check(edited === 'TESTWORD', '预览里改字写回工作数据', 'got=' + edited);

  /* 进入制作页 */
  await browser.evaluate("document.querySelector('#go-make').click(); true");
  await browser.waitFor("location.pathname.endsWith('/make.html')", { label: '跳转制作页' });
  await browser.waitFor("document.querySelectorAll('#sheets .sheet').length > 0", { label: '制作页渲染卡片' });
  await browser.sleep(900);

  check(await browser.evaluate(`document.querySelector('#data-summary').textContent.includes('${rangeStart}–${rangeEnd}')`),
    '制作页显示来源与序号范围');
  check(await browser.evaluate("document.querySelector('#data-badge').textContent === '4 张'"),
    '制作页只拿到范围内的 4 张');
  check(await browser.evaluate("document.querySelector('.sheet--front .main').textContent === 'TESTWORD'"),
    '导入页的编辑带到了制作页');
  const expectedNums = firstSeqs.slice(0, 4).sort((a, b) => a - b);
  const backNums = await browser.evaluate(`[...document.querySelectorAll('.sheet--back .num')]
    .map((n) => Number(n.textContent)).sort((a, b) => a - b).join(',')`);
  check(backNums === expectedNums.join(','), `卡片序号使用 i 字段（背面序号 ${expectedNums.join(',')}）`, backNums);

  /* 预设 4 */
  await browser.evaluate("document.querySelector('.preset-card[data-preset=\"p4\"]').click(); true");
  await browser.sleep(500);
  const geo = await browser.evaluate("document.querySelector('#geometry-info').innerText");
  check(geo.includes('74.3 × 52.5'), '预设 4 切换为横版 4×4（74.3 × 52.5mm）', geo.replace(/\\n/g, ' '));
  const savedConfig = await browser.evaluate(`(() => {
    const c = JSON.parse(localStorage.getItem('wordcard.v3.config'));
    return [c.page.orientation, c.grid.long, c.grid.short, c.card.safe.left].join(',');
  })()`);
  check(savedConfig === 'landscape,4,4,15', '预设 4 保存到本地配置（安全区左 15mm）', savedConfig);
  check(await browser.evaluate("document.querySelector('.preset-card[data-preset=\"p4\"]').classList.contains('is-active')"),
    '当前预设高亮正确');

  /* 细节分组默认折叠，点开可用 */
  check(await browser.evaluate("document.querySelector('#detail-sections details[data-group=\"front\"]').open === false"),
    '细节设置默认折叠');
  await browser.evaluate("document.querySelector('#detail-sections details[data-group=\"front\"] summary').click(); true");
  await browser.sleep(200);
  check(await browser.evaluate("document.querySelector('#detail-sections details[data-group=\"front\"]').open === true"),
    '细节分组可以展开');

  /* 软更新：字号 / 底色 / 安全区不重排 DOM，直接改变量 */
  await browser.evaluate(`(() => {
    const input = document.querySelector('#primary-fields [data-path="front.size"]');
    input.value = '20';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await browser.sleep(350);
  check(await browser.evaluate("document.querySelector('.sheet--front').style.getPropertyValue('--main-size') === '20pt'"),
    '改正面字号只更新 CSS 变量（快速路径）');

  await browser.evaluate(`(() => {
    const input = document.querySelector('[data-path="card.background"]');
    input.value = '#ffeeaa';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await browser.sleep(450);
  check(await browser.evaluate("getComputedStyle(document.querySelector('.sheet--front .cell')).backgroundColor === 'rgb(255, 238, 170)'"),
    '改卡片底色立即生效');

  const hadGuide = await browser.evaluate("document.querySelector('.sheet--front').classList.contains('guide-l')");
  await browser.evaluate(`(() => {
    const input = document.querySelector('[data-path="card.safe.left"]');
    input.value = '0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await browser.sleep(350);
  check(hadGuide && await browser.evaluate("!document.querySelector('.sheet--front').classList.contains('guide-l')"),
    '安全区改回 0 后参考线同步消失');
  check(await browser.evaluate("getComputedStyle(document.querySelector('.sheet--front .cell')).paddingLeft === '0px'"),
    '安全区数值同步到 padding');

  /* 拖拽中线（键盘等价操作） */
  const widthBefore = await browser.evaluate("parseFloat(document.querySelector('#make-layout').style.getPropertyValue('--settings-w'))");
  await browser.evaluate(`(() => {
    const s = document.querySelector('#splitter');
    s.focus();
    s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    return true;
  })()`);
  await browser.sleep(300);
  const widthAfter = await browser.evaluate("parseFloat(document.querySelector('#make-layout').style.getPropertyValue('--settings-w'))");
  check(widthAfter > widthBefore, '中线可调整设置区宽度（键盘 ArrowRight）', `${widthBefore} → ${widthAfter}`);

  /* 对位测试 */
  await browser.evaluate("document.querySelector('#align-test').click(); true");
  await browser.sleep(400);
  check(await browser.evaluate("document.querySelector('#align-banner').hidden === false"),
    '进入对位测试显示提示条');
  check(await browser.evaluate("document.querySelectorAll('#sheets .sheet').length === 2"),
    '对位测试使用 2×2 网格（2 页）');
  check(await browser.evaluate("document.querySelector('#data-badge').textContent === '对位测试'"),
    '对位测试标记清晰');
  await browser.evaluate("document.querySelector('#align-exit').click(); true");
  await browser.sleep(400);
  check(await browser.evaluate("document.querySelector('#align-banner').hidden === true"),
    '退出对位测试后提示条隐藏');
  check(await browser.evaluate("document.querySelector('#data-summary').textContent.includes('4 张')"),
    '退出后恢复原来的 4 张卡片');

  /* 手机端：预览按钮 + 弹层 */
  await browser.setViewport(390, 844, true);
  await browser.sleep(500);
  check(await browser.evaluate("getComputedStyle(document.querySelector('#open-preview-inline')).display !== 'none'"),
    '窄屏显示预览悬浮按钮');
  check(await browser.evaluate("getComputedStyle(document.querySelector('#splitter')).display === 'none'"),
    '窄屏隐藏拖拽中线');
  await browser.evaluate("document.querySelector('#open-preview-inline').click(); true");
  await browser.sleep(500);
  check(await browser.evaluate("document.body.classList.contains('preview-open')"),
    '点击按钮打开预览弹层');
  check(await browser.evaluate("getComputedStyle(document.querySelector('#preview-pane')).position === 'fixed'"),
    '窄屏预览是固定弹层');
  await browser.evaluate("document.querySelector('#preview-close').click(); true");
  await browser.sleep(300);
  check(await browser.evaluate("!document.body.classList.contains('preview-open')"),
    '关闭按钮能收起预览弹层');

  /* 回导入页：预设词表不允许直接加行 */
  await browser.setViewport(1440, 900, false);
  await browser.navigate(BASE + '/import.html');
  await browser.waitFor("document.querySelectorAll('#data-body tr').length === 4", { label: '返回后恢复范围数据' });
  await browser.sleep(500);
  check(await browser.evaluate("document.querySelector('#add-row').disabled === true"),
    '预设词表在范围模式下禁用“添加一行”');

  /* 导入自定义 JSON，再测试添加 / 删除 */
  await browser.evaluate("document.querySelector('#open-import').click(); true");
  await browser.waitFor("document.querySelector('#import-dialog').open", { label: '打开导入向导' });
  await browser.evaluate(`(() => {
    const text = JSON.stringify([
      { front: 'x', back: 'X' },
      { front: 'y', back: 'Y' }
    ]);
    const t = document.querySelector('#import-text');
    t.value = text;
    t.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await browser.sleep(250);
  await browser.evaluate("document.querySelector('#wizard-next').click(); true");
  await browser.waitFor("!document.querySelector('#import-dialog [data-step=\"2\"]').hidden", { label: 'JSON 映射步骤' });
  await browser.sleep(250);
  check(await browser.evaluate("document.querySelector('#table-meta').textContent.includes('2 行')"),
    'JSON 导入识别出 2 行');
  await browser.evaluate("document.querySelector('#wizard-import').click(); true");
  await browser.sleep(600);
  check(await browser.evaluate("document.querySelector('#stat-total').textContent === '2'"),
    'JSON 替换导入 2 条');
  check(await browser.evaluate("document.querySelector('#stat-source').textContent === '自定义导入'"),
    '自定义导入来源标记正确');
  check(await browser.evaluate("document.querySelector('#range-box').hidden === true"),
    '自定义数据不显示序号范围');
  check(await browser.evaluate("document.querySelector('#add-row').disabled === false"),
    '自定义数据可以添加行');

  await browser.evaluate("document.querySelector('#add-row').click(); true");
  await browser.sleep(400);
  check(await browser.evaluate("document.querySelector('#stat-total').textContent === '3'"),
    '新增一行后总条数 +1');
  check(await browser.evaluate("document.querySelectorAll('#data-body tr').length === 3"),
    '新增行出现在预览里');
  check(await browser.evaluate("[...document.querySelectorAll('#data-body .seq-badge')].map(n=>n.textContent).join(',') === '1,2,3'"),
    '无 i 字段的数据按顺序编号 1,2,3');
  await browser.evaluate(`(() => {
    const row = [...document.querySelectorAll('#data-body tr')]
      .find((tr) => tr.querySelector('.seq-badge')?.textContent === '3');
    row.querySelector('.row-del').click();
    return true;
  })()`);
  await browser.sleep(500);
  check(await browser.evaluate("document.querySelector('#stat-total').textContent === '2'"),
    '删除后总条数恢复');
  check(await browser.evaluate("document.querySelectorAll('#data-body tr').length === 2"),
    '删除后预览恢复 2 行');

  /* 导入页手机预览 */
  await browser.setViewport(390, 844, true);
  await browser.sleep(400);
  await browser.evaluate("document.querySelector('#open-preview-inline').click(); true");
  await browser.sleep(400);
  check(await browser.evaluate("document.body.classList.contains('preview-open')"),
    '导入页窄屏也能弹出数据预览');
  await browser.evaluate("document.querySelector('#preview-close').click(); true");
} catch (err) {
  console.error('FAIL  测试异常：' + err.message);
  fail++;
} finally {
  await browser.close();
}

console.log('----');
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
