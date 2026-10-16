const PIXEL_ID = '7636992793629523969'
export function initTikTok() {
  if (window.ttq) return
  window.TiktokAnalyticsObject = 'ttq'
  const ttq = window.ttq = []
  for (const method of ['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie']) ttq[method] = (...args) => ttq.push([method,...args])
  ttq._i = {}; ttq._i[PIXEL_ID] = []; ttq._i[PIXEL_ID]._u = 'https://analytics.tiktok.com/i18n/pixel/events.js'
  ttq._t = {[PIXEL_ID]: Date.now()}; ttq._o = {[PIXEL_ID]: {}}
  const script = document.createElement('script'); script.async = true
  script.src = 'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=' + PIXEL_ID + '&lib=ttq'
  document.head.appendChild(script); ttq.page()
}
export function trackTikTokCart(plan, price) {
  try {
    initTikTok()
    const raw = String(price ?? '').replace(/[^0-9,.]/g, '')
    const value = typeof price === 'number' ? price : Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw)
    if (!Number.isFinite(value) || value <= 0) return
    window.ttq.track('AddToCart', {contents:[{content_id:plan,content_name:'Plano '+plan,quantity:1,price:value}],content_type:'product',value,currency:'BRL'}, {event_id:'vm-cart-'+crypto.randomUUID()})
  } catch { /* tracking must never block checkout */ }
}
