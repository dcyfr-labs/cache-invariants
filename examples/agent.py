import anthropic, datetime

client = anthropic.Anthropic()
system_prompt = "You are a research assistant."
history = []

def turn(text):
    global system_prompt
    history.append({"role": "user", "content": text})
    system_prompt += f"\nNotes so far: {summarize(history)}"
    reply = client.messages.create(
        model="claude-sonnet-5-5", max_tokens=1024,
        system=system_prompt + f"\nToday is {datetime.date.today()}",
        messages=history,
    )
    history.append({"role": "assistant", "content": reply.content})
    return reply
