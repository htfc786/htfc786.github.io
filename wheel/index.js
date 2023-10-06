const rotateBtn = document.querySelector("#rotateBtn");
const wheel = document.querySelector("#wheel");
const light = document.querySelector(".light");
//礼物
const giftshow = document.querySelector("#giftshow");
const giftshowtext = document.querySelector("#giftshowtext");
const badshow = document.querySelector("#badshow");
//debug
const debugBtn = document.querySelector("#debug-btn");
const debugClose = document.querySelector("#debug-close");
const debug = document.querySelector(".debug");
//debug值
const laipiVal = document.querySelector("#deb-laipi");

const reward = ['谢谢参与', '中考体育免测', '谢谢参与', '中考+80分', '中考语文简单', 
 '谢谢参与', '中考+800分', '谢谢参与', '中考+20分', '中考数学简单'];
let isRotation = false;
let currentDeg = 0;
var hasgift = false;

//初始化
let initr = -18;
for (var i=0; i < reward.length;i++){
    wheel.innerHTML += `<div class="item" style="--r: ${initr}deg"><div><span>${reward[i]}</span></div></div>`;
    initr += 36;
}

rotateBtn.addEventListener('click', () => {
    if (isRotation) return;
    isRotation = true;
    light.className += ' light-twinkling';

    //
    let rotateDeg = Math.floor(Math.random() * 360 + 1080);
    currentDeg += rotateDeg;
    let rewardText = reward[Math.floor((currentDeg + 18) % 360 / 36)]

    hasgift = false;
    if (rewardText != "谢谢参与"){
        hasgift = true;
        giftshowtext.innerText = "获得 " + rewardText
    }

    wheel.style.setProperty('--wheel-rotate', `${currentDeg}deg`);
    
    setTimeout(() => {
        endWheel();
    }, 3500);
})
function endWheel(){
    isRotation = false;
    light.className = 'light';
    if (hasgift) {
        giftshow.style.display = "block" 
    } else {
        badshow.style.display = "block" 
    }
}
giftshow.addEventListener('mousedown', ()=>{
    giftshow.style.display = "none" 
})
badshow.addEventListener('mousedown', ()=>{
    badshow.style.display = "none" 
})