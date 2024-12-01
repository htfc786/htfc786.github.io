// 生成卡片
function createCard(content, size) {
  const card = document.createElement('div')
  // 内容
  const contentDom = document.createElement('div')
  contentDom.innerHTML = content
  // 左右加上空白
  contentDom.style.padding = '0 20px'
  card.style.position = 'relative'
  card.appendChild(contentDom)
  // 大小
  const { width, height } = size
  card.style.width = width
  card.style.height = height
  // 内容居中
  card.style.display = 'flex'
  card.style.justifyContent = 'center'
  card.style.alignItems = 'center'
  return card;
}

// 创建纸张dom
async function createImage(data) {
  const paper = document.createElement('div')
  paper.style.width = `${data.width}mm`
  paper.style.height = `${data.height}mm`
  // paper.style.border = '1px solid #ccc'
  // grid 布局
  paper.style.display = 'grid'
  paper.style.gridTemplateColumns = `repeat(${data.cols}, 0fr)`
  paper.style.gridTemplateRows = `repeat(${data.rows}, 1fr)`
  paper.style.textAlign = 'center'

  // 绘制卡片
  // 计算卡片横竖长度
  const cardWidth = data.width / data.cols
  const cardHeight = data.height / data.rows
  // 创建卡片元素，填满区域
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < data.contents.length; i++) {
    const content = data.contents[i]
    const card = createCard(content, { 
      width: `${cardWidth}mm`, 
      height: `${cardHeight}mm`
    });
    fragment.appendChild(card);
  }
  paper.appendChild(fragment); 

  // 添加页码
  const page = document.createElement('div')
  page.style.position = 'absolute'
  page.style.bottom = '5mm'
  page.style.right = '5mm'
  page.innerText = data.pageNum;
  paper.appendChild(page)
  paper.style.position = 'relative'

  
  // 创建一个看不见的元素用于绘制
  const drawDom = document.createElement('div');
  drawDom.style.position = 'absolute';
  drawDom.style.left = '-9999px';
  drawDom.style.top = '-9999px';
  document.body.appendChild(drawDom);
  drawDom.appendChild(paper);
  // 尝试转换
  let image = "";
  try {
    const canvas = await html2canvas(paper, { scale:1 });
    image = canvas.toDataURL("image/png");
  } catch (error) {
    console.error('html2canvas 失败:', error);
  } finally {
    document.body.removeChild(drawDom);
  }
  return image;
}

  // const paper = createImage(data)
// 解析单词表
function parseWordList(wordListString) {
  // 转换数组
  // 去除空行
  // 去除所有的 ▫ 和 * 及其后面的空格
  const wordListStringLine = wordListString
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => line.replace(/^[*▫]/, '').trim())
  // 合并内容
  // 如果下一行不已英文字母开头,把内容转到上一行
  for (let i = 0; i < wordListStringLine.length - 1; i++) {
    if (!/^[a-zA-Z]/.test(wordListStringLine[i + 1])) {
      // 如果已字母结束,添加空格
      const isEndWithLetter = /[a-zA-Z]$/.test(wordListStringLine[i][wordListStringLine[i].length - 1]);
      wordListStringLine[i] += (isEndWithLetter ? ' ' : '') + wordListStringLine[i + 1];
      wordListStringLine.splice(i + 1, 1);
    }
  }
  // 提取内容
  // senior /ˈsiːniə/ adj. （地位、水平或级别）高的，高级的 1
  // butterflies in one’s stomach 情绪紧张，心里发慌 4
  // 提取单词、音标和中文
  const words = wordListStringLine.map((wordLine,index) => {
    const data = wordLine.split(' ');
      // 去除数组最后一项页码
    data.pop();
    // 判断是否是单词
    // 判断是否存在音标(/ˈsiːniə/)
    if (wordLine.includes('/')) { // 单词
      return { 
        index: index + 1,
        word: data[0], 
        pronounce: data[1], 
        chinese: data.slice(2).join(' ') 
      };
    } else { // 词组
      return {
        index: index + 1,
        word: data.slice(0, -1).join(' '),//前面几项
        pronounce: '', 
        chinese: data[data.length - 1]//最后一项
      };
    }
  })
  return words;
}



const createFront = word => `<h3>${word.word}</h3>`
const createBack = word => `<h3>${word.chinese}</h3><p>${word.pronounce}</p><div style="position:absolute;top:5mm;left:5mm">${word.index}</div>`

function createPage(contents, config, pageNum){
  const { width, height, rows, cols } = config;
  // 页面数据
  return {
    width, height, rows, cols,
    // 卡片内容
    // 直接传入HTML
    contents,
    // 页面信息
    pageNum: `${pageNum}`
  }
}

// 生成打印纸的参数
function createPaperData(wordsList, config) {
  // 解析
  const { width, height, rows, cols } = config;
  // 一个页面的卡片数
  const pageCardNum = rows * cols;
  
  const result = []

  let frontContents = new Array(pageCardNum).fill('')
  let backContents = new Array(pageCardNum).fill('')
  for (let i = 0; i < wordsList.length; i++) {
    const pageIndex = i % pageCardNum
    const word = wordsList[i]
    frontContents[pageIndex] = createFront(word)

    // 在那一行
    const rowIndex = Math.floor(pageIndex / cols)
    // 在哪一列
    const colIndex = pageIndex % cols

    const pageIndex2 = rowIndex * cols + cols-1-colIndex
    console.log('pageIndex',rowIndex,colIndex, pageIndex, pageIndex2);

    backContents[pageIndex2] = createBack(word)
    // 打包一页
    if (pageIndex === pageCardNum - 1 || i === wordsList.length - 1) {
      const pageNum = Math.ceil(i / pageCardNum) * 2 - 1
      result.push(createPage(frontContents, config, pageNum))
      result.push(createPage(backContents, config, pageNum+1))
      frontContents = new Array(pageCardNum).fill('')
      backContents = new Array(pageCardNum).fill('')
    }
  }
  return result;
}

// const wordsList = parseWordList(wordlistString)
// console.log(wordsList)
// createPaperData(wordsList, {
//   rows: 4,
//   cols: 4,
//   width: 297,
//   height: 210,
// })

function createPdf(images) {
  // 横向的pdf
  const orientation = 'l';
  const pdf = new jspdf.jsPDF({
    orientation,
    unit: 'mm',
    format: [297, 210],
  });
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    pdf.addImage(img, 'JPEG', 0, 0, 297, 210);
    if (i < images.length - 1) {
      pdf.addPage();
    }
  }
  pdf.save('单词小卡片.pdf');
}