// Pixels de campanha de um link de oferta (/oferta/<slug>): carregados só nessa página,
// além do pixel do TikTok do site (index.html). Falha de pixel nunca bloqueia o checkout.

let metaLoaded = false

export function loadCampaignPixels({ metaPixelId, tiktokPixelId } = {}) {
  try {
    if (metaPixelId && !metaLoaded) {
      /* eslint-disable */
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
      document,'script','https://connect.facebook.net/en_US/fbevents.js');
      /* eslint-enable */
      window.fbq('init', metaPixelId)
      window.fbq('track', 'PageView')
      metaLoaded = true
    }
    // Pixel extra do TikTok: depois do load, os track() do checkout vão para todos os pixels.
    if (tiktokPixelId && typeof window.ttq?.load === 'function') {
      window.ttq.load(tiktokPixelId)
      window.ttq.ready?.(() => window.ttq.instance?.(tiktokPixelId)?.page())
    }
  } catch { /* pixel nunca derruba a página */ }
}

function metaTrack(event, data, eventID) {
  if (!metaLoaded || typeof window.fbq !== 'function') return
  try { window.fbq('track', event, data, eventID ? { eventID } : undefined) } catch { /* ignora */ }
}

export function trackCampaignCheckout(plan, value) {
  metaTrack('InitiateCheckout', { value, currency: 'BRL', content_name: `Plano ${plan}`, content_type: 'product' })
}

export function trackCampaignPurchase(plan, value, transactionId) {
  metaTrack('Purchase', { value, currency: 'BRL', content_name: `Plano ${plan}`, content_type: 'product' }, `vm-purchase-${transactionId}`)
}
