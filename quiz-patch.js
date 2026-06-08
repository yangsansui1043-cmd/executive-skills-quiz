/**
 * quiz-patch.js — 执行技能测试 × 追踪工具桥接脚本
 * 已根据 index.html 实际源码分析编写，精准覆盖关键函数。
 *
 * 原理：
 *  1. 覆盖 calcResults()：用户点「查看结果分析」时，无论是否付款，先把 answers 写入 localStorage
 *  2. 覆盖 renderResults()：结果展示后，在页面底部注入「开始练习计划」按钮
 *  3. 付款回跳时（?paid=true），也补注入 CTA 按钮
 */

(function () {
  'use strict';

  // 测试 SKILLS 顺序(0-11) → 追踪工具 skillId(1-12)
  // 对应关系经源码确认：
  // 0反应抑制→1, 1工作记忆→2, 2情绪控制→3, 3启动任务→5,
  // 4持续注意力→4, 5按优先次序制订计划→6, 6规整→7, 7时间管理→8,
  // 8灵活性→10, 9元认知→11, 10将目标贯彻到底→9, 11承受压力→12
  const QUIZ_TO_TRACKER_ID = [1, 2, 3, 5, 4, 6, 7, 8, 10, 11, 9, 12];

  const TRACKER_NAMES = {
    1:'反应抑制', 2:'工作记忆', 3:'情绪控制', 4:'持续专注', 5:'任务启动',
    6:'计划优先级', 7:'组织条理', 8:'时间管理', 9:'目标坚持',
    10:'灵活变通', 11:'元认知', 12:'压力承受'
  };

  /** 3-18 分 → 1-5 星 */
  function toStars(score) {
    return Math.min(5, Math.ceil((score - 2) / 3));
  }

  /** 从全局 answers 读取12项原始总分 */
  function readRawScores() {
    if (typeof answers === 'undefined') return null;
    const raw = Array.from({ length: 12 }, (_, i) =>
      [0, 1, 2].reduce((sum, q) => sum + (answers[`q_${i}_${q}`] || 0), 0)
    );
    if (raw.every(s => s === 0)) return null;
    return raw;
  }

  /** 写入 localStorage */
  function syncToStorage(rawScores) {
    const sessionScores = {};
    rawScores.forEach((raw, i) => {
      if (raw > 0) sessionScores[QUIZ_TO_TRACKER_ID[i]] = toStars(raw);
    });

    let data = {};
    try { data = JSON.parse(localStorage.getItem('execTracker_v1') || '{}'); } catch (e) {}
    if (!data.scores) data.scores = {};
    if (!data.quizHistory) data.quizHistory = [];

    // 首次填入（不覆盖已有手动评分）
    Object.entries(sessionScores).forEach(([id, stars]) => {
      if (!data.scores[id]) data.scores[id] = stars;
    });

    data.pendingQuizImport = {
      date: new Date().toISOString().split('T')[0],
      scores: sessionScores,
      rawScores
    };

    localStorage.setItem('execTracker_v1', JSON.stringify(data));
    return sessionScores;
  }

  /** 在结果页注入「开始练习计划」CTA 按钮 */
  function injectCTA() {
    if (document.getElementById('exec-tracker-cta')) return;

    const rawScores = readRawScores();
    if (!rawScores) return;
    const sessionScores = syncToStorage(rawScores);

    const weakIds = Object.entries(sessionScores)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3)
      .map(([id]) => Number(id));

    const cta = document.createElement('div');
    cta.id = 'exec-tracker-cta';
    cta.style.cssText = 'margin:24px 16px 8px;text-align:center;background:linear-gradient(135deg,#1a1d27,#222536);border:1px solid #6c63ff;border-radius:16px;padding:28px 24px;box-shadow:0 8px 32px rgba(108,99,255,.3);font-family:inherit;';
    cta.innerHTML = `
      <div style="font-size:28px;margin-bottom:8px">⚡</div>
      <div style="font-size:17px;font-weight:700;color:#e8eaf0;margin-bottom:6px">测试完成！你的练习计划已就绪</div>
      <div style="font-size:13px;color:#9aa0c0;margin-bottom:12px;line-height:1.7">
        根据你的得分，最需要提升的技能是：
      </div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:20px">
        ${weakIds.map(id => `<span style="background:rgba(255,101,132,.15);border:1px solid rgba(255,101,132,.4);color:#ff6584;padding:5px 14px;border-radius:20px;font-size:13px;font-weight:700">${TRACKER_NAMES[id]}</span>`).join('')}
      </div>
      <a href="/tracker.html" style="display:inline-block;background:linear-gradient(135deg,#6c63ff,#ff6584);color:#fff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:16px;font-weight:700;letter-spacing:.5px;box-shadow:0 4px 20px rgba(108,99,255,.5)">
        开始我的练习计划 →
      </a>
      <div style="margin-top:12px;font-size:11px;color:#5a607a">数据已自动同步，无需重新输入</div>
    `;

    // 插到「重新作答」按钮前面
    const retakeBtn = document.querySelector('#tab-results .submit-btn');
    const resultsContent = document.getElementById('results-content');
    if (retakeBtn && resultsContent) {
      resultsContent.insertBefore(cta, retakeBtn);
    } else if (resultsContent) {
      resultsContent.appendChild(cta);
    }

    cta.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /** 等页面 JS 加载完毕后再挂钩 */
  window.addEventListener('load', () => {

    // 1. 覆盖 calcResults：用户点「查看结果分析」时立即同步分数
    const _calcResults = window.calcResults;
    window.calcResults = function () {
      const raw = readRawScores();
      if (raw) syncToStorage(raw);           // 付款前就保存，不依赖付款
      _calcResults.apply(this, arguments);
    };

    // 2. 覆盖 renderResults：结果渲染后注入 CTA
    const _renderResults = window.renderResults;
    window.renderResults = function () {
      _renderResults.apply(this, arguments);
      setTimeout(injectCTA, 300);
    };

    // 3. 付款回跳（?paid=true）时也注入 CTA
    if (new URLSearchParams(location.search).get('paid') === 'true') {
      setTimeout(injectCTA, 1000);
    }
  });

})();
