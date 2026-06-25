import os
import litellm
from dotenv import load_dotenv

# Load env from apps/worker/.env
load_dotenv("apps/worker/.env")

api_key = os.getenv("DEEPSEEK_API_KEY")
model = os.getenv("ACTIVE_MODEL", "deepseek/deepseek-chat")

print(f"Testing with model: {model}")

try:
    response = litellm.completion(
        model=model,
        messages=[
            {"role": "user", "content": "Hello, respond with 'Success' if you can read this."}
        ],
        api_key=api_key
    )
    print("\n--- Response ---")
    print(response.choices[0].message.content)
except Exception as e:
    print("\n--- Error ---")
    print(str(e))
