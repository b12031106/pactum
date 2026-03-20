interface SlackMessage {
  text: string;
}

export async function sendSlack(webhookUrl: string, message: SlackMessage): Promise<void> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (!res.ok) {
      console.error('Slack webhook failed:', res.status);
    }
  } catch (err) {
    console.error('Failed to send Slack message:', err);
  }
}
