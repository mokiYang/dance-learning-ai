<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DanceAura - 舞蹈教学平台</title>
    <style>
        *{
            margin:0;
            padding:0;
            box-sizing:border-box;
            font-family:"Microsoft YaHei",sans-serif;
        }
        body{
            background-color:#faf8f9;
        }
        .container{
            max-width:1320px;
            padding:0 20px;
            margin:0 auto;
        }
        .video-heading{
            text-align:center;
            padding:60px 0 40px;
        }
        .video-heading h2{
            font-size:34px;
            color:#222222;
        }
        .video-heading span{
            color:#c83a7c;
        }
        .video-heading p{
            margin-top:10px;
            color:#777;
        }

        /* 舞蹈网站 瀑布流核心样式 */
        .waterfall-wrap{
            column-count:3;
            column-gap:26px;
            margin-bottom:70px;
        }
        .video-item{
            background:#ffffff;
            border-radius:18px;
            overflow:hidden;
            box-shadow:0 3px 12px rgba(200,58,124,0.07);
            transition: 0.3s ease;
            margin-bottom:26px;
            break-inside:avoid;
        }
        .video-item:hover{
            transform: translateY(-6px);
            box-shadow:0 12px 24px rgba(200,58,124,0.16);
        }
        .video-item video{
            width:100%;
            display:block;
        }
        .video-text{
            padding:18px;
        }
        .video-text h4{
            font-size:17px;
            color:#222;
            margin-bottom:6px;
        }
        .video-text p{
            font-size:14px;
            color:#777;
        }

        /* 新手弹窗样式 */
        .guide-mask {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          z-index: 9999;
          display: none;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .guide-box {
          width: 100%;
          max-width: 620px;
          background: #ffffff;
          border-radius: 20px;
          padding: 40px 32px;
          position: relative;
          animation: popAnim 0.3s ease;
        }
        @keyframes popAnim {
          from {transform: scale(0.9);opacity: 0;}
          to {transform: scale(1);opacity: 1;}
        }
        .guide-close {
          position: absolute;
          top: 16px;
          right: 16px;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: none;
          background: #eee;
          font-size: 20px;
          cursor: pointer;
        }
        .guide-close:hover {
          background: #ddd;
        }
        .guide-title {
          text-align: center;
          font-size: 28px;
          color: #222;
          margin: 0 0 10px;
        }
        .guide-subtitle {
          text-align: center;
          color: #777;
          margin-bottom: 30px;
        }
        .guide-step {
          margin: 14px 0;
          font-size: 16px;
          line-height: 1.7;
          color: #333;
        }
        .guide-ok {
          width: 100%;
          margin-top: 25px;
          padding: 15px;
          border: none;
          border-radius: 12px;
          background: #c83a7c;
          color: white;
          font-size: 17px;
          cursor: pointer;
        }
        .guide-ok:hover {
          background: #b02f6b;
        }
        .open-guide-btn {
          position: fixed;
          bottom: 30px;
          right: 30px;
          padding: 12px 22px;
          border: none;
          border-radius: 30px;
          background: #c83a7c;
          color: #fff;
          cursor: pointer;
          font-size: 15px;
          z-index: 99;
          box-shadow: 0 4px 15px rgba(200,58,124,0.25);
        }

        /* 响应式 */
        @media (max-width:900px) {
            .waterfall-wrap{column-count:2;}
        }
        @media (max-width:550px) {
            .waterfall-wrap{column-count:1;}
        }
    </style>
</head>
<body>

    <!-- 视频瀑布流页面 -->
    <div class="container">
        <div class="video-heading">
            <h2>精选<span>舞蹈作品</span></h2>
            <p>爵士｜古典舞｜韩舞｜现代舞 精品教学</p>
        </div>
        <div class="waterfall-wrap">
            {% for video in videos %}
            <div class="video-item">
                <video muted preload="metadata" loop>
                    <source src="{{ video.url }}" type="video/mp4">
                </video>
                <div class="video-text">
                    <h4>{{ video.title }}</h4>
                    <p>难度：{{ video.level }}｜时长 {{ video.duration }}</p>
                </div>
            </div>
            {% endfor %}
        </div>
    </div>

    <!-- 新手引导按钮 -->
    <button class="open-guide-btn" id="openGuideBtn">新手使用指南</button>

    <!-- 新手引导弹窗 -->
    <div class="guide-mask" id="guideMask">
  <div class="guide-box">
    <button class="guide-close" id="closeGuide">×</button>
    <h2 class="guide-title">Hello！这里助力你的舞蹈梦想✨</h2>
    <p class="guide-subtitle">快来解锁超有趣的使用小Tips</p>

    <div class="guide-step"> 初次到访，记得完成页面顶部新手入门教程，快速熟悉平台！</div>
    <div class="guide-step"> 首页超多精品舞蹈教学视频，挑选喜欢的片段录制视频发给AI助手，收获专属针对性改进意见。</div>
    <div class="guide-step"> 页面底部加号按钮，随时上传跟拍作品，大胆展示你的舞姿！</div>
    <div class="guide-step"> 刷到别人的精彩舞蹈视频，多多点赞留言，为伙伴送上暖心鼓励吧。</div>
    <div class="guide-step"> 快来开启你的舞蹈成长之旅！</div>

    <button class="guide-ok" id="confirmGuide">立刻开启</button>
  </div>
</div>


<script>
// 弹窗逻辑
const mask = document.getElementById('guideMask');
const closeBtn = document.getElementById('closeGuide');
const confirmBtn = document.getElementById('confirmGuide');
const openBtn = document.getElementById('openGuideBtn');

function closeGuidePopup() {
  mask.style.display = 'none';
  localStorage.setItem('danceaura_has_guide', '1');
}
function openGuidePopup() {
  mask.style.display = 'flex';
}

// 新用户自动弹窗
if (!localStorage.getItem('danceaura_has_guide')) {
  openGuidePopup();
}

closeBtn.addEventListener('click', closeGuidePopup);
confirmBtn.addEventListener('click', closeGuidePopup);
openBtn.addEventListener('click', openGuidePopup);
mask.addEventListener('click', function (e) {
  if (e.target === mask) closeGuidePopup();
});

// 视频悬浮有声播放
document.querySelectorAll('.video-item video').forEach(item=>{
    item.addEventListener('mouseenter',()=>{
        item.muted = false;
        item.play();
    })
    item.addEventListener('mouseleave',()=>{
        item.muted = true;
        item.pause();
    })
})
</script>

</body>
</html>
