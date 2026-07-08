/**
 * SM-2 间隔重复算法，支持自定义复习节奏参数
 * quality: 0=重来, 1=困难, 2=良好, 3=简单
 */
function computeReview(card, quality, settings) {
  const dayMs = 24 * 60 * 60 * 1000;
  let { ease, interval, repetitions } = card;

  if (quality === 0) {
    repetitions = 0;
    interval = settings.initialInterval;
    ease = Math.max(settings.minEase, ease - 0.2);
  } else if (quality === 1) {
    repetitions = Math.max(0, repetitions);
    interval = Math.max(settings.initialInterval, interval * settings.hardInterval);
    ease = Math.max(settings.minEase, ease - 0.15);
  } else if (quality === 2) {
    if (repetitions === 0) {
      interval = settings.graduatingInterval;
    } else if (repetitions === 1) {
      interval = settings.initialInterval * 6;
    } else {
      interval = Math.min(settings.maxInterval, interval * ease);
    }
    repetitions += 1;
  } else if (quality === 3) {
    if (repetitions === 0) {
      interval = settings.graduatingInterval * settings.easyBonus;
    } else {
      interval = Math.min(settings.maxInterval, interval * ease * settings.easyBonus);
    }
    repetitions += 1;
    ease += 0.15;
  }

  const now = Date.now();
  return { ease, interval, repetitions, due_date: now + interval * dayMs };
}

function reviewCard(card, quality, settings) {
  const result = computeReview(card, quality, settings);
  return { ...card, ...result, updated_at: Date.now() };
}

function previewIntervals(card, settings) {
  return [0, 1, 2, 3].map((quality) => ({
    quality,
    interval: computeReview(card, quality, settings).interval
  }));
}

function formatInterval(days) {
  if (days < 1 / 24) return '<1小时';
  if (days < 1) {
    const hours = Math.round(days * 24);
    return hours <= 1 ? '<1小时' : `${hours}小时`;
  }
  if (days >= 365) {
    const y = days / 365;
    return y >= 10 ? `${Math.round(y)}年` : `${y.toFixed(1).replace(/\.0$/, '')}年`;
  }
  if (days >= 30) return `${Math.round(days / 30)}个月`;
  const rounded = Math.round(days * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}天` : `${rounded}天`;
}

module.exports = { reviewCard, previewIntervals, formatInterval };
