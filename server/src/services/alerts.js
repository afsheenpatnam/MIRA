import crypto from 'node:crypto';

export const hashKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');

export function newIngestKey(slug) {
  return `mira_${slug}_${crypto.randomBytes(24).toString('base64url')}`;
}

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/**
 * Turns an alert from a monitoring tool into one readable line for MIRA.
 * Understands Grafana / Prometheus Alertmanager, PagerDuty v3, Datadog and plain JSON.
 */
export function alertToText(body = {}, sourceHeader = '') {
  // Grafana and Alertmanager: { receiver, status, alerts: [{ labels, annotations }] }
  if (Array.isArray(body.alerts) && body.alerts.length) {
    const firing = body.alerts.filter((a) => a.status !== 'resolved');
    const list = (firing.length ? firing : body.alerts).slice(0, 5).map((a) => {
      const l = a.labels || {};
      const n = a.annotations || {};
      return [
        l.alertname && `${l.alertname}:`,
        n.summary || n.message || n.description,
        n.summary && n.description && n.description !== n.summary && `(${n.description})`,
        (l.service || l.job) && `service ${l.service || l.job}`,
        l.severity && `severity ${l.severity}`,
      ].filter(Boolean).join(' ');
    });
    return { source: sourceHeader || (body.receiver ? 'Grafana / Alertmanager' : 'Alertmanager'), text: list.join('\n') };
  }
  // PagerDuty v3 webhooks: { event: { event_type, data: { title, service: { summary } } } }
  if (body.event?.data) {
    const d = body.event.data;
    return {
      source: 'PagerDuty',
      text: [d.title || d.summary, d.service?.summary && `service ${d.service.summary}`, d.urgency && `urgency ${d.urgency}`].filter(Boolean).join(', '),
    };
  }
  // Datadog and most generic tools
  const title = str(body.title || body.alert_title || body.summary || body.name || body.alert);
  const detail = str(body.body || body.text || body.message || body.description || body.details);
  const service = str(body.service || body.host || body.component);
  const text = [title, detail, service && `service ${service}`, body.severity && `severity ${body.severity}`].filter(Boolean).join('. ');
  return {
    source: sourceHeader || (body.alert_type || body.event_type ? 'Datadog' : 'Webhook'),
    text: text || JSON.stringify(body).slice(0, 1500),
  };
}
