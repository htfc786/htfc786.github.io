const doms = {
  wordsListStr: document.querySelector('#wordliststring'),
  wordsListBtn: document.querySelector('#wordlistbtn'),
  wordsList: document.querySelector('#wordlist'),
  genBtn: document.querySelector('#gen'),
  printBtn: document.querySelector('#print'),
  exportBtn: document.querySelector('#export'),
  paperlist: document.querySelector('#paperlist'),
}
let wordsList = [];
let paperDataList = [];
let paperImageData = [];

// 实现单词表解析
doms.wordsListBtn.addEventListener('click', () => {
  //清除之前的
  paperDataList = [];
  paperImageData = [];
  doms.wordsList.innerHTML = '';
  
  const wordsListStr = doms.wordsListStr.value;
  wordsList = parseWordList(wordsListStr);
  // 便利显示
  const fragment = document.createDocumentFragment();
  wordsList.forEach((word) => {
    const tr = document.createElement('tr');
    tr.innerHTML =`<th>${word.index}</th><th>${word.word}</th><th>${word.chinese}</th><th>${word.pronounce}</th>`
    fragment.appendChild(tr);
  })
  doms.wordsList.appendChild(fragment);
});

doms.genBtn.addEventListener('click', async ()=>{
//   console.log('genBtn',wordsList);
  if (wordsList.length < 1) {
    alert('请先添加单词');
    return;
  }
  paperDataList = createPaperData(wordsList, {
    rows: 4,
    cols: 4,
    width: 297,
    height: 210,
  })
  // 渲染纸张
  for (let i = 0; i < paperDataList.length; i++) {
    const paperData = paperDataList[i];
    const img = await createImage(paperData);
    const imgDom = document.createElement('img');
    imgDom.src = img;
    doms.paperlist.appendChild(imgDom);
    // 加入列表
    paperImageData.push(img);
  }
})

doms.exportBtn.addEventListener('click', () => {
    if (paperImageData.length === 0){
        alert('请先生成！');
        return;
    }
    createPdf(paperImageData);
});
doms.printBtn.addEventListener('click', () => {
    if (paperImageData.length === 0){
        alert('请先生成！');
        return;
    }
    createPdf(paperImageData);
});