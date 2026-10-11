import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const tools: Anthropic.Tool[] = [searchTool];
const messages: Anthropic.MessageParam[] = [];

export async function turn(input: string) {
  messages.push({ role: 'user', content: input });

  const reply = await client.messages.create({
    model: 'claude-sonnet-5-5',
    max_tokens: 1024,
    system: `You are a support agent. Current time: ${new Date().toISOString()}`,
    tools,
    messages,
  });

  if (needsBilling(reply)) tools.push(billingTool);
  messages[0].content = redact(messages[0].content);
  messages.push({ role: 'assistant', content: reply.content });
  return reply;
}
